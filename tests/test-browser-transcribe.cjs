/* UI/state tests with generated media and a simulated recognizer, no user recording or model downloads. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = new URL(process.argv[2] || 'http://localhost:8000');
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw new Error('Run UI fixtures only against a local preview');

function wav(silent = false) {
  const count = 16000;
  const data = Buffer.alloc(44 + count * 2);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) data.writeInt16LE(silent ? 0 : Math.round(6000 * Math.sin(i * 2 * Math.PI * 440 / 16000)), 44 + i * 2);
  return {name: 'fixture.wav', mimeType: 'audio/wav', buffer: data};
}

(async () => {
  const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
  try {
    const context = await browser.newContext({acceptDownloads: true});
    await context.addInitScript(() => {
      window.__mode = 'no-audio';
      window.__workerPosts = 0;
      window.Worker = class {
        postMessage(data) {
          window.__workerPosts++;
          if (window.__mode === 'hold') return;
          setTimeout(() => this.onmessage?.({data: {type: 'complete', result: {text: '模拟识别测试', chunks: [{timestamp: [0, data.audio.length / 16000], text: '模拟识别测试'}]}}}), 0);
        }
        terminate() {}
      };
      navigator.mediaDevices.getDisplayMedia = async () => {
        if (window.__mode === 'permission-denied') throw new DOMException('Fixture denial', 'NotAllowedError');
        const canvas = document.createElement('canvas');
        canvas.width = 100; canvas.height = 100;
        canvas.getContext('2d').fillRect(0, 0, 100, 100);
        const video = canvas.captureStream();
        window.__captureTracks = video.getTracks();
        if (window.__mode === 'no-audio') return video;
        const audio = new AudioContext();
        await audio.resume();
        const oscillator = audio.createOscillator();
        const output = audio.createMediaStreamDestination();
        oscillator.connect(output); oscillator.start();
        window.__fixtureAudio = audio;
        const stream = new MediaStream([...video.getTracks(), ...output.stream.getAudioTracks()]);
        window.__captureTracks = stream.getTracks();
        return stream;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const external = [];
    page.on('request', request => {if (new URL(request.url()).origin !== base.origin) external.push(request.url());});
    await page.goto(new URL('/tools/browser-transcribe.html', base).href);
    assert.equal(await page.locator('#record').isDisabled(), true);
    await page.locator('#consent').check();
    await page.locator('#record').click();
    await page.waitForFunction(() => document.querySelector('#record-status').textContent.includes('没有收到音轨'));
    assert.equal(await page.evaluate(() => window.__captureTracks.every(track => track.readyState === 'ended')), true);
    await page.evaluate(() => {window.__mode = 'permission-denied';});
    await page.locator('#record').click();
    await page.waitForFunction(() => document.querySelector('#record-status').textContent.includes('共享已取消'));

    await page.evaluate(() => {window.__mode = 'record';});
    await page.locator('#record').click();
    await page.waitForFunction(() => document.querySelector('#stop').disabled === false);
    // Wait for a real generated MediaRecorder chunk, not a arbitrary wall-clock delay.
    await page.waitForFunction(() => document.querySelector('#record-status').textContent.includes('正在录制'), {timeout: 5000});
    await page.locator('#stop').click();
    await page.waitForFunction(() => !document.querySelector('#save-audio').disabled);
    assert.equal(await page.evaluate(() => window.__captureTracks.every(track => track.readyState === 'ended')), true);
    await page.evaluate(() => window.__fixtureAudio.close());

    await page.locator('#audio-file').setInputFiles(wav());
    await page.locator('#expected-duration').fill('60');
    await page.locator('#transcribe').click();
    await page.waitForFunction(() => !document.querySelector('#save-json').disabled);
    assert.match(await page.locator('#coverage-status').innerText(), /时长不符/);
    assert.equal(await page.locator('#transcript').inputValue(), '模拟识别测试');
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#save-json').click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    const buffers = []; for await (const chunk of stream) buffers.push(chunk);
    const report = JSON.parse(Buffer.concat(buffers));
    assert.equal(report.coverage, 'unverified');
    assert.equal(report.checked, false);
    assert.equal(report.full_input_processed, true);
    assert.equal(report.review_required, true);
    assert.match(report.audio_sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.duration_check.matches, false);

    await page.locator('#audio-file').setInputFiles(wav(true));
    const posts = await page.evaluate(() => window.__workerPosts);
    await page.locator('#transcribe').click();
    await page.waitForFunction(() => document.querySelector('#transcribe-status').textContent.includes('静音'));
    assert.equal(await page.evaluate(() => window.__workerPosts), posts);
    assert.equal(await page.locator('#save-json').isDisabled(), true);

    await page.locator('#audio-file').setInputFiles(wav());
    await page.evaluate(() => {window.__mode = 'hold';});
    await page.locator('#transcribe').click();
    await page.locator('#cancel').click();
    assert.match(await page.locator('#transcribe-status').innerText(), /已取消/);
    assert.equal(await page.locator('#save-audio').isEnabled(), true);
    assert.equal(await page.locator('#transcribe').isEnabled(), true);
    assert.equal(await page.locator('#save-json').isDisabled(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({width, height: 900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
      assert.equal(await page.locator('.tool-card .step-number').evaluateAll(numbers => numbers.every(number => {
        const r = number.getBoundingClientRect(), card = number.closest('.tool-card').getBoundingClientRect();
        return r.top >= card.top && r.bottom <= card.bottom && r.left >= card.left && r.right <= card.right;
      })), true, `Step number escaped card at ${width}px`);
    }
    console.log('PASS: consent, missing audio, permission denial, generated recording, release tracks, exports, incomplete coverage, silence, cancellation, no external fixture requests, responsive layout');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
