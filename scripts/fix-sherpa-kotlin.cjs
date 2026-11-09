// expo-sherpa-onnx 0.0.8 registers 113 bindings in one inlined Kotlin method.
// Split only registration structure; keep bindings, lifecycle cleanup, and bodies intact.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE_HASH = 'a2b36a048373fb3f2d884911ff937c882bb2764488449e7f7d2baeb0799239bd';
const PATCHED_HASH = '19a302c1c74bb28197efd686af53dc96d090a0e2a0538a69c6b3945975f6e166';
const RELATIVE = 'node_modules/expo-sherpa-onnx/android/src/main/java/expo/modules/sherpaonnx/ExpoSherpaOnnxModule.kt';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
function patchSource(input) {
  const source = normalize(input);
  if (hash(source) === PATCHED_HASH) return source;
  if (hash(source) !== SOURCE_HASH) throw new Error('Unexpected expo-sherpa-onnx Kotlin source. Expected pinned version 0.0.8; review this patch before upgrading.');
  const start = source.indexOf('  override fun definition() = ModuleDefinition {');
  const bodyStart = source.indexOf('\n', start) + 1;
  const bodyEnd = source.indexOf('\n  }', bodyStart);
  const body = source.slice(bodyStart, bodyEnd);
  // Include annotations with the registration they annotate.
  const starts = [...body.matchAll(/^(?:    @Suppress\([^\n]*\)\n)*    (?:Name|OnDestroy|Function|AsyncFunction|Events)\b/gm)];
  if (starts.length !== 113) throw new Error('Unexpected native binding count');
  const groups = [];
  for (let i = 0; i < starts.length; i += 4) {
    groups.push(body.slice(i === 0 ? 0 : starts[i].index, starts[i + 4]?.index ?? body.length));
  }
  const replacement = '  // AI Reminder: split native registrations to stay below the JVM method-size limit.\n' +
    '  override fun definition() = ModuleDefinition {\n' +
    groups.map((_, i) => '    registerBindings' + (i + 1) + '()').join('\n') + '\n  }\n\n' +
    groups.map((group, i) => '  private fun ModuleDefinitionBuilder.registerBindings' + (i + 1) + '() {\n' + group.trimEnd() + '\n  }').join('\n\n');
  const output = (source.slice(0, start) + replacement + source.slice(bodyEnd + 4)).replace(
    'import expo.modules.kotlin.modules.ModuleDefinition\n',
    'import expo.modules.kotlin.modules.ModuleDefinition\nimport expo.modules.kotlin.modules.ModuleDefinitionBuilder\n');
  if (hash(output) !== PATCHED_HASH) throw new Error('Native patch output did not match the reviewed result');
  return output;
}
function applyPatch() {
  const root = path.resolve(__dirname, '..');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/expo-sherpa-onnx/package.json'), 'utf8')).version;
  if (version !== '0.0.8') throw new Error('Review native method-size fix for expo-sherpa-onnx ' + version);
  const target = path.join(root, RELATIVE);
  const source = fs.readFileSync(target, 'utf8');
  const output = patchSource(source);
  if (normalize(source) !== output) fs.writeFileSync(target, output);
  console.log('Sherpa Kotlin fix verified: 113 bindings in 29 small registration methods.');
}
if (require.main === module) applyPatch();
module.exports = { patchSource, applyPatch };
