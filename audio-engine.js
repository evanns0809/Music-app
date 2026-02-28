/* ============================================
   Piano Composer - Audio Engine
   Beautiful piano synthesis using Web Audio API
   with reverb, harmonics, and velocity
   ============================================ */

class PianoAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.compressor = null;
    this.initialized = false;
    this.soundType = 'grand';
    this.reverbAmount = 0.4;
    this.masterVolume = 0.8;
    this.activeNotes = new Map();
  }

  async init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Compressor for smooth dynamics
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    // Master gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    // Dry / Wet (reverb) paths
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1 - this.reverbAmount;

    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = this.reverbAmount;

    // Build reverb impulse
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this._createReverbImpulse(2.5, 3.0);

    // Routing: compressor -> dry + reverb -> master -> destination
    this.compressor.connect(this.dryGain);
    this.compressor.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbGain);
    this.dryGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.initialized = true;
  }

  /** Generate a convolution reverb impulse response */
  _createReverbImpulse(duration, decay) {
    const rate = this.ctx.sampleRate;
    const length = rate * duration;
    const buffer = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /** Set master volume 0-1 */
  setVolume(v) {
    this.masterVolume = v;
    if (this.masterGain) this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Set reverb amount 0-1 */
  setReverb(v) {
    this.reverbAmount = v;
    if (this.dryGain) {
      this.dryGain.gain.setTargetAtTime(1 - v, this.ctx.currentTime, 0.05);
      this.reverbGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  /** Set piano sound type */
  setSoundType(type) {
    this.soundType = type;
  }

  /**
   * Get harmonic profile for different piano sound types.
   * Returns array of { ratio, amplitude, decay } for partials.
   */
  _getHarmonics(type) {
    switch (type) {
      case 'grand':
        return [
          { ratio: 1,   amp: 1.0,  decay: 2.5  },
          { ratio: 2,   amp: 0.45, decay: 2.0  },
          { ratio: 3,   amp: 0.25, decay: 1.6  },
          { ratio: 4,   amp: 0.12, decay: 1.2  },
          { ratio: 5,   amp: 0.07, decay: 1.0  },
          { ratio: 6,   amp: 0.04, decay: 0.8  },
          { ratio: 7,   amp: 0.02, decay: 0.6  },
        ];
      case 'bright':
        return [
          { ratio: 1,   amp: 0.9,  decay: 2.0  },
          { ratio: 2,   amp: 0.55, decay: 1.8  },
          { ratio: 3,   amp: 0.4,  decay: 1.5  },
          { ratio: 4,   amp: 0.25, decay: 1.2  },
          { ratio: 5,   amp: 0.15, decay: 1.0  },
          { ratio: 6,   amp: 0.1,  decay: 0.8  },
          { ratio: 7,   amp: 0.06, decay: 0.6  },
          { ratio: 8,   amp: 0.03, decay: 0.5  },
        ];
      case 'warm':
        return [
          { ratio: 1,   amp: 1.0,  decay: 3.5  },
          { ratio: 2,   amp: 0.3,  decay: 2.8  },
          { ratio: 3,   amp: 0.1,  decay: 2.0  },
          { ratio: 4,   amp: 0.04, decay: 1.5  },
        ];
      case 'electric':
        return [
          { ratio: 1,   amp: 1.0,  decay: 1.8  },
          { ratio: 2,   amp: 0.6,  decay: 1.5  },
          { ratio: 3,   amp: 0.35, decay: 1.2  },
          { ratio: 4,   amp: 0.2,  decay: 0.9  },
          { ratio: 5.02,amp: 0.1,  decay: 0.7  },
          { ratio: 7,   amp: 0.08, decay: 0.5  },
        ];
      default:
        return this._getHarmonics('grand');
    }
  }

  /**
   * Play a piano note.
   * @param {string} noteId - e.g. "C4", "F#3"
   * @param {number} frequency - Hz
   * @param {number} velocity - 0-1
   * @param {number} duration - seconds (0 = sustain until noteOff)
   */
  playNote(noteId, frequency, velocity = 0.7, duration = 0) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const harmonics = this._getHarmonics(this.soundType);
    const noteGain = this.ctx.createGain();
    noteGain.gain.value = 0;
    noteGain.connect(this.compressor);

    const oscillators = [];

    // Higher notes decay faster
    const octave = parseInt(noteId.slice(-1)) || 4;
    const decayMult = Math.max(0.3, 1.0 - (octave - 3) * 0.12);

    harmonics.forEach(h => {
      const freq = frequency * h.ratio;
      if (freq > 15000) return; // skip inaudible partials

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;

      // Slight detuning for richness
      if (h.ratio > 1) {
        osc.detune.value = (Math.random() - 0.5) * 3;
      }

      const partialGain = this.ctx.createGain();
      partialGain.gain.value = h.amp * velocity;

      // Decay envelope per partial
      const decayTime = h.decay * decayMult;
      partialGain.gain.setTargetAtTime(
        h.amp * velocity * 0.6,
        now + 0.01,
        decayTime * 0.3
      );
      partialGain.gain.setTargetAtTime(0, now + decayTime * 0.5, decayTime * 0.6);

      osc.connect(partialGain);
      partialGain.connect(noteGain);
      osc.start(now);

      if (duration > 0) {
        osc.stop(now + duration + 0.5);
      }

      oscillators.push({ osc, gain: partialGain });
    });

    // Attack envelope
    noteGain.gain.setTargetAtTime(velocity * 0.35, now, 0.004);

    // Hammer click for realism
    this._addHammerClick(now, velocity);

    const noteData = { noteGain, oscillators, startTime: now };

    if (duration > 0) {
      // Auto release after duration
      noteGain.gain.setTargetAtTime(0, now + duration, 0.15);
      setTimeout(() => {
        oscillators.forEach(o => { try { o.osc.stop(); } catch(e){} });
        try { noteGain.disconnect(); } catch(e){}
      }, (duration + 1) * 1000);
    } else {
      this.activeNotes.set(noteId, noteData);
    }

    return noteData;
  }

  /** Hammer click transient for realism */
  _addHammerClick(time, velocity) {
    const bufferSize = this.ctx.sampleRate * 0.02;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 15);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const clickGain = this.ctx.createGain();
    clickGain.gain.value = velocity * 0.06;
    // Filter the click
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 1;

    src.connect(filter);
    filter.connect(clickGain);
    clickGain.connect(this.compressor);
    src.start(time);
  }

  /** Stop a sustained note */
  noteOff(noteId) {
    const noteData = this.activeNotes.get(noteId);
    if (!noteData) return;
    const now = this.ctx.currentTime;
    noteData.noteGain.gain.setTargetAtTime(0, now, 0.12);
    setTimeout(() => {
      noteData.oscillators.forEach(o => { try { o.osc.stop(); } catch(e){} });
      try { noteData.noteGain.disconnect(); } catch(e){}
    }, 800);
    this.activeNotes.delete(noteId);
  }

  /** Play a metronome click */
  playMetronomeClick(accent = false) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1200 : 800;
    const gain = this.ctx.createGain();
    gain.gain.value = accent ? 0.25 : 0.15;
    gain.gain.setTargetAtTime(0, now + 0.02, 0.015);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  /** Play a short tap sound effect */
  playTapSound() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 600;
    osc.frequency.setTargetAtTime(400, now, 0.03);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.12;
    gain.gain.setTargetAtTime(0, now + 0.01, 0.03);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Get current audio context time */
  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Resume context (needed for iOS) */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }
}

/* ============================================
   NOTE UTILITIES
   ============================================ */
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]); // indices of sharps/flats

/** Convert MIDI number to frequency */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert MIDI number to note name like "C4" */
function midiToName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return name + octave;
}

/** Check if a MIDI number is a black key */
function isBlackKey(midi) {
  return BLACK_KEYS.has(midi % 12);
}

/** Get display name (use flat names for display) */
function noteDisplayName(midi) {
  const flatNames = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return flatNames[midi % 12] + octave;
}
