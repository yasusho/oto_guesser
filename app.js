/**
 * Oto Guesser - Psychoacoustic Evaluation & Color Guesser Style UI
 * Supports 1-Tone (Single) and 2-Tone (Chord) modes.
 */

// Application State
const state = {
  mode: 'free', // 'free' | 'challenge'
  polyphonyCount: 1, // 1 | 2
  round: 1,
  totalScore: 0,
  history: [],
  isSubmitted: false,

  targetTones: [{ freq: 440, wave: 'sine' }],
  guessTones: [{ freq: 440, wave: 'sine' }],

  currentScore: 0,
  currentEvaluation: 'S',
  
  timerStart: null,
  timerInterval: null,
  elapsedMs: 0,
  currentTime: 0,

  isComparing: false,
  compareTimer: null
};

const waveNames = {
  sine: 'サイン波',
  triangle: '三角波',
  sawtooth: 'ノコギリ波',
  square: '矩形波'
};

const waveIcons = {
  sine: '〰️',
  triangle: '🔺',
  sawtooth: '🪚',
  square: '⏹️'
};

// Global Sound Engine Reference
const engine = window.soundEngine;

// --- Timer Functions ---
const startTimer = () => {
  state.timerStart = Date.now();
  state.elapsedMs = 0;
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    state.elapsedMs = Date.now() - state.timerStart;
    const sec = (state.elapsedMs / 1000).toFixed(1);
    if (el.timerDisplay) el.timerDisplay.textContent = sec + 's';
  }, 100);
};

const stopTimer = () => {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.currentTime = state.elapsedMs;
  if (el.timerDisplay) el.timerDisplay.textContent = (state.currentTime / 1000).toFixed(1) + 's';
};

// --- DOM Cache ---
const el = {};
document.querySelectorAll('[id]').forEach(n => {
  el[n.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = n;
});

// Toast Utility
const showToast = (msg) => {
  if (!el.toast || !el.toastMessage) return;
  el.toastMessage.textContent = msg;
  el.toast.classList.remove('translate-y-10', 'opacity-0');
  setTimeout(() => el.toast.classList.add('translate-y-10', 'opacity-0'), 2500);
};

// Toggle Controls Lock
const toggleControls = (disabled) => {
  document.querySelectorAll('.param-slider').forEach(s => s.disabled = disabled);
  document.querySelectorAll('.btn-minus, .btn-plus').forEach(b => b.disabled = disabled);
  document.querySelectorAll('.wave-btn').forEach(b => b.disabled = disabled);
  document.querySelectorAll('.btn-step').forEach(b => b.disabled = disabled);
  if (el.polyphonySelect) el.polyphonySelect.disabled = disabled;
  state.isSubmitted = disabled;
};

// --- Psychoacoustic Scoring Engine ---
/**
 * Calculates score for a single tone pair (0 to 100)
 * Uses Cent logarithmic pitch perception and acoustic waveform similarity.
 */
const calculateToneScore = (t, g) => {
  // 1. Logarithmic Pitch Error in Cents: 1200 * |log2(gFreq / tFreq)|
  const centsDiff = 1200 * Math.abs(Math.log2(g.freq / t.freq));

  // Exponential decay curve based on cents:
  // 0 cents -> 100 pts
  // 5 cents (~0.3% error) -> ~93 pts
  // 15 cents (~0.9% error) -> ~80 pts
  // 35 cents (~2% error) -> ~60 pts
  // 100 cents (1 semitone) -> ~24 pts
  const freqScore = 100 * Math.exp(-centsDiff / 70);

  // 2. Timbre / Waveform Similarity Score
  let waveScore = 0;
  if (t.wave === g.wave) {
    waveScore = 100; // Exact wave match
  } else if (
    (t.wave === 'sine' && g.wave === 'triangle') || (t.wave === 'triangle' && g.wave === 'sine') ||
    (t.wave === 'sawtooth' && g.wave === 'square') || (t.wave === 'square' && g.wave === 'sawtooth')
  ) {
    waveScore = 40; // Similar harmonic character
  } else {
    waveScore = 0; // Dissimilar timbre
  }

  // Weight: 65% Pitch Accuracy + 35% Timbre Accuracy
  return 0.65 * freqScore + 0.35 * waveScore;
};

/**
 * Calculates overall round score for 1 or 2 tones.
 * Automatically pairs guessed tones to target tones for optimal score.
 */
const evaluateRoundScore = (targetTones, guessTones) => {
  if (targetTones.length === 1) {
    const isExact = targetTones[0].freq === guessTones[0].freq && targetTones[0].wave === guessTones[0].wave;
    if (isExact) return { score: 100, pairing: [{ t: 0, g: 0 }] };

    const score = Math.round(calculateToneScore(targetTones[0], guessTones[0]));
    return { score: Math.max(0, Math.min(99, score)), pairing: [{ t: 0, g: 0 }] };
  }

  // For 2 tones: evaluate both possible pairings (0->0, 1->1) and (0->1, 1->0)
  const isExactPairingA = (targetTones[0].freq === guessTones[0].freq && targetTones[0].wave === guessTones[0].wave) &&
                          (targetTones[1].freq === guessTones[1].freq && targetTones[1].wave === guessTones[1].wave);

  const isExactPairingB = (targetTones[0].freq === guessTones[1].freq && targetTones[0].wave === guessTones[1].wave) &&
                          (targetTones[1].freq === guessTones[0].freq && targetTones[1].wave === guessTones[0].wave);

  if (isExactPairingA) return { score: 100, pairing: [{ t: 0, g: 0 }, { t: 1, g: 1 }] };
  if (isExactPairingB) return { score: 100, pairing: [{ t: 0, g: 1 }, { t: 1, g: 0 }] };

  const scoreA = (calculateToneScore(targetTones[0], guessTones[0]) + calculateToneScore(targetTones[1], guessTones[1])) / 2;
  const scoreB = (calculateToneScore(targetTones[0], guessTones[1]) + calculateToneScore(targetTones[1], guessTones[0])) / 2;

  if (scoreA >= scoreB) {
    return { score: Math.max(0, Math.min(99, Math.round(scoreA))), pairing: [{ t: 0, g: 0 }, { t: 1, g: 1 }] };
  } else {
    return { score: Math.max(0, Math.min(99, Math.round(scoreB))), pairing: [{ t: 0, g: 1 }, { t: 1, g: 0 }] };
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();

  // Load Polyphony from localStorage
  const savedPoly = localStorage.getItem('oto_guesser_polyphony');
  if (savedPoly && ['1', '2'].includes(savedPoly)) {
    state.polyphonyCount = parseInt(savedPoly, 10);
    if (el.polyphonySelect) el.polyphonySelect.value = savedPoly;
  }

  // Generate Distinct Frequencies for Target Chord
  const generateTargetChord = (count) => {
    const waves = ['sine', 'triangle', 'sawtooth', 'square'];
    const tones = [];

    for (let i = 0; i < count; i++) {
      let freq;
      let valid = false;
      let attempts = 0;

      while (!valid && attempts < 50) {
        attempts++;
        freq = Math.floor(Math.random() * (1200 - 130 + 1)) + 130;
        valid = tones.every(t => Math.abs(t.freq - freq) >= 50); // At least 50Hz separation
      }

      const wave = waves[Math.floor(Math.random() * waves.length)];
      tones.push({ freq, wave });
    }

    return tones.sort((a, b) => a.freq - b.freq);
  };

  // Render Dynamic Control Cards for Tones (1 or 2)
  const renderToneControls = () => {
    const container = document.getElementById('tone-controls-container');
    if (!container) return;

    container.innerHTML = state.guessTones.map((tone, idx) => `
      <div class="space-y-4 p-4 rounded-sm border border-slate-200 bg-slate-50/50 shadow-2xs">
        <div class="flex justify-between items-center text-[11px] font-bold text-slate-500 tracking-widest border-b border-slate-200/60 pb-2">
          <span class="flex items-center gap-1.5 text-slate-800">
            <span class="w-2 h-2 rounded-sm bg-slate-900 shrink-0"></span>
            音 ${idx + 1} (${state.polyphonyCount === 1 ? '単音' : '構成音 ' + (idx + 1)})
          </span>
          <span class="font-mono text-slate-800 text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-sm">
            <span class="selected-wave-label-${idx}">${waveNames[tone.wave]}</span> · <span class="freq-val-${idx}">${tone.freq}</span> Hz
          </span>
        </div>

        <!-- 波形選択 -->
        <div class="space-y-2">
          <div class="grid grid-cols-4 gap-2">
            <button class="wave-btn ${tone.wave === 'sine' ? 'active' : ''} flex flex-col items-center justify-center p-2 rounded-sm border border-slate-200 hover:border-slate-400 transition bg-white text-slate-800 font-bold" data-tone-idx="${idx}" data-wave="sine">
              <svg viewBox="0 0 40 20" class="w-6 h-4 stroke-current fill-none stroke-[2.5]"><path d="M 0,10 C 10,0 10,20 20,10 C 30,0 30,20 40,10"/></svg>
              <span class="text-[10px] font-bold tracking-wider mt-1">サイン</span>
            </button>
            <button class="wave-btn ${tone.wave === 'triangle' ? 'active' : ''} flex flex-col items-center justify-center p-2 rounded-sm border border-slate-200 hover:border-slate-400 transition bg-white text-slate-800 font-bold" data-tone-idx="${idx}" data-wave="triangle">
              <svg viewBox="0 0 40 20" class="w-6 h-4 stroke-current fill-none stroke-[2.5]"><path d="M 0,10 L 10,2 L 30,18 L 40,10"/></svg>
              <span class="text-[10px] font-bold tracking-wider mt-1">三角波</span>
            </button>
            <button class="wave-btn ${tone.wave === 'sawtooth' ? 'active' : ''} flex flex-col items-center justify-center p-2 rounded-sm border border-slate-200 hover:border-slate-400 transition bg-white text-slate-800 font-bold" data-tone-idx="${idx}" data-wave="sawtooth">
              <svg viewBox="0 0 40 20" class="w-6 h-4 stroke-current fill-none stroke-[2.5]"><path d="M 0,18 L 20,2 L 20,18 L 40,2"/></svg>
              <span class="text-[10px] font-bold tracking-wider mt-1">ノコギリ</span>
            </button>
            <button class="wave-btn ${tone.wave === 'square' ? 'active' : ''} flex flex-col items-center justify-center p-2 rounded-sm border border-slate-200 hover:border-slate-400 transition bg-white text-slate-800 font-bold" data-tone-idx="${idx}" data-wave="square">
              <svg viewBox="0 0 40 20" class="w-6 h-4 stroke-current fill-none stroke-[2.5]"><path d="M 0,2 L 20,2 L 20,18 L 40,18"/></svg>
              <span class="text-[10px] font-bold tracking-wider mt-1">矩形波</span>
            </button>
          </div>
        </div>

        <!-- 周波数スライダー & マイナス/プラス -->
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <button class="btn-minus btn-freq-minus-${idx} w-8 h-8 shrink-0 flex items-center justify-center text-slate-300 hover:text-slate-800 hover:bg-white rounded-sm transition font-bold disabled:opacity-40" data-tone-idx="${idx}">-</button>
            <input type="range" class="param-slider freq-slider-${idx} flex-1 min-w-0 h-1.5 rounded-sm bg-slate-200 border border-slate-300 cursor-pointer" data-tone-idx="${idx}" min="100" max="1600" step="1" value="${tone.freq}">
            <button class="btn-plus btn-freq-plus-${idx} w-8 h-8 shrink-0 flex items-center justify-center text-slate-300 hover:text-slate-800 hover:bg-white rounded-sm transition font-bold disabled:opacity-40" data-tone-idx="${idx}">+</button>
          </div>

          <div class="flex gap-2 justify-center pt-1">
            <button class="btn-step text-[10px] font-bold font-mono text-slate-400 hover:text-slate-800 hover:bg-white px-2.5 py-1 rounded-sm border border-slate-200 transition tracking-widest" data-tone-idx="${idx}" data-step="-10">-10Hz</button>
            <button class="btn-step text-[10px] font-bold font-mono text-slate-400 hover:text-slate-800 hover:bg-white px-2.5 py-1 rounded-sm border border-slate-200 transition tracking-widest" data-tone-idx="${idx}" data-step="-1">-1Hz</button>
            <button class="btn-step text-[10px] font-bold font-mono text-slate-400 hover:text-slate-800 hover:bg-white px-2.5 py-1 rounded-sm border border-slate-200 transition tracking-widest" data-tone-idx="${idx}" data-step="1">+1Hz</button>
            <button class="btn-step text-[10px] font-bold font-mono text-slate-400 hover:text-slate-800 hover:bg-white px-2.5 py-1 rounded-sm border border-slate-200 transition tracking-widest" data-tone-idx="${idx}" data-step="10">+10Hz</button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach Event Handlers for dynamic controls
    state.guessTones.forEach((_, idx) => {
      const slider = container.querySelector(`.freq-slider-${idx}`);
      const btnMinus = container.querySelector(`.btn-freq-minus-${idx}`);
      const btnPlus = container.querySelector(`.btn-freq-plus-${idx}`);

      if (slider) {
        slider.addEventListener('input', (e) => {
          if (state.isSubmitted) return;
          updateGuessFreq(idx, parseInt(e.target.value, 10));
        });
      }

      if (btnMinus) setupLongPress(btnMinus, () => updateGuessFreq(idx, state.guessTones[idx].freq - 1));
      if (btnPlus) setupLongPress(btnPlus, () => updateGuessFreq(idx, state.guessTones[idx].freq + 1));
    });

    // Wave buttons event handler
    container.querySelectorAll('.wave-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.isSubmitted) return;
        const idx = parseInt(btn.dataset.toneIdx, 10);
        const wave = btn.dataset.wave;
        state.guessTones[idx].wave = wave;

        // Update UI
        container.querySelectorAll(`.wave-btn[data-tone-idx="${idx}"]`).forEach(b => {
          b.classList.toggle('active', b.dataset.wave === wave);
        });
        const label = container.querySelector(`.selected-wave-label-${idx}`);
        if (label) label.textContent = waveNames[wave];

        if (engine.currentSoundType === 'guess') {
          engine.updateToneWaveType(idx, wave);
        }
      });
    });

    // Quick step buttons event handler with long-press support
    container.querySelectorAll('.btn-step').forEach(btn => {
      const idx = parseInt(btn.dataset.toneIdx, 10);
      const step = parseInt(btn.dataset.step, 10);
      setupLongPress(btn, () => updateGuessFreq(idx, state.guessTones[idx].freq + step));
    });
  };

  const updateGuessFreq = (idx, newFreq) => {
    const val = Math.min(1600, Math.max(100, newFreq));
    state.guessTones[idx].freq = val;

    const slider = document.querySelector(`.freq-slider-${idx}`);
    const label = document.querySelector(`.freq-val-${idx}`);

    if (slider) slider.value = val;
    if (label) label.textContent = val;

    if (engine.currentSoundType === 'guess') {
      engine.updateToneFrequency(idx, val);
    }
  };

  // Long press helper for minus/plus & step buttons
  const setupLongPress = (btn, action) => {
    let timer = null;
    let interval = null;
    let isTouching = false;

    const stop = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (interval) { clearInterval(interval); interval = null; }
    };

    const start = (e) => {
      if (state.isSubmitted) return;
      if (e.type === 'touchstart') {
        isTouching = true;
      } else if (e.type === 'mousedown' && isTouching) {
        return;
      }
      if (e.cancelable) e.preventDefault();

      stop();
      action();

      timer = setTimeout(() => {
        let tick = 0;
        interval = setInterval(() => {
          action();
          tick++;
          if (tick === 12) {
            clearInterval(interval);
            interval = setInterval(action, 30);
          }
        }, 60);
      }, 250);
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchend', (e) => {
      stop();
      setTimeout(() => { isTouching = false; }, 300);
    });
    btn.addEventListener('touchcancel', (e) => {
      stop();
      setTimeout(() => { isTouching = false; }, 300);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // Initialize Game Round
  const initGame = (isNewGame = false) => {
    if (isNewGame) {
      state.round = 1;
      state.totalScore = 0;
      state.history = [];
      if (el.challengeTotalScore) el.challengeTotalScore.textContent = "SCORE: 0";
    }

    stopComparison();

    // Generate Target chord & Default Guess chord
    state.targetTones = generateTargetChord(state.polyphonyCount);
    state.guessTones = Array.from({ length: state.polyphonyCount }, (_, i) => ({
      freq: 440 + i * 120,
      wave: 'sine'
    }));

    renderToneControls();

    if (el.challengeRound) el.challengeRound.textContent = `R: ${state.round} / 5`;

    toggleControls(false);
    if (el.btnSubmit) el.btnSubmit.classList.remove('hidden');
    if (el.btnNext) el.btnNext.classList.add('hidden');
    if (el.resultPanel) el.resultPanel.classList.add('hidden');

    startTimer();
  };

  // Sound Playback Handlers
  const stopComparison = () => {
    state.isComparing = false;
    if (state.compareTimer) {
      clearTimeout(state.compareTimer);
      state.compareTimer = null;
    }
    engine.stopCurrentSound();
    if (el.targetPlayingDot) el.targetPlayingDot.classList.add('hidden');
    if (el.guessPlayingDot) el.guessPlayingDot.classList.add('hidden');
  };

  if (el.btnPlayTarget) {
    el.btnPlayTarget.addEventListener('click', () => {
      stopComparison();
      if (engine.currentSoundType === 'target') {
        engine.stopCurrentSound();
      } else {
        engine.playChord(state.targetTones, 2.0, 'target');
        if (el.targetPlayingDot) el.targetPlayingDot.classList.remove('hidden');
        setTimeout(() => {
          if (engine.currentSoundType === 'target' && el.targetPlayingDot) {
            el.targetPlayingDot.classList.add('hidden');
          }
        }, 2000);
      }
    });
  }

  if (el.btnPlayGuess) {
    el.btnPlayGuess.addEventListener('click', () => {
      stopComparison();
      if (engine.currentSoundType === 'guess') {
        engine.stopCurrentSound();
      } else {
        engine.playChord(state.guessTones, 2.0, 'guess');
        if (el.guessPlayingDot) el.guessPlayingDot.classList.remove('hidden');
        setTimeout(() => {
          if (engine.currentSoundType === 'guess' && el.guessPlayingDot) {
            el.guessPlayingDot.classList.add('hidden');
          }
        }, 2000);
      }
    });
  }

  if (el.btnCompareBoth) {
    el.btnCompareBoth.addEventListener('click', () => {
      if (engine.currentSoundType === 'both' || state.isComparing) {
        stopComparison();
        return;
      }

      stopComparison();
      state.isComparing = true;

      const combinedTones = [...state.targetTones, ...state.guessTones];
      engine.playChord(combinedTones, 2.0, 'both');

      if (el.targetPlayingDot) el.targetPlayingDot.classList.remove('hidden');
      if (el.guessPlayingDot) el.guessPlayingDot.classList.remove('hidden');

      state.compareTimer = setTimeout(() => {
        stopComparison();
      }, 2000);
    });
  }

  // Handle Polyphony Select Change
  if (el.polyphonySelect) {
    el.polyphonySelect.addEventListener('change', (e) => {
      state.polyphonyCount = parseInt(e.target.value, 10);
      localStorage.setItem('oto_guesser_polyphony', e.target.value);
      initGame(true);
    });
  }

  // --- Submission & Evaluation Logic ---
  const submitGuess = () => {
    stopTimer();
    stopComparison();

    const timeSec = (state.currentTime / 1000).toFixed(1);
    toggleControls(true);

    if (el.btnSubmit) el.btnSubmit.classList.add('hidden');
    if (el.btnNext) el.btnNext.classList.remove('hidden');
    if (el.resultPanel) el.resultPanel.classList.remove('hidden');

    // Psychoacoustic evaluation
    const evalResult = evaluateRoundScore(state.targetTones, state.guessTones);
    const score = evalResult.score;

    // Evaluation Grades (Color Guesser Ranks)
    const evals = [
      { min: 100, txt: 'SS', color: 'rank-ss font-extrabold' },
      { min: 95, txt: 'S', color: 'text-amber-500 font-bold' },
      { min: 85, txt: 'A', color: 'text-emerald-500 font-bold' },
      { min: 70, txt: 'B', color: 'text-blue-500 font-bold' },
      { min: 50, txt: 'C', color: 'text-purple-500 font-bold' },
      { min: 30, txt: 'D', color: 'text-yellow-600 font-bold' },
      { min: 0, txt: 'E', color: 'text-rose-500 font-bold' }
    ];
    const evaluation = evals.find(e => score >= e.min);

    if (el.scoreDisplay) el.scoreDisplay.textContent = score;
    if (el.evaluationText) {
      el.evaluationText.textContent = evaluation.txt;
      el.evaluationText.className = `text-7xl font-black ${evaluation.color}`;
    }
    if (el.resultTimeDisplay) el.resultTimeDisplay.textContent = timeSec + 's';

    state.currentScore = score;
    state.currentEvaluation = evaluation.txt;

    // Render Result Breakdown Grid
    const resultGrid = document.getElementById('result-grid-container');
    if (resultGrid) {
      const pairing = evalResult.pairing;
      resultGrid.innerHTML = `
        <div class="flex-1 space-y-2">
          <p class="text-[#c83771] font-bold tracking-widest text-[10px] mb-2">正解値 (TARGET)</p>
          ${state.targetTones.map((t, i) => `
            <p class="font-mono text-slate-800 text-xs">
              <span class="text-slate-400 font-bold text-[10px] w-10 inline-block">音${i + 1}:</span>
              <span class="font-bold">${t.freq} Hz</span> <span class="text-slate-500">(${waveNames[t.wave]})</span>
            </p>
          `).join('')}
        </div>
        <div class="flex-1 space-y-2 border-l border-slate-100 pl-6">
          <p class="text-[#3771c8] font-bold tracking-widest text-[10px] mb-2">あなたの予想 (YOURS)</p>
          ${state.guessTones.map((g, gi) => {
            const pair = pairing.find(p => p.g === gi);
            const targetTone = pair ? state.targetTones[pair.t] : state.targetTones[gi];
            const diffHz = Math.abs(targetTone.freq - g.freq);
            const diffStr = diffHz > 0 ? (g.freq > targetTone.freq ? '+' + diffHz : '-' + diffHz) : '±0';
            const waveMatch = (targetTone.wave === g.wave) ? '一致' : '不一致';
            return `
              <p class="font-mono text-slate-800 text-xs">
                <span class="text-slate-400 font-bold text-[10px] w-10 inline-block">音${gi + 1}:</span>
                <span class="font-bold">${g.freq} Hz (${diffStr})</span> <span class="text-slate-500">(${waveNames[g.wave]}:${waveMatch})</span>
              </p>
            `;
          }).join('')}
        </div>
      `;
    }

    // Play fanfare / sound feedback based on score
    if (score >= 80) {
      engine.playChord([{ freq: 523.25, wave: 'sine' }, { freq: 659.25, wave: 'sine' }], 0.25, 'guess');
      setTimeout(() => engine.playChord([{ freq: 659.25, wave: 'sine' }, { freq: 783.99, wave: 'sine' }], 0.4, 'guess'), 250);
    }

    if (state.mode === 'challenge') {
      state.totalScore += score;
      state.history.push({
        round: state.round,
        score,
        time: state.currentTime,
        targetTones: [...state.targetTones],
        guessTones: [...state.guessTones],
        polyphony: state.polyphonyCount,
        eval: evaluation.txt
      });

      if (el.challengeTotalScore) el.challengeTotalScore.textContent = `SCORE: ${state.totalScore}`;
      if (el.nextText) el.nextText.textContent = state.round < 5 ? "次のラウンドへ" : "結果発表";
      if (el.freeShareContainer) el.freeShareContainer.classList.add('hidden');
    } else {
      if (el.nextText) el.nextText.textContent = "次の音へ";
      if (el.freeShareContainer) el.freeShareContainer.classList.remove('hidden');
    }
    lucide.createIcons();
  };

  if (el.btnSubmit) el.btnSubmit.addEventListener('click', submitGuess);

  // Handle Next Round / Challenge Summary Modal
  const handleNext = () => {
    if (state.mode === 'challenge' && state.round >= 5) {
      const totalTimeMs = state.history.reduce((acc, h) => acc + h.time, 0);
      const totalTimeSec = (totalTimeMs / 1000).toFixed(1);

      if (el.summaryTotalScore) {
        el.summaryTotalScore.innerHTML = `${state.totalScore} <span class="text-xl text-slate-300 font-medium">/500</span>`;
      }
      if (el.summaryFeedback) {
        el.summaryFeedback.textContent = state.totalScore >= 450 
          ? "神がかった絶対音感です！" 
          : state.totalScore >= 350 
          ? "かなり優秀な絶対音感を持っていますね！" 
          : "あと少し！繰り返しチャレンジしてみましょう！";
      }
      if (el.summaryTotalTime) el.summaryTotalTime.textContent = totalTimeSec + 's';

      if (el.summaryHistory) {
        el.summaryHistory.innerHTML = state.history.map(item => `
          <div class="flex flex-col p-2.5 border-b border-slate-100 last:border-0 gap-1">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2 flex-1">
                <span class="font-bold w-6 text-slate-400 text-xs">R${item.round}</span>
                <span class="text-xs font-bold text-slate-500">${item.polyphony === 1 ? '単音' : '2音和音'}</span>
                <div class="text-[10px] font-bold text-slate-400 tracking-wider ml-1">
                  ${(item.time / 1000).toFixed(1)}s
                </div>
              </div>
              <span class="font-mono text-slate-800 text-sm font-bold text-right">${item.score} <span class="text-[10px] text-slate-400">(${item.eval})</span></span>
            </div>
            <div class="text-[10px] pl-8 text-slate-500 font-mono space-y-0.5">
              ${item.targetTones.map((t, i) => `
                <div>お題${i + 1}: ${t.freq}Hz(${waveNames[t.wave]}) → 予想: ${item.guessTones[i].freq}Hz(${waveNames[item.guessTones[i].wave]})</div>
              `).join('')}
            </div>
          </div>
        `).join('');
      }

      if (el.modalSummary) el.modalSummary.classList.remove('hidden');
    } else {
      if (state.mode === 'challenge') state.round++;
      initGame();
    }
  };

  if (el.btnNext) el.btnNext.addEventListener('click', handleNext);

  if (el.btnRestart) {
    el.btnRestart.addEventListener('click', () => {
      if (el.modalSummary) el.modalSummary.classList.add('hidden');
      initGame(true);
    });
  }

  // --- Mode Switching (Free Play vs 5-Round Challenge) ---
  const switchMode = (newMode) => {
    if (state.mode === newMode) return;
    state.mode = newMode;

    const act = "font-bold text-slate-900 border-b-2 border-slate-900 pb-1.5 transition";
    const inact = "font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent pb-1.5 transition";

    if (el.modeFree) el.modeFree.className = newMode === 'free' ? act : inact;
    if (el.modeChallenge) el.modeChallenge.className = newMode !== 'free' ? act : inact;
    if (el.challengeStatus) el.challengeStatus.classList.toggle('hidden', newMode === 'free');

    initGame(newMode === 'challenge');
  };

  if (el.modeFree) el.modeFree.addEventListener('click', () => switchMode('free'));
  if (el.modeChallenge) el.modeChallenge.addEventListener('click', () => switchMode('challenge'));

  // --- Share Functions (X Twitter & Copy) ---
  const generateShareText = (isChallenge = false) => {
    if (isChallenge) {
      const totalTimeSec = (state.history.reduce((acc, h) => acc + h.time, 0) / 1000).toFixed(1);
      const blocks = state.history.map(h => {
        if (h.score >= 95) return '🟩';
        if (h.score >= 70) return '🟦';
        if (h.score >= 50) return '🟨';
        return '🟥';
      }).join('');

      return `🎵 Oto Guesser【5問チャレンジ (${state.polyphonyCount === 1 ? '単音' : '2音和音'})】結果\n` +
             `総合スコア: ${state.totalScore}/500 (${totalTimeSec}s)\n` +
             `${blocks}\n` +
             `#OtoGuesser #音当てゲーム`;
    } else {
      const targetsStr = state.targetTones.map(t => `${t.freq}Hz(${waveNames[t.wave]})`).join(', ');
      return `🎵 Oto Guesser【フリープレイ (${state.polyphonyCount === 1 ? '単音' : '2音和音'})】\n` +
             `お題: ${targetsStr}\n` +
             `スコア: ${state.currentScore}点 [Rank ${state.currentEvaluation}]\n` +
             `#OtoGuesser #音当てゲーム`;
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('結果をクリップボードにコピーしました！');
    }).catch(() => {
      showToast('コピーに失敗しました');
    });
  };

  const openXShare = (text) => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (el.btnShareFree) el.btnShareFree.addEventListener('click', () => copyToClipboard(generateShareText(false)));
  if (el.btnShareXFree) el.btnShareXFree.addEventListener('click', () => openXShare(generateShareText(false)));

  if (el.btnShare) el.btnShare.addEventListener('click', () => copyToClipboard(generateShareText(true)));
  if (el.btnShareX) el.btnShareX.addEventListener('click', () => openXShare(generateShareText(true)));

  // Start First Game
  initGame(true);
});
