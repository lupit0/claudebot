import { addF, mulF, negF, frac, isZeroF } from './fractions';

let _sid = 0;
const uid = () => `s${++_sid}`;

// ── Term factories ────────────────────────────────────────────
// Term:  { id, coeff:{num,den}, varName:'x'|'y'|null }
// Group: { id, type:'group', multiplier:{num,den}, inner:[...terms] }

export function makeTermS(num, den, varName = null) {
  return { id: uid(), coeff: frac(num, den), varName };
}

export function makeGroupS(mulNum, mulDen, innerTerms) {
  return { id: uid(), type: 'group', multiplier: frac(mulNum, mulDen), inner: innerTerms };
}

function cloneTermS(t) {
  if (t.type === 'group') {
    return { ...t, id: uid(), inner: t.inner.map(cloneTermS) };
  }
  return { ...t, id: uid() };
}

// ── Single-equation operations ────────────────────────────────

export function moveTermS(eq, termId, fromSide) {
  const toSide = fromSide === 'left' ? 'right' : 'left';
  const term = eq[fromSide].find(t => t.id === termId);
  if (!term) return eq;
  const moved = { ...cloneTermS(term), coeff: negF(term.coeff) };
  return {
    [fromSide]: eq[fromSide].filter(t => t.id !== termId),
    [toSide]:   [...eq[toSide], moved],
  };
}

export function combineTermsS(eq, id1, id2, side) {
  const terms = eq[side];
  const t1 = terms.find(t => t.id === id1);
  const t2 = terms.find(t => t.id === id2);
  if (!t1 || !t2 || t1.varName !== t2.varName) return eq;
  const newCoeff = addF(t1.coeff, t2.coeff);
  const rest = terms.filter(t => t.id !== id1 && t.id !== id2);
  if (isZeroF(newCoeff)) return { ...eq, [side]: rest };
  return { ...eq, [side]: [...rest, { id: uid(), coeff: newCoeff, varName: t1.varName }] };
}

export function expandGroupS(eq, groupId, side) {
  const terms = eq[side];
  const idx = terms.findIndex(t => t.id === groupId && t.type === 'group');
  if (idx === -1) return eq;
  const group = terms[idx];
  const expanded = group.inner.map(inner => ({
    id: uid(),
    coeff: mulF(group.multiplier, inner.coeff),
    varName: inner.varName,
  }));
  const rest = terms.filter(t => t.id !== groupId);
  return { ...eq, [side]: [...rest.slice(0, idx), ...expanded, ...rest.slice(idx)] };
}

export function multiplyEqS(eq, mulNum, mulDen) {
  const factor = frac(mulNum, mulDen);
  const mulSide = terms => terms.map(t => {
    if (t.type === 'group') {
      return { ...t, id: uid(), multiplier: mulF(t.multiplier, factor) };
    }
    return { ...t, id: uid(), coeff: mulF(t.coeff, factor) };
  });
  return { left: mulSide(eq.left), right: mulSide(eq.right) };
}

// ── Isolation detection ───────────────────────────────────────
// Returns { varName, exprTerms, exprSide, negated } or null
// Conditions:
//   - one side has exactly 1 term, it's a pure variable with |coeff|=1, no type='group'
//   - other side has no top-level terms of that variable and no groups containing it

export function detectIsolated(eq) {
  // Groups don't have .coeff so exclude them from the zero-filter
  const nz = ts => ts.filter(t => t.type === 'group' || !isZeroF(t.coeff));
  const hasGroup = ts => ts.some(t => t.type === 'group');
  const hasVar = (ts, vn) => ts.some(t => {
    if (t.type === 'group') return t.inner.some(u => u.varName === vn);
    return t.varName === vn;
  });

  for (const [varSide, exprSide] of [['left', 'right'], ['right', 'left']]) {
    const varTerms  = nz(eq[varSide]);
    const exprTerms = eq[exprSide];

    if (hasGroup(varTerms)) continue;
    if (varTerms.length !== 1) continue;

    const vt = varTerms[0];
    if (vt.type === 'group') continue;
    if (!vt.varName) continue;
    if (Math.abs(vt.coeff.num) !== vt.coeff.den) continue; // |coeff| !== 1

    const varName = vt.varName;
    const negated = vt.coeff.num < 0; // isolated -x = expr

    // Expr side must not contain that variable
    if (hasVar(exprTerms, varName)) continue;

    return { varName, exprTerms, exprSide, negated };
  }
  return null;
}

// ── Substitution ──────────────────────────────────────────────
// Replace a specific term (by id) in eq with the substitution expression.
// If exprTerms is a single constant, compute directly (no group).
// Otherwise create a group: makeGroupS(effCoeff.num, effCoeff.den, clonedExprTerms)

export function substituteById(eq, termId, exprTerms, negated) {
  const allTerms = [...eq.left, ...eq.right];
  const term = allTerms.find(t => t.id === termId);
  if (!term) return eq;

  const effCoeff = negated ? negF(term.coeff) : term.coeff;

  let replacement;
  const nzExpr = exprTerms.filter(t => !isZeroF(t.coeff));

  // If expression is a single constant and effCoeff is pure integer denominator 1,
  // or more generally: if expr is a single constant, compute directly
  if (nzExpr.length === 0) {
    // expr is 0 — replace with zero constant
    replacement = [{ id: uid(), coeff: frac(0, 1), varName: null }];
  } else if (nzExpr.length === 1 && nzExpr[0].varName === null && nzExpr[0].type !== 'group') {
    // single constant — compute directly: effCoeff * constVal
    const val = mulF(effCoeff, nzExpr[0].coeff);
    replacement = [{ id: uid(), coeff: val, varName: null }];
  } else {
    // multiple terms — create a group
    const cloned = exprTerms.map(cloneTermS);
    replacement = [makeGroupS(effCoeff.num, effCoeff.den, cloned)];
  }

  const replaceSide = side => {
    const idx = side.findIndex(t => t.id === termId);
    if (idx === -1) return side;
    return [
      ...side.slice(0, idx),
      ...replacement,
      ...side.slice(idx + 1),
    ];
  };

  return {
    left:  replaceSide(eq.left),
    right: replaceSide(eq.right),
  };
}

// ── Equation combination (elimination method) ─────────────────
// sign = 1: target + source; sign = -1: target - source
// targetEq is modified; sourceEq stays unchanged.

export function addEquations(targetEq, sourceEq, sign) {
  const signedSource = multiplyEqS(sourceEq, sign, 1);
  const clonedTarget = multiplyEqS(targetEq, 1, 1);
  return {
    left:  [...clonedTarget.left,  ...signedSource.left],
    right: [...clonedTarget.right, ...signedSource.right],
  };
}

// ── Win detection ─────────────────────────────────────────────
// Both x and y are isolated with only constant expressions

export function checkSystemWin(eq1, eq2) {
  const iso1 = detectIsolated(eq1);
  const iso2 = detectIsolated(eq2);
  if (!iso1 || !iso2) return false;

  // "Fully solved" means: no groups, exactly one constant (or zero)
  const isConstExpr = (terms) => {
    if (terms.some(t => t.type === 'group')) return false;
    const nz = terms.filter(t => !isZeroF(t.coeff));
    if (nz.length === 0) return true; // = 0
    return nz.length === 1 && nz[0].varName === null;
  };

  const vars = new Set([iso1.varName, iso2.varName]);
  if (!vars.has('x') || !vars.has('y')) return false;

  return isConstExpr(iso1.exprTerms) && isConstExpr(iso2.exprTerms);
}

// ── Solution extraction ───────────────────────────────────────
// Returns { x: frac|null, y: frac|null, str: 'x = 3, y = 4' }

export function extractSystemSolution(eq1, eq2) {
  const result = { x: null, y: null, str: '' };

  function extractFromEq(eq) {
    const iso = detectIsolated(eq);
    if (!iso) return null;
    const nz = iso.exprTerms.filter(t => !isZeroF(t.coeff));
    if (nz.length === 0) return frac(0, 1);
    // Sum all constants
    let sum = frac(0, 1);
    for (const t of nz) {
      if (t.type === 'group' || t.varName !== null) return null; // not pure constant
      sum = addF(sum, t.coeff);
    }
    // If isolated as -x = expr, the actual value is negated
    if (iso.negated) sum = negF(sum);
    return sum;
  }

  for (const eq of [eq1, eq2]) {
    const iso = detectIsolated(eq);
    if (!iso) continue;
    const val = extractFromEq(eq);
    if (val !== null) result[iso.varName] = val;
  }

  const parts = [];
  if (result.x !== null) {
    const v = result.x;
    parts.push(`x = ${v.den === 1 ? v.num : `${v.num}/${v.den}`}`);
  }
  if (result.y !== null) {
    const v = result.y;
    parts.push(`y = ${v.den === 1 ? v.num : `${v.num}/${v.den}`}`);
  }
  result.str = parts.join(', ');
  return result;
}

// ── Equation string rendering ─────────────────────────────────

export function eqStrS(eq) {
  const sideStr = terms => {
    if (terms.length === 0) return '0';
    return terms.map((t, i) => {
      if (t.type === 'group') {
        const inner = t.inner.map((u, j) => {
          const sign = j === 0 ? (u.coeff.num < 0 ? '-' : '') : (u.coeff.num < 0 ? ' - ' : ' + ');
          const mag  = Math.abs(u.coeff.num);
          const d    = u.coeff.den;
          const coef = d === 1 ? (mag === 1 && u.varName ? '' : `${mag}`) : `${mag}/${d}`;
          return `${sign}${coef}${u.varName || ''}`;
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
      const varPart = t.varName || '';
      const coeffStr = t.varName && c.den === 1 && mag === 1 ? '' : coef;
      return `${sign}${coeffStr}${varPart}`;
    }).join('');
  };
  return `${sideStr(eq.left)} = ${sideStr(eq.right)}`;
}

export function systemStr(eq1, eq2) {
  return `${eqStrS(eq1)}  |  ${eqStrS(eq2)}`;
}

// ── Hint logic ────────────────────────────────────────────────

export function suggestSystemHint(eq1, eq2) {
  const nz = ts => ts.filter(t => !isZeroF(t.coeff));

  // Helper: check for groups in an eq
  const hasGroups = eq =>
    [...eq.left, ...eq.right].some(t => t.type === 'group');

  // 1. Expand groups first
  if (hasGroups(eq1)) return 'Expand the brackets in Eq 1';
  if (hasGroups(eq2)) return 'Expand the brackets in Eq 2';

  const iso1 = detectIsolated(eq1);
  const iso2 = detectIsolated(eq2);

  // 2. Check win state
  const isConstExpr = terms => nz(terms).every(t => t.type !== 'group' && t.varName === null);

  if (iso1 && isConstExpr(iso1.exprTerms) && iso2 && isConstExpr(iso2.exprTerms)) {
    return 'Both variables solved!';
  }

  // 3. If one var is isolated (numerically) and the other isn't:
  //    Check if x isolated in one eq — look for y in the other
  if (iso1 && isConstExpr(iso1.exprTerms)) {
    // x (or y) is solved in eq1
    if (iso2 && !isConstExpr(iso2.exprTerms)) {
      return `${iso1.varName} is solved — now solve for ${iso2.varName} in Eq 2`;
    }
    if (!iso2) {
      const missing = iso1.varName === 'x' ? 'y' : 'x';
      return `${iso1.varName} is solved — isolate ${missing} in Eq 2`;
    }
  }
  if (iso2 && isConstExpr(iso2.exprTerms)) {
    if (iso1 && !isConstExpr(iso1.exprTerms)) {
      return `${iso2.varName} is solved — now solve for ${iso1.varName} in Eq 1`;
    }
    if (!iso1) {
      const missing = iso2.varName === 'x' ? 'y' : 'x';
      return `${iso2.varName} is solved — isolate ${missing} in Eq 1`;
    }
  }

  // 4. If x isolated (in expr form) in eq1 → suggest substituting into eq2
  if (iso1) {
    const isoVar = iso1.varName;
    const otherEq = eq2;
    const otherHasVar = [...otherEq.left, ...otherEq.right].some(
      t => t.type !== 'group' && t.varName === isoVar
    );
    if (otherHasVar) {
      return `${isoVar} is isolated in Eq 1 — tap a ${isoVar} term in Eq 2 to substitute`;
    }
  }
  if (iso2) {
    const isoVar = iso2.varName;
    const otherEq = eq1;
    const otherHasVar = [...otherEq.left, ...otherEq.right].some(
      t => t.type !== 'group' && t.varName === isoVar
    );
    if (otherHasVar) {
      return `${isoVar} is isolated in Eq 2 — tap a ${isoVar} term in Eq 1 to substitute`;
    }
  }

  // 5. Describe the simplest manipulation step for each equation
  const hintForEq = (eq, label) => {
    const allTerms = [...eq.left, ...eq.right];
    const lTerms = nz(eq.left);
    const rTerms = nz(eq.right);

    const lX = lTerms.filter(t => !t.type && t.varName === 'x');
    const lY = lTerms.filter(t => !t.type && t.varName === 'y');
    const rX = rTerms.filter(t => !t.type && t.varName === 'x');
    const rY = rTerms.filter(t => !t.type && t.varName === 'y');
    const lC = lTerms.filter(t => !t.type && !t.varName);
    const rC = rTerms.filter(t => !t.type && !t.varName);

    if (lX.length >= 2) return `Combine x terms on the left of ${label}`;
    if (rX.length >= 2) return `Combine x terms on the right of ${label}`;
    if (lY.length >= 2) return `Combine y terms on the left of ${label}`;
    if (rY.length >= 2) return `Combine y terms on the right of ${label}`;
    if (lC.length >= 2) return `Combine numbers on the left of ${label}`;
    if (rC.length >= 2) return `Combine numbers on the right of ${label}`;

    // Variables on both sides — suggest moving one
    const xBothSides = lX.length > 0 && rX.length > 0;
    const yBothSides = lY.length > 0 && rY.length > 0;
    if (xBothSides) return `Move x terms to one side in ${label}`;
    if (yBothSides) return `Move y terms to one side in ${label}`;

    // Constants on the variable side — suggest moving them
    const hasXorY = t => t.varName === 'x' || t.varName === 'y';
    const lHasVar = lTerms.some(t => !t.type && hasXorY(t));
    const rHasVar = rTerms.some(t => !t.type && hasXorY(t));
    if (lHasVar && lC.length > 0) return `Move the number to the right in ${label}`;
    if (rHasVar && rC.length > 0) return `Move the number to the left in ${label}`;

    return null;
  };

  const h1 = hintForEq(eq1, 'Eq 1');
  if (h1) return h1;
  const h2 = hintForEq(eq2, 'Eq 2');
  if (h2) return h2;

  return 'Try isolating one variable in either equation';
}

// ── Optimal-step simulator ────────────────────────────────────
// Mirrors computeOptimalSteps() in equations.js but for 2-variable systems.

function netVarCoeff(eq, varName) {
  let s = 0;
  eq.left.forEach(t  => { if (t.type !== 'group' && t.varName === varName) s += t.coeff.num / t.coeff.den; });
  eq.right.forEach(t => { if (t.type !== 'group' && t.varName === varName) s -= t.coeff.num / t.coeff.den; });
  return s;
}

function suggestSingleEqAction(eq, eqKey) {
  const nz = ts => ts.filter(t => !isZeroF(t.coeff));
  const nzL    = nz(eq.left.filter(t => t.type !== 'group'));
  const nzR    = nz(eq.right.filter(t => t.type !== 'group'));
  const lVars  = nzL.filter(t => t.varName !== null);
  const rVars  = nzR.filter(t => t.varName !== null);
  const lConst = nzL.filter(t => t.varName === null);

  if (lVars.length > 0 && rVars.length > 0)
    return { eqKey, type: 'move', termId: rVars[0].id, side: 'right' };

  if (lVars.length === 0 && rVars.length > 0) {
    if (lConst.length > 0) return { eqKey, type: 'move', termId: lConst[0].id, side: 'left' };
    return { eqKey, type: 'move', termId: rVars[0].id, side: 'right' };
  }

  const uniqueVars = new Set(lVars.map(t => t.varName));
  if (uniqueVars.size > 1) return null;
  if (lConst.length > 0) return { eqKey, type: 'move', termId: lConst[0].id, side: 'left' };
  if (lVars.length === 0) return null;

  const vt = lVars[0];
  if (vt.coeff.num < 0) return { eqKey, type: 'negate' };
  if (vt.coeff.num !== vt.coeff.den) return { eqKey, type: 'multiply', mulNum: vt.coeff.den, mulDen: vt.coeff.num };
  return null;
}

function suggestSystemAction(eq1, eq2) {
  const nz = ts => ts.filter(t => t.type === 'group' || !isZeroF(t.coeff));
  const isConst = ts => {
    const nzTs = ts.filter(t => !isZeroF(t.coeff));
    return nzTs.length <= 1 && nzTs.every(t => t.varName === null && t.type !== 'group');
  };

  // 1. Expand groups first
  for (const [eq, eqKey] of [[eq1, 'eq1'], [eq2, 'eq2']]) {
    for (const side of ['left', 'right']) {
      const g = eq[side].find(t => t.type === 'group');
      if (g) return { eqKey, type: 'expand', termId: g.id, side };
    }
  }

  // 2. Combine like terms
  const findCombine = eq => {
    for (const side of ['left', 'right']) {
      const terms = nz(eq[side]).filter(t => t.type !== 'group');
      for (let i = 0; i < terms.length; i++)
        for (let j = i + 1; j < terms.length; j++)
          if (terms[i].varName === terms[j].varName)
            return { id1: terms[i].id, id2: terms[j].id, side };
    }
    return null;
  };
  const cc1 = findCombine(eq1); if (cc1) return { eqKey: 'eq1', type: 'combine', ...cc1 };
  const cc2 = findCombine(eq2); if (cc2) return { eqKey: 'eq2', type: 'combine', ...cc2 };

  // 3. Isolation
  const iso1 = detectIsolated(eq1);
  const iso2 = detectIsolated(eq2);
  if (iso1 && isConst(iso1.exprTerms) && iso2 && isConst(iso2.exprTerms)) return null;

  // 4. Numerically solved → substitute into other
  if (iso1 && isConst(iso1.exprTerms)) {
    const t = [...eq2.left, ...eq2.right].find(t => t.varName === iso1.varName && t.type !== 'group');
    if (t) return { type: 'substitute', targetEq: 'eq2', termId: t.id };
    return suggestSingleEqAction(eq2, 'eq2');
  }
  if (iso2 && isConst(iso2.exprTerms)) {
    const t = [...eq1.left, ...eq1.right].find(t => t.varName === iso2.varName && t.type !== 'group');
    if (t) return { type: 'substitute', targetEq: 'eq1', termId: t.id };
    return suggestSingleEqAction(eq1, 'eq1');
  }

  // 5. Expr-isolated → substitute
  if (iso1) {
    const t = [...eq2.left, ...eq2.right].find(t => t.varName === iso1.varName && t.type !== 'group');
    if (t) return { type: 'substitute', targetEq: 'eq2', termId: t.id };
  }
  if (iso2) {
    const t = [...eq1.left, ...eq1.right].find(t => t.varName === iso2.varName && t.type !== 'group');
    if (t) return { type: 'substitute', targetEq: 'eq1', termId: t.id };
  }

  // 6. Single-equation steps
  const a1 = suggestSingleEqAction(eq1, 'eq1'); if (a1) return a1;
  const a2 = suggestSingleEqAction(eq2, 'eq2'); if (a2) return a2;

  // 7. Elimination (try sign=1 first, then -1, for each variable)
  const elVars = new Set();
  [...eq1.left, ...eq1.right, ...eq2.left, ...eq2.right]
    .forEach(t => { if (!t.type && t.varName) elVars.add(t.varName); });
  for (const sign of [1, -1]) {
    for (const v of elVars) {
      const nc1 = netVarCoeff(eq1, v);
      const nc2 = netVarCoeff(eq2, v);
      if (Math.abs(nc2 + sign * nc1) < 0.001 && Math.abs(nc1) > 0.001)
        return { type: 'addEquations', targetEq: 'eq2', sign };
    }
  }
  return { type: 'addEquations', targetEq: 'eq2', sign: 1 };
}

export function computeSystemOptimalSteps(eq1Initial, eq2Initial) {
  const cloneEq = eq => ({ left: eq.left.map(cloneTermS), right: eq.right.map(cloneTermS) });
  let eq1 = cloneEq(eq1Initial);
  let eq2 = cloneEq(eq2Initial);
  let steps = 0;
  const MAX = 40;

  while (!checkSystemWin(eq1, eq2) && steps < MAX) {
    const action = suggestSystemAction(eq1, eq2);
    if (!action) break;

    const isEq1 = action.eqKey === 'eq1';
    if (action.type === 'expand') {
      if (isEq1) eq1 = expandGroupS(eq1, action.termId, action.side);
      else       eq2 = expandGroupS(eq2, action.termId, action.side);
    } else if (action.type === 'combine') {
      if (isEq1) eq1 = combineTermsS(eq1, action.id1, action.id2, action.side);
      else       eq2 = combineTermsS(eq2, action.id1, action.id2, action.side);
    } else if (action.type === 'move') {
      if (isEq1) eq1 = moveTermS(eq1, action.termId, action.side);
      else       eq2 = moveTermS(eq2, action.termId, action.side);
    } else if (action.type === 'negate') {
      if (isEq1) eq1 = multiplyEqS(eq1, -1, 1);
      else       eq2 = multiplyEqS(eq2, -1, 1);
    } else if (action.type === 'multiply') {
      if (isEq1) eq1 = multiplyEqS(eq1, action.mulNum, action.mulDen);
      else       eq2 = multiplyEqS(eq2, action.mulNum, action.mulDen);
    } else if (action.type === 'substitute') {
      const isoEq = action.targetEq === 'eq2' ? eq1 : eq2;
      const iso   = detectIsolated(isoEq);
      if (!iso) break;
      if (action.targetEq === 'eq2') eq2 = substituteById(eq2, action.termId, iso.exprTerms, iso.negated);
      else                           eq1 = substituteById(eq1, action.termId, iso.exprTerms, iso.negated);
    } else if (action.type === 'addEquations') {
      const target = action.targetEq === 'eq1' ? eq1 : eq2;
      const source = action.targetEq === 'eq1' ? eq2 : eq1;
      const newEq  = addEquations(target, source, action.sign);
      if (action.targetEq === 'eq1') eq1 = newEq; else eq2 = newEq;
    }
    steps++;
  }
  return steps;
}
