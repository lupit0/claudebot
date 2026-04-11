import { useState } from 'react';
import {
  makeTerm, makeGroup, equationStr, computeOptimalSteps,
  suggestNextStep, moveTerm, combineTerms, multiplyBothSides, expandGroup,
} from '../utils/equations';
import { frac } from '../utils/fractions';

// ─── helpers ──────────────────────────────────────────────
function parsePending(numStr, denStr, negative) {
  const n = Number(numStr || '1');
  const d = Number(denStr || '1');
  if (!numStr && !denStr) return frac(negative ? -1 : 1, 1);
  if (isNaN(n) || isNaN(d) || d === 0 || n === 0) return null;
  return frac(negative ? -n : n, d);
}

function termLabel(t, index) {
  if (t.type === 'group') {
    const mulNeg  = t.mul.num < 0;
    const sign    = index === 0 ? (mulNeg ? '−' : '') : (mulNeg ? ' − ' : ' + ');
    const absN    = Math.abs(t.mul.num);
    const mulStr  = (absN === 1 && t.mul.den === 1)
      ? '' : (t.mul.den === 1 ? String(absN) : `${absN}/${t.mul.den}`);
    const inner   = t.inner.map((u, j) => termLabel(u, j)).join('');
    return `${sign}${mulStr}(${inner})`;
  }
  const neg  = t.num < 0;
  const sign = index === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ');
  const abs  = Math.abs(t.num);
  const coef = t.den === 1 ? String(abs) : `${abs}/${t.den}`;
  if (t.isVar) return sign + (abs === 1 && t.den === 1 ? 'x' : `${coef}x`);
  return sign + coef;
}

function buildState(left, right) {
  const toTerm = t => {
    if (t.type === 'group') {
      return makeGroup(t.mul.num, t.mul.den,
        t.inner.map(u => makeTerm(u.num, u.den, u.isVar)));
    }
    return makeTerm(t.num, t.den, t.isVar);
  };
  return { left: left.map(toTerm), right: right.map(toTerm) };
}

function extractSol(state, optimal) {
  let s = state;
  for (let i = 0; i < optimal + 3; i++) {
    const h = suggestNextStep(s);
    if (!h) break;
    if      (h.type === 'expand')   s = expandGroup(s, h.termId, h.side);
    else if (h.type === 'combine')  s = combineTerms(s, h.id1, h.id2, h.side);
    else if (h.type === 'move')     s = moveTerm(s, h.termId, h.fromSide);
    else if (h.type === 'negate')   s = multiplyBothSides(s, -1, 1);
    else if (h.type === 'multiply') s = multiplyBothSides(s, h.num, h.den);
  }
  const ct = [...s.left, ...s.right].find(t => !t.isVar);
  if (!ct) return '?';
  const { num, den } = ct.coeff;
  return den === 1 ? String(num) : `${num}/${den}`;
}

// ─── component ────────────────────────────────────────────
export default function EquationBuilder({ onSave, onBack }) {
  const [left,  setLeft]  = useState([]);
  const [right, setRight] = useState([]);
  const [side,  setSide]  = useState('left');
  const [num,   setNum]   = useState('');
  const [den,   setDen]   = useState('');
  const [inDen, setInDen] = useState(false);
  const [neg,   setNeg]   = useState(false);
  // Bracket / group state
  const [inGroup,    setInGroup]    = useState(false);
  const [groupMul,   setGroupMul]   = useState(null); // {num,den}
  const [groupInner, setGroupInner] = useState([]);

  const [status,    setStatus]    = useState({ msg: '', ok: false });
  const [validated, setValidated] = useState(false);
  const [savedData, setSavedData] = useState(null);

  const clearStatus = () => { setStatus({ msg: '', ok: false }); setValidated(false); };

  const resetInput = () => { setNum(''); setDen(''); setInDen(false); setNeg(false); };

  const inputDisplay = () => {
    const sign = neg ? '−' : '+';
    const n = num || (inDen ? '?' : '');
    const fracStr = inDen ? `${n}/${den || '?'}` : n;
    return `${sign} ${fracStr}`;
  };

  // Route a committed term to either groupInner or the active side
  function addToActive(term) {
    if (inGroup) setGroupInner(p => [...p, term]);
    else if (side === 'left') setLeft(p => [...p, term]);
    else setRight(p => [...p, term]);
  }

  function commitTerm(isVar) {
    const f = parsePending(num, inDen ? den : '', neg);
    if (!f) { setStatus({ msg: 'Invalid number', ok: false }); return false; }
    addToActive({ num: f.num, den: f.den, isVar });
    resetInput();
    clearStatus();
    return true;
  }

  function commitConst() {
    if (num === '' && !inDen) return;
    commitTerm(false);
  }

  // ── button handlers ──────────────────────────────────────
  function pressDigit(d) {
    clearStatus();
    if (inDen) { if (den.length < 3) setDen(p => p + d); }
    else        { if (num.length < 4) setNum(p => p + d); }
  }

  function pressSlash() {
    if (num === '') return;
    setInDen(true); clearStatus();
  }

  function pressX() { commitTerm(true); }

  function pressPlus() {
    commitConst(); setNeg(false); clearStatus();
  }

  function pressMinus() {
    if (num === '' && !inDen) { setNeg(true); clearStatus(); return; }
    commitConst(); setNeg(true); clearStatus();
  }

  function pressOpenParen() {
    if (inGroup) return; // no nested groups
    // Current numInput becomes the multiplier (default 1)
    const f = parsePending(num, inDen ? den : '', neg) || frac(1, 1);
    setGroupMul({ num: f.num, den: f.den });
    setGroupInner([]);
    setInGroup(true);
    resetInput();
    clearStatus();
  }

  function pressCloseParen() {
    if (!inGroup) return;
    commitConst(); // finalise any pending inner term
    // Need the updated groupInner — use functional form for the set
    setGroupInner(inner => {
      if (inner.length === 0) {
        // Empty group: cancel
        setInGroup(false);
        setGroupMul(null);
        return [];
      }
      const group = { type: 'group', mul: groupMul, inner };
      // Add the completed group to the active side
      if (side === 'left') setLeft(p => [...p, group]);
      else                 setRight(p => [...p, group]);
      setInGroup(false);
      setGroupMul(null);
      resetInput();
      return [];
    });
    clearStatus();
  }

  function pressEquals() {
    if (side === 'right' || inGroup) return;
    commitConst();
    setSide('right'); setNeg(false); clearStatus();
  }

  function pressBackspace() {
    clearStatus();
    if (inDen && den.length > 0)  { setDen(p => p.slice(0,-1)); return; }
    if (inDen)                     { setInDen(false); setDen(''); return; }
    if (num.length > 0)            { setNum(p => p.slice(0,-1)); return; }
    // Inside a group: remove last inner term, or cancel the group
    if (inGroup) {
      if (groupInner.length > 0) { setGroupInner(p => p.slice(0,-1)); return; }
      setInGroup(false); setGroupMul(null); return;
    }
    if (side === 'right' && right.length === 0) { setSide('left'); return; }
    if (side === 'left')  setLeft(p  => p.slice(0,-1));
    else                  setRight(p => p.slice(0,-1));
    setNeg(false);
  }

  function pressClear() {
    setLeft([]); setRight([]); setSide('left');
    resetInput();
    setInGroup(false); setGroupMul(null); setGroupInner([]);
    clearStatus();
  }

  // ── validate ─────────────────────────────────────────────
  function validate() {
    if (inGroup) { setStatus({ msg: 'Close the bracket with ) first', ok: false }); return; }

    let fl = [...left], fr = [...right];
    const pf = parsePending(num, inDen ? den : '', neg);
    if (pf && num !== '') {
      const t = { num: pf.num, den: pf.den, isVar: false };
      if (side === 'left') fl = [...fl, t]; else fr = [...fr, t];
    }

    if (fl.length === 0) { setStatus({ msg: 'Add terms to the left side', ok: false }); return; }
    if (fr.length === 0) { setStatus({ msg: 'Add terms to the right side', ok: false }); return; }

    const allFlat = t => t.type === 'group' ? t.inner : [t];
    const hasVar = [...fl, ...fr].flatMap(allFlat).some(t => t.isVar);
    if (!hasVar) { setStatus({ msg: 'Need at least one x term', ok: false }); return; }

    const state = buildState(fl, fr);
    const opt   = computeOptimalSteps(state);
    if (opt <= 0 || opt >= 25) {
      setStatus({ msg: 'Not solvable — try a different equation', ok: false }); return;
    }

    const sol = extractSol(state, opt);
    setStatus({ msg: `x = ${sol}  ·  ${opt} step${opt!==1?'s':''} to solve`, ok: true });
    setValidated(true);
    setSavedData({ fl, fr, opt });
    setLeft(fl); setRight(fr); setNum(''); setDen(''); setInDen(false);
  }

  function save() {
    if (!validated || !savedData) return;
    const { fl, fr, opt } = savedData;
    const state = buildState(fl, fr);
    onSave({ left: fl, right: fr, title: equationStr(state), optimalSteps: opt });
  }

  // ── render ───────────────────────────────────────────────
  const renderSide = (terms, thisSide) => (
    <div className={`builder-side ${side === thisSide ? 'side-active' : ''}`}>
      {terms.length === 0 && side !== thisSide && !inGroup && (
        <span className="side-empty">?</span>
      )}
      {terms.map((t, i) => (
        <span key={i} className={`btm ${t.type === 'group' ? 'btm-group' : t.isVar ? 'btm-var' : 'btm-const'}`}>
          {termLabel(t, i)}
        </span>
      ))}
      {side === thisSide && (
        inGroup ? (
          // Show the group being assembled
          <span className="btm btm-group">
            {groupMul && Math.abs(groupMul.num) !== 1 || groupMul?.den !== 1
              ? (groupMul.num < 0 ? '−' : terms.length > 0 ? '+' : '')
                + (groupMul.den === 1 ? Math.abs(groupMul.num) : `${Math.abs(groupMul.num)}/${groupMul.den}`)
              : (groupMul?.num < 0 ? '−' : terms.length > 0 ? '+' : '')
            }{'('}
            {groupInner.map((u, j) => termLabel(u, j)).join('')}
            <span className="btm-cursor">{inputDisplay()}▌</span>
            {')'}
          </span>
        ) : (
          <span className="btm-cursor">{inputDisplay()}▌</span>
        )
      )}
    </div>
  );

  const canOpenParen  = !inGroup;
  const canCloseParen = inGroup;
  const canEquals     = side === 'left' && !inGroup;

  return (
    <div className="equation-builder">
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="builder-title">MAKE A LEVEL</div>
        <div />
      </div>

      <div className="builder-preview">
        {renderSide(left, 'left')}
        <div className={`builder-eq ${side === 'right' ? 'eq-done' : ''}`}
             onClick={canEquals ? pressEquals : undefined}
             style={{ cursor: canEquals ? 'pointer' : 'default', opacity: canEquals ? 1 : 0.4 }}>
          =
        </div>
        {renderSide(right, 'right')}
      </div>

      <div className="builder-hint">
        {inGroup
          ? 'Inside brackets — add terms, then press ) to close'
          : side === 'left'
            ? 'Sign first, then number. Press x for variable, = to switch sides.'
            : 'Build right side. Press VALIDATE when done.'}
      </div>

      <div className="builder-pad">
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('7')}>7</button>
          <button className="pad-btn" onClick={() => pressDigit('8')}>8</button>
          <button className="pad-btn" onClick={() => pressDigit('9')}>9</button>
          <button className="pad-btn pad-plus" onClick={pressPlus}>+</button>
          <button className="pad-btn pad-minus" onClick={pressMinus}>−</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('4')}>4</button>
          <button className="pad-btn" onClick={() => pressDigit('5')}>5</button>
          <button className="pad-btn" onClick={() => pressDigit('6')}>6</button>
          <button className="pad-btn pad-frac" onClick={pressSlash} disabled={num === ''}>/</button>
          <button className="pad-btn pad-back" onClick={pressBackspace}>⌫</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('1')}>1</button>
          <button className="pad-btn" onClick={() => pressDigit('2')}>2</button>
          <button className="pad-btn" onClick={() => pressDigit('3')}>3</button>
          <button className="pad-btn pad-eq" onClick={pressEquals} disabled={!canEquals}>=</button>
          <button className="pad-btn pad-clr" onClick={pressClear}>CLR</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('0')}>0</button>
          <button className="pad-btn pad-paren" onClick={pressOpenParen}  disabled={!canOpenParen}>(</button>
          <button className="pad-btn pad-paren" onClick={pressCloseParen} disabled={!canCloseParen}>)</button>
          <button className="pad-btn pad-x" onClick={pressX}>x</button>
          <div />
        </div>
      </div>

      {status.msg && (
        <div className={`builder-status ${status.ok ? 'status-ok' : 'status-err'}`}>
          {status.msg}
        </div>
      )}

      <div className="builder-actions">
        <button className="pixel-btn btn-validate" onClick={validate}>VALIDATE</button>
        <button className="pixel-btn btn-save-level" onClick={save} disabled={!validated}>
          SAVE LEVEL
        </button>
      </div>
    </div>
  );
}
