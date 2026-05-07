// DAW Frontend Controller
const API_BASE = 'http://localhost:5000/api';

// Note frequencies for piano roll (32 keys)
const NOTE_NAMES = [
  'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
  'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
  'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6'
];

let state = {
  tracks: [],
  playing: false,
  currentStep: 0,
  bpm: 120,
  steps: 128, // 8 bars × 16 steps
};

let pianoNotes = {};
let awaitingMute = false;
let selectedTrack = 0;

// ════════════════════════════════════════════════════════════════[...]
// INITIALIZATION
// ════════════════════════════════════════════════════════════════[...]

async function init() {
  console.log("Initializing DAW...");

  // Ensure backend is initialized
  try {
    await fetch(`${API_BASE}/init`, { method: 'POST' });
  } catch (e) {
    console.log("Backend may already be initialized");
  }

  await fetchState();

  if (state.tracks && state.tracks.length > 0) {
    console.log(`Loaded ${state.tracks.length} tracks`);
  } else {
    console.warn("No tracks loaded - using fallback");
  }

  renderChannelRack();
  renderPianoRoll();
  attachEventListeners();
  startStatusPolling();
}

// ════════════════════════════════════════════════════════════════[...]
// API CALLS
// ════════════════════════════════════════════════════════════════[...]

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

// ════════════════════════════════════════════════════════════════[...]
// CHANNEL RACK RENDERING
// ════════════════════════════════════════════════════════════════[...]

function renderChannelRack() {
  const rack = document.getElementById('channel-rack');
  if (!rack) return; // Add check in case we're not on the rack tab
  rack.innerHTML = '';

  state.tracks.forEach((track, index) => {
    const channel = document.createElement('div');
    channel.className = 'channel';

    // Left controls (indicator, mute, solo)
    const leftControls = document.createElement('div');
    leftControls.className = 'channel-controls-left';

    const indicator = document.createElement('div');
    indicator.className = `channel-indicator ${track.muted ? 'off' : ''}`;
    indicator.title = 'Power';
    indicator.onclick = () => apiCall(`/track/${index}/mute`, 'POST');
    leftControls.appendChild(indicator);

    const muteBtn = document.createElement('button');
    muteBtn.className = 'channel-icon-btn';
    muteBtn.textContent = 'M';
    muteBtn.title = 'Mute';
    muteBtn.onclick = () => apiCall(`/track/${index}/mute`, 'POST');
    leftControls.appendChild(muteBtn);

    const soloBtn = document.createElement('button');
    soloBtn.className = 'channel-icon-btn';
    soloBtn.textContent = 'S';
    soloBtn.title = 'Solo';
    leftControls.appendChild(soloBtn);

    // Track name (clickable to select for piano roll)
    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = track.name;
    name.onclick = () => {
      selectedTrack = index;
      renderPianoRoll();
      switchTab('piano-roll-tab'); // Automatically switch to piano roll
    };

    // Step buttons (16 visible steps showing pattern)
    const stepsDiv = document.createElement('div');
    stepsDiv.className = 'channel-steps';

    for (let i = 0; i < 16; i++) {
      const stepBtn = document.createElement('button');
      stepBtn.className = 'step-btn';
      if (track.pattern && track.pattern[i]) {
        stepBtn.classList.add('active');
      }
      if (i === state.currentStep % 16) {
        stepBtn.classList.add('current');
      }
      stepBtn.textContent = (i + 1);
      stepBtn.onclick = () => toggleStep(index, i);
      stepsDiv.appendChild(stepBtn);
    }

    channel.appendChild(leftControls);
    channel.appendChild(name);
    channel.appendChild(stepsDiv);
    rack.appendChild(channel);
  });
}

// ════════════════════════════════════════════════════════════════[...]
// PIANO ROLL RENDERING
// ════════════════════════════════════════════════════════════════[...]

function renderPianoRoll() {
  renderPianoKeys();
  renderPianoGrid();
}

function renderPianoKeys() {
  const keysContainer = document.getElementById('piano-keys');
  if (!keysContainer) return;
  keysContainer.innerHTML = '';

  const reverseNotes = [...NOTE_NAMES].reverse();

  reverseNotes.forEach((note) => {
    const key = document.createElement('div');
    key.className = 'piano-key';

    // Check if it's a black key
    if (note.includes('#')) {
      key.classList.add('black');
    }

    key.textContent = note;
    keysContainer.appendChild(key);
  });
}

function renderPianoGrid() {
  const grid = document.getElementById('piano-roll-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const reverseNotes = [...NOTE_NAMES].reverse();
  const cols = 128; // 8 bars × 16 steps
  const rows = reverseNotes.length;

  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${rows}, 24px)`;

  for (let note = 0; note < rows; note++) {
    for (let step = 0; step < cols; step++) {
      const cell = document.createElement('div');
      cell.className = 'piano-note';

      const key = `track-${selectedTrack}-step-${step}-note-${note}`;
      if (pianoNotes[key]) {
        cell.classList.add('active');
      }

      if (step === state.currentStep) {
        cell.classList.add('current');
      }

      cell.dataset.track = selectedTrack;
      cell.dataset.step = step;
      cell.dataset.note = note;
      cell.onclick = () => togglePianoNote(cell, key);
      grid.appendChild(cell);
    }
  }
}

// ════════════════════════════════════════════════════════════════[...]
// EVENT HANDLERS
// ════════════════════════════════════════════════════════════════[...]

function attachEventListeners() {
  document.getElementById('play-btn').onclick = () => apiCall('/play', 'POST');
  document.getElementById('pause-btn').onclick = () => apiCall('/pause', 'POST');
  document.getElementById('stop-btn').onclick = () => apiCall('/stop', 'POST');

  document.getElementById('bpm-input').onchange = (e) => {
    apiCall('/bpm', 'POST', { bpm: parseFloat(e.target.value) });
  };

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  // Master volume
  document.getElementById('master-volume').oninput = (e) => {
    document.getElementById('volume-display').textContent = e.target.value + '%';
  };

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ignore key shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT') return;

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

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const selectedTab = document.getElementById(tabName);
  if (selectedTab) selectedTab.classList.add('active');

  // Activate button
  const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (selectedBtn) selectedBtn.classList.add('active');
  if (tabName === 'piano-roll-tab') {
    renderPianoRoll();
  } else if (tabName === 'channel-rack-tab') {
    renderChannelRack();
  }
}


async function toggleStep(trackIndex, step) {
  await apiCall(`/track/${trackIndex}/toggle-step/${step}`, 'POST');
  renderChannelRack();
}

function togglePianoNote(cell, key) {
  if (pianoNotes[key]) {
    delete pianoNotes[key];
    cell.classList.remove('active');
  } else {
    pianoNotes[key] = true;
    cell.classList.add('active');
  }
}

// ════════════════════════════════════════════════════════════════[...]
// POLLING & UPDATES
// ════════════════════════════════════════════════════════════════[...]

function startStatusPolling() {
  setInterval(async () => {
    const oldStep = state.currentStep;
    await fetchState();
    
    // Only update UI if playing or step changed
    if (state.playing || oldStep !== state.currentStep) {
      updateStepDisplay();
      updateCurrentStepDisplay();
    }
  }, 50); // Faster polling for snappier UI
}

function updateStepDisplay() {
  const info = document.getElementById('step-info');
  if (!info) return;
  const bar = Math.floor(state.currentStep / 16) + 1;
  const beat = Math.floor((state.currentStep % 16) / 4) + 1;
  const step = (state.currentStep % 4) + 1;
  info.textContent = `Bar: ${bar} | Beat: ${beat} | Step: ${step}`;
}

function updateCurrentStepDisplay() {
  // Update channel rack
  document.querySelectorAll('.channel').forEach((channel, trackIdx) => {
      const stepBtns = channel.querySelectorAll('.step-btn');
      stepBtns.forEach((btn, stepIdx) => {
          btn.classList.remove('current');
          // In the UI we show 16 steps, which corresponds to modulo 16 of current step
          if (stepIdx === state.currentStep % 16) {
              btn.classList.add('current');
          }
      });
  });

  // Update piano roll
  document.querySelectorAll('.piano-note').forEach((note) => {
    note.classList.remove('current');
    if (parseInt(note.dataset.step) === state.currentStep) {
      note.classList.add('current');
    }
  });
}

// ════════════════════════════════════════════════════════════════[...]
// START
// ════════════════════════════════════════════════════════════════[...]

init();
