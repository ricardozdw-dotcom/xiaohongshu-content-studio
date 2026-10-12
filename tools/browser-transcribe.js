import {normalizeSegments, toSrt, durationCheck} from './transcript-utils.mjs';

const el = id => document.getElementById(id);
let stream, recorder, chunks = [], audioBlob, previewUrl, worker, timer, startedAt;
let busy = false, acquiring = false, finalizing = false, result, requestMetadata, recordingError;
let operationId = 0;

function message(id, text, kind = '') {
  el(id).textContent = text;
  el(id).className = 'tool-status ' + kind;
}

function refresh() {
  const recording = acquiring || finalizing || (recorder && recorder.state !== 'inactive');
  el('record').disabled = !el('consent').checked || !captureSupported || recording || busy;
  el('stop').disabled = !recorder || recorder.state !== 'recording';
  el('transcribe').disabled = !el('consent').checked || !audioBlob || recording || busy || !recognitionSupported;
  el('cancel').disabled = !busy;
  el('audio-file').disabled = recording || busy;
  el('save-audio').disabled = !audioBlob || recording;
  for (const id of ['language', 'model', 'source-url', 'expected-duration', 'consent']) el(id).disabled = recording || busy;
  el('save-txt').disabled = !result;
  el('save-json').disabled = !result;
  el('save-srt').disabled = !result || !toSrt(result.segments);
}

function resetResult() {
  result = null;
  el('transcript').value = '';
  message('coverage-status', '尚无转写结果；音频与关键画面仍需要核对。');
}

function setAudio(blob, name) {
  audioBlob = blob;
  resetResult();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);
  el('audio-preview').src = previewUrl;
  el('audio-preview').hidden = false;
  message('record-status', `${name} · ${(blob.size / 1024 / 1024).toFixed(2)} MB。请先试听，确认有声音且首尾完整。`);
  message('transcribe-status', '音频已准备好。首次识别会下载模型，请保持此页打开。');
  refresh();
}

function releaseCapture() {
  clearInterval(timer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
}

function stopRecording() {
  if (recorder && recorder.state === 'recording') {finalizing = true; recorder.stop();}
  releaseCapture();
  refresh();
}

function save(content, type, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const captureSupported = Boolean(window.isSecureContext && navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder);
const recognitionSupported = Boolean(window.isSecureContext && window.Worker && window.AudioContext && window.WebAssembly);
el('compatibility').textContent = captureSupported
  ? '浏览器具备录音接口；能否共享标签页音频，以权限弹窗及实际音轨为准。使用桌面 Chrome / Edge 更稳妥。'
  : '当前环境不支持标签页录音。请在桌面 Chrome / Edge 打开 HTTPS 网页或 localhost；也可选择已有音频文件。';
if (!recognitionSupported) el('compatibility').textContent += ' 当前环境也不支持浏览器本地识别。';
el('consent').addEventListener('change', refresh);

el('record').addEventListener('click', async () => {
  if (!el('consent').checked || acquiring || finalizing || busy) return;
  acquiring = true; refresh();
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {displaySurface: 'browser'}, audio: true,
      systemAudio: 'exclude', selfBrowserSurface: 'exclude',
      monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude',
    });
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) throw new Error('没有收到音轨。请重新选择视频标签页并勾选“共享标签页音频”；不要选择屏幕或窗口。');
    const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
    if (surface && surface !== 'browser') throw new Error('请只共享目标视频的浏览器标签页，不要录制窗口或整个屏幕。');
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(new MediaStream(audioTracks), mimeType ? {mimeType} : {});
    chunks = []; recordingError = null;
    recorder.ondataavailable = event => {if (event.data.size) chunks.push(event.data);};
    recorder.onerror = event => {recordingError = event.error?.message || '录音器异常'; stopRecording();};
    recorder.onstop = () => {
      releaseCapture();
      const blob = new Blob(chunks, {type: recorder.mimeType});
      if (!blob.size) message('record-status', '录音为空，请检查共享音频设置。', 'error');
      else {
        setAudio(blob, '标签页录音');
        if (recordingError) message('record-status', `录音中断：${recordingError}。已保留录到的部分，不代表全程。`, 'error');
      }
      acquiring = false; finalizing = false; refresh();
    };
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', stopRecording));
    audioTracks.forEach(track => track.addEventListener('ended', stopRecording));
    resetResult(); audioBlob = null;
    el('audio-preview').hidden = true;
    startedAt = performance.now();
    recorder.start(1000);
    timer = setInterval(() => message('record-status', `正在录制 · ${Math.floor((performance.now() - startedAt) / 1000)} 秒。请从视频开头播放到结尾，不要跳段。`, 'live'), 1000);
    message('record-status', '录音已开始，现在回到目标标签页播放视频。', 'live');
  } catch (error) {
    releaseCapture();
    message('record-status', error.name === 'NotAllowedError' ? '共享已取消或未获授权。没有开始录音，可重新选择标签页。' : error.message, 'error');
  } finally {acquiring = false; refresh();}
});
el('stop').addEventListener('click', stopRecording);
el('audio-file').addEventListener('change', () => {
  const file = el('audio-file').files[0];
  if (file) setAudio(file, '本地音频');
});
el('save-audio').addEventListener('click', () => save(audioBlob, audioBlob.type, audioBlob.type.includes('mp4') ? '录音备份.m4a' : audioBlob instanceof File ? audioBlob.name : '标签页录音.webm'));

function finishBusy() {
  busy = false; el('progress').hidden = true; refresh();
}

function createWorker() {
  const instance = new Worker(new URL('./asr-worker.js', import.meta.url), {type: 'module'});
  instance.onerror = () => {
    message('transcribe-status', '识别模块无法加载。请检查 jsDelivr / Hugging Face 网络访问，保存音频后改用本地转写。', 'error');
    instance.terminate(); if (worker === instance) worker = null;
    finishBusy();
  };
  instance.onmessage = ({data}) => {
    if (worker !== instance) return;
    if (data.type === 'model-progress') {
      message('transcribe-status', `下载模型资源：${data.file || data.status || '准备中'}${Number.isFinite(data.progress) ? ' · ' + Math.round(data.progress) + '%' : ''}`);
      el('progress').hidden = false;
      if (Number.isFinite(data.progress)) {el('progress').value = data.progress;} else {el('progress').removeAttribute('value');}
    } else if (data.type === 'recognizing') {
      el('progress').hidden = false; el('progress').removeAttribute('value');
      message('transcribe-status', '正在本地识别整个输入音频（含长音频分块），请保持页面打开。可以取消，音频备份不会丢失。');
    } else if (data.type === 'error') {
      message('transcribe-status', `识别失败：${data.message}。可重试、换小模型或保存音频后本地转写。`, 'error');
      finishBusy();
    } else if (data.type === 'complete') {
      try {
        if (!data.result.text?.trim()) throw new Error('未识别到有效文字，请试听音频检查静音或音量。');
        const segments = normalizeSegments(data.result.chunks || [], requestMetadata.processed_duration_seconds);
        result = {...requestMetadata, text: data.result.text.trim(), segments, review_required: true, coverage: 'unverified', checked: false};
        el('transcript').value = result.text;
        const d = result.duration_check;
        message('coverage-status', `已处理 ${result.processed_duration_seconds.toFixed(1)} 秒音频。${d.matches === null ? '未填写原视频时长，无法比较。' : d.matches ? '时长大致相符，但不能据此证明没有漏段。' : '录音与原视频时长不符，请核对是否漏录、倍速或含额外静音。'}\n仍须回听首尾、全部有声缺口与技术细节，并补充关键画面。${toSrt(segments) ? '' : '部分时间戳缺失，暂不提供 SRT；JSON 保留未确定值。'}`);
        message('transcribe-status', '转写完成。结果为自动识别，尚未登记完整原稿或用户确认。', 'live');
      } catch (error) {message('transcribe-status', error.message, 'error');}
      finishBusy();
    }
  };
  return instance;
}

el('transcribe').addEventListener('click', async () => {
  if (!audioBlob || busy || !el('consent').checked) return;
  const snapshot = audioBlob;
  const currentOperation = ++operationId;
  busy = true; resetResult(); refresh();
  message('transcribe-status', '读取并解码本地音频…');
  let context;
  try {
    const sourceUrl = el('source-url').value.trim();
    if (sourceUrl && (!el('source-url').checkValidity() || !/^https?:\/\//i.test(sourceUrl))) throw new Error('原视频链接应为有效 HTTP(S) 地址。');
    context = new AudioContext({sampleRate: 16000});
    const buffer = await context.decodeAudioData(await snapshot.arrayBuffer());
    if (!busy || currentOperation !== operationId) return;
    if (buffer.sampleRate !== 16000) throw new Error('浏览器未提供 16kHz 解码，请保存音频后使用本地转写。');
    const audio = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const values = buffer.getChannelData(channel);
      for (let i = 0; i < audio.length; i++) audio[i] += values[i] / buffer.numberOfChannels;
    }
    let energy = 0;
    for (const value of audio) energy += value * value;
    if (Math.sqrt(energy / audio.length) < 0.00001) throw new Error('音频几乎完全静音，请检查共享音频选项。');
    const rawExpected = el('expected-duration').value.trim();
    const expected = rawExpected ? Number(rawExpected) : null;
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await snapshot.arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (!busy || currentOperation !== operationId) return;
    requestMetadata = {version: 1, basis: 'full_audio_transcription', engine: 'transformers.js@2.17.2', model: el('model').value,
      language: el('language').value, source_url: sourceUrl, audio_sha256: hash, audio_bytes: snapshot.size,
      expected_duration_seconds: expected, processed_duration_seconds: buffer.duration,
      duration_check: durationCheck(buffer.duration, expected), full_input_processed: true,
      created_at: new Date().toISOString()};
    worker ||= createWorker();
    worker.postMessage({type: 'transcribe', audio, model: requestMetadata.model, language: requestMetadata.language}, [audio.buffer]);
  } catch (error) {if (currentOperation === operationId) {message('transcribe-status', `无法转写：${error.message}。音频仍可保存。`, 'error'); finishBusy();}}
  finally {if (context) await context.close();}
});
el('cancel').addEventListener('click', () => {
  operationId++;
  if (worker) worker.terminate(); worker = null;
  finishBusy(); message('transcribe-status', '已取消转写，音频仍保留。再次开始可能需要重新加载模型。');
});
el('save-txt').addEventListener('click', () => save(el('transcript').value + '\n', 'text/plain;charset=utf-8', '口播转写_待核对.txt'));
el('save-srt').addEventListener('click', () => save(toSrt(result.segments), 'text/plain;charset=utf-8', '口播转写_待核对.srt'));
el('save-json').addEventListener('click', () => save(JSON.stringify(result, null, 2), 'application/json', '口播转写_待核对.json'));
window.addEventListener('beforeunload', event => {if (busy || recorder?.state === 'recording') {event.preventDefault(); event.returnValue = '';}});
refresh();
