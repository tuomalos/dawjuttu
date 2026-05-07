"""
server.py — Flask API server for the web-based DAW
Wraps the audio_engine and sequencer modules to provide REST endpoints.
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import os
import sys
import numpy as np
import soundfile as sf
import tempfile
from audio_engine import AudioEngine, Sample
from sequencer import Sequencer, Track

app = Flask(__name__)
CORS(app)

# Global state
engine = None
sequencer = None

def make_tone(freq, duration=0.1, sr=44100):
    """Generate a sine wave tone for demo mode."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    wave = np.sin(2 * np.pi * freq * t) * np.exp(-t * 20)
    wave = wave.astype(np.float32)
    path = tempfile.mktemp(suffix=".wav")
    sf.write(path, wave, sr)
    return path

def init_daw():
    """Initialize the DAW with demo sine tones."""
    global engine, sequencer
    
    engine = AudioEngine()
    engine.start()
    
    sequencer = Sequencer(engine, steps=16)
    
    # Create 4 demo tracks with sine waves at different frequencies
    freqs = [80, 200, 400, 800]
    names = ["Kick", "Snare", "HiHat", "Perc"]
    
    for name, freq in zip(names, freqs):
        path = make_tone(freq)
        sample = Sample(path)
        track = Track(name, sample)
        sequencer.add_track(track)
    
    # Set default pattern (classic 4/4 kick on beats 1,5,9,13)
    if sequencer.tracks:
        for step in [0, 4, 8, 12]:
            sequencer.tracks[0].set_step(step, True)
    if len(sequencer.tracks) > 1:
        for step in [4, 12]:
            sequencer.tracks[1].set_step(step, True)
    if len(sequencer.tracks) > 2:
        for step in range(0, 16, 2):
            sequencer.tracks[2].set_step(step, True)
    
    print("DAW initialized with 4 demo sine-wave tracks.")
    return True

# ── API Endpoints ──────────────────────────────────────────────

@app.route('/')
def serve_index():
    """Serve the main HTML UI."""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files (CSS, JS)."""
    return send_from_directory('.', path)

@app.route('/api/init', methods=['POST'])
def api_init():
    """Initialize the DAW."""
    try:
        init_daw()
        return jsonify({'status': 'ok', 'message': 'DAW initialized'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/status', methods=['GET'])
def api_status():
    """Get current DAW status."""
    if not sequencer or not engine:
        return jsonify({'status': 'not_initialized'})
    
    return jsonify({
        'playing': sequencer.playing,
        'bpm': sequencer.bpm,
        'current_step': sequencer.current_step,
        'master_volume': engine.master_volume,
        'tracks': [
            {
                'name': t.name,
                'muted': t.muted,
                'volume': t.volume,
                'pattern': t.pattern
            }
            for t in sequencer.tracks
        ]
    })

@app.route('/api/play', methods=['POST'])
def api_play():
    """Start playback."""
    if not sequencer:
        return jsonify({'status': 'error', 'message': 'DAW not initialized'}), 400
    
    sequencer.play()
    return jsonify({'status': 'ok', 'playing': True})

@app.route('/api/pause', methods=['POST'])
def api_pause():
    """Pause playback."""
    if not sequencer:
        return jsonify({'status': 'error', 'message': 'DAW not initialized'}), 400
    
    sequencer.pause()
    return jsonify({'status': 'ok', 'playing': False})

@app.route('/api/stop', methods=['POST'])
def api_stop():
    """Stop playback and reset."""
    if not sequencer:
        return jsonify({'status': 'error', 'message': 'DAW not initialized'}), 400
    
    sequencer.stop()
    return jsonify({'status': 'ok', 'playing': False, 'current_step': 0})

@app.route('/api/bpm', methods=['POST'])
def api_set_bpm():
    """Set BPM."""
    if not sequencer:
        return jsonify({'status': 'error', 'message': 'DAW not initialized'}), 400
    
    data = request.json
    bpm = data.get('bpm', sequencer.bpm)
    
    try:
        sequencer.bpm = float(bpm)
        return jsonify({'status': 'ok', 'bpm': sequencer.bpm})
    except ValueError:
        return jsonify({'status': 'error', 'message': 'Invalid BPM'}), 400

@app.route('/api/master-volume', methods=['POST'])
def api_set_master_volume():
    """Set master volume."""
    if not engine:
        return jsonify({'status': 'error', 'message': 'DAW not initialized'}), 400
    
    data = request.json
    volume = float(data.get('volume', 0.8))
    
    if not 0 <= volume <= 1:
        return jsonify({'status': 'error', 'message': 'Volume must be 0-1'}), 400
    
    engine.master_volume = volume
    return jsonify({'status': 'ok', 'master_volume': engine.master_volume})

@app.route('/api/track/<int:track_idx>/toggle-step/<int:step_idx>', methods=['POST'])
def api_toggle_step(track_idx, step_idx):
    """Toggle a step on/off."""
    if not sequencer or track_idx >= len(sequencer.tracks):
        return jsonify({'status': 'error', 'message': 'Invalid track'}), 400
    
    track = sequencer.tracks[track_idx]
    track.toggle_step(step_idx)
    
    return jsonify({
        'status': 'ok',
        'track': track_idx,
        'step': step_idx,
        'active': track.pattern[step_idx]
    })

@app.route('/api/track/<int:track_idx>/set-step/<int:step_idx>', methods=['POST'])
def api_set_step(track_idx, step_idx):
    """Set a step to a specific value."""
    if not sequencer or track_idx >= len(sequencer.tracks):
        return jsonify({'status': 'error', 'message': 'Invalid track'}), 400
    
    data = request.json
    value = data.get('value', False)
    
    track = sequencer.tracks[track_idx]
    track.set_step(step_idx, value)
    
    return jsonify({
        'status': 'ok',
        'track': track_idx,
        'step': step_idx,
        'active': track.pattern[step_idx]
    })

@app.route('/api/track/<int:track_idx>/mute', methods=['POST'])
def api_mute_track(track_idx):
    """Toggle mute on a track."""
    if not sequencer or track_idx >= len(sequencer.tracks):
        return jsonify({'status': 'error', 'message': 'Invalid track'}), 400
    
    track = sequencer.tracks[track_idx]
    track.muted = not track.muted
    
    return jsonify({
        'status': 'ok',
        'track': track_idx,
        'muted': track.muted
    })

@app.route('/api/track/<int:track_idx>/volume', methods=['POST'])
def api_set_track_volume(track_idx):
    """Set track volume."""
    if not sequencer or track_idx >= len(sequencer.tracks):
        return jsonify({'status': 'error', 'message': 'Invalid track'}), 400
    
    data = request.json
    volume = float(data.get('volume', 1.0))
    
    if not 0 <= volume <= 1:
        return jsonify({'status': 'error', 'message': 'Volume must be 0-1'}), 400
    
    track = sequencer.tracks[track_idx]
    track.volume = volume
    
    return jsonify({
        'status': 'ok',
        'track': track_idx,
        'volume': track.volume
    })

# ── Shutdown ──────────────────────────────────────────────────

def cleanup():
    """Clean up resources on shutdown."""
    if sequencer:
        sequencer.stop()
    if engine:
        engine.stop()

if __name__ == '__main__':
    try:
        app.run(debug=False, host='127.0.0.1', port=5000)
    finally:
        cleanup()
