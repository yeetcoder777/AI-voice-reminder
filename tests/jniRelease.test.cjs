const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchGradle, RULE } = require('../scripts/fix-sherpa-jni.cjs');
const android = path.join(__dirname, '../node_modules/expo-sherpa-onnx/android');

test('JNI consumer rules are installed and survive repeated dependency installs', () => {
  const source = fs.readFileSync(path.join(android, 'build.gradle'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(patchGradle(source), source);
  assert.equal(patchGradle(source.replace(/\n/g, '\r\n')), source);
  assert.equal(source.match(/consumerProguardFiles 'aireminder-jni.pro'/g).length, 1);
  assert.equal(fs.readFileSync(path.join(android, 'aireminder-jni.pro'), 'utf8'), RULE);
  assert.match(RULE, /-keep class com\.k2fsa\.sherpa\.onnx\.\*\* \{ \*; \}/);
});
test('JNI Gradle patch fails on an unexpected upstream layout', () => {
  assert.throws(() => patchGradle('unrecognized build file'), /Unexpected/);
});
