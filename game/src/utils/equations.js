import { addF, mulF, negF, frac, isZeroF, absEqOneF, isPosOneF } from './fractions';

let _id = 0;
const uid = () => String(++_id);

// Create a term: num/den * x  (isVar=true) or just num/den (isVar=false)
export function makeTerm(num, den, isVar) {
  return { id: uid(), coeff: frac(num, den), isVar };
}

// Create a grouped term: multiplier * (inner terms) — for parenthesis levels
export function makeGroup(mulNum, mulDen, innerTerms) {
  return { id: uid(), type: 'group', multiplier: frac(mulNum, mulDen), inner: innerTerms };
}

// --- State helpers ---

export function cloneTerm(t) {
  if (t.type === 'group') {
    return { ...t, id: uid(), inner: t.inner.map(cloneTerm) };
  }
  return { ...t, id: uid() };
}

export function flatTerms(state, side) {
  return state[side].filter(t => t.type !== 'group');
}

// Move a term across the equals sign (negates its coefficient)
export function moveTerm(state, termId, fromSide) {
  const toSide = fromSide === 'left' ? 'right' : 'left';
  const term = state[fromSide].find(t => t.id === termId);
  if (!term) return state;
  const moved = { ...cloneTerm(term), coeff: negF(term.coeff) };
  return {
    [fromSide]: state[fromSide].filter(t => t.id !== termId),
    [toSide]:   [...state[toSide], moved],
  };
}

// Combine two like terms on the same side
export function combineTerms(state, id1, id2, side) {
  const terms = state[side];
  const t1 = terms.find(t => t.id === id1);
  const t2 = terms.find(t => t.id === id2);
  if (!t1 || !t2 || t1.isVar !== t2.isVar) return state;
  const newCoeff = addF(t1.coeff, t2.coeff);
  const rest = terms.filter(t => t.id !== id1 && t.id !== id2);
  if (isZeroF(newCoeff)) return { ...state, [side]: rest };
  return { ...state, [side]: [...rest, { id: uid(), coeff: newCoeff, isVar: t1.isVar }] };
}

// Multiply all terms on both sides by num/den
export function multiplyBothSides(state, num, den) {
  const factor = frac(num, den);
  const mulSide = terms => terms.map(t => {
    if (t.type === 'group') {
      return { ...t, id: uid(), multiplier: mulF(t.multiplier, factor) };
    }
    return { ...t, id: uid(), coeff: mulF(t.coeff, factor) };
  });
  return { left: mulSide(state.left), right: mulSide(state.right) };
}

// Expand a parenthesized group into flat terms
export function expandGroup(state, groupId, side) {
  const terms = state[side];
  const group = terms.find(t => t.id === groupId && t.type === 'group');
  if (!group) return state;
  const expanded = group.inner.map(inner => ({
    id: uid(),
    coeff: mulF(group.multiplier, inner.coeff),
    isVar: inner.isVar,
  }));
  const rest = terms.filter(t => t.id !== groupId);
  return { ...state, [side]: [...rest, ...expanded] };
}

// --- Win detection ---
export function checkWin(state) {
  const { left, right } = state;
  // No groups allowed (must all be flat terms)
  if ([...left, ...right].some(t => t.type === 'group')) return false;

  const lVars   = left.filter(t => t.isVar);
  const lConst  = left.filter(t => !t.isVar);
  const rVars   = right.filter(t => t.isVar);
  const rConst  = right.filter(t => !t.isVar);

  // x = N  or  -x = N  (coefficient magnitude 1, zero constants on same side)
  // Also filter out stray zero-coefficient terms that didn't get cleaned up
  const nonZero = ts => ts.filter(t => !isZeroF(t.coeff));
  const lVarsNZ  = nonZero(lVars);
  const lConstNZ = nonZero(lConst);
  const rVarsNZ  = nonZero(rVars);
  const rConstNZ = nonZero(rConst);

  // Only x = N counts as solved, not -x = N (student must clear the negative)
  const singleVar   = (v, c) => v.length === 1 && c.length === 0 && isPosOneF(v[0].coeff);
  const singleConst = (v, c) => v.length === 0 && c.length === 1;

  // Re-bind with zero-filtered arrays
  const lV = lVarsNZ, lC = lConstNZ, rV = rVarsNZ, rC = rConstNZ;

  return (singleVar(lV, lC) && singleConst(rV, rC)) ||
         (singleConst(lV, lC) && singleVar(rV, rC));
}

// Narrate the last operation
export function narrate(prevState, nextState, op) {
  switch (op.type) {
    case 'move': {
      const side = op.fromSide === 'left' ? 'right' : 'left';
      return `Moved term → ${side} side (sign flipped)`;
    }
    case 'combine':
      return `Combined like terms on ${op.side} side`;
    case 'multiply':
      return `Multiplied both sides by ${op.num}${op.den !== 1 ? `/${op.den}` : ''}`;
    case 'divide':
      return `Divided both sides by ${op.num}${op.den !== 1 ? `/${op.den}` : ''}`;
    case 'negate':
      return 'Changed sign on both sides (× −1)';
    case 'expand':
      return 'Expanded parentheses';
    default:
      return '';
  }
}

// Suggest the single best next step for the solver hint.
// Returns a plain-data object (no functions) describing what to do.
export function suggestNextStep(state) {
  const { left, right } = state;
  const nz = ts => ts.filter(t => !isZeroF(t.coeff));

  // 1. Expand groups first
  for (const side of ['left', 'right']) {
    const g = state[side].find(t => t.type === 'group');
    if (g) return { type: 'expand', termId: g.id, side,
      description: 'Expand the parentheses' };
  }

  const lVars   = nz(left.filter(t => t.isVar));
  const lConsts = nz(left.filter(t => !t.isVar));
  const rVars   = nz(right.filter(t => t.isVar));
  const rConsts = nz(right.filter(t => !t.isVar));

  // 2. Combine like terms on same side
  if (lVars.length   >= 2) return { type: 'combine', id1: lVars[0].id,   id2: lVars[1].id,   side: 'left',  description: 'Combine the x terms on the left' };
  if (rVars.length   >= 2) return { type: 'combine', id1: rVars[0].id,   id2: rVars[1].id,   side: 'right', description: 'Combine the x terms on the right' };
  if (lConsts.length >= 2) return { type: 'combine', id1: lConsts[0].id, id2: lConsts[1].id, side: 'left',  description: 'Combine the numbers on the left' };
  if (rConsts.length >= 2) return { type: 'combine', id1: rConsts[0].id, id2: rConsts[1].id, side: 'right', description: 'Combine the numbers on the right' };

  // 3. Decide which side should hold the variable (prefer left)
  if (lVars.length > 0 && rVars.length > 0) {
    // Variables on both sides → move one from right to left
    return { type: 'move', termId: rVars[0].id, fromSide: 'right',
      description: 'Move the x term to the left side' };
  }

  const varSide   = lVars.length > 0 ? 'left' : 'right';
  const constSide = varSide === 'left' ? 'right' : 'left';
  const varTerms  = varSide === 'left' ? lVars : rVars;
  const strayCons = varSide === 'left' ? lConsts : rConsts;

  // 4. Move stray constants off the variable side
  if (strayCons.length > 0) {
    return { type: 'move', termId: strayCons[0].id, fromSide: varSide,
      description: `Move the number to the ${constSide} side` };
  }

  // 5. Clear the coefficient
  const varTerm = varTerms[0];
  if (!varTerm) return null;
  const { num, den } = varTerm.coeff;

  if (num < 0) return { type: 'negate',
    description: 'x is negative — change sign on both sides' };

  if (num !== den) {
    // Multiply by den/num to make coefficient 1
    return { type: 'multiply', num: den, den: num,
      description: `Multiply both sides by ${den}/${num === 1 ? den : num} to get x alone` };
  }

  return null; // already solved
}

// Simulate the solver to count the minimum steps for any given state.
// Reuses suggestNextStep so it stays in sync with the hint logic.
export function computeOptimalSteps(initialState) {
  let s = initialState;
  let steps = 0;
  const MAX = 25; // safety cap
  while (!checkWin(s) && steps < MAX) {
    const hint = suggestNextStep(s);
    if (!hint) break;
    switch (hint.type) {
      case 'expand':   s = expandGroup(s, hint.termId, hint.side); break;
      case 'combine':  s = combineTerms(s, hint.id1, hint.id2, hint.side); break;
      case 'move':     s = moveTerm(s, hint.termId, hint.fromSide); break;
      case 'negate':   s = multiplyBothSides(s, -1, 1); break;
      case 'multiply': s = multiplyBothSides(s, hint.num, hint.den); break;
      default: break;
    }
    steps++;
  }
  return steps;
}
export function equationStr(state) {
  const sideStr = terms => {
    if (terms.length === 0) return '0';
    return terms.map((t, i) => {
      if (t.type === 'group') {
        const inner = t.inner.map((u, j) => {
          const sign = j === 0 ? (u.coeff.num < 0 ? '-' : '') : (u.coeff.num < 0 ? ' - ' : ' + ');
          const mag  = Math.abs(u.coeff.num);
          const d    = u.coeff.den;
          const coef = d === 1 ? (mag === 1 && u.isVar ? '' : `${mag}`) : `${mag}/${d}`;
          return `${sign}${coef}${u.isVar ? 'x' : ''}`;
        }).join('');
        const m = t.multiplier;
        const mStr = m.den === 1 ? (m.num === 1 ? '' : `${m.num}`) : `(${m.num}/${m.den})`;
        return `${i > 0 ? ' + ' : ''}${mStr}(${inner})`;
      }
      const c = t.coeff;
      const sign = i === 0
        ? (c.num < 0 ? '-' : '')
        : (c.num < 0 ? ' - ' : ' + ');
      const mag = Math.abs(c.num);
      const coef = c.den === 1 ? `${mag}` : `${mag}/${c.den}`;
      const varPart = t.isVar ? 'x' : '';
      const coeffStr = t.isVar && c.den === 1 && mag === 1 ? '' : coef;
      return `${sign}${coeffStr}${varPart}`;
    }).join('');
  };
  return `${sideStr(state.left)} = ${sideStr(state.right)}`;
}
