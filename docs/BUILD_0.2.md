# Standalone test APK 0.2.0

- Source commit: 278c55c06642d55bc564645d84245f5a897385f9.
- Successful native build: https://github.com/yeetcoder777/AI-voice-reminder/actions/runs/42830785741.
- GitHub artifact: AI-Reminder-Test-0.2.0, retained for 14 days.
- Local APK: artifacts/AI-Reminder-Test-0.2.0.apk.
- APK size: 45,739,626 bytes (about 43.6 MiB).
- APK SHA-256: 8a05999e2c2d1844e75b556b72b7f135756cc0e12416f141b9f1051d84350c8e.
- Package: com.aireminder.prototype.testing; app name: AI Reminder Test.
- ARM64 standalone release build using the generated Android debug signing key. No Expo signing credentials were copied to GitHub.

Verified locally after download: the artifact ZIP matches GitHub's SHA-256 digest; the APK contains the expected package identifier, Android manifest, DEX code, assets/index.android.bundle and lib/arm64-v8a/libsherpa-onnx-jni.so. Native compilation and all CI steps succeeded. TypeScript, nine automated tests and Expo Doctor passed before submission.

Copy the APK to the Realme, open it, and permit installation from that file source if Android asks. It installs alongside the EAS app; enrollment and model setup are separate because the package is different. No Metro server or Expo Go is needed. Internet is needed for first-use model downloads, then speech detection and voice matching run locally.

Follow PHONE_TEST.md. Physical phone testing, microphone behavior, playback, VAD quality and speaker-match accuracy remain unverified by the coding agent. There is no transcription or reminder scheduling yet.

The separately signed EAS preview build is 8778f75c-ef43-4185-80ec-980b256705a2. Its last observed state was IN_QUEUE; use the completed GitHub test APK now.
