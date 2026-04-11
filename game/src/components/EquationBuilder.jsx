import { useState } from 'react';
import {
  makeTerm, equationStr, computeOptimalSteps,
  suggestNextStep, moveTerm, combineTerms, multiplyBothSides, expandGroup,
} from '../utils/equations';
import { frac } from '../utils/fractions';

// ─── helpers ──────────────────────────────────────────────
function parsePending(numStr, denStr, negative) {
  const n = Number(numStr || '1');
  const d = Number(denStr || '1');
  if (!numStr && !denStr) return frac(negative ? -1 : 1, 1); // bare x or +-
  if (isNaN(n) || isNaN(d) || d === 0 || n === 0) return null;
  return frac(negative ? -n : n, d);
}

function termLabel(t, index) {
  const neg = t.num < 0;
  const sign = index === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ');
  const abs  = Math.abs(t.num);
  const coef = t.den === 1 ? String(abs) : `${abs}/${t.den}`;
  if (t.isVar) return sign + (abs === 1 && t.den === 1 ? 'x' : `${coef}x`);
  return sign + coef;
}

function buildState(left, right) {
  return {
    left:  left.map(t  => makeTerm(t.num, t.den, t.isVar)),
    right: right.map(t => makeTerm(t.num, t.den, t.isVar)),
  };
}

// Simulate the solver to find x value
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
  const [num,   setNum]   = useState('');  // numerator digits
  const [den,   setDen]   = useState('');  // denominator digits (after /)
  const [inDen, setInDen] = useState(false); // typing denominator?
  const [neg,   setNeg]   = useState(false);
  const [status, setStatus] = useState({ msg: '', ok: false });
  const [validated, setValidated] = useState(false);
  const [savedData,  setSavedData]  = useState(null);

  const clearStatus = () => { setStatus({ msg: '', ok: false }); setValidated(false); };

  const inputDisplay = () => {
    const sign = neg ? '−' : '+';
    const n = num || (inDen ? '?' : '');
    const d = inDen ? (den || '?') : '';
    const frac = inDen ? `${n}/${d}` : n;
    return `${sign} ${frac}`;
  };

  function commitTerm(isVar) {
    const f = parsePending(num, inDen ? den : '', neg);
    if (!f) { setStatus({ msg: 'Invalid number', ok: false }); return false; }
    const term = { num: f.num, den: f.den, isVar };
    if (side === 'left') setLeft(p => [...p, term]);
    else setRight(p => [...p, term]);
    setNum(''); setDen(''); setInDen(false); setNeg(false);
    clearStatus();
    return true;
  }

  function commitConst() {
    if (num === '' && !inDen) return; // nothing typed, nothing to commit
    commitTerm(false);
  }

  // ── button handlers ──────────────────────────────────────
  function pressDigit(d) {
    clearStatus();
    if (inDen) { if (den.length < 3) setDen(p => p + d); }
    else        { if (num.length < 4) setNum(p => p + d); }
  }

  function pressSlash() {
    if (num === '') return; // need numerator first
    setInDen(true);
    clearStatus();
  }

  function pressX() {
    commitTerm(true);
  }

  function pressPlus() {
    commitConst();
    setNeg(false);
    clearStatus();
  }

  function pressMinus() {
    if (num === '' && !inDen) { setNeg(true); clearStatus(); return; }
    commitConst();
    setNeg(true);
    clearStatus();
  }

  function pressEquals() {
    if (side === 'right') return;
    commitConst();
    setSide('right');
    setNeg(false);
    clearStatus();
  }

  function pressBackspace() {
    clearStatus();
    if (inDen && den.length > 0) { setDen(p => p.slice(0,-1)); return; }
    if (inDen) { setInDen(false); setDen(''); return; }
    if (num.length > 0) { setNum(p => p.slice(0,-1)); return; }
    // remove last term
    if (side === 'right' && right.length === 0) { setSide('left'); return; }
    if (side === 'left')  setLeft(p  => p.slice(0,-1));
    else                  setRight(p => p.slice(0,-1));
    setNeg(false);
  }

  function pressClear() {
    setLeft([]); setRight([]); setSide('left');
    setNum(''); setDen(''); setInDen(false); setNeg(false);
    clearStatus();
  }

  // ── validate ─────────────────────────────────────────────
  function validate() {
    // Finalise any pending input
    let fl = [...left], fr = [...right];
    const pf = parsePending(num, inDen ? den : '', neg);
    if (pf && num !== '') {
      const t = { num: pf.num, den: pf.den, isVar: false };
      if (side === 'left') fl = [...fl, t]; else fr = [...fr, t];
    }

    if (fl.length === 0) { setStatus({ msg: 'Add terms to the left side', ok: false }); return; }
    if (fr.length === 0) { setStatus({ msg: 'Add terms to the right side', ok: false }); return; }
    const hasVar = [...fl, ...fr].some(t => t.isVar);
    if (!hasVar) { setStatus({ msg: 'Need at least one x term!', ok: false }); return; }

    const state = buildState(fl, fr);
    const opt   = computeOptimalSteps(state);
    if (opt <= 0 || opt >= 25) {
      setStatus({ msg: 'Not solvable — try a different equation', ok: false });
      return;
    }

    const sol = extractSol(state, opt);
    setStatus({ msg: `x = ${sol}  ·  ${opt} step${opt!==1?'s':''} to solve`, ok: true });
    setValidated(true);
    setSavedData({ fl, fr, opt });
    // Update committed state to include finalised pending input
    setLeft(fl); setRight(fr); setNum(''); setDen(''); setInDen(false);
  }

  // ── save ─────────────────────────────────────────────────
  function save() {
    if (!validated || !savedData) return;
    const { fl, fr, opt } = savedData;
    const state = buildState(fl, fr);
    onSave({ left: fl, right: fr, title: equationStr(state), optimalSteps: opt });
  }

  // ── render ───────────────────────────────────────────────
  const renderSide = (terms, thisSide) => (
    <div className={`builder-side ${side === thisSide ? 'side-active' : ''}`}>
      {terms.length === 0 && side !== thisSide && <span className="side-empty">?</span>}
      {terms.map((t, i) => (
        <span key={i} className={`btm ${t.isVar ? 'btm-var' : 'btm-const'}`}>
          {termLabel(t, i)}
        </span>
      ))}
      {side === thisSide && (
        <span className="btm-cursor">{inputDisplay()}▌</span>
      )}
    </div>
  );

  return (
    <div className="equation-builder">
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="builder-title">MAKE A LEVEL</div>
        <div />
      </div>

      {/* Live equation preview */}
      <div className="builder-preview">
        {renderSide(left, 'left')}
        <div className={`builder-eq ${side === 'right' ? 'eq-done' : ''}`}
             onClick={pressEquals} title="Switch to right side">
          =
        </div>
        {renderSide(right, 'right')}
      </div>

      <div className="builder-hint">
        {side === 'left'
          ? 'Tip: sign first, then number — e.g. − 5 x for −5x. Tap = when left side is done.'
          : 'Tip: + or − sets the sign before you type. Tap VALIDATE when done.'}
      </div>

      {/* Numpad */}
      <div className="builder-pad">
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('7')}>7</button>
          <button className="pad-btn" onClick={() => pressDigit('8')}>8</button>
          <button className="pad-btn" onClick={() => pressDigit('9')}>9</button>
          <button className="pad-btn pad-x" onClick={pressX}>x</button>
          <button className="pad-btn pad-plus" onClick={pressPlus}>+</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('4')}>4</button>
          <button className="pad-btn" onClick={() => pressDigit('5')}>5</button>
          <button className="pad-btn" onClick={() => pressDigit('6')}>6</button>
          <button className="pad-btn pad-frac" onClick={pressSlash} disabled={num === ''}>
            /
          </button>
          <button className="pad-btn pad-minus" onClick={pressMinus}>−</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => pressDigit('1')}>1</button>
          <button className="pad-btn" onClick={() => pressDigit('2')}>2</button>
          <button className="pad-btn" onClick={() => pressDigit('3')}>3</button>
          <button className="pad-btn pad-back" onClick={pressBackspace}>⌫</button>
          <button className="pad-btn pad-eq" onClick={pressEquals} disabled={side === 'right'}>=</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn pad-zero" onClick={() => pressDigit('0')}>0</button>
          <button className="pad-btn pad-clr" onClick={pressClear}>CLR</button>
          <div /> <div /> <div />
        </div>
      </div>

      {status.msg && (
        <div className={`builder-status ${status.ok ? 'status-ok' : 'status-err'}`}>
          {status.msg}
        </div>
      )}

      <div className="builder-actions">
        <button className="pixel-btn btn-validate" onClick={validate}>
          VALIDATE
        </button>
        <button className="pixel-btn btn-save-level" onClick={save} disabled={!validated}>
          SAVE LEVEL
        </button>
      </div>
    </div>
  );
}
