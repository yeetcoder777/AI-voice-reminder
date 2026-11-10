// Inspect the actual packaged DEX field table, rather than trusting source keep rules.
const fs = require('node:fs');
const path = require('node:path');
function fieldsInDex(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'dex\n') throw new Error('Expected standard Android DEX');
  const stringCount = bytes.readUInt32LE(0x38), stringOffset = bytes.readUInt32LE(0x3c);
  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    let start = bytes.readUInt32LE(stringOffset + i * 4);
    while (bytes[start++] & 0x80) {} // Skip UTF-16 length encoded as ULEB128.
    let end = start; while (bytes[end] !== 0) end++;
    strings.push(bytes.toString('utf8', start, end));
  }
  const typeCount = bytes.readUInt32LE(0x40), typeOffset = bytes.readUInt32LE(0x44);
  const types = Array.from({ length: typeCount }, (_, i) => strings[bytes.readUInt32LE(typeOffset + i * 4)]);
  const fieldCount = bytes.readUInt32LE(0x50), fieldOffset = bytes.readUInt32LE(0x54);
  return Array.from({ length: fieldCount }, (_, i) => {
    const offset = fieldOffset + i * 8;
    return { owner: types[bytes.readUInt16LE(offset)], type: types[bytes.readUInt16LE(offset + 2)], name: strings[bytes.readUInt32LE(offset + 4)] };
  });
}
const REQUIRED = {
  SpeakerEmbeddingExtractorConfig: { model: 'Ljava/lang/String;', numThreads: 'I', debug: 'Z', provider: 'Ljava/lang/String;' },
  VadModelConfig: {
    sileroVadModelConfig: 'Lcom/k2fsa/sherpa/onnx/SileroVadModelConfig;',
    tenVadModelConfig: 'Lcom/k2fsa/sherpa/onnx/TenVadModelConfig;',
    sampleRate: 'I', numThreads: 'I', provider: 'Ljava/lang/String;', debug: 'Z',
  },
  SileroVadModelConfig: { model: 'Ljava/lang/String;', threshold: 'F', minSilenceDuration: 'F', minSpeechDuration: 'F', windowSize: 'I', maxSpeechDuration: 'F' },
  TenVadModelConfig: { model: 'Ljava/lang/String;', threshold: 'F', minSilenceDuration: 'F', minSpeechDuration: 'F', windowSize: 'I', maxSpeechDuration: 'F' },
  SpeechSegment: { start: 'I', samples: '[F' },
};
function verify(files) {
  const fields = files.flatMap(file => fieldsInDex(fs.readFileSync(file)));
  for (const [owner, required] of Object.entries(REQUIRED)) {
    const descriptor = 'Lcom/k2fsa/sherpa/onnx/' + owner + ';';
    for (const [name, type] of Object.entries(required)) {
      if (!fields.some(field => field.owner === descriptor && field.name === name && field.type === type)) {
        throw new Error('Packaged JNI field missing or renamed: ' + owner + '.' + name + ':' + type);
      }
    }
  }
  console.log('Verified JNI configuration fields and types in packaged DEX.');
}
if (require.main === module) {
  const directory = process.argv[2];
  if (!directory) throw new Error('Usage: node scripts/verify-sherpa-dex.cjs <extracted-dex-directory>');
  const files = fs.readdirSync(directory).filter(name => /^classes\d*\.dex$/.test(name)).map(name => path.join(directory, name));
  if (!files.length) throw new Error('No packaged DEX files found');
  verify(files);
}
module.exports = { fieldsInDex, verify };
