export interface SpeechDetector {
  reset(): Promise<void>;
  clear(): Promise<void>;
  acceptWaveform(samples: number[]): Promise<void>;
  flush(): Promise<void>;
  empty(): Promise<boolean>;
  front(): Promise<{ samples: number[] }>;
  pop(): Promise<void>;
}

/** Sherpa updates speech boundaries per call: never pass a whole recording at once. */
export async function detectSpeech(vad: SpeechDetector, samples: number[]): Promise<number[]> {
  await vad.reset();
  await vad.clear();
  const speech: number[] = [];
  const drain = async () => {
    while (!await vad.empty()) {
      const segment = await vad.front();
      for (const value of segment.samples) speech.push(value);
      await vad.pop();
    }
  };
  for (let offset = 0; offset < samples.length; offset += 512) {
    const frame = samples.slice(offset, offset + 512);
    while (frame.length < 512) frame.push(0);
    await vad.acceptWaveform(frame);
    await drain();
  }
  await vad.flush();
  await drain();
  // Zero padding on the last frame must not extend audio beyond the source length.
  return speech.slice(0, samples.length);
}

export function audioMetrics(samples: number[]) {
  let energy = 0, peak = 0;
  for (const value of samples) { energy += value * value; peak = Math.max(peak, Math.abs(value)); }
  const rms = samples.length ? Math.sqrt(energy / samples.length) : 0;
  return { rms, peak, dbfs: rms > 0 ? 20 * Math.log10(rms) : -120 };
}

export function speechStatus(input: number[], speech: number[], sampleRate: number, minimumSeconds: number) {
  if (!input.some(value => value !== 0)) return 'noInput' as const;
  if (!speech.length) return 'noSpeech' as const;
  if (speech.length < minimumSeconds * sampleRate) return 'tooShort' as const;
  return 'speech' as const;
}
