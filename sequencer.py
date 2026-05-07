"""
sequencer.py — Stage 2
A 16-step beat sequencer. Manages tracks, steps, and timing.
"""

import threading
import time
from audio_engine import AudioEngine, Sample


class Track:
    """One row in the sequencer (e.g. Kick, Snare, Hi-hat)."""

    def __init__(self, name: str, sample: Sample, steps: int = 16):
        self.name = name
        self.sample = sample
        self.steps = steps
        # Each step is True (on) or False (off)
        self.pattern: list[bool] = [False] * steps
        self.volume: float = 1.0
        self.muted: bool = False

    def toggle_step(self, step_index: int):
        """Toggle a step on or off."""
        self.pattern[step_index] = not self.pattern[step_index]

    def set_step(self, step_index: int, value: bool):
        self.pattern[step_index] = value


class Sequencer:
    """
    Drives the beat grid. Runs a background thread that advances
    one step at a time based on BPM.
    """

    def __init__(self, engine: AudioEngine, steps: int = 16):
        self.engine = engine
        self.steps = steps
        self.tracks: list[Track] = []
        self.bpm: float = 120.0
        self.current_step: int = 0
        self.playing: bool = False
        self._thread: threading.Thread | None = None

    def add_track(self, track: Track):
        self.tracks.append(track)
        print(f"Track added: {track.name}")

    def remove_track(self, name: str):
        self.tracks = [t for t in self.tracks if t.name != name]

    @property
    def step_duration(self) -> float:
        """Duration of one 16th note in seconds."""
        return 60.0 / self.bpm / 4.0

    def play(self):
        """Start playback from current step."""
        if self.playing:
            return
        self.playing = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        print(f"Sequencer playing at {self.bpm} BPM")

    def stop(self):
        """Stop playback."""
        self.playing = False
        self.current_step = 0
        print("Sequencer stopped.")

    def pause(self):
        """Pause without resetting step position."""
        self.playing = False
        print("Sequencer paused.")

    def _loop(self):
        """Main sequencer loop — runs in background thread."""
        while self.playing:
            step_start = time.perf_counter()

            self._fire_step(self.current_step)

            # Advance step
            self.current_step = (self.current_step + 1) % self.steps

            # Sleep for the remainder of this step's duration
            elapsed = time.perf_counter() - step_start
            sleep_time = self.step_duration - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    def _fire_step(self, step: int):
        """Trigger all active tracks at the current step."""
        for track in self.tracks:
            if not track.muted and track.pattern[step]:
                # Temporarily adjust sample volume by track volume
                original_vol = track.sample.volume
                track.sample.volume = original_vol * track.volume
                self.engine.trigger(track.sample)
                track.sample.volume = original_vol

    def print_grid(self):
        """Print the current pattern to the terminal (useful before UI)."""
        step_str = "".join(
            f"[{i+1:02d}]" if i == self.current_step and self.playing
            else "    "
            for i in range(self.steps)
        )
        header = f"{'STEP':<10}" + "".join(f"{i+1:02d}  " for i in range(self.steps))
        print("\n" + header)
        print("-" * len(header))
        for track in self.tracks:
            row = f"{track.name:<10}"
            for active in track.pattern:
                row += " X  " if active else " .  "
            mute_str = " [MUTED]" if track.muted else ""
            print(row + mute_str)
        print()
