/**
 * Audio Engine for Oto Guesser using Web Audio API.
 * Supports polyphonic tone synthesis (1 to 3 simultaneous tones),
 * volume normalization, and gain envelopes.
 */
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;

    this.activeNodes = []; // Array of { source, gain }
    this.currentSoundType = null; // 'target' | 'guess' | null
    this.stopTimeout = null;
  }

  /**
   * Initializes the AudioContext on user gesture.
   */
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime); // Master limit

      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Stops all currently playing sounds smoothly.
   * @param {number} fadeOutDuration duration in seconds
   */
  stopCurrentSound(fadeOutDuration = 0.08) {
    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }

    if (this.activeNodes.length > 0 && this.ctx) {
      const now = this.ctx.currentTime;
      const nodesToStop = [...this.activeNodes];
      this.activeNodes = [];

      nodesToStop.forEach(({ source, gain }) => {
        try {
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeOutDuration);

          setTimeout(() => {
            try {
              source.stop();
              source.disconnect();
              gain.disconnect();
            } catch (e) {}
          }, fadeOutDuration * 1000 + 20);
        } catch (e) {}
      });
    }
    this.currentSoundType = null;
  }

  /**
   * Plays array of tones simultaneously.
   * @param {Array<{freq: number, wave: string}>} tones 
   * @param {number} duration 
   * @param {string} soundTypeIdentifier 'target' or 'guess'
   */
  playChord(tones, duration = null, soundTypeIdentifier = 'tone') {
    this.init();
    this.stopCurrentSound(0.05);

    if (!tones || tones.length === 0) return;

    const now = this.ctx.currentTime;
    const count = tones.length;

    // Gain per tone normalized to prevent clipping when playing chords
    const baseVolume = 0.35 / Math.sqrt(count);

    this.activeNodes = tones.map(t => {
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();

      osc.type = t.wave || 'sine';
      osc.frequency.setValueAtTime(t.freq || 440, now);

      const targetVol = (t.wave === 'square' || t.wave === 'sawtooth') ? baseVolume * 0.75 : baseVolume;

      noteGain.gain.setValueAtTime(0.0001, now);
      noteGain.gain.exponentialRampToValueAtTime(targetVol, now + 0.05);

      osc.connect(noteGain);
      noteGain.connect(this.masterGain);

      osc.start(now);
      return { source: osc, gain: noteGain, indexFreq: t.freq, indexWave: t.wave };
    });

    this.currentSoundType = soundTypeIdentifier;

    if (duration && duration > 0) {
      this.stopTimeout = setTimeout(() => {
        this.stopCurrentSound(0.1);
      }, duration * 1000);
    }
  }

  /**
   * Helper to play single tone
   */
  playTone(freq, wave, duration = null, soundTypeIdentifier = 'tone') {
    this.playChord([{ freq, wave }], duration, soundTypeIdentifier);
  }

  /**
   * Updates frequency of specific tone index during active playback.
   */
  updateToneFrequency(index, newFreq) {
    if (this.activeNodes[index] && this.ctx) {
      this.activeNodes[index].source.frequency.setTargetAtTime(newFreq, this.ctx.currentTime, 0.03);
    }
  }

  /**
   * Updates wave type of specific tone index during active playback.
   */
  updateToneWaveType(index, newWave) {
    if (this.activeNodes[index]) {
      this.activeNodes[index].source.type = newWave;
    }
  }

  getWaveformData() {
    return null;
  }
}

// Global Sound Engine Instance
window.soundEngine = new SoundEngine();
