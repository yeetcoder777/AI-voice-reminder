import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { createSpeakerEmbeddingExtractor, type SpeakerEmbeddingExtractorEngine } from 'expo-sherpa-onnx';
import { unit, wav } from './voiceMath';

export const MODEL = 'wespeaker_en_voxceleb_resnet34.onnx';
const MODEL_BYTES = 26534365;
const directory = new Directory(Paths.document, 'voice-model');
const model = new File(directory, MODEL);
const profile = new File(Paths.document, 'voice-profile.json');
const clips = new Directory(Paths.cache, 'accepted-voice');
let engine: SpeakerEmbeddingExtractorEngine | undefined;

export async function initialize(onProgress: (message: string) => void) {
  if (engine) return;
  directory.create({ intermediates: true, idempotent: true });
  if (!model.exists || model.size !== MODEL_BYTES) {
    onProgress('Downloading voice model (about 27 MB)…');
    const pending = new File(directory, MODEL + '.part');
    try {
      const response = await LegacyFS.downloadAsync(
        'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/' + MODEL,
        pending.uri);
      if (response.status !== 200 || pending.size !== MODEL_BYTES) throw new Error('Model download incomplete. Check your connection and retry.');
      if (model.exists) model.delete();
      pending.move(model);
    } finally { if (pending.exists) pending.delete(); }
  }
  onProgress('Loading voice model…');
  engine = await createSpeakerEmbeddingExtractor({ model: model.uri.replace('file://', ''), numThreads: 2, provider: 'cpu', debug: false });
}
export async function embedding(samples: number[], sampleRate: number) {
  if (!engine) throw new Error('Load the voice model first');
  const stream = await engine.createStream();
  try {
    await stream.acceptWaveform(samples, sampleRate);
    if (!await stream.isReady()) throw new Error('Not enough audio for voice matching');
    return unit(await stream.compute());
  } finally { await stream.destroy(); }
}
export function loadProfile(): number[] | null {
  if (!profile.exists) return null;
  try {
    const data = JSON.parse(profile.textSync());
    if (data.model !== MODEL || !Array.isArray(data.embedding)) return null;
    return unit(data.embedding);
  } catch { return null; }
}
export function saveProfile(vector: number[]) {
  profile.create({ overwrite: true });
  profile.write(JSON.stringify({ version: 1, model: MODEL, embedding: unit(vector) }));
}
export function removeProfile() { if (profile.exists) profile.delete(); }
export function saveClip(samples: number[], rate: number): string {
  clips.create({ intermediates: true, idempotent: true });
  const file = new File(clips, Date.now() + '-' + Math.random().toString(36).slice(2) + '.wav');
  file.create();
  file.write(wav(samples, rate));
  return file.uri;
}
export function deleteClip(uri: string) { const file = new File(uri); if (file.exists) file.delete(); }
export function clearClips() { if (clips.exists) clips.delete(); }
