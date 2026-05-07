"""
audio_engine.py — Stage 1
Handles sample loading and real-time audio output via sounddevice.
"""

import sounddevice as sd
import soundfile as sf
import numpy as np
import threading


SAMPLE_RATE = 44100
CHANNELS = 2
BUFFER_SIZE = 512


class Sample:
    """A loaded audio sample that can be triggered."""

    def __init__(self, filepath: str, volume: float = 1.0):
        self.name = filepath.split("/")[-1].split(".")[0]
        self.volume = volume
        self._load(filepath)

    def _load(self, filepath: str):
        data, sr = sf.read(filepath, dtype="float32", always_2d=True)

        # Resample if needed (simple: just warn for now)
        if sr != SAMPLE_RATE:
            print(f"Warning: {self.name} is {sr}Hz, engine runs at {SAMPLE_RATE}Hz")

        # Ensure stereo
        if data.shape[1] == 1:
            data = np.repeat(data, 2, axis=1)
        elif data.shape[1] > 2:
            data = data[:, :2]

        self.data = data  # shape: (num_frames, 2)
        print(f"Loaded: {self.name} ({len(data)} frames, {len(data)/SAMPLE_RATE:.2f}s)")


class Voice:
    """A single playing instance of a sample (one-shot)."""

    def __init__(self, sample: Sample):
        self.sample = sample
        self.position = 0
        self.done = False

    def render(self, num_frames: int) -> np.ndarray:
        """Fill a buffer with the next num_frames of audio."""
        remaining = len(self.sample.data) - self.position
        frames_to_copy = min(num_frames, remaining)

        buf = np.zeros((num_frames, 2), dtype=np.float32)
        chunk = self.sample.data[self.position:self.position + frames_to_copy]
        buf[:frames_to_copy] = chunk * self.sample.volume

        self.position += frames_to_copy
        if self.position >= len(self.sample.data):
            self.done = True

        return buf


class AudioEngine:
    """
    Core audio engine. Runs a sounddevice output stream.
    Voices are mixed together in the audio callback.
    """

    def __init__(self):
        self.voices: list[Voice] = []
        self.master_volume: float = 0.8
        self._lock = threading.Lock()
        self._stream = None
        self.running = False

    def start(self):
        """Open the audio stream and start playback."""
        self._stream = sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            blocksize=BUFFER_SIZE,
            dtype="float32",
            callback=self._audio_callback,
        )
        self._stream.start()
        self.running = True
        print(f"Audio engine started (SR={SAMPLE_RATE}, buffer={BUFFER_SIZE})")

    def stop(self):
        """Stop and close the audio stream."""
        if self._stream:
            self._stream.stop()
            self._stream.close()
        self.running = False
        print("Audio engine stopped.")

    def trigger(self, sample: Sample):
        """Trigger a sample to play immediately (call from any thread)."""
        voice = Voice(sample)
        with self._lock:
            self.voices.append(voice)

    def _audio_callback(self, outdata, frames, time, status):
        """
        Called by sounddevice on the audio thread every ~11ms.
        IMPORTANT: No memory allocation, no print(), no blocking here.
        """
        if status:
            pass  # could log to a queue, but no print in callback

        mix = np.zeros((frames, 2), dtype=np.float32)

        with self._lock:
            active = []
            for voice in self.voices:
                mix += voice.render(frames)
                if not voice.done:
                    active.append(voice)
            self.voices = active

        # Apply master volume and soft clip to prevent clipping
        mix *= self.master_volume
        np.clip(mix, -1.0, 1.0, out=mix)
        outdata[:] = mix
