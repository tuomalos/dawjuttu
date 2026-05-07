# Mini DAW — Stage 1 & 2

A simple beat sequencer built in Python. Foundation for a full DAW.

## Install

```bash
pip install sounddevice numpy soundfile
```

## Run

```bash
# With your own WAV drum samples:
python main.py kick.wav snare.wav hihat.wav clap.wav

# Demo mode (generates sine tones, no samples needed):
python main.py
```

## Controls

| Key       | Action                        |
|-----------|-------------------------------|
| `SPACE`   | Play / Pause                  |
| `s`       | Stop and reset to step 1      |
| `p`       | Print the beat grid           |
| `b`       | Change BPM                    |
| `m` + `1-4` | Mute / unmute a track       |
| `q`       | Quit                          |

## File Structure

```
audio_engine.py   — Sample loading + real-time audio output
sequencer.py      — 16-step beat grid, BPM, track management
main.py           — Entry point, keyboard controls
```

## What's next (Stage 3)

- PyQt6 GUI with clickable step buttons
- Visual step highlight during playback
- Volume sliders per track
