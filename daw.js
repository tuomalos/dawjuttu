// DAW Frontend Controller
const API_BASE = 'http://localhost:5000/api';

// Note frequencies for piano roll
const NOTE_NAMES = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4',
                    'C5', 'C#5', 'D5', 'D#5', 'E5', 'F5', 'F#5', 'G5', 'G#5', 'A5', 'A#5', 'B5',
                    'C6', 'C#6', 'D6', 'D#6', 'E6', 'F6', 'F#6', 'G6'];

let state = {
  tracks: [],
  playing: false,
  currentStep: 0,
  bpm: 120,
  steps: 128, // 8 bars of 16 steps
};

let pianoNotes = {};
let awaitingMute = false;
let selectedTrack = 0;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function init() {
  await fetchState();
  renderChannelRack();
  renderPianoRoll();
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
/* CHANNEL RACK RENDERING */
// ═══════════════════════════════════════════════════════════════════════════

function renderChannelRack() {
  const rack = document.getElementById('channel-rack');
  rack.innerHTML = '';

  state.tracks.forEach((track, index) => {
    const channel = document.createElement('div');
    channel.className = 'channel';

    // Left controls (indicator, mute, solo)
    const leftControls = document.createElement('div');
    leftControls.className = 'channel-controls-left';

    const indicator = document.createElement('div');
    indicator.className = 'channel-indicator';
    if (track.muted) {
      indicator.classList.add('off');
    }
    indicator.onclick = () => apiCall(`/track/${index}/mute`, 'POST');
    leftControls.appendChild(indicator);

    const muteBtn = document.createElement('button');
    muteBtn.className = 'channel-icon-btn';
    muteBtn.textContent = '🔇';
    muteBtn.title = 'Mute';
    muteBtn.onclick = () => apiCall(`/track/${index}/mute`, 'POST');
    leftControls.appendChild(muteBtn);

    const soloBtn = document.createElement('button');
    soloBtn.className = 'channel-icon-btn';
    soloBtn.textContent = 'S';
    soloBtn.title = 'Solo';
    leftControls.appendChild(soloBtn);

    // Track name
    const name = document.createElement('div');
    name.className = 'channel-name';
    name.textContent = track.name;
    name.onclick = () => {
      selectedTrack = index;
      renderPianoRoll();
    };

    // Step buttons (8 visible steps showing pattern)
    const stepsDiv = document.createElement('div');
    stepsDiv.className = 'channel-steps';

    for (let i = 0; i < 32; i += 4) {
      const stepBtn = document.createElement('button');
      stepBtn.className = 'step-btn';
      if (track.pattern[i]) {
        stepBtn.classList.add('active');
      }
      if (i === state.currentStep) {
        stepBtn.classList.add('current');
      }
      stepBtn.textContent = String.fromCharCode(9632); // filled square
      stepBtn.onclick = () => toggleStep(index, i);
      stepsDiv.appendChild(stepBtn);
    }

    channel.appendChild(leftControls);
    channel.appendChild(name);
    channel.appendChild(stepsDiv);
    rack.appendChild(channel);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
/* PIANO ROLL RENDERING */
// ═══════════════════════════════════════════════════════════════════════════

function renderPianoRoll() {
  renderPianoKeys();
  renderPianoGrid();
}

function renderPianoKeys() {
  const keysContainer = document.getElementById('piano-keys');
  keysContainer.innerHTML = '';

  NOTE_NAMES.reverse().forEach((note) => {
    const key = document.createElement('div');
    key.className = 'piano-key';
    
    // Check if it's a black key
    if (note.includes('#')) {
      key.classList.add('black');
    }
    
    key.textContent = note;
    keysContainer.appendChild(key);
  });

  NOTE_NAMES.reverse(); // reverse back
}

function renderPianoGrid() {
  const grid = document.getElementById('piano-roll-grid');
  grid.innerHTML = '';

  const notesReverse = [...NOTE_NAMES].reverse();
  const cols = 128; // 8 bars × 16 steps

  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${notesReverse.length}, 24px)`;

  for (let note = 0; note < notesReverse.length; note++) {
    for (let step = 0; step < cols; step++) {
      const cell = document.createElement('div');
      cell.className = 'piano-note';

      const key = `${selectedTrack}-${step}-${note}`;
      if (pianoNotes[key]) {
        cell.classList.add('active');
      }

      if (step === state.currentStep) {
        cell.classList.add('current');
      }

      cell.onclick = () => togglePianoNote(selectedTrack, step, note, cell);
      grid.appendChild(cell);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
/* EVENT HANDLERS */
// ═══════════════════════════════════════════════════════════════════════════

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
  document.getElementById(tabName).classList.add('active');

  // Activate button
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

async function toggleStep(trackIndex, step) {
  await apiCall(`/track/${trackIndex}/step/${step}`, 'POST');
  renderChannelRack();
}

function togglePianoNote(trackIndex, step, note, element) {
  const key = `${trackIndex}-${step}-${note}`;
  
  if (pianoNotes[key]) {
    delete pianoNotes[key];
    element.classList.remove('active');
  } else {
    pianoNotes[key] = true;
    element.classList.add('active');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
/* POLLING & UPDATES */
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
  const bar = Math.floor(state.currentStep / 16) + 1;
  const beat = (state.currentStep % 16) + 1;
  info.textContent = `Bar: ${bar} | Beat: ${beat}`;
}

function updateCurrentStep() {
  // Update channel rack visual
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.classList.remove('current');
  });

  // Update piano roll visual
  document.querySelectorAll('.piano-note').forEach(note => {
    note.classList.remove('current');
  });

  const currentStepDisplay = state.currentStep % 32;
  document.querySelectorAll('.step-btn').forEach((btn, idx) => {
    if (idx === Math.floor(currentStepDisplay / 4)) {
      btn.classList.add('current');
    }
  });

  document.querySelectorAll('.piano-note').forEach((note, idx) => {
    if (idx % 128 === state.currentStep % 128) {
      note.classList.add('current');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
/* START */
// ═══════════════════════════════════════════════════════════════════════════

init();
