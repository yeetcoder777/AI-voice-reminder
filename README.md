# AI Reminder — voice prototype

An Android-first Expo / React Native prototype for enrolling one voice and keeping audio windows that match it. No transcription, summaries, tasks, or reminder scheduling yet.

## Run on your Realme

Use Node.js 22 LTS or newer supported by Expo SDK 58. Open PowerShell in this folder:

~~~powershell
npm install
npm run typecheck
npm test
npx expo-doctor
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile development
~~~

EAS may ask you to create/link an Expo project and generate an Android signing key. Install the resulting development APK from the Expo build page on your phone. Then:

~~~powershell
npm start
~~~

Keep the phone and computer on the same Wi-Fi and open the Metro QR code in your installed development app. If LAN discovery fails, try npx expo start --dev-client --tunnel. Expo Go cannot load the custom microphone and speaker modules. Adding/changing native code requires rebuilding the APK; ordinary screen changes use Metro.

For a standalone APK without Metro: npx eas-cli@latest build --platform android --profile preview.

## First experiment

1. Tap Download & load voice model. Only this setup download needs internet (about 27 MB); matching uses local inference.
2. Tap Enroll my voice and grant microphone access. Keep speaking naturally, alone, for about 16 seconds. Follow the changing prompts. Three six-second windows create a reference embedding. Audio windows share one second.
3. Tap Start voice test. Speak for at least six seconds. Watch the score and accepted/rejected counters. Stop, then replay accepted windows.
4. Repeat with someone else's voice, one speaker at a time. Try both Hindi and English, then mixed speech. Test across different sentences so you measure voice matching rather than matching a memorized phrase.
5. Adjust the threshold only while stopped. Start at 0.50 as an uncalibrated experiment. Log ten windows of your voice and ten of someone else's per language. Count own-voice rejections and other-voice acceptances. Choose a threshold based on those results; there is no guaranteed accuracy.
6. After the model is downloaded, repeat in airplane mode to verify local operation (use the standalone preview APK to remove Metro's network dependency).

Keep the screen open. Leaving the app stops capture. Each window is classified as a whole: speaker changes inside a window, overlapping voices, music, and TV can cause incorrect accepts or rejects. This is not source separation, biometric authentication, or production speech detection. Quiet windows are filtered by RMS amplitude only; noise can pass that check. The English-trained speaker model's performance on Hindi must be measured on your samples.

## What is stored

- The downloaded model and one voice-profile JSON in the app documents directory.
- Up to 12 accepted six-second WAV windows in cache (overlap is audible on replay). Previous prototype clips are removed at app startup. Android may also evict cache.
- Rejected windows and enrollment audio are never written to disk. They exist temporarily in memory while embeddings are computed.
- Delete accepted audio and Delete my voice profile are separate controls. Deleting the profile retains the downloaded model. Uninstalling clears app data.

## Architecture

Android AudioRecord → mono PCM16 at 16 kHz → continuous native thread → 6-second windows / 1-second overlap → energy gate → Sherpa speaker embedding → cosine comparison → accept/discard.

Enrollment normalizes three embeddings, averages them, then normalizes again. Each test embedding is compared against that reference. A similarity score is not a probability.

The native recorder continues while a window is processed. Only one inference runs at a time. If another window arrives while inference is busy, that window is skipped and the skipped counter increases. This bounds processing memory for the prototype, but does not provide lossless production buffering. The final partial window is discarded on Stop; this version emits only full six-second windows. The future hour-long pipeline needs speech boundaries, a disk-backed bounded queue, final-window flushing, lifecycle recovery, and a microphone foreground service.

## Files to study

- App.tsx: permissions, enrollment/test state, controls, lifecycle and result counters.
- modules/voice-capture/: Android AudioRecord capture; one continuous microphone stream.
- src/speaker.ts: model installation, native embedding extraction, profile and WAV storage.
- src/voiceMath.ts: normalization, centroid, cosine similarity, amplitude gate, WAV encoding.
- docs/LEARNING.md: explanation and interview prompts.

## Verification status

Dependencies are installed and package-lock.json is included. Passed: TypeScript (tsc --noEmit), all seven automated math/WAV and native-patch tests, Expo Doctor (20/20), native autolinking discovery for voice-capture and expo-sherpa-onnx, and the final Android Metro/Hermes bundle export.

An APK has not been compiled or installed. Native Kotlin compilation, permissions, microphone capture, voice quality, playback, visual layout, and device performance remain unverified until a real Android build and phone test. EAS project/account setup is still required for a cloud build. npm reported five moderate dependency advisories during installation; no breaking force-upgrades were applied.

The pinned expo-sherpa-onnx 0.0.8 wrapper declares itself experimental. Its published package includes the speaker API and Android arm64 library, but Expo SDK 58 compatibility still needs a real build.

References: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo APK builds](https://docs.expo.dev/build-reference/apk/), [speaker wrapper](https://github.com/tirth0/expo-sherpa-onnx), [Sherpa speaker models](https://k2-fsa.github.io/sherpa/onnx/speaker-identification/).

## Native build fix: Method too large

The first EAS build compiled voice-capture successfully but failed in expo-sherpa-onnx 0.0.8 because ExpoSherpaOnnxModule.definition exceeded the JVM per-method bytecode limit. scripts/fix-sherpa-kotlin.cjs splits its 113 registrations into 29 non-inline helper methods, preserving their order, function bodies and lifecycle cleanup. The npm postinstall hook applies the fix on EAS as well as locally. SHA-256 guards reject unreviewed dependency source changes; repeated installation is safe. Keep scripts/ in the build upload. If upgrading the pinned wrapper, review this patch first.

Regression checks verify the patch is idempotent, rejects unexpected upstream code, and preserves all registration signatures in order. A cloud Android build is still needed to validate native compilation.
