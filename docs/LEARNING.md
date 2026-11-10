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

The native thread keeps reading samples while the embedding model processes a previous window. This is producer-consumer architecture. Version 0.2 buffers up to four windows including the active one and shows a skipped count only when that limit is reached. A production version would use bounded disk buffering and define what to do when the buffer fills.

Question: if five seconds of incoming speech takes eight seconds to process, what happens during an hour?

## Interview explanation

I built an Android-first React Native prototype using Expo development builds. A custom Kotlin module captures mono PCM continuously and emits overlapping windows. A pretrained Sherpa-ONNX speaker model creates embeddings. Enrollment stores a normalized reference vector; verification compares new embeddings using cosine similarity and an adjustable threshold. Matching windows can be replayed locally. I still need to validate device performance and calibrate Hindi/English false accepts and false rejects. Whole-window matching cannot separate simultaneous speakers.

## Build debugging: JavaScript and native compilation are different

The initial EAS failure was in the speaker dependency, not the audio capture module. Its large Kotlin definition() method registered 113 APIs. Expo registration helpers are inlined, so the compiled JVM method exceeded the bytecode limit even though the source was valid Kotlin. The fix moves registrations into 29 ordinary helper methods, keeping each generated method smaller.

TypeScript and Metro validate the JavaScript side; neither compiles this Kotlin file. That is why they could pass while the APK build failed. The postinstall script makes the fix reproducible on a fresh cloud machine instead of relying on a manual node_modules edit.

Interview question: why would increasing build memory or retrying an unchanged build fail to solve a method-size compiler error?

## Version 0.2: detecting speech and finishing work

Volume and speech are different. A fan can be loud but contain no speech. The inexpensive RMS gate rejects very quiet windows; Silero VAD then identifies speech regions. Only those regions go into the voice embedding, and at least two seconds are required. VAD answers whether speech is present, not whose voice it is. The speaker model still makes the identity decision. VAD is reset per overlapping window so shared samples do not enter its recurrent state twice.

Capture and inference use different clocks. A bounded promise queue serializes expensive inference while capture continues. It holds at most four audio windows; if processing remains slower than capture, it eventually overflows. More queue capacity delays this problem but does not make inference faster. The processing-time readout helps measure this on your phone.

Stop now has two stages: stop acquiring new samples, then drain the processing queue. A final native audio window is returned by stop() when long enough. The screen says it is finishing so the user knows the microphone is off even while inference continues. Enrollment completion deliberately discards its tail. Session IDs prevent results from an old capture being mistaken for a new one.

Try it: record for roughly four seconds, stop, and check whether enough speech is detected for a final match. Then record silence and check that it creates no accepted clip. Finally, change the threshold, restart the app, and verify that the setting was saved. Keep actual results separate from source-level expectations.

## Version 0.2.1: asynchronous operations and mutable file handles

The phone exposed a model-not-found error during setup. The cause was our file-install code: in SDK 58, File.move() is asynchronous and changes the File object's uri after moving it. Starting the move without await let cleanup race it. Cleaning up through the same object after moving could instead delete the installed model.

The fix preserves the original temporary URI as an immutable string, awaits the move, verifies the destination, then cleans only that original temporary path through a fresh File object. Regression tests simulate an asynchronous move that mutates uri and check that both model files survive before native initialization. They also check cached/offline setup and failed download/move cleanup. These tests cover the file-lifecycle bug, not actual Android inference quality.

Interview question: why is adding await alone insufficient if finally still calls delete() on the moved source object?

## Version 0.2.2: release optimization and JNI field names

After model installation succeeded, the phone reached native model creation and failed to find a field called model. We inspected the shipped APK's DEX field table: R8 had renamed the four SpeakerEmbeddingExtractorConfig fields to a, b, c, and d. The prebuilt native library still performs JNI GetFieldID lookups using the original names. A successful compilation cannot establish that these string-based lookups will work at runtime.

The fix supplies consumer ProGuard rules to keep Sherpa's JNI-facing classes and all their members. This applies to both GitHub and EAS release builds through postinstall, without disabling optimization for the whole app. The CI build now extracts the actual APK's DEX and checks field names and descriptors for speaker config, VAD config, both VAD model configs and speech-segment results. The old APK fails that check at exactly the field named in the phone error.

Interview question: why can a release build compile successfully while a native library fails to find a Kotlin field at runtime?
