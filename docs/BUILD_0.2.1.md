# Model-install fix: test APK 0.2.1

The phone's "speaker embedding model not found" error was caused by unawaited File.move() and cleanup through a File object whose URI changes after moving. The fix awaits installation, verifies the destination, and removes only the original temporary path. Both speaker and VAD model downloads use this corrected lifecycle.

- Source commit: 38e4e725641a10d3c19d884e05dbe9a2305f300e.
- Successful build: https://github.com/yeetcoder777/AI-voice-reminder/actions/runs/42862479670.
- Local APK: artifacts/AI-Reminder-Test-0.2.1.apk.
- Package: com.aireminder.prototype.testing; version 0.2.1; version code 3.
- APK size: 45,740,254 bytes.
- APK SHA-256: d65cd4b062d71bab67215955770666a1cd17860b65786589cdbe9b3da6176a72.

Passed: TypeScript, 13 tests, Expo Doctor 20/20, Android bundling and cloud native compilation. The downloaded ZIP matched GitHub's artifact digest. Package/version, manifest, DEX, JavaScript bundle and ARM64 speaker library were checked in the APK. On-device model initialization and speaker accuracy require retesting on the Realme.

Install this APK and open **AI Reminder Test**. Check that its badge says **0.2.1**. This is a separate app from the EAS-signed **AI Reminder** shown in the original screenshot. Tap Download & load voice model (or Retry model setup). No phone-settings change is needed for the model-file error. After successful setup, enroll and test your voice. No Metro server is required.
