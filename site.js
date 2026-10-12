'use strict';

const copyButton = document.getElementById('copy-prompt');
copyButton.addEventListener('click', async () => {
  const prompt = document.getElementById('prompt-text');
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(prompt.textContent.trim());
    status.textContent = '已复制。把你的链接一起发送，就可以开始整理。';
    copyButton.textContent = '已复制 ✓';
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(prompt);
    selection.removeAllRanges();
    selection.addRange(range);
    status.textContent = '自动复制不可用，已选中文字，请手动复制。';
  }
});
