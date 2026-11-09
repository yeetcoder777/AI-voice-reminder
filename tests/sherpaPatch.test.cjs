const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { patchSource } = require('../scripts/fix-sherpa-kotlin.cjs');
const file = path.join(__dirname, '../node_modules/expo-sherpa-onnx/android/src/main/java/expo/modules/sherpaonnx/ExpoSherpaOnnxModule.kt');
test('native install fix is idempotent, including CRLF input', () => {
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(patchSource(source), source);
  assert.equal(patchSource(source.replace(/\n/g, '\r\n')), source);
});
test('native install fix refuses unexpected dependency changes', () => {
  assert.throws(() => patchSource('different upstream code'), /Unexpected/);
});
test('all 113 native registration signatures remain in order in bounded methods', () => {
  const source = fs.readFileSync(file, 'utf8');
  const signatures = [...source.matchAll(/^    (?:Name|OnDestroy|Function|AsyncFunction|Events)\b[^\n]*/gm)].map(m => m[0]);
  assert.equal(signatures.length, 113);
  assert.equal(crypto.createHash('sha256').update(signatures.join('\n')).digest('hex'), 'e1327337b6723213a722b7d68d93e3491e357f3cd4e5d6f0064f379ceacefa2e');
  const helpers = [...source.matchAll(/  private fun ModuleDefinitionBuilder\.registerBindings\d+\(\) \{\n([\s\S]*?)\n  }/g)];
  assert.equal(helpers.length, 29);
  assert.ok(helpers.every(m => m[1].split('\n').length < 100));
});
