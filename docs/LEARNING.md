# Learn the first prototype

## 1. The boundary between JavaScript and native code

React Native renders the screen and manages decisions. Android's AudioRecord owns the microphone. The local Expo module exposes start(), stop(), and events. This boundary exists because the JavaScript UI thread is not a reliable place to acquire audio samples on a fixed schedule.

Try first: find the Start voice test button in App.tsx, follow begin(), then read startCapture() in VoiceCaptureModule.kt. Do not start by memorizing the model API.

## 2. What audio looks like

At 16 kHz, the microphone produces 16,000 samples each second. One sample represents signal amplitude at an instant, not a word or a voice identity. PCM16 uses signed 16-bit values. We divide by 32,768 to represent them approximately between -1 and 1 for the model.

Six seconds contain 96,000 samples. Keeping the last 16,000 gives one second of overlap, so subsequent full windows arrive every five seconds. The first three arrive at roughly 6, 11, and 16 seconds. No recorder restart is needed at the boundaries.

Question: why would two separate stop/start recordings risk losing words?

## 3. Enrollment is not model training

The pretrained model converts speech to a fixed-length numerical vector. We store a normalized average of three such vectors. Model weights stay unchanged. English/Hindi support for transcription is a separate question from the speaker model's cross-language reliability.

Question: what changes on disk when you re-enroll? What does not change?

## 4. Verification

The cosine score compares vector direction. A threshold converts that score to an accept/reject decision. Raising it can reduce acceptance of other people but reject more of your speech. A value of 0.8 is not 80 percent confidence.

Test with different phrases, distances and languages. Keep results from enrollment separate from test recordings. Do not claim accuracy from one successful replay.

Question: how would you choose a threshold when false accepts are more costly than false rejects?

## 5. Capture and processing happen concurrently

The native thread keeps reading samples while the embedding model processes a previous window. This is producer-consumer architecture. This prototype skips windows if its consumer is busy and shows that count. A production version would use bounded disk buffering and define what to do when the buffer fills.

Question: if five seconds of incoming speech takes eight seconds to process, what happens during an hour?

## Interview explanation

I built an Android-first React Native prototype using Expo development builds. A custom Kotlin module captures mono PCM continuously and emits overlapping windows. A pretrained Sherpa-ONNX speaker model creates embeddings. Enrollment stores a normalized reference vector; verification compares new embeddings using cosine similarity and an adjustable threshold. Matching windows can be replayed locally. I still need to validate device performance and calibrate Hindi/English false accepts and false rejects. Whole-window matching cannot separate simultaneous speakers.
