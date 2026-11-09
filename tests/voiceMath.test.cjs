const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/voiceMath.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { exports: {} }; vm.runInNewContext(output, context);
const { cosine, centroid, rms, wav, unit } = context.exports;
test('cosine is invariant to magnitude and separates orthogonal/opposite vectors', () => {
  assert.ok(Math.abs(cosine([1, 2], [10, 20]) - 1) < 1e-10);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 0], [-1, 0]), -1);
});
test('enrollment gives samples equal directional weight', () => {
  const c = centroid([[100, 0], [0, 1]]);
  assert.ok(Math.abs(c[0] - c[1]) < 1e-10);
  assert.ok(Math.abs(Math.hypot(...c) - 1) < 1e-10);
});
test('invalid voice vectors cannot become valid profile matches', () => {
  assert.throws(() => unit([0, 0]));
  assert.throws(() => unit([NaN, 1]));
  assert.throws(() => cosine([1], [1, 0]));
  assert.throws(() => centroid([]));
  assert.equal(rms([]), 0);
  assert.equal(rms([1, -1]), 1);
});
test('WAV header and clipped PCM samples are valid for local playback', () => {
  const bytes = wav([-2, 0, 2], 16000);
  const view = new DataView(bytes.buffer);
  assert.equal(Buffer.from(bytes.slice(0, 4)).toString(), 'RIFF');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 6);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 0);
  assert.equal(view.getInt16(48, true), 32767);
});
