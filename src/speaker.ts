import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { createSpeakerEmbeddingExtractor, createVAD, type SpeakerEmbeddingExtractorEngine, type VADEngine } from 'expo-sherpa-onnx';
import { unit, wav } from './voiceMath';
import { detectSpeech } from './speechDetection';

export const MODEL = 'wespeaker_en_voxceleb_resnet34.onnx';
const MODEL_BYTES = 26534365;
const directory = new Directory(Paths.document, 'voice-model');
const model = new File(directory, MODEL);
const profile = new File(Paths.document, 'voice-profile.json');
const clips = new Directory(Paths.cache, 'accepted-voice');
let engine: SpeakerEmbeddingExtractorEngine | undefined;
let vad: VADEngine | undefined;
const settings = new File(Paths.document, 'voice-settings.json');

async function download(target: File, url: string, bytes: number, label: string, onProgress: (message: string) => void) {
  if (target.exists && target.size === bytes) return;
  // move() mutates the File object's URI; cleanup must retain the ORIGINAL path.
  const pendingUri = new File(directory, target.name + '.part').uri;
  const pending = new File(pendingUri);
  if (pending.exists) pending.delete();
  try {
    const task = LegacyFS.createDownloadResumable(url, pending.uri, {}, progress => {
      const percent = progress.totalBytesExpectedToWrite > 0 ? Math.round(progress.totalBytesWritten * 100 / progress.totalBytesExpectedToWrite) : 0;
      onProgress('Downloading ' + label + '… ' + percent + '%');
    });
    const response = await task.downloadAsync();
    if (response?.status !== 200 || pending.size !== bytes) throw new Error(label + ' download incomplete. Check your connection and retry.');
    if (target.exists) target.delete();
    await pending.move(target);
    const installed = new File(target.uri);
    if (!installed.exists || installed.size !== bytes) throw new Error(label + ' could not be installed. Retry model setup.');
  } finally {
    const leftover = new File(pendingUri);
    if (leftover.exists) leftover.delete();
  }
}

export async function initialize(onProgress: (message: string) => void) {
  if (engine && vad) return;
  directory.create({ intermediates: true, idempotent: true });
  await download(model, 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/' + MODEL,
    MODEL_BYTES, 'voice model (27 MB)', onProgress);
  const vadModel = new File(directory, 'silero_vad.onnx');
  await download(vadModel, 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    643854, 'speech detector', onProgress);
  onProgress('Loading voice model…');
  if (!engine) engine = await createSpeakerEmbeddingExtractor({ model: model.uri.replace('file://', ''), numThreads: 2, provider: 'cpu', debug: false });
  if (!vad) vad = await createVAD({ sampleRate: 16000, numThreads: 1, provider: 'cpu',
    sileroVadModelConfig: { model: vadModel.uri.replace('file://', ''), threshold: 0.5,
      minSilenceDuration: 0.25, minSpeechDuration: 0.25, windowSize: 512, maxSpeechDuration: 10 } }, 15);
}
/** Reset per overlapping window so shared audio is not fed to recurrent VAD twice. */
export async function speechOnly(samples: number[]): Promise<number[]> {
  if (!vad) throw new Error('Load the speech detector first');
  return detectSpeech(vad, samples);
}
export function loadThreshold(): number {
  try { const value = JSON.parse(settings.textSync()).threshold; return typeof value === 'number' && value >= 0.2 && value <= 0.9 ? value : 0.5; }
  catch { return 0.5; }
}
export function saveThreshold(threshold: number) {
  settings.create({ overwrite: true });
  settings.write(JSON.stringify({ threshold }));
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
