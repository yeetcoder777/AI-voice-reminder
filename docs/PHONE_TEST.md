# Test version 0.3.0 on your Realme

Install the standalone preview APK. It does not need Metro, Expo Go, or the computer after installation. Reuse the existing app installation if Android accepts the update; this preserves the enrolled profile and model. Do not uninstall unless necessary, because that removes app data.

## First use

1. Keep internet on and tap Download & load voice model. Wait for both the speaker model and speech detector to load. Setup shows download percentages.
2. Tap Enroll my voice (or Record enrollment again), then Record sample 1 of 3. Allow microphone access and speak for six seconds until recording stops.
3. Replay the recording. Tap Use sample 1, then record/replay/confirm sample 2 and sample 3. You may retake before confirming. The profile is saved only after all three confirmations. Each is a separate recording, with no shared enrollment audio.
4. If a recording is not accepted, read the actual input dBFS, peak, and detected speech duration. Zero input, no detected speech, and short speech are separate causes. Do not interpret them as failed speaker identity matches.

## Voice matching

1. Start a voice test. Speak in Hindi for 10–15 seconds. Watch the microphone meter, accepted/rejected counters, and similarity score.
2. Stop. The microphone stops first; the app finishes processing pending audio before replay becomes available.
3. Replay accepted clips. Their durations reflect speech detected inside each window.
4. Repeat in English, then mixed Hindi–English. Use different sentences from enrollment.
5. Ask someone else to speak alone. Record whether their voice is accepted or rejected. Take turns in separate tests; mixed-speaker windows are not isolated.

## Edge cases

- Record about four seconds of speech, then Stop. If at least one second of speech is detected in a test, the final partial window should be checked. Enrollment requires two seconds.
- Record silence for ten seconds. It should increase no input or no speech, depending on hardware noise, and create no accepted clip.
- Adjust sensitivity while stopped. Restart the app and check that the value persists.
- Leave the app while recording. It should stop the microphone and finish processing; this is not background-session support.
- The screen should remain awake while recording. Replay should be disabled until recording and processing finish.
- Restarting clears cached replay clips, while retaining enrollment and downloaded models.
- After successful setup, try airplane mode. Local matching should still work.

## Record actual observations

For each language, try ten windows of your own voice and ten of someone else's. Record the threshold, similarity scores, own-voice rejections, other-voice acceptances, processing time, and skipped count. These measurements determine whether to change the threshold or model. A similarity score is not percentage confidence.

The app has not been physically tested by the coding agent. Phone behavior and accuracy must be checked with these experiments. No transcription, summaries, tasks, or reminders are implemented in 0.2.
