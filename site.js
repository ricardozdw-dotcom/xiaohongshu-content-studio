'use strict';

const LINES = ['确认之后，再做图', '材料进来，成稿出', '先对齐，再出图文'];

const typewriter = document.getElementById('typewriter');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cycleTitles() {
  let index = 0;
  typewriter.textContent = LINES[0];
  await sleep(1400);
  while (true) {
    const line = LINES[index % LINES.length];
    for (let i = line.length - 1; i >= 0; i -= 1) {
      typewriter.textContent = line.slice(0, i);
      await sleep(42);
    }
    await sleep(180);
    index += 1;
    const next = LINES[index % LINES.length];
    for (let i = 1; i <= next.length; i += 1) {
      typewriter.textContent = next.slice(0, i);
      await sleep(78);
    }
    await sleep(1500);
  }
}

function alignSubtitle() {
  const copy = document.querySelector('.hero-copy');
  const sub = document.querySelector('.hero-sub');
  if (!copy || !sub) return;
  const narrow = window.matchMedia('(max-width: 900px)').matches;
  if (narrow) {
    sub.style.fontSize = '';
    sub.style.whiteSpace = '';
    return;
  }
  const target = copy.clientWidth;
  if (!target) return;
  sub.style.whiteSpace = 'nowrap';
  let lo = 12;
  let hi = 32;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    sub.style.fontSize = `${mid}px`;
    if (sub.scrollWidth > target) hi = mid;
    else lo = mid;
  }
  sub.style.fontSize = `${lo}px`;
}

function setCopied(button, message) {
  const status = document.getElementById('copy-status');
  const previous = button.textContent;
  button.textContent = '已复制';
  button.classList.add('is-copied');
  if (status) status.textContent = message;
  window.setTimeout(() => {
    button.textContent = previous;
    button.classList.remove('is-copied');
  }, 1600);
}

async function copyFrom(button) {
  const source = document.getElementById(button.dataset.copy);
  const text = source ? source.textContent.trim() : '';
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setCopied(button, '已复制到剪贴板');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    const status = document.getElementById('copy-status');
    if (ok) setCopied(button, '已复制到剪贴板');
    else if (status) status.textContent = '复制失败，请手动选择文字';
  }
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', () => { copyFrom(button); });
});

const pills = [...document.querySelectorAll('.step-pills a')];
function markStep(id) {
  pills.forEach((pill) => {
    const on = pill.getAttribute('href') === `#${id}`;
    if (on) pill.setAttribute('aria-current', 'true');
    else pill.removeAttribute('aria-current');
  });
}
markStep('step-install');
pills.forEach((pill) => {
  pill.addEventListener('click', () => markStep(pill.getAttribute('href').slice(1)));
});

alignSubtitle();
window.addEventListener('resize', alignSubtitle);

const heroWave = document.querySelector('.hero-wave');
if (heroWave) {
  if (reduceMotion) {
    heroWave.removeAttribute('autoplay');
    heroWave.pause();
  } else {
    const started = heroWave.play();
    if (started) started.catch(() => {});
  }
}

if (!reduceMotion && typewriter) cycleTitles();
