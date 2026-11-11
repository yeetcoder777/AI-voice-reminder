# Enrollment and speech-detection fix: APK 0.3.0

The user reported that the microphone meter moved but every voice was called quiet, and three samples were not collected clearly. Two independent faults were corrected:

1. The absolute RMS cutoff of 0.008 rejected low-volume audio before VAD. It is removed. Input level is diagnostic information rather than an identity decision.
2. Six seconds were fed to Sherpa VAD in one call. Its pinned backend updates speech boundaries per call, so that can return only a short tail. VAD now receives 512-sample frames (32 ms), with segment draining and final flushing.

Enrollment now records three independent samples. Each recording stops after its first six-second window, or can be stopped earlier. The user replays and explicitly confirms each sample. A capture session cannot count twice. The profile is saved only after all three confirmations; canceling retains the previous profile. One draft raw recording is cached for replay, then deleted after confirmation, retake, cancel or next startup.

No-input, no-speech and short-speech counters are separate. The app shows RMS dBFS, peak and detected speech duration. Enrollment requires two seconds of detected speech per sample; voice tests require one second. The speaker identity threshold is unchanged.

## Verified build

- Source commit: 123f5ce8ee6fe97797315838083d113b07777d49.
- Successful build: https://github.com/yeetcoder777/AI-voice-reminder/actions/runs/43009517027.
- Artifact: AI-Reminder-Test-0.3.0.
- Local APK: artifacts/AI-Reminder-Test-0.3.0.apk.
- Package: com.aireminder.prototype.testing; version code 5.
- APK size: 45,796,251 bytes.
- SHA-256: fd17c1c37bc2fa5f0cda8779133fc4a50559a83e4223ba24100345f9d4c82c99.

Passed: TypeScript, 21 unit/regression tests, Expo Doctor 1.21.6 (20/20), Android bundling, native release compilation, packaged JNI-field checks, downloaded artifact checksum, package/version and embedded JavaScript checks. The latest Expo Doctor 1.21.7 invocation failed to resolve its own @expo/env dependency locally; the previously working 1.21.6 checker was used instead.

## Actual native VAD experiment

CI used sherpa-onnx 1.12.29, matching the app wrapper's backend version, with its Silero model and an official public speech-only recording (itn-zh-number.wav). First-six-second input: RMS 0.037217, peak 0.242676. Results:

| Input method | Detected speech |
| --- | --- |
| Old one-call six-second input | 0.314 seconds |
| New 512-sample frames | 4.256 seconds |
| New frames with audio volume multiplied by 0.1 | 5.242 seconds |
| Silence | 0 seconds |

The reduced-volume input's RMS is about 0.00372, below the former cutoff. This verifies the framing bug and low-volume path with a real native backend and one known reference, not general Hindi/English accuracy or Realme microphone behavior. The first CI attempt used another reference whose first six seconds produced no speech; it was replaced with the short speech-only fixture before accepting the build.

## Phone retest

Install 0.3.0 and open AI Reminder Test. Load cached models, choose Enroll my voice or Record enrollment again, then Record sample 1 → Replay → Use sample 1. Repeat for samples 2 and 3. Speak naturally through each six-second recording. Start a voice test after the third confirmation. If anything is rejected, report the displayed input dBFS/peak and detected speech duration along with the separate counter, rather than treating it as a quiet-voice decision.

Actual Realme enrollment, playback, Hindi/English speaker-match quality and long-session performance still require phone testing.
