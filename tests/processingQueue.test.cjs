const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/processingQueue.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText, context);
const { ProcessingQueue } = context.exports;

test('queue bounds buffered audio, serializes inference, and drains before finishing', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const seen = [];
  let active = 0, peak = 0;
  const queue = new ProcessingQueue(async value => {
    active++; peak = Math.max(peak, active);
    await gate;
    seen.push(value); active--;
  }, 2);
  assert.equal(queue.enqueue(1), true);
  assert.equal(queue.enqueue(2), true);
  assert.equal(queue.enqueue(3), false);
  let finished = false;
  const drained = queue.drain().then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  release(); await drained;
  assert.deepEqual(seen, [1, 2]);
  assert.equal(peak, 1);
  assert.equal(queue.enqueue(4), true);
  await queue.drain();
  assert.deepEqual(seen, [1, 2, 4]);
});

test('one failed inference does not wedge the queue', async () => {
  const seen = [];
  const queue = new ProcessingQueue(async value => {
    if (value === 1) throw new Error('inference failed');
    seen.push(value);
  });
  queue.enqueue(1); queue.enqueue(2);
  await queue.drain();
  assert.deepEqual(seen, [2]);
});
