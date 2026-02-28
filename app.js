/* ============================================
   Piano Composer - Main Application
   ============================================ */

(function () {
  'use strict';

  // =============================================
  //  STATE
  // =============================================
  const state = {
    mode: 'tap', // 'tap' | 'assign' | 'arrange'
    bpm: 120,
    timeSignature: 4,
    metronomeOn: false,
    metronomeTimer: null,
    metronomeBeat: 0,

    // Tap rhythm
    tapRecording: false,
    tapStartTime: null,
    taps: [],           // Array of { time: seconds relative to start }
    maxTapDuration: 8,  // seconds of recording window

    // Assign notes
    selectedTapIndex: -1,
    noteAssignments: [], // Array of { tapIndex, midi, time }

    // Themes
    themes: [],          // Array of { id, name, color, taps, notes, bpm, timeSig }
    nextThemeId: 1,

    // Arrangement
    arrangement: [],     // Array of { themeId, index }
    selectedThemeCard: null,
    loopArrangement: false,
    isPlaying: false,
    playbackTimer: null,
  };

  const audio = new PianoAudioEngine();

  // =============================================
  //  DOM REFS
  // =============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    modeTabs: $$('.mode-tab'),
    modePanels: $$('.mode-panel'),
    // Tap
    tapPad: $('#tap-pad'),
    tapRippleContainer: $('.tap-ripple-container'),
    tapPrompt: $('.tap-prompt'),
    timelineTaps: $('#timeline-taps'),
    timelineBeats: $('#timeline-beats'),
    rhythmTimeline: $('#rhythm-timeline'),
    tempoDisplay: $('#tempo-display'),
    tempoUp: $('#tempo-up'),
    tempoDown: $('#tempo-down'),
    timeSig: $('#time-signature'),
    btnMetronome: $('#btn-metronome'),
    btnClearRhythm: $('#btn-clear-rhythm'),
    btnPlayRhythm: $('#btn-play-rhythm'),
    btnConfirmRhythm: $('#btn-confirm-rhythm'),
    // Assign
    noteTimelineInner: $('#note-timeline-inner'),
    pianoKeyboard: $('#piano-keyboard'),
    btnPlayMelody: $('#btn-play-melody'),
    btnAutoAssign: $('#btn-auto-assign'),
    btnSaveTheme: $('#btn-save-theme'),
    // Arrange
    themeList: $('#theme-list'),
    arrangementDropZone: $('#arrangement-drop-zone'),
    btnNewTheme: $('#btn-new-theme'),
    btnPlayArrangement: $('#btn-play-arrangement'),
    btnStopArrangement: $('#btn-stop-arrangement'),
    btnLoopArrangement: $('#btn-loop-arrangement'),
    btnExportMidi: $('#btn-export-midi'),
    btnExportWav: $('#btn-export-wav'),
    // Settings
    btnSettings: $('#btn-settings'),
    settingsModal: $('#settings-modal'),
    closeSettings: $('#close-settings'),
    masterVolume: $('#master-volume'),
    pianoSoundType: $('#piano-sound-type'),
    reverbAmount: $('#reverb-amount'),
    quantizeValue: $('#quantize-value'),
    // Theme name modal
    themeNameModal: $('#theme-name-modal'),
    themeNameInput: $('#theme-name-input'),
    closeThemeModal: $('#close-theme-modal'),
    colorOptions: $$('.color-opt'),
    btnConfirmThemeName: $('#btn-confirm-theme-name'),
  };

  // =============================================
  //  INIT
  // =============================================
  function init() {
    buildPianoKeyboard();
    renderBeatLines();
    bindEvents();
    loadFromStorage();
    renderThemeList();
    renderArrangement();
  }

  // =============================================
  //  MODE SWITCHING
  // =============================================
  function switchMode(mode) {
    state.mode = mode;
    dom.modeTabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    dom.modePanels.forEach(p => {
      p.classList.toggle('active', p.id === 'mode-' + mode);
    });
    if (mode === 'assign') {
      renderNoteTimeline();
    } else if (mode === 'arrange') {
      renderThemeList();
      renderArrangement();
    }
  }

  // =============================================
  //  TAP RHYTHM
  // =============================================
  function handleTap(e) {
    e.preventDefault();
    initAudio();

    const now = performance.now();

    // Start recording on first tap
    if (state.taps.length === 0) {
      state.tapStartTime = now;
      state.tapRecording = true;
      if (dom.tapPrompt) dom.tapPrompt.style.opacity = '0.15';
    }

    const relativeTime = (now - state.tapStartTime) / 1000; // seconds

    if (relativeTime > state.maxTapDuration) {
      return; // exceeded recording window
    }

    // Quantize if enabled
    const quantize = parseInt(dom.quantizeValue.value);
    let time = relativeTime;
    if (quantize > 0) {
      const beatDuration = 60 / state.bpm;
      const subdivDuration = beatDuration / (quantize / 4);
      time = Math.round(time / subdivDuration) * subdivDuration;
    }

    state.taps.push({ time });
    audio.playTapSound();
    createRipple(e);
    renderTapMarkers();
  }

  function createRipple(e) {
    const rect = dom.tapPad.getBoundingClientRect();
    let x, y;
    if (e.touches) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }
    const ripple = document.createElement('div');
    ripple.className = 'tap-ripple';
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    dom.tapRippleContainer.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  }

  function renderBeatLines() {
    dom.timelineBeats.innerHTML = '';
    const beatDur = 60 / state.bpm;
    const totalBeats = Math.ceil(state.maxTapDuration / beatDur);
    const pxPerSecond = dom.rhythmTimeline.offsetWidth / state.maxTapDuration;

    for (let i = 0; i <= totalBeats; i++) {
      const t = i * beatDur;
      const pct = (t / state.maxTapDuration) * 100;
      if (pct > 100) break;

      const line = document.createElement('div');
      line.className = 'beat-line' + (i % state.timeSignature === 0 ? ' strong' : '');
      line.style.left = pct + '%';
      dom.timelineBeats.appendChild(line);

      if (i % state.timeSignature === 0) {
        const label = document.createElement('div');
        label.className = 'beat-label';
        label.textContent = Math.floor(i / state.timeSignature) + 1;
        label.style.left = pct + '%';
        dom.timelineBeats.appendChild(label);
      }
    }
  }

  function renderTapMarkers() {
    dom.timelineTaps.innerHTML = '';
    state.taps.forEach((tap, i) => {
      const pct = (tap.time / state.maxTapDuration) * 100;
      const marker = document.createElement('div');
      marker.className = 'tap-marker' + (i === state.selectedTapIndex ? ' selected' : '');
      marker.style.left = Math.min(pct, 99) + '%';
      marker.dataset.index = i;
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedTapIndex = i;
        renderTapMarkers();
      });
      dom.timelineTaps.appendChild(marker);
    });
  }

  function clearRhythm() {
    state.taps = [];
    state.tapStartTime = null;
    state.tapRecording = false;
    state.noteAssignments = [];
    state.selectedTapIndex = -1;
    if (dom.tapPrompt) dom.tapPrompt.style.opacity = '1';
    renderTapMarkers();
  }

  function previewRhythm() {
    if (state.taps.length === 0) return;
    initAudio();
    state.taps.forEach((tap) => {
      setTimeout(() => audio.playTapSound(), tap.time * 1000);
    });
  }

  // =============================================
  //  METRONOME
  // =============================================
  function toggleMetronome() {
    state.metronomeOn = !state.metronomeOn;
    dom.btnMetronome.classList.toggle('active', state.metronomeOn);
    if (state.metronomeOn) {
      startMetronome();
    } else {
      stopMetronome();
    }
  }

  function startMetronome() {
    initAudio();
    state.metronomeBeat = 0;
    const beatInterval = (60 / state.bpm) * 1000;
    tick();
    state.metronomeTimer = setInterval(tick, beatInterval);

    function tick() {
      const accent = state.metronomeBeat % state.timeSignature === 0;
      audio.playMetronomeClick(accent);
      state.metronomeBeat++;
    }
  }

  function stopMetronome() {
    if (state.metronomeTimer) {
      clearInterval(state.metronomeTimer);
      state.metronomeTimer = null;
    }
  }

  // =============================================
  //  PIANO KEYBOARD
  // =============================================
  function buildPianoKeyboard() {
    dom.pianoKeyboard.innerHTML = '';
    // Build 3 octaves: C3 to B5 (MIDI 48 to 83)
    const startMidi = 48;
    const endMidi = 84;
    const whiteKeys = [];
    const blackKeys = [];

    // First pass: position white keys
    let whiteIndex = 0;
    for (let midi = startMidi; midi < endMidi; midi++) {
      if (!isBlackKey(midi)) {
        whiteKeys.push({ midi, index: whiteIndex });
        whiteIndex++;
      }
    }

    const whiteKeyWidth = 52;
    const totalWidth = whiteKeys.length * whiteKeyWidth;
    dom.pianoKeyboard.style.width = totalWidth + 'px';

    // Create white keys
    whiteKeys.forEach(wk => {
      const key = document.createElement('button');
      key.className = 'piano-key white';
      key.dataset.midi = wk.midi;
      key.style.left = (wk.index * whiteKeyWidth) + 'px';
      key.style.position = 'absolute';
      const label = document.createElement('span');
      label.className = 'key-label';
      label.textContent = midiToName(wk.midi);
      key.appendChild(label);
      dom.pianoKeyboard.appendChild(key);
    });

    // Create black keys
    whiteIndex = 0;
    for (let midi = startMidi; midi < endMidi; midi++) {
      if (!isBlackKey(midi)) {
        whiteIndex++;
      } else {
        // Position black key relative to white keys
        const leftPos = (whiteIndex - 1) * whiteKeyWidth + whiteKeyWidth * 0.65;
        const key = document.createElement('button');
        key.className = 'piano-key black';
        key.dataset.midi = midi;
        key.style.left = leftPos + 'px';
        const label = document.createElement('span');
        label.className = 'key-label';
        label.textContent = noteDisplayName(midi).replace(/\d/, '');
        key.appendChild(label);
        dom.pianoKeyboard.appendChild(key);
      }
    }

    // Scroll to middle
    const pianoScroll = dom.pianoKeyboard.parentElement;
    setTimeout(() => {
      pianoScroll.scrollLeft = (totalWidth - pianoScroll.offsetWidth) / 2;
    }, 100);
  }

  function handlePianoKey(midi) {
    initAudio();
    const noteId = midiToName(midi);
    const freq = midiToFreq(midi);

    // Play the note
    audio.playNote(noteId, freq, 0.75, 1.5);

    // Visual feedback
    const keyEl = dom.pianoKeyboard.querySelector(`[data-midi="${midi}"]`);
    if (keyEl) {
      keyEl.classList.add('active');
      setTimeout(() => keyEl.classList.remove('active'), 200);
    }

    // If in assign mode and a tap is selected, assign this note
    if (state.mode === 'assign' && state.selectedTapIndex >= 0) {
      assignNoteToTap(state.selectedTapIndex, midi);
    }
  }

  // =============================================
  //  NOTE ASSIGNMENT
  // =============================================
  function renderNoteTimeline() {
    dom.noteTimelineInner.innerHTML = '';
    if (state.taps.length === 0) {
      dom.noteTimelineInner.innerHTML = '<p style="color:var(--text-muted);padding:20px;text-align:center;">No rhythm tapped yet. Go to "Tap Rhythm" first.</p>';
      return;
    }

    const totalDuration = state.taps.length > 0
      ? Math.max(state.taps[state.taps.length - 1].time + 1, state.maxTapDuration)
      : state.maxTapDuration;

    state.taps.forEach((tap, i) => {
      const pct = (tap.time / totalDuration) * 100;
      const block = document.createElement('div');
      const assignment = state.noteAssignments.find(a => a.tapIndex === i);
      const assigned = !!assignment;
      const selected = state.selectedTapIndex === i;

      block.className = 'note-block'
        + (selected ? ' selected' : '')
        + (assigned ? ' assigned' : ' unassigned');
      block.style.left = Math.max(2, Math.min(pct, 96)) + '%';

      if (assigned) {
        const name = noteDisplayName(assignment.midi);
        block.innerHTML = `<span class="note-label">${name.replace(/\d/, '')}</span><span class="note-octave">${name.match(/\d/)?.[0] || ''}</span>`;
      } else {
        block.innerHTML = `<span class="note-label">?</span><span class="note-octave">tap ${i + 1}</span>`;
      }

      block.addEventListener('click', () => {
        state.selectedTapIndex = i;
        renderNoteTimeline();
        highlightAssignedKey(assignment ? assignment.midi : null);
      });

      dom.noteTimelineInner.appendChild(block);
    });
  }

  function assignNoteToTap(tapIndex, midi) {
    // Remove existing assignment for this tap
    state.noteAssignments = state.noteAssignments.filter(a => a.tapIndex !== tapIndex);
    state.noteAssignments.push({
      tapIndex,
      midi,
      time: state.taps[tapIndex].time,
    });

    // Auto-advance to next unassigned tap
    const nextUnassigned = state.taps.findIndex((_, i) =>
      i > tapIndex && !state.noteAssignments.find(a => a.tapIndex === i)
    );
    state.selectedTapIndex = nextUnassigned >= 0 ? nextUnassigned : -1;

    renderNoteTimeline();
    highlightAssignedKey(null);
  }

  function highlightAssignedKey(midi) {
    dom.pianoKeyboard.querySelectorAll('.piano-key').forEach(k => k.classList.remove('highlight'));
    if (midi !== null) {
      const keyEl = dom.pianoKeyboard.querySelector(`[data-midi="${midi}"]`);
      if (keyEl) keyEl.classList.add('highlight');
    }
  }

  function autoAssignNotes() {
    initAudio();
    // Simple auto-fill: assign notes in a pentatonic scale pattern
    const pentatonic = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]; // C major pentatonic across 2 octaves
    state.taps.forEach((tap, i) => {
      if (!state.noteAssignments.find(a => a.tapIndex === i)) {
        const midi = pentatonic[i % pentatonic.length];
        state.noteAssignments.push({ tapIndex: i, midi, time: tap.time });
      }
    });
    state.selectedTapIndex = -1;
    renderNoteTimeline();
  }

  function playMelody() {
    if (state.noteAssignments.length === 0) return;
    initAudio();
    stopPlayback();

    const sorted = [...state.noteAssignments].sort((a, b) => a.time - b.time);
    sorted.forEach(note => {
      const noteId = midiToName(note.midi);
      const freq = midiToFreq(note.midi);
      setTimeout(() => {
        audio.playNote(noteId, freq, 0.75, 1.2);
        // Highlight key
        const keyEl = dom.pianoKeyboard.querySelector(`[data-midi="${note.midi}"]`);
        if (keyEl) {
          keyEl.classList.add('active');
          setTimeout(() => keyEl.classList.remove('active'), 250);
        }
      }, note.time * 1000);
    });
  }

  // =============================================
  //  THEMES
  // =============================================
  let selectedThemeColor = '#6C5CE7';

  function openThemeNameModal() {
    if (state.taps.length === 0) {
      alert('Please tap a rhythm first!');
      return;
    }
    if (state.noteAssignments.length === 0) {
      alert('Please assign at least some notes first!');
      return;
    }
    dom.themeNameInput.value = 'Theme ' + state.nextThemeId;
    selectedThemeColor = '#6C5CE7';
    dom.colorOptions.forEach(c => c.classList.toggle('selected', c.dataset.color === selectedThemeColor));
    dom.themeNameModal.classList.add('active');
    setTimeout(() => dom.themeNameInput.focus(), 100);
  }

  function saveTheme() {
    const name = dom.themeNameInput.value.trim() || ('Theme ' + state.nextThemeId);
    const theme = {
      id: state.nextThemeId++,
      name,
      color: selectedThemeColor,
      taps: [...state.taps],
      notes: [...state.noteAssignments],
      bpm: state.bpm,
      timeSig: state.timeSignature,
    };
    state.themes.push(theme);
    dom.themeNameModal.classList.remove('active');
    saveToStorage();
    renderThemeList();

    // Ask user what to do next
    clearRhythm();
    switchMode('arrange');
  }

  function renderThemeList() {
    if (state.themes.length === 0) {
      dom.themeList.innerHTML = '<div class="empty-themes"><p>No themes yet. Go to "Tap Rhythm" to create your first theme!</p></div>';
      return;
    }

    dom.themeList.innerHTML = '';
    state.themes.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'theme-card' + (state.selectedThemeCard === theme.id ? ' selected' : '');
      card.innerHTML = `
        <div class="theme-color-bar" style="background:${theme.color}"></div>
        <div class="theme-card-name">${escHtml(theme.name)}</div>
        <div class="theme-card-info">${theme.notes.length} notes &bull; ${theme.bpm} BPM</div>
        <div class="theme-card-actions">
          <button class="theme-card-btn play-theme" data-id="${theme.id}">Play</button>
          <button class="theme-card-btn edit-theme" data-id="${theme.id}">Edit</button>
          <button class="theme-card-btn delete delete-theme" data-id="${theme.id}">Delete</button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.theme-card-btn')) return;
        state.selectedThemeCard = state.selectedThemeCard === theme.id ? null : theme.id;
        renderThemeList();
      });

      dom.themeList.appendChild(card);
    });

    // Bind card action buttons
    dom.themeList.querySelectorAll('.play-theme').forEach(btn => {
      btn.addEventListener('click', () => playTheme(parseInt(btn.dataset.id)));
    });
    dom.themeList.querySelectorAll('.edit-theme').forEach(btn => {
      btn.addEventListener('click', () => editTheme(parseInt(btn.dataset.id)));
    });
    dom.themeList.querySelectorAll('.delete-theme').forEach(btn => {
      btn.addEventListener('click', () => deleteTheme(parseInt(btn.dataset.id)));
    });
  }

  function playTheme(themeId) {
    initAudio();
    const theme = state.themes.find(t => t.id === themeId);
    if (!theme) return;
    stopPlayback();

    const sorted = [...theme.notes].sort((a, b) => a.time - b.time);
    sorted.forEach(note => {
      const noteId = midiToName(note.midi);
      const freq = midiToFreq(note.midi);
      setTimeout(() => {
        audio.playNote(noteId, freq, 0.75, 1.2);
      }, note.time * 1000);
    });
  }

  function editTheme(themeId) {
    const theme = state.themes.find(t => t.id === themeId);
    if (!theme) return;
    // Load theme back into tap/assign state
    state.taps = [...theme.taps];
    state.noteAssignments = [...theme.notes];
    state.bpm = theme.bpm;
    state.timeSignature = theme.timeSig;
    state.selectedTapIndex = -1;

    dom.tempoDisplay.textContent = state.bpm;
    dom.timeSig.value = state.timeSignature;
    renderBeatLines();
    renderTapMarkers();

    // Remove theme so saving creates a fresh one (or updated)
    state.themes = state.themes.filter(t => t.id !== themeId);
    state.arrangement = state.arrangement.filter(a => a.themeId !== themeId);
    saveToStorage();

    switchMode('assign');
    renderNoteTimeline();
  }

  function deleteTheme(themeId) {
    state.themes = state.themes.filter(t => t.id !== themeId);
    state.arrangement = state.arrangement.filter(a => a.themeId !== themeId);
    if (state.selectedThemeCard === themeId) state.selectedThemeCard = null;
    saveToStorage();
    renderThemeList();
    renderArrangement();
  }

  // =============================================
  //  ARRANGEMENT
  // =============================================
  function addToArrangement() {
    if (state.selectedThemeCard === null) return;
    state.arrangement.push({
      themeId: state.selectedThemeCard,
      index: state.arrangement.length,
    });
    saveToStorage();
    renderArrangement();
  }

  function removeFromArrangement(index) {
    state.arrangement.splice(index, 1);
    state.arrangement.forEach((a, i) => a.index = i);
    saveToStorage();
    renderArrangement();
  }

  function renderArrangement() {
    const zone = dom.arrangementDropZone;
    zone.innerHTML = '';

    if (state.arrangement.length === 0) {
      zone.innerHTML = '<p class="drop-hint">Tap a theme above, then tap here to add it</p>';
      return;
    }

    state.arrangement.forEach((item, idx) => {
      const theme = state.themes.find(t => t.id === item.themeId);
      if (!theme) return;

      const block = document.createElement('div');
      block.className = 'arrangement-block';
      block.style.background = theme.color;
      block.dataset.index = idx;
      block.innerHTML = `
        <span class="arr-block-name">${escHtml(theme.name)}</span>
        <span class="arr-block-notes">${theme.notes.length} notes</span>
        <button class="arr-remove">&times;</button>
      `;

      block.querySelector('.arr-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromArrangement(idx);
      });

      zone.appendChild(block);
    });
  }

  function playArrangement() {
    if (state.arrangement.length === 0) return;
    initAudio();
    stopPlayback();
    state.isPlaying = true;

    let currentTime = 0;
    const allNotes = [];

    state.arrangement.forEach(item => {
      const theme = state.themes.find(t => t.id === item.themeId);
      if (!theme || theme.notes.length === 0) return;

      const maxTime = Math.max(...theme.taps.map(t => t.time));
      const themeDuration = maxTime + 1; // add 1s gap

      theme.notes.forEach(note => {
        allNotes.push({
          time: currentTime + note.time,
          midi: note.midi,
          arrangementIndex: item.index,
        });
      });

      currentTime += themeDuration;
    });

    const totalDuration = currentTime;

    // Highlight arrangement blocks as they play
    const blocks = dom.arrangementDropZone.querySelectorAll('.arrangement-block');

    allNotes.sort((a, b) => a.time - b.time);

    const timers = [];
    allNotes.forEach(note => {
      const timer = setTimeout(() => {
        if (!state.isPlaying) return;
        const noteId = midiToName(note.midi);
        const freq = midiToFreq(note.midi);
        audio.playNote(noteId, freq, 0.75, 1.2);

        // Highlight current block
        blocks.forEach(b => b.classList.remove('playing'));
        const currentBlock = blocks[note.arrangementIndex];
        if (currentBlock) currentBlock.classList.add('playing');
      }, note.time * 1000);
      timers.push(timer);
    });

    // End playback
    const endTimer = setTimeout(() => {
      blocks.forEach(b => b.classList.remove('playing'));
      state.isPlaying = false;
      if (state.loopArrangement) {
        playArrangement();
      }
    }, totalDuration * 1000);
    timers.push(endTimer);

    state.playbackTimer = timers;
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.playbackTimer) {
      if (Array.isArray(state.playbackTimer)) {
        state.playbackTimer.forEach(t => clearTimeout(t));
      } else {
        clearTimeout(state.playbackTimer);
      }
      state.playbackTimer = null;
    }
    dom.arrangementDropZone.querySelectorAll('.arrangement-block')
      .forEach(b => b.classList.remove('playing'));
  }

  // =============================================
  //  EXPORT
  // =============================================
  function exportMidi() {
    if (state.arrangement.length === 0) {
      alert('Add themes to the arrangement first!');
      return;
    }

    // Build MIDI file manually (minimal Type 0)
    const events = [];
    let currentTime = 0;
    const ticksPerBeat = 480;
    const bpm = state.themes[0]?.bpm || 120;
    const usPerBeat = Math.round(60000000 / bpm);

    // Tempo event
    events.push({ delta: 0, data: [0xFF, 0x51, 0x03,
      (usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF] });

    state.arrangement.forEach(item => {
      const theme = state.themes.find(t => t.id === item.themeId);
      if (!theme) return;

      const maxTime = Math.max(...theme.taps.map(t => t.time));
      const sorted = [...theme.notes].sort((a, b) => a.time - b.time);

      sorted.forEach(note => {
        const absoluteTime = currentTime + note.time;
        const tick = Math.round(absoluteTime * (ticksPerBeat * bpm / 60));
        events.push({ tick, type: 'on', midi: note.midi, vel: 90 });
        events.push({ tick: tick + ticksPerBeat, type: 'off', midi: note.midi, vel: 0 });
      });

      currentTime += maxTime + 1;
    });

    // Sort and convert to delta times
    const noteEvents = events.filter(e => e.type).sort((a, b) => a.tick - b.tick);
    const midiBytes = [];

    // Header: MThd
    midiBytes.push(0x4D, 0x54, 0x68, 0x64); // MThd
    midiBytes.push(0, 0, 0, 6); // Header length
    midiBytes.push(0, 0); // Format 0
    midiBytes.push(0, 1); // 1 track
    midiBytes.push((ticksPerBeat >> 8) & 0xFF, ticksPerBeat & 0xFF);

    // Track: MTrk
    const trackData = [];

    // Tempo
    writeVarLen(trackData, 0);
    trackData.push(0xFF, 0x51, 0x03);
    trackData.push((usPerBeat >> 16) & 0xFF, (usPerBeat >> 8) & 0xFF, usPerBeat & 0xFF);

    let lastTick = 0;
    noteEvents.forEach(ev => {
      const delta = ev.tick - lastTick;
      writeVarLen(trackData, delta);
      if (ev.type === 'on') {
        trackData.push(0x90, ev.midi, ev.vel);
      } else {
        trackData.push(0x80, ev.midi, 0);
      }
      lastTick = ev.tick;
    });

    // End of track
    writeVarLen(trackData, 0);
    trackData.push(0xFF, 0x2F, 0x00);

    midiBytes.push(0x4D, 0x54, 0x72, 0x6B); // MTrk
    const trackLen = trackData.length;
    midiBytes.push((trackLen >> 24) & 0xFF, (trackLen >> 16) & 0xFF,
                    (trackLen >> 8) & 0xFF, trackLen & 0xFF);
    midiBytes.push(...trackData);

    const blob = new Blob([new Uint8Array(midiBytes)], { type: 'audio/midi' });
    downloadBlob(blob, 'composition.mid');
  }

  function writeVarLen(arr, value) {
    if (value < 0) value = 0;
    const bytes = [];
    bytes.push(value & 0x7F);
    value >>= 7;
    while (value > 0) {
      bytes.push((value & 0x7F) | 0x80);
      value >>= 7;
    }
    bytes.reverse();
    arr.push(...bytes);
  }

  function exportWav() {
    if (state.arrangement.length === 0) {
      alert('Add themes to the arrangement first!');
      return;
    }

    // Render to offline audio context
    let totalDuration = 0;
    state.arrangement.forEach(item => {
      const theme = state.themes.find(t => t.id === item.themeId);
      if (!theme) return;
      const maxTime = Math.max(...theme.taps.map(t => t.time));
      totalDuration += maxTime + 1;
    });
    totalDuration += 2; // Extra tail for reverb

    const sampleRate = 44100;
    const offCtx = new OfflineAudioContext(2, sampleRate * totalDuration, sampleRate);

    // Simple rendering: create oscillators for each note
    let currentTime = 0;
    state.arrangement.forEach(item => {
      const theme = state.themes.find(t => t.id === item.themeId);
      if (!theme) return;
      const maxTime = Math.max(...theme.taps.map(t => t.time));

      theme.notes.forEach(note => {
        const t = currentTime + note.time;
        const freq = midiToFreq(note.midi);
        const osc = offCtx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = offCtx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        osc.connect(gain);
        gain.connect(offCtx.destination);
        osc.start(t);
        osc.stop(t + 1.5);

        // Add harmonics
        const osc2 = offCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 2;
        const gain2 = offCtx.createGain();
        gain2.gain.setValueAtTime(0, t);
        gain2.gain.linearRampToValueAtTime(0.12, t + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
        osc2.connect(gain2);
        gain2.connect(offCtx.destination);
        osc2.start(t);
        osc2.stop(t + 1.0);
      });

      currentTime += maxTime + 1;
    });

    offCtx.startRendering().then(buffer => {
      const wav = audioBufferToWav(buffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      downloadBlob(blob, 'composition.wav');
    });
  }

  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = buffer.length * blockAlign;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave channels
    const channels = [];
    for (let i = 0; i < numChannels; i++) channels.push(buffer.getChannelData(i));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =============================================
  //  SETTINGS
  // =============================================
  function openSettings() {
    dom.settingsModal.classList.add('active');
  }

  function closeSettings() {
    dom.settingsModal.classList.remove('active');
  }

  // =============================================
  //  PERSISTENCE (LocalStorage)
  // =============================================
  function saveToStorage() {
    try {
      localStorage.setItem('pianoComposer', JSON.stringify({
        themes: state.themes,
        arrangement: state.arrangement,
        nextThemeId: state.nextThemeId,
        bpm: state.bpm,
        timeSignature: state.timeSignature,
      }));
    } catch (e) { /* quota exceeded, ignore */ }
  }

  function loadFromStorage() {
    try {
      const data = JSON.parse(localStorage.getItem('pianoComposer'));
      if (data) {
        state.themes = data.themes || [];
        state.arrangement = data.arrangement || [];
        state.nextThemeId = data.nextThemeId || 1;
        state.bpm = data.bpm || 120;
        state.timeSignature = data.timeSignature || 4;
        dom.tempoDisplay.textContent = state.bpm;
        dom.timeSig.value = state.timeSignature;
      }
    } catch (e) { /* corrupted data, ignore */ }
  }

  // =============================================
  //  UTILITY
  // =============================================
  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function initAudio() {
    if (!audio.initialized) {
      audio.init();
    } else {
      audio.resume();
    }
  }

  // =============================================
  //  EVENT BINDINGS
  // =============================================
  function bindEvents() {
    // Mode tabs
    dom.modeTabs.forEach(tab => {
      tab.addEventListener('click', () => switchMode(tab.dataset.mode));
    });

    // Tap pad - touch and mouse
    dom.tapPad.addEventListener('touchstart', handleTap, { passive: false });
    dom.tapPad.addEventListener('mousedown', handleTap);

    // Tempo
    dom.tempoUp.addEventListener('click', () => {
      state.bpm = Math.min(300, state.bpm + 5);
      dom.tempoDisplay.textContent = state.bpm;
      renderBeatLines();
      if (state.metronomeOn) { stopMetronome(); startMetronome(); }
    });
    dom.tempoDown.addEventListener('click', () => {
      state.bpm = Math.max(40, state.bpm - 5);
      dom.tempoDisplay.textContent = state.bpm;
      renderBeatLines();
      if (state.metronomeOn) { stopMetronome(); startMetronome(); }
    });

    // Time signature
    dom.timeSig.addEventListener('change', () => {
      state.timeSignature = parseInt(dom.timeSig.value);
      renderBeatLines();
    });

    // Metronome
    dom.btnMetronome.addEventListener('click', toggleMetronome);

    // Tap actions
    dom.btnClearRhythm.addEventListener('click', clearRhythm);
    dom.btnPlayRhythm.addEventListener('click', previewRhythm);
    dom.btnConfirmRhythm.addEventListener('click', () => {
      if (state.taps.length === 0) {
        alert('Tap a rhythm first!');
        return;
      }
      switchMode('assign');
    });

    // Piano keyboard - touch and mouse
    dom.pianoKeyboard.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const key = e.target.closest('.piano-key');
      if (key) handlePianoKey(parseInt(key.dataset.midi));
    }, { passive: false });

    dom.pianoKeyboard.addEventListener('mousedown', (e) => {
      const key = e.target.closest('.piano-key');
      if (key) handlePianoKey(parseInt(key.dataset.midi));
    });

    // Note assign actions
    dom.btnPlayMelody.addEventListener('click', playMelody);
    dom.btnAutoAssign.addEventListener('click', autoAssignNotes);
    dom.btnSaveTheme.addEventListener('click', openThemeNameModal);

    // Theme name modal
    dom.colorOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        selectedThemeColor = opt.dataset.color;
        dom.colorOptions.forEach(c => c.classList.toggle('selected', c === opt));
      });
    });
    dom.btnConfirmThemeName.addEventListener('click', saveTheme);
    dom.closeThemeModal.addEventListener('click', () => dom.themeNameModal.classList.remove('active'));
    dom.themeNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveTheme();
    });

    // Arrange
    dom.btnNewTheme.addEventListener('click', () => {
      clearRhythm();
      switchMode('tap');
    });
    dom.arrangementDropZone.addEventListener('click', (e) => {
      if (e.target.closest('.arrangement-block')) return;
      addToArrangement();
    });
    dom.btnPlayArrangement.addEventListener('click', playArrangement);
    dom.btnStopArrangement.addEventListener('click', stopPlayback);
    dom.btnLoopArrangement.addEventListener('click', () => {
      state.loopArrangement = !state.loopArrangement;
      dom.btnLoopArrangement.classList.toggle('active', state.loopArrangement);
    });

    // Export
    dom.btnExportMidi.addEventListener('click', exportMidi);
    dom.btnExportWav.addEventListener('click', exportWav);

    // Settings
    dom.btnSettings.addEventListener('click', openSettings);
    dom.closeSettings.addEventListener('click', closeSettings);
    dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) closeSettings();
    });
    dom.themeNameModal.addEventListener('click', (e) => {
      if (e.target === dom.themeNameModal) dom.themeNameModal.classList.remove('active');
    });

    dom.masterVolume.addEventListener('input', () => {
      audio.setVolume(dom.masterVolume.value / 100);
    });
    dom.pianoSoundType.addEventListener('change', () => {
      audio.setSoundType(dom.pianoSoundType.value);
    });
    dom.reverbAmount.addEventListener('input', () => {
      audio.setReverb(dom.reverbAmount.value / 100);
    });

    // Keyboard shortcuts (for desktop testing)
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (state.mode === 'tap') {
          handleTap(e);
        } else if (state.mode === 'arrange') {
          if (state.isPlaying) stopPlayback();
          else playArrangement();
        }
      }
    });

    // Window resize
    window.addEventListener('resize', () => {
      renderBeatLines();
    });
  }

  // =============================================
  //  START
  // =============================================
  document.addEventListener('DOMContentLoaded', init);
  // Also init immediately if DOM is already ready
  if (document.readyState !== 'loading') init();
})();
