// DAW Frontend Controller
const API_BASE = 'http://localhost:5000/api';

let state = {
  tracks: [],
  playing: false,
  currentStep: 0,
  bpm: 120,
  steps: 16,
};

let awaitingMute = false;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function init() {
  await fetchState();
  renderChannelRack();
  renderGrid();
  attachEventListeners();
  startStatusPolling();
}

// ═══════════════════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════════════════

async function fetchState() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    state = await response.json();
  } catch (error) {
    console.error('Failed to fetch state:', error);
  }
}

async function apiCall(endpoint, method = 'POST', data = {}) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (method !== 'GET') {
      options.body = JSON.stringify(data);
    }
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const result = await response.json();
    await fetchState();
    return result;
  } catch (error) {
    console.error(`API call failed: ${endpoint}`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function renderChannelRack() {
  const rack = document.getElementById('channel-rack');
  rack.innerHTML = '';

  state.tracks.forEach((track, index) => {
    const channel = document.createElement('div');
    channel.className = 'channel';

    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = track.name;

    const controls = document.createElement('div');
    controls.className = 'channel-controls';

    // Mute button
    const muteBtn = document.createElement('button');
    muteBtn.className = `mute-btn ${track.muted ? 'muted' : ''}`;
    muteBtn.textContent = track.muted ? '🔇 Muted' : '🔊 Mute';
    muteBtn.onclick = (e) => {
      e.stopPropagation();
      apiCall(`/track/${index}/mute`, 'POST');
    };

    // Volume slider
    const volumeLabel = document.createElement('div');
    volumeLabel.className = 'volume-label';
    volumeLabel.textContent = `Vol: ${Math.round(track.volume * 100)}%`;

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.className = 'volume-slider';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = track.volume * 100;
    volumeSlider.oninput = (e) => {
      volumeLabel.textContent = `Vol: ${e.target.value}%`;
      apiCall(`/track/${index}/volume`, 'POST', { volume: e.target.value / 100 });
    };

    controls.appendChild(muteBtn);
    controls.appendChild(volumeLabel);
    controls.appendChild(volumeSlider);

    channel.appendChild(name);
    channel.appendChild(controls);
    rack.appendChild(channel);
  });
}

function renderGrid() {
  const grid = document.getElementById('sequencer-grid');
  grid.innerHTML = '';

  // Header row (empty top-left + step numbers)
  const empty = document.createElement('div');
  grid.appendChild(empty);
  for (let i = 0; i < state.steps; i++) {
    const header = document.createElement('div');
    header.textContent = i + 1;
    header.style.textAlign = 'center';
    header.style.fontSize = '11px';
    header.style.color = '#666';
    header.style.fontWeight = 'bold';
    grid.appendChild(header);
  }

  // Rows for each track
  state.tracks.forEach((track, trackIndex) => {
    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = track.name;
    grid.appendChild(label);

    for (let step = 0; step < state.steps; step++) {
      const cell = document.createElement('div');
      cell.className = 'step';
      if (track.pattern[step]) {
        cell.classList.add('active');
      }
      if (step === state.currentStep) {
        cell.classList.add('current');
      }
      cell.onclick = () => toggleStep(trackIndex, step);
      grid.appendChild(cell);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

function attachEventListeners() {
  document.getElementById('play-btn').onclick = () => apiCall('/play', 'POST');
  document.getElementById('pause-btn').onclick = () => apiCall('/pause', 'POST');
  document.getElementById('stop-btn').onclick = () => apiCall('/stop', 'POST');

  document.getElementById('bpm-input').onchange = (e) => {
    apiCall('/bpm', 'POST', { bpm: parseFloat(e.target.value) });
  };

  document.getElementById('scale-select').onchange = (e) => {
    state.steps = parseInt(e.target.value);
    renderGrid();
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.playing) {
        apiCall('/pause', 'POST');
      } else {
        apiCall('/play', 'POST');
      }
    } else if (e.key.toLowerCase() === 's') {
      apiCall('/stop', 'POST');
    } else if (e.key.toLowerCase() === 'm') {
      awaitingMute = true;
    } else if (awaitingMute && e.key >= '1' && e.key <= '4') {
      const trackIndex = parseInt(e.key) - 1;
      if (trackIndex < state.tracks.length) {
        apiCall(`/track/${trackIndex}/mute`, 'POST');
        awaitingMute = false;
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'm') {
      awaitingMute = false;
    }
  });
}

async function toggleStep(trackIndex, step) {
  await apiCall(`/track/${trackIndex}/step/${step}`, 'POST');
  renderGrid();
}

// ═══════════════════════════════════════════════════════════════════════════
// POLLING
// ═══════════════════════════════════════════════════════════════════════════

function startStatusPolling() {
  setInterval(async () => {
    await fetchState();
    updateStepDisplay();
    updateCurrentStep();
  }, 100);
}

function updateStepDisplay() {
  const info = document.getElementById('step-info');
  info.textContent = `Step: ${state.currentStep + 1}`;
}

function updateCurrentStep() {
  const steps = document.querySelectorAll('.step');
  steps.forEach((step) => step.classList.remove('current'));

  // Recalculate current positions
  let stepIndex = 0;
  state.tracks.forEach((track) => {
    for (let i = 0; i < state.steps; i++) {
      const cellIndex = stepIndex + i + 1; // +1 for track label
      if (i === state.currentStep) {
        const cell = document.querySelectorAll('.step')[stepIndex * state.steps + i];
        if (cell) {
          cell.classList.add('current');
        }
      }
    }
    stepIndex += 1;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════════════

init();
