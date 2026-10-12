import test from 'node:test';
import assert from 'node:assert/strict';
import {timestamp, normalizeSegments, toSrt, durationCheck} from '../tools/transcript-utils.mjs';

test('SRT rounds milliseconds and handles hour rollover', () => {
  assert.equal(timestamp(3599.9996), '01:00:00,000');
  const segments = normalizeSegments([{timestamp: [0, 1.5], text: ' 中文测试 '}], 2);
  assert.equal(toSrt(segments), '1\n00:00:00,000 --> 00:00:01,500\n中文测试\n');
});
test('unknown end remains unknown, not invented SRT', () => {
  const segments = normalizeSegments([{timestamp: [0, null], text: '测试'}], 2);
  assert.equal(segments[0].end, null);
  assert.equal(toSrt(segments), null);
});
test('invalid timestamps and non-monotonic starts are rejected', () => {
  for (const chunks of [[{timestamp: [-1, 1]}], [{timestamp: [1, 0]}], [{timestamp: [0, 100]}], [{timestamp: [1, 2]}, {timestamp: [0, 1]}]]) {
    assert.throws(() => normalizeSegments(chunks, 3));
  }
});
test('no expected duration means unknown, not complete', () => {
  assert.equal(durationCheck(30, null).matches, null);
  assert.equal(durationCheck(30, 60).matches, false);
  assert.equal(durationCheck(60.1, 60).matches, true);
  assert.throws(() => durationCheck(0, 60));
  assert.throws(() => durationCheck(60, NaN));
});
