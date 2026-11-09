import { requireNativeModule } from 'expo';
export type AudioChunk = { samples: number[]; sequence: number; sampleRate: number };
export default requireNativeModule('VoiceCapture') as {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'onChunk', listener: (event: AudioChunk) => void): { remove(): void };
  addListener(event: 'onCaptureError', listener: (event: { message: string }) => void): { remove(): void };
};
