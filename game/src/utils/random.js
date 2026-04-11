// Random equation generator — one per tier.
// Each generator always produces an equation with a clean integer solution.

import { makeTerm, makeGroup } from './equations';

function ri(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % b; a = t; }
  return a || 1;
}
function lcm(a, b) { return (a * b) / gcd(a, b); }

function t(n, d, isVar = false) { return makeTerm(n, d, isVar); }

// ── Tier 1: one-step ──────────────────────────────────────
export function randomTier1() {
  const type = ri(0, 2);
  const sol = ri(2, 18);

  if (type === 0) {
    // x + a = b
    const a = pick([-12,-10,-8,-6,-5,-4,4,5,6,8,10,12]);
    const b = sol + a;
    return {
      hint: `Drag ${a > 0 ? '+' + a : a} to the other side!`,
      left:  [t(1,1,true), t(a,1)],
      right: [t(b,1)],
    };
  }
  if (type === 1) {
    // n·x = b
    const n = pick([2,3,4,5,6]);
    return {
      hint: `Multiply both sides by 1/${n}`,
      left:  [t(n,1,true)],
      right: [t(n*sol,1)],
    };
  }
  // x/n = sol
  const n = pick([2,3,4,5]);
  return {
    hint: `Multiply both sides by ${n}!`,
    left:  [t(1,n,true)],
    right: [t(sol,1)],
  };
}

// ── Tier 2: two-step ─────────────────────────────────────
export function randomTier2() {
  const sol = ri(2, 12);
  const n   = pick([2,3,4,5]);
  const a   = pick([-10,-8,-6,-5,-4,-3,3,4,5,6,8,10]);
  const b   = n * sol + a;
  return {
    hint: `Move ${a > 0 ? '+' + a : a} first, then multiply by 1/${n}`,
    left:  [t(n,1,true), t(a,1)],
    right: [t(b,1)],
  };
}

// ── Tier 3: variables on both sides ──────────────────────
export function randomTier3() {
  const sol = ri(2, 12);
  const n   = pick([3,4,5,6]);
  const m   = pick([1,2]);
  if (m >= n) return randomTier3();
  const a = ri(-8, 8);
  const b = (n - m) * sol + a;   // n·sol + a = m·sol + b ↔ b = (n-m)·sol + a
  return {
    hint: 'Move x terms to one side, numbers to the other!',
    left:  [t(n,1,true), t(a,1)],
    right: [t(m,1,true), t(b,1)],
  };
}

// ── Tier 4: fractions ────────────────────────────────────
export function randomTier4() {
  const type = ri(0, 2);

  if (type === 0) {
    // (p/q)x = b   →  x = b·q/p (integer when p|b·q)
    const [p,q] = pick([[1,2],[1,3],[2,3],[3,4],[1,4],[3,2],[4,3]]);
    const k   = ri(1, 6);
    const sol = k * q;             // guarantees (p/q)·sol is integer
    const b   = p * sol / q;
    return {
      hint: `Multiply both sides by ${q}/${p}`,
      left:  [t(p,q,true)],
      right: [t(b,1)],
    };
  }

  if (type === 1) {
    // (p/q)x + a = b
    const [p,q] = pick([[1,2],[1,3],[2,3],[3,4],[1,4]]);
    const k   = ri(1, 5);
    const sol = k * q;
    const a   = ri(-8, 8);
    const b   = p * sol / q + a;
    return {
      hint: `Move the constant first, then multiply by ${q}/${p}`,
      left:  [t(p,q,true), t(a,1)],
      right: [t(b,1)],
    };
  }

  // x/a + x/b = c  (combine two fractional x terms)
  const a = pick([2,3,4,6]);
  const candidates = [2,3,4,6].filter(x => x !== a);
  const b = pick(candidates);
  const L = lcm(a, b);
  // (1/a + 1/b)·x = c  →  x·(a+b)/(a·b) = c  →  x = c·a·b/(a+b)
  // To ensure x is integer: x = L·k, c = x·(a+b)/(a·b) = L·k·(a+b)/(a·b)
  // L = lcm(a,b), L/(a·b) = 1/gcd(a,b), so c = k·(a+b)/gcd(a,b)
  const g = gcd(a, b);
  const k = ri(1, 4);
  const c = k * (a + b) / g;
  if (!Number.isInteger(c) || c <= 0) return randomTier4();
  return {
    hint: `Multiply both sides by ${L} to clear fractions, then combine!`,
    left:  [t(1,a,true), t(1,b,true)],
    right: [t(c,1)],
  };
}

// ── Tier 5: parentheses ──────────────────────────────────
export function randomTier5() {
  const sol  = ri(1, 10);
  const type = ri(0, 1);

  if (type === 0) {
    // n(x + a) = b
    const n = pick([2,3,4]);
    const a = ri(-6, 6);
    const b = n * (sol + a);
    return {
      hint: 'Double-tap the group to expand, then solve!',
      left:  [makeGroup(n, 1, [t(1,1,true), t(a,1)])],
      right: [t(b,1)],
    };
  }

  // n(x + a) = m·x + b
  const n = pick([2,3,4]);
  const m = pick([1,2]);
  if (m >= n) return randomTier5();
  const a = ri(-5, 5);
  // n·sol + n·a = m·sol + b  →  b = (n-m)·sol + n·a
  const b = (n - m) * sol + n * a;
  return {
    hint: 'Expand the parentheses first, then collect terms!',
    left:  [makeGroup(n, 1, [t(1,1,true), t(a,1)])],
    right: [t(m,1,true), t(b,1)],
  };
}

const GENERATORS = [null, randomTier1, randomTier2, randomTier3, randomTier4, randomTier5];

export function randomEquation(tier) {
  const gen = GENERATORS[tier];
  if (!gen) return null;
  return gen();
}
