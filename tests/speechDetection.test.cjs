const test = require('node:test');
const assert = require('node:assert/strict');
const { detectSpeech, audioMetrics, speechStatus } = require('./loadTs.cjs')('src/speechDetection.ts');

function detector() {
  let current = [], queue = [], calls = 0;
  return {
    get calls() { return calls; },
    async reset() { current = []; },
    async clear() { queue = []; },
    async acceptWaveform(frame) {
      assert.equal(frame.length, 512, 'VAD must receive one analysis frame, not six seconds at once');
      calls++;
      if (frame.some(value => value !== 0)) current.push(...frame);
      else if (current.length) { queue.push({ samples: current }); current = []; }
    },
    async flush() { if (current.length) { queue.push({ samples: current }); current = []; } },
    async empty() { return !queue.length; },
    async front() { return queue[0]; },
    async pop() { queue.shift(); },
  };
}
test('six-second input feeds VAD frame by frame and preserves ongoing speech on flush', async () => {
  const vad = detector();
  const input = Array(96000).fill(0.002);
  const speech = await detectSpeech(vad, input);
  assert.equal(vad.calls, 188);
  assert.equal(speech.length, input.length);
  assert.equal(speech[0], 0.002);
  assert.equal(speech.at(-1), 0.002);
});
test('low-volume speech is not classified as quiet by an absolute RMS cutoff', () => {
  const input = Array(96000).fill(0.002);
  assert.ok(audioMetrics(input).rms < 0.008);
  assert.equal(speechStatus(input, input, 16000, 2), 'speech');
});
test('zero input, no detected speech and short speech remain separate outcomes', async () => {
  assert.equal(speechStatus(Array(96000).fill(0), [], 16000, 1), 'noInput');
  assert.equal(speechStatus([0.01], [], 16000, 1), 'noSpeech');
  assert.equal(speechStatus([0.01], [0.01], 16000, 1), 'tooShort');
  const vad = detector();
  assert.equal((await detectSpeech(vad, Array(96000).fill(0))).length, 0);
});
test('VAD state does not leak across independent recordings', async () => {
  const vad = detector();
  assert.equal((await detectSpeech(vad, Array(32000).fill(0.05))).length, 32000);
  assert.equal((await detectSpeech(vad, Array(32000).fill(0))).length, 0);
});
