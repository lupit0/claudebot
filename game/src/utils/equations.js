import { addF, mulF, negF, frac, isZeroF, absEqOneF } from './fractions';

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

  const singleVar   = (v, c) => v.length === 1 && c.length === 0 && absEqOneF(v[0].coeff);
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
    case 'expand':
      return 'Expanded parentheses';
    default:
      return '';
  }
}

// Stringify the equation for step history
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
