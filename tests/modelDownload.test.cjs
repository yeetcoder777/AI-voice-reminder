const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/speaker.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const model = 'file:///documents/voice-model/wespeaker_en_voxceleb_resnet34.onnx';
const vad = 'file:///documents/voice-model/silero_vad.onnx';

// Model the installed SDK's important behavior: move is asynchronous and changes uri.
function setup({ cached = false, failMove = false, failDownload = false } = {}) {
  const disk = new Map();
  if (cached) { disk.set(model, 26534365); disk.set(vad, 643854); }
  let downloads = 0;
  const nativeLoads = [];
  class File {
    constructor(parent, name) { this.uri = name ? (parent.uri || parent) + '/' + name : parent.uri || parent; }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return disk.has(this.uri); }
    get size() { return disk.get(this.uri) || 0; }
    delete() { disk.delete(this.uri); }
    async move(target) {
      await new Promise(resolve => setImmediate(resolve));
      if (failMove) throw new Error('move failed');
      assert.ok(this.exists, 'download source must survive until async move completes');
      disk.set(target.uri, disk.get(this.uri)); disk.delete(this.uri);
      this.uri = target.uri;
    }
  }
  class Directory { constructor(parent, name) { this.uri = name ? parent + '/' + name : parent; } create() {} }
  const context = {
    exports: {},
    require(name) {
      if (name === 'expo-file-system') return { File, Directory, Paths: { document: 'file:///documents', cache: 'file:///cache' } };
      if (name === 'expo-file-system/legacy') return {
        createDownloadResumable(url, uri) { return { async downloadAsync() {
          downloads++; disk.set(uri, url.includes('silero') ? 643854 : 26534365);
          return { status: failDownload ? 503 : 200 };
        } }; },
      };
      if (name === 'expo-sherpa-onnx') return {
        async createSpeakerEmbeddingExtractor(config) {
          const uri = 'file://' + config.model;
          assert.equal(disk.get(uri), 26534365, 'model must exist before native initialization');
          nativeLoads.push(uri); return {};
        },
        async createVAD(config) {
          const uri = 'file://' + config.sileroVadModelConfig.model;
          assert.equal(disk.get(uri), 643854, 'VAD must exist before native initialization');
          nativeLoads.push(uri); return {};
        },
      };
      if (name === './voiceMath') return {};
      throw new Error('Unexpected import: ' + name);
    },
  };
  vm.runInNewContext(compiled, context);
  return { initialize: () => context.exports.initialize(() => {}), disk, nativeLoads, downloads: () => downloads };
}

test('download waits for move and never deletes installed models during cleanup', async () => {
  const fixture = setup();
  await fixture.initialize();
  assert.equal(fixture.disk.get(model), 26534365);
  assert.equal(fixture.disk.get(vad), 643854);
  assert.deepEqual(fixture.nativeLoads, [model, vad]);
  assert.ok([...fixture.disk.keys()].every(uri => !uri.endsWith('.part')));
});
test('valid cached models can initialize offline without another download', async () => {
  const fixture = setup({ cached: true });
  await fixture.initialize(); await fixture.initialize();
  assert.equal(fixture.downloads(), 0);
  assert.deepEqual(fixture.nativeLoads, [model, vad]);
});
test('move failure cleans temporary audio-model files and never invokes native loading', async () => {
  const fixture = setup({ failMove: true });
  await assert.rejects(fixture.initialize(), /move failed/);
  assert.equal(fixture.disk.size, 0);
  assert.equal(fixture.nativeLoads.length, 0);
});
test('failed HTTP download is cleaned up before model initialization', async () => {
  const fixture = setup({ failDownload: true });
  await assert.rejects(fixture.initialize(), /download incomplete/);
  assert.equal(fixture.disk.size, 0);
  assert.equal(fixture.nativeLoads.length, 0);
});
