/** Similarity is a geometric score, not a probability. */
export function unit(vector: number[]): number[] {
  if (!vector.length || vector.some(v => !Number.isFinite(v))) throw new Error('Invalid voice embedding');
  const magnitude = Math.hypot(...vector);
  if (magnitude < 1e-8) throw new Error('Voice embedding was empty; speak clearly and retry');
  return vector.map(v => v / magnitude);
}
export function centroid(vectors: number[][]): number[] {
  if (!vectors.length) throw new Error('No enrollment samples');
  const normalized = vectors.map(unit);
  if (normalized.some(v => v.length !== normalized[0].length)) throw new Error('Embedding dimensions differ');
  return unit(normalized[0].map((_, i) => normalized.reduce((sum, v) => sum + v[i], 0) / normalized.length));
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Voice profile is incompatible; enroll again');
  const x = unit(a), y = unit(b);
  return Math.max(-1, Math.min(1, x.reduce((sum, v, i) => sum + v * y[i], 0)));
}
export function rms(samples: number[]): number {
  return samples.length ? Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length) : 0;
}
/** Standard mono PCM16 WAV for replaying accepted windows. */
export function wav(samples: number[], sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const label = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const value = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true); });
  return bytes;
}
