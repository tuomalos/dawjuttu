"""
main.py — Stage 1+2 entry point
Run this to test your audio engine and sequencer from the terminal.

Controls:
  SPACE     — play / pause
  s         — stop and reset
  p         — print the current grid
  b         — change BPM
  1-4       — toggle steps on track 1 (kick) for quick testing
  q         — quit

Usage:
  python main.py kick.wav snare.wav hihat.wav
  (pass WAV file paths as arguments)
"""

import sys
import time
import threading
from audio_engine import AudioEngine, Sample
from sequencer import Sequencer, Track


def get_char():
    """Read a single keypress without pressing Enter (cross-platform)."""
    if sys.platform == "win32":
        import msvcrt
        ch = msvcrt.getwch()
        return ch
    else:
        import tty, termios
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            return sys.stdin.read(1)
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)


def print_help():
    print("\n--- Mini DAW Terminal ---")
    print("SPACE  = play/pause")
    print("s      = stop + reset")
    print("p      = print grid")
    print("b      = set BPM")
    print("m 1-4  = mute/unmute track (e.g. 'm' then '2')")
    print("q      = quit")
    print("------------------------\n")


def main():
    # ── Load samples ──────────────────────────────────────────────
    sample_paths = sys.argv[1:]

    if not sample_paths:
        print("No WAV files provided. Using sine tone demo mode.")
        print("Usage: python main.py kick.wav snare.wav hihat.wav\n")
        demo_mode = True
    else:
        demo_mode = False

    engine = AudioEngine()
    engine.start()

    seq = Sequencer(engine, steps=16)

    if demo_mode:
        # Generate simple sine-wave samples on the fly for demo
        import numpy as np
        import soundfile as sf
        import tempfile, os

        def make_tone(freq, duration=0.1, sr=44100):
            t = np.linspace(0, duration, int(sr * duration), endpoint=False)
            wave = np.sin(2 * np.pi * freq * t) * np.exp(-t * 20)
            wave = wave.astype(np.float32)
            path = tempfile.mktemp(suffix=".wav")
            sf.write(path, wave, sr)
            return path

        paths = [make_tone(f) for f in [80, 200, 400, 800]]
        names = ["Kick", "Snare", "HiHat", "Perc"]
        print("Demo mode: generated 4 sine-wave tones.\n")
    else:
        paths = sample_paths
        names = [p.split("/")[-1].split(".")[0] for p in paths]

    # ── Build tracks ───────────────────────────────────────────────
    for name, path in zip(names, paths):
        sample = Sample(path)
        track = Track(name, sample)
        seq.add_track(track)

    # Default pattern for demo (classic 4/4 kick on beats 1,5,9,13)
    if seq.tracks:
        for step in [0, 4, 8, 12]:
            seq.tracks[0].set_step(step, True)
    if len(seq.tracks) > 1:
        for step in [4, 12]:
            seq.tracks[1].set_step(step, True)
    if len(seq.tracks) > 2:
        for step in range(0, 16, 2):
            seq.tracks[2].set_step(step, True)

    print_help()
    seq.print_grid()

    # ── Keyboard loop ──────────────────────────────────────────────
    awaiting_mute = False
    try:
        while True:
            ch = get_char()

            if ch == " ":
                if seq.playing:
                    seq.pause()
                else:
                    seq.play()

            elif ch == "s":
                seq.stop()
                seq.print_grid()

            elif ch == "p":
                seq.print_grid()

            elif ch == "b":
                print(f"\nCurrent BPM: {seq.bpm}. Enter new BPM: ", end="", flush=True)
                try:
                    bpm_str = input()
                    seq.bpm = float(bpm_str)
                    print(f"BPM set to {seq.bpm}")
                except ValueError:
                    print("Invalid BPM.")

            elif ch == "m":
                awaiting_mute = True
                print("\nMute which track? (1-{})".format(len(seq.tracks)), end=" ", flush=True)

            elif awaiting_mute and ch.isdigit():
                idx = int(ch) - 1
                if 0 <= idx < len(seq.tracks):
                    track = seq.tracks[idx]
                    track.muted = not track.muted
                    state = "MUTED" if track.muted else "UNMUTED"
                    print(f"\nTrack '{track.name}' {state}")
                awaiting_mute = False

            elif ch == "q":
                print("\nQuitting...")
                break

    except KeyboardInterrupt:
        pass
    finally:
        seq.stop()
        engine.stop()


if __name__ == "__main__":
    main()