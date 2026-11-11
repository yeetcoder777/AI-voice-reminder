# JNI release fix: APK 0.2.2

The phone's "Failed to get field ID for model" error was reproduced by inspecting the 0.2.1 APK. Its SpeakerEmbeddingExtractorConfig class remained named, but its model/numThreads/debug/provider fields had been renamed by R8 to a/b/c/d. The prebuilt native library requires the original names for JNI lookup.

The postinstall hook now supplies library consumer keep rules for com.k2fsa.sherpa.onnx classes and members. CI checks the finished APK's DEX field tables for required speaker and VAD configuration fields, their types, and speech-result fields. The old APK fails that check; the new APK passes it both in CI and after local download.

- Source commit: 465c55a9c543d8f43116722ca33416ffd5127db4.
- Successful build: https://github.com/yeetcoder777/AI-voice-reminder/actions/runs/42869039958.
- GitHub artifact: AI-Reminder-Test-0.2.2.
- Local APK: artifacts/AI-Reminder-Test-0.2.2.apk.
- Size: 45,789,727 bytes.
- SHA-256: 1da7f4a7e736d393632c9dd4e8e2dd1a2b7f5a992c255681801e90928b90709d.
- Package: com.aireminder.prototype.testing; version code 4.

Passed: TypeScript, all 15 tests, Expo Doctor 20/20, Android bundling, native release compilation, packaged JNI field verification, and downloaded artifact checksum verification. Model initialization and inference on a physical phone still require retesting.

Install the APK, open AI Reminder Test, and confirm badge 0.2.2. Retry model setup. Already valid downloads are reused, and missing files are downloaded automatically. Do not open the separate older EAS app when testing this fix. This is a native release fix, so retrying setup in an old APK cannot apply it.
