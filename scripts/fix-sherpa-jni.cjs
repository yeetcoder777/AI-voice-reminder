// Native Sherpa code looks up these JVM class/field names literally through JNI.
const fs = require('node:fs');
const path = require('node:path');
const RULE = '-keep class com.k2fsa.sherpa.onnx.** { *; }\n';
const MARKER = "    consumerProguardFiles 'aireminder-jni.pro'";
function patchGradle(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (normalized.includes(MARKER)) return normalized;
  const anchor = '  defaultConfig {\n';
  if (normalized.split(anchor).length !== 2) throw new Error('Unexpected Sherpa Gradle layout; review JNI patch.');
  return normalized.replace(anchor, anchor + MARKER + '\n');
}
function applyPatch() {
  const root = path.resolve(__dirname, '..', 'node_modules/expo-sherpa-onnx');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (version !== '0.0.8') throw new Error('Review Sherpa JNI keep rules for version ' + version);
  const gradle = path.join(root, 'android/build.gradle');
  fs.writeFileSync(gradle, patchGradle(fs.readFileSync(gradle, 'utf8')));
  fs.writeFileSync(path.join(root, 'android/aireminder-jni.pro'), RULE);
  console.log('Sherpa JNI rules installed: preserve native class, field, and method names in release builds.');
}
if (require.main === module) applyPatch();
module.exports = { patchGradle, RULE };
