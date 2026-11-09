# AI Reminder — tentative development plan

This is a working roadmap, not a promise that the proposed models or performance will work. Update it after each device experiment. Progress depends on evidence from the phone rather than fixed dates.

## 1. Product goal

Build an Android app that lets the user explicitly start a conversation session, recognize one enrolled speaker, understand their instructions, save tasks, and deliver local reminders. The motivating example is remembering tasks given by the user's father.

Start development with the user's own voice. Later replace that enrollment with the father's profile. All audio processing and AI inference must eventually run locally on the phone. Internet may be needed for initial model downloads; ordinary use after setup must work offline.

Target device: Realme P4 5G, Dimensity 7400 Ultra, 6 GB RAM. Target speech: Hindi, English, and mixed Hindi–English. Target session length: roughly one hour, explicitly started and stopped by the user.

Keep React Native, TypeScript, and Expo development APKs. Kotlin supports native Android capabilities; it does not replace the frontend with Compose. Expo Go cannot load the custom native modules.

## 2. Current baseline

The current source implements a focused voice prototype:

- Download/load a speaker model and enroll three voice samples.
- Capture continuous mono PCM16 audio at 16 kHz through Android AudioRecord.
- Process six-second windows with one-second overlap.
- Apply an RMS amplitude gate and compare speaker embeddings with cosine similarity.
- Save matching windows, discard rejected windows, and replay accepted WAV clips.
- Adjust the threshold and separately delete the profile or accepted audio.

Enrollment creates a reference embedding; it does not train the model. The starting threshold of 0.50 is uncalibrated, and a similarity score is not a probability. RMS measures energy, not whether speech is present.

Current limitations include skipped windows while inference is busy, discarded final partial windows, foreground-only capture, and whole-window speaker decisions. A window containing several speakers cannot be treated as isolated target speech. Overlapping speakers are not separated.

Transcription, summaries, task extraction, reminders, durable session storage, and production background capture are not implemented.

### Evidence at this planning baseline

Cloud dependency installation, TypeScript, seven existing tests, native module discovery, Android Metro/Hermes export, and serving a development bundle passed. Expo Doctor passed 18/20 checks; two network-dependent checks remain blocked pending environment network changes. These checks do not establish native APK compilation or phone behavior.

The initial EAS build compiled the microphone module but failed in the speaker dependency with a JVM method-size error. `scripts/fix-sherpa-kotlin.cjs`, run by `postinstall`, preserves the dependency registrations while splitting the oversized Kotlin method. Keep its checksum guards and regression tests; review it when upgrading the dependency.

The replacement EAS build's final result is unknown. Check it before submitting another build:

https://expo.dev/accounts/siddhesht/projects/ai-reminder-prototype/builds/10f8c0dc-f3f9-4261-a2a5-4052f8aeea43

## 3. Development approach

Complete one useful vertical slice at a time. Explain each component alongside implementation, trace examples through the actual files, and discuss its trade-offs. Use `docs/LEARNING.md` for explanations and interview questions.

Before advancing, record what was tested, on which device/build/model, and what remains unknown. Distinguish setup failures, code defects, model limitations, and untested behavior. Do not describe a feature as phone-verified based only on TypeScript or bundling.

The four distinct jobs remain:

| Job | Question |
| --- | --- |
| Speech detection | Is someone speaking? |
| Speaker verification | Does this sound like the enrolled person? |
| Speech recognition | What words were spoken? |
| Task extraction | What needs doing, by whom, and when? |

## 4. Phase 1 — build and validate the existing prototype

1. Check the existing replacement EAS build. If it failed, inspect its actual compiler error and address that cause. If it succeeded, install the APK on the Realme.
2. Connect the development APK to Metro using a supported reachable transport. Cloud localhost alone is not reachable from the phone; determine the available connection before prescribing LAN or tunnel steps.
3. Verify model download/loading, interrupted-download recovery, and microphone permission granted/denied behavior.
4. Enroll three samples and verify the profile survives an app restart.
5. Test own-voice acceptance, another speaker's rejection, accepted-audio playback, deletion, Stop, and leaving the app.
6. Repeat in Hindi, English, and mixed speech, using phrases different from enrollment.
7. Once development behavior works, use a standalone preview APK to test operation in airplane mode after the model is installed.

Collect an initial small dataset, such as ten target and ten other-speaker windows per language, then expand across distance, noise, and speakers. Record scores, threshold, accepted/rejected/skipped counts, inference duration, and conditions. Keep enrollment recordings separate from evaluation recordings.

**Exit evidence:** a native build succeeds and core interactions work on the Realme. Report false accepts and false rejects separately and choose a provisional threshold from measured results. Do not infer general accuracy from a few successful trials.

## 5. Phase 2 — reliable session capture and speech segmentation

Replace prototype data loss before relying on long sessions:

- Keep one continuous microphone stream with timestamps and stable segment identifiers.
- Add a real VAD and speech boundaries; Silero through Sherpa is a candidate to evaluate.
- Preserve the final partial segment on Stop and define minimum usable audio length.
- Use a small overlap when a long utterance must be split; reconcile duplicate content downstream.
- Add a bounded disk-backed queue with explicit pending, processing, completed, and failed states.
- Define queue limits, retries, storage cleanup, and visible behavior when processing falls behind. Do not silently drop task-bearing speech.
- Stop microphone capture immediately when requested, then finish queued work with visible progress and cancellation behavior.

Test silence, short utterances, long speech, repeated start/stop, slow inference, full storage, interrupted processing, and restart recovery. Choose segment sizes using device measurements.

**Exit evidence:** final speech is retained, queue/storage growth is bounded, and interrupted work recovers without silent loss or duplicate processing.

## 6. Phase 3 — improve speaker selection

Evaluate the current English-trained speaker model on the actual Hindi/English use case before replacing it. Measure the effect of segment duration, noise, distance, and enrollment quality. VAD segments may be too short for reliable embeddings; group or defer them using a measured minimum-duration policy.

Add enrollment quality feedback and a safe re-enrollment flow. Replacing a profile must not accidentally reuse embeddings from an incompatible model. Store model/version information with the profile.

Define handling for uncertain scores, speaker changes inside a segment, and simultaneous speakers. Prefer marking uncertain segments for review over claiming they contain only the target person. Diarization or source separation would require a separate feasibility experiment if basic segmentation is insufficient.

**Exit evidence:** measured speaker-selection behavior across target languages and an explicit policy for ambiguous segments. Acceptance criteria should reflect the user's tolerance for missed instructions versus unrelated speech entering later stages.

## 7. Phase 4 — offline Hindi–English transcription

Benchmark multilingual Whisper candidates, initially `base` and `small`; do not use English-only `.en` variants. `whisper.rn` is a possible binding, not a committed dependency.

First validate native integration and transcribe one known local clip. Then integrate accepted segments with the queue. Preserve timestamps, original language/text, and links to source segments. Handle overlap duplicates and expose uncertain or failed transcription.

Compare names, numbers, dates, negation, code switching, and realistic instructions. Measure time per minute of audio, peak memory, thermal behavior, storage, and sustained throughput. Select a model based on the phone's accuracy/performance trade-off rather than model size alone.

Keep heavy model inference sequential unless measurements justify concurrency. Continuous capture can run concurrently with processing without loading several heavy models at once. Unload models when needed to stay within the phone's practical memory budget.

**Exit evidence:** useful offline transcripts on representative recordings and a measured backlog policy when transcription is slower than incoming speech.

## 8. Phase 5 — local task extraction and summaries

Evaluate a small quantized instruction model and a suitable React Native inference binding. Qwen3-1.7B in non-thinking mode is one candidate; compatibility, memory use, Hindi quality, licensing, and device performance must be checked before adoption.

Start with saved transcript examples so extraction can be tested independently of microphone and transcription quality. Produce structured proposals with:

- Task title/action and intended assignee.
- Supporting transcript spans and session/segment references.
- Deadline expression, resolved date/time when justified, and ambiguity status.
- Proposed create/update/complete action with links to an existing task when applicable.

Reject malformed model output through schema validation. Do not invent deadlines or treat every statement as an instruction. Resolve relative dates against the utterance's session timestamp and timezone, preserving the original phrase. Ambiguous phrases need clarification or review.

For example, “Kal electricity bill bhar dena” followed by “Actually, parson kar dena” should produce one corrected task, not two reminders. Test repeated instructions, negation, completed statements, vague deadlines, wrong assignees, and instructions quoted by someone else.

Run extraction periodically over accumulated conversational context, with a final pass after Stop. Reconcile results idempotently. Generate summaries grounded in the transcript; keep summaries separate from the task records used for scheduling.

**Exit evidence:** a representative Hindi/English evaluation set demonstrates grounded tasks, correct corrections/deduplication, and explicit uncertainty. Initially require user review before proposed tasks become scheduled reminders.

## 9. Phase 6 — durable tasks and local reminders

Evaluate `expo-sqlite` for local persistence and `expo-notifications` for local notifications. Proposed records include sessions, segments, processing jobs, transcript spans, task revisions, and notification identifiers. Keep migrations and recovery behavior explicit.

Build task review, editing, completion, deletion, and reminder-time selection. Let the user correct the assignee or deadline. Preserve extraction provenance so the user can inspect why a task was suggested.

Schedule reminders locally after confirmation. Updating or completing a task must replace or cancel its old notification. Make repeated processing and app restarts safe from duplicate scheduling. Handle notification permission denial, timezone changes, device reboot, and Android battery restrictions. Decide whether exact timing is required before selecting exact-alarm permissions or APIs.

**Exit evidence:** confirmed tasks survive restart and local reminders are exercised on the Realme, including edit/cancel, denied permissions, and offline behavior.

## 10. Phase 7 — hour-long Android sessions

Add a microphone foreground service and persistent recording notification for user-started sessions, using the Android permissions and lifecycle rules required by the target SDK. Provide clear recording/processing states and a reliable Stop action. Do not assume the current foreground-only recorder can simply continue in the background.

Test screen lock, backgrounding, interruptions, permission revocation, force-stop, low storage, thermal throttling, and battery restrictions on the Realme. Define recovery semantics; Android termination cannot be assumed to preserve a live recorder.

Run progressively longer trials before a full hour. Measure queue depth, memory, CPU, temperature, battery drain, storage, inference throughput, and time required to finish processing after Stop.

**Exit evidence:** a roughly hour-long trial has bounded resources, visible backlog handling, retained final speech, and documented interruption/recovery behavior. Reduce model cost or revise the experience if the device cannot sustain the intended pipeline.

## 11. Phase 8 — integrated offline validation and product polish

Test the complete journey: enroll → start → capture target instructions → stop → finish processing → review tasks → receive reminders. Repeat with the father's replacement profile when the earlier stages are stable.

Use realistic multi-speaker Hindi/English conversations, corrections, vague instructions, noise, and repeated tasks. Attribute failures to speaker selection, transcription, extraction, persistence, or scheduling so fixes target the right stage.

Improve accessibility, progress/error messages, model management, storage usage display, and deletion controls. Clearly distinguish “recording stopped” from “processing finished.” Verify the standalone app works offline after setup and does not depend on Metro or remote AI services.

**Exit evidence:** documented device results and known limitations for the full flow. Release readiness requires a separate decision based on those results.

## 12. Privacy, storage, and model lifecycle

Keep recording explicitly user-controlled and visible. Make sure conversation participants understand the recording. Avoid audio/transcript content in diagnostic logs by default.

Choose and expose retention rules for raw audio, rejected segments, transcripts, profiles, and completed sessions. The current 12-clip prototype cache is not a production retention policy. Provide clear deletion controls and ensure queue cleanup follows them.

Model downloads should support interruption recovery, trusted sources, and integrity verification. The current speaker download checks file size; evaluate a trusted checksum before treating size alone as sufficient integrity evidence. Record model identifiers/versions, disk requirements, and compatible profile formats. Never silently reuse incompatible profiles after an upgrade.

## 13. Tentative architecture

```text
Explicit Start/Stop + visible Android recording service
    → continuous PCM capture and timestamps
    → VAD / bounded speech segments
    → speaker verification with uncertainty handling
    → durable processing queue
    → local multilingual transcription
    → transcript/context store and duplicate reconciliation
    → local task proposals + grounded session summary
    → user review and corrections
    → durable tasks + local notification scheduling
```

This is a conceptual flow. Queue boundaries and model loading order must be refined from measurements. Speaker verification, VAD, transcription, and extraction remain separate responsibilities even if one library supplies several of them.

## 14. Validation and learning record

For each phase, record the build/commit, device/OS, model versions, test conditions, observed results, failures, and next decision. Use existing automated checks where meaningful; add behavioral tests when implementing queue recovery, date interpretation, task reconciliation, and notification lifecycle.

Maintain small reproducible evaluation sets, with consent for any retained recordings. Keep phone tests separate from automated math, schema, and integration tests. Track false speaker accepts/rejects, important transcription errors, task precision/misses, duplicate/correction errors, and reminder delivery behavior.

Learning checkpoints should explain PCM and sampling, embeddings versus training, cosine thresholds, producer/consumer queues, VAD versus transcription, structured extraction, relative dates, database state, and Android lifecycle. Explain one real failure and its diagnosis at each stage.

## 15. Decisions still open

- Final VAD, transcription model, extraction model, inference bindings, and quantization.
- Minimum speaker-verification segment length and threshold calibration.
- Acceptable latency, missed-instruction rate, false accepts, and battery use.
- Queue/storage limits and behavior when processing cannot keep up.
- Required reminder precision and handling of vague deadlines.
- Long-term audio/transcript retention and recovery behavior.
- Phone-to-cloud Metro transport for development.

The next concrete action is Phase 1: check the existing replacement EAS build and validate the prototype on the Realme. Revisit later phases after measuring this baseline.
