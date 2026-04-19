// Retro 8-bit sound effects via Web Audio API
// Sounds are generated procedurally — no files needed.

let _ctx = null;
function ctx() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Play a single oscillator tone
function tone(freq, startSec, durSec, type = 'square', vol = 0.18) {
  const c = ctx();
  const t = c.currentTime;
  const osc  = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t + startSec);
  gain.gain.setValueAtTime(vol, t + startSec);
  gain.gain.exponentialRampToValueAtTime(0.001, t + startSec + durSec);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t + startSec);
  osc.stop(t + startSec + durSec + 0.01);
}

export const sounds = {
  // Short two-note "whoosh" when a term crosses the = sign
  move: () => {
    tone(330, 0.00, 0.07, 'square', 0.15);
    tone(494, 0.06, 0.10, 'square', 0.15);
  },

  // Rising three-note chime for combining like terms
  combine: () => {
    tone(392, 0.00, 0.06, 'square', 0.14);
    tone(523, 0.05, 0.06, 'square', 0.14);
    tone(659, 0.10, 0.12, 'square', 0.14);
  },

  // Buzzy "power charge" for multiplying both sides
  multiply: () => {
    tone(165, 0.00, 0.06, 'sawtooth', 0.12);
    tone(220, 0.05, 0.06, 'sawtooth', 0.12);
    tone(330, 0.10, 0.10, 'sawtooth', 0.12);
    tone(440, 0.16, 0.12, 'sawtooth', 0.12);
  },

  // Soft click for expand/distribute
  expand: () => {
    tone(523, 0.00, 0.05, 'square', 0.12);
    tone(784, 0.04, 0.08, 'square', 0.10);
  },

  // Soft "blip" on term select
  select: () => {
    tone(440, 0.00, 0.04, 'square', 0.08);
  },

  // Classic 8-bit victory fanfare
  win: () => {
    const melody = [
      [523, 0.00], [523, 0.10], [523, 0.20],
      [415, 0.30], [523, 0.40], [659, 0.56],
    ];
    melody.forEach(([f, s]) => tone(f, s, 0.12, 'square', 0.18));
    // Harmony
    tone(659, 0.56, 0.30, 'square', 0.12);
  },

  // Recycle / new equation "ready" sound
  recycle: () => {
    tone(659, 0.00, 0.06, 'square', 0.12);
    tone(523, 0.06, 0.06, 'square', 0.12);
    tone(659, 0.12, 0.10, 'square', 0.14);
  },

  // Error buzz (e.g., invalid drag)
  error: () => {
    tone(196, 0.00, 0.08, 'sawtooth', 0.15);
    tone(147, 0.07, 0.12, 'sawtooth', 0.12);
  },
};
