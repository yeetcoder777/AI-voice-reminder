# AI Reminder — voice prototype 0.2.1

An Android-first Expo / React Native prototype for enrolling one voice and keeping audio windows that match it. No transcription, summaries, tasks, or reminder scheduling yet.

Version 0.2.1 fixes model installation: Expo SDK 58 File.move() returns a promise and changes the source object's URI. Installation now awaits the move, checks the destination file, and cleans only the original temporary path. Version 0.2 could delete or race the downloaded file, producing a native "speaker embedding model not found" error. Install the 0.2.1 APK and retry model setup; no microphone-settings change is required for that error.

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

An alternative GitHub Actions workflow builds a standalone ARM64 APK for testing when EAS is queued. It is named AI Reminder Test, uses package com.aireminder.prototype.testing and the generated Android debug signing key, and installs alongside the EAS-signed app. It is a test artifact, not a store release or a signing-key replacement. No Expo credentials are uploaded to GitHub. Workflow artifacts are retained for 14 days.

## First experiment

1. Tap Download & load voice model. Initial setup downloads the speaker model (about 27 MB) and Silero speech detector (about 644 KB), with progress. Later starts use cached models; matching uses local inference.
2. Tap Enroll my voice and grant microphone access. Keep speaking naturally, alone, for about 16 seconds. Follow the changing prompts. Three six-second windows create a reference embedding. Audio windows share one second.
3. Tap Start voice test. Speak for at least six seconds. Watch the score and accepted/rejected counters. Stop, then replay accepted windows.
4. Repeat with someone else's voice, one speaker at a time. Try both Hindi and English, then mixed speech. Test across different sentences so you measure voice matching rather than matching a memorized phrase.
5. Adjust the threshold only while stopped. Start at 0.50 as an uncalibrated experiment. Log ten windows of your voice and ten of someone else's per language. Count own-voice rejections and other-voice acceptances. Choose a threshold based on those results; there is no guaranteed accuracy.
6. After the model is downloaded, repeat in airplane mode to verify local operation (use the standalone preview APK to remove Metro's network dependency).

Keep the app open; the screen stays awake while recording. Leaving the app stops capture and finishes pending processing. Silero VAD removes non-speech portions before matching, and windows with less than two seconds of detected speech are skipped. This does not distinguish speakers: speaker changes inside a window, overlapping voices, music, and TV can still cause errors. This is not source separation or biometric authentication. The English-trained speaker model's performance on Hindi must be measured on your samples.

## What is stored

- Two downloaded models, one voice-profile JSON, and your selected threshold in app documents.
- Up to 12 accepted speech-only WAV clips in cache, with actual durations (overlap is audible on replay). Previous prototype clips are removed at app startup. Android may also evict cache.
- Rejected windows and enrollment audio are never written to disk. They exist temporarily in memory while embeddings are computed.
- Delete accepted audio and Delete my voice profile are separate controls. Deleting the profile retains the downloaded model. Uninstalling clears app data.

## Architecture

Android AudioRecord → mono PCM16 at 16 kHz → continuous native thread → 6-second windows / 1-second overlap → bounded serial queue → energy gate → Silero VAD → at least 2 seconds of speech → Sherpa speaker embedding → cosine comparison → accept/discard.

Enrollment normalizes three embeddings, averages them, then normalizes again. Each test embedding is compared against that reference. A similarity score is not a probability.

The native recorder continues while a window is processed. A bounded serial queue holds at most four windows including the active inference. Overflow increases the skipped counter. This absorbs short processing delays but does not provide lossless hour-long buffering. Stop turns off the microphone, retrieves its final window if at least two seconds of audio remain, and waits for queued processing. Final windows with less than two seconds of detected speech are skipped. Session IDs prevent old capture events entering a new session. Enrollment completion deliberately discards remaining audio. The future hour-long pipeline needs continuous speech-boundary segmentation, durable disk buffering, lifecycle recovery, and a microphone foreground service.

## Files to study

- App.tsx: permissions, enrollment/test state, controls, lifecycle and result counters.
- modules/voice-capture/: Android AudioRecord capture; one continuous microphone stream.
- src/speaker.ts: model installation, native embedding extraction, profile and WAV storage.
- src/voiceMath.ts: normalization, centroid, cosine similarity, amplitude gate, WAV encoding.
- src/processingQueue.ts: bounded, serial processing and drain-on-stop behavior.
- docs/LEARNING.md: explanation and interview prompts.

## Verification status

Dependencies are installed and package-lock.json is included. Version 0.2 passed TypeScript, all nine automated math/WAV, queue and native-patch tests, Expo Doctor (20/20), and Android Metro/Hermes export.

The previous 0.1 development build (10f8c0dc-f3f9-4261-a2a5-4052f8aeea43) finished successfully on EAS, confirming the native registration fix. Version 0.2 requires a new native APK because the microphone interface changed. Permissions, actual capture, voice accuracy, VAD quality, playback, visual layout, and device performance still require a phone test. npm reported five moderate dependency advisories; no breaking force-upgrades were applied.

Version 0.2 native compilation also succeeded through [GitHub Actions](https://github.com/yeetcoder777/AI-voice-reminder/actions/runs/42830785741), from source commit 278c55c. The downloadable AI-Reminder-Test-0.2.0 artifact contains app-release.apk. On the local development machine the APK is saved under artifacts/AI-Reminder-Test-0.2.0.apk. See docs/PHONE_TEST.md for installation and device checks. GitHub keeps this workflow artifact for 14 days.

The pinned expo-sherpa-onnx 0.0.8 wrapper declares itself experimental. Keep its install-time Kotlin workaround enabled.

References: [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [Expo APK builds](https://docs.expo.dev/build-reference/apk/), [speaker wrapper](https://github.com/tirth0/expo-sherpa-onnx), [Sherpa speaker models](https://k2-fsa.github.io/sherpa/onnx/speaker-identification/).

## Native build fix: Method too large

The first EAS build compiled voice-capture successfully but failed in expo-sherpa-onnx 0.0.8 because ExpoSherpaOnnxModule.definition exceeded the JVM per-method bytecode limit. scripts/fix-sherpa-kotlin.cjs splits its 113 registrations into 29 non-inline helper methods, preserving their order, function bodies and lifecycle cleanup. The npm postinstall hook applies the fix on EAS as well as locally. SHA-256 guards reject unreviewed dependency source changes; repeated installation is safe. Keep scripts/ in the build upload. If upgrading the pinned wrapper, review this patch first.

Regression checks verify the patch is idempotent, rejects unexpected upstream code, and preserves all registration signatures in order. The replacement 0.1 development build finished successfully on EAS.
