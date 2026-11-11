"""Check the pinned Sherpa VAD backend with public reference speech, not user audio."""
from pathlib import Path
import urllib.request
import numpy as np
import soundfile as sf
import sherpa_onnx

folder = Path('artifacts/vad-smoke')
folder.mkdir(parents=True, exist_ok=True)
base = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/'
for name in ('silero_vad.onnx', 'Obama.wav'):
    target = folder / name
    if not target.exists():
        with urllib.request.urlopen(base + name, timeout=90) as response:
            target.write_bytes(response.read())

audio, rate = sf.read(folder / 'Obama.wav', dtype='float32', always_2d=True)
audio = audio.mean(axis=1)
if rate != 16000:
    audio = np.interp(np.arange(round(len(audio) * 16000 / rate)) / 16000,
                      np.arange(len(audio)) / rate, audio).astype(np.float32)
audio = np.asarray(audio[:96000], dtype=np.float32)
assert len(audio) == 96000, 'Reference must contain at least six seconds'

def detected_seconds(samples, frame_size):
    config = sherpa_onnx.VadModelConfig()
    config.silero_vad.model = str(folder / 'silero_vad.onnx')
    config.silero_vad.threshold = 0.5
    config.silero_vad.min_silence_duration = 0.25
    config.silero_vad.min_speech_duration = 0.25
    config.silero_vad.max_speech_duration = 10
    config.silero_vad.window_size = 512
    config.sample_rate = 16000
    config.num_threads = 1
    vad = sherpa_onnx.VoiceActivityDetector(config, buffer_size_in_seconds=15)
    count = 0
    for offset in range(0, len(samples), frame_size):
        frame = samples[offset:offset + frame_size]
        if len(frame) < frame_size:
            frame = np.pad(frame, (0, frame_size - len(frame)))
        vad.accept_waveform(frame)
        while not vad.empty():
            count += len(vad.front.samples)
            vad.pop()
    vad.flush()
    while not vad.empty():
        count += len(vad.front.samples)
        vad.pop()
    return count / 16000

bulk = detected_seconds(audio, 96000)
framed = detected_seconds(audio, 512)
low = detected_seconds(audio * 0.1, 512)
silence = detected_seconds(np.zeros_like(audio), 512)
print(f'Real VAD: bulk={bulk:.3f}s; framed={framed:.3f}s; low-volume={low:.3f}s; silence={silence:.3f}s', flush=True)
assert framed >= 2, 'Framed reference speech must support enrollment'
assert framed > bulk + 1, 'Reference should reproduce the bulk-input boundary bug'
assert low >= 1, 'Low-volume reference speech must support a voice test'
assert silence == 0, 'Silence must not become speech'
