import { requireNativeModule } from 'expo';
export type AudioChunk = { samples: number[]; sequence: number; sampleRate: number; sessionId: number; final: boolean };
export default requireNativeModule('VoiceCapture') as {
  start(): Promise<number>;
  stop(): Promise<AudioChunk | null>;
  addListener(event: 'onChunk', listener: (event: AudioChunk) => void): { remove(): void };
  addListener(event: 'onCaptureError', listener: (event: { message: string }) => void): { remove(): void };
  addListener(event: 'onLevel', listener: (event: { level: number }) => void): { remove(): void };
};
