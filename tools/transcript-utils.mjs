export function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return [h, m, s].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0');
}

export function normalizeSegments(chunks, duration) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('音频时长无效。');
  let previousStart = 0;
  return chunks.map(chunk => {
    const [start, end] = chunk.timestamp || [];
    if (!Number.isFinite(start) || start < 0 || start < previousStart || start > duration + 0.5) {
      throw new Error('识别器返回了无效时间戳，请保留音频并改用其他转写方式。');
    }
    previousStart = start;
    // The model sometimes omits the final end timestamp. Preserve that uncertainty.
    if (end !== null && end !== undefined && (!Number.isFinite(end) || end < start || end > duration + 0.5)) {
      throw new Error('识别器返回了无效结束时间戳。');
    }
    return {start, end: end == null ? null : Math.min(end, duration), text: String(chunk.text || '').trim()};
  }).filter(segment => segment.text);
}

export function toSrt(segments) {
  if (!segments.length || segments.some(x => x.end === null)) return null;
  return segments.map((x, i) => `${i + 1}\n${timestamp(x.start)} --> ${timestamp(x.end)}\n${x.text}\n`).join('\n');
}

export function durationCheck(actual, expected) {
  if (!Number.isFinite(actual) || actual <= 0) throw new Error('没有有效音频。');
  if (expected == null) return {matches: null, difference_seconds: null};
  if (!Number.isFinite(expected) || expected <= 0) throw new Error('原视频总时长必须为正数。');
  const difference = actual - expected;
  return {matches: Math.abs(difference) <= Math.max(2, expected * 0.02), difference_seconds: Math.round(difference * 1000) / 1000};
}
