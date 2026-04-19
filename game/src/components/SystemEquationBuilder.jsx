import { useState } from 'react';
import { frac } from '../utils/fractions';
import { makeTermS, makeGroupS, eqStrS } from '../utils/systemEquations';

// ─── helpers ──────────────────────────────────────────────────
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
    const inner = t.inner.map((u, j) => termLabel(u, j)).join('');
    return `${sign}${mulStr}(${inner})`;
  }
  const neg  = t.num < 0;
  const sign = index === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ');
  const abs  = Math.abs(t.num);
  const coef = t.den === 1 ? String(abs) : `${abs}/${t.den}`;
  if (t.varName) return sign + (abs === 1 && t.den === 1 ? t.varName : `${coef}${t.varName}`);
  return sign + coef;
}

function buildEqState(left, right) {
  const toTerm = t => {
    if (t.type === 'group') {
      return makeGroupS(t.mul.num, t.mul.den,
        t.inner.map(u => makeTermS(u.num, u.den, u.varName)));
    }
    return makeTermS(t.num, t.den, t.varName);
  };
  return { left: left.map(toTerm), right: right.map(toTerm) };
}

// ─── component ────────────────────────────────────────────────
export default function SystemEquationBuilder({ onSave, onBack }) {
  // Active equation being built
  const [activeEq, setActiveEq] = useState('eq1'); // 'eq1' | 'eq2'

  // Each equation has its own left/right raw term arrays
  const [eq1Left,  setEq1Left]  = useState([]);
  const [eq1Right, setEq1Right] = useState([]);
  const [eq2Left,  setEq2Left]  = useState([]);
  const [eq2Right, setEq2Right] = useState([]);

  // Per-equation build state
  const [side,  setSide]  = useState('left'); // 'left' | 'right' (for active eq)
  const [num,   setNum]   = useState('');
  const [den,   setDen]   = useState('');
  const [inDen, setInDen] = useState(false);
  const [neg,   setNeg]   = useState(false);
  const [inGroup,    setInGroup]    = useState(false);
  const [groupMul,   setGroupMul]   = useState(null);
  const [groupInner, setGroupInner] = useState([]);

  const [status,    setStatus]    = useState({ msg: '', ok: false });
  const [validated, setValidated] = useState(false);
  const [savedData, setSavedData] = useState(null);

  // Helpers to get/set current active eq's left/right
  const getLeft  = () => activeEq === 'eq1' ? eq1Left  : eq2Left;
  const getRight = () => activeEq === 'eq1' ? eq1Right : eq2Right;
  const setLeft  = fn => activeEq === 'eq1' ? setEq1Left(fn)  : setEq2Left(fn);
  const setRight = fn => activeEq === 'eq1' ? setEq1Right(fn) : setEq2Right(fn);

  const clearStatus = () => { setStatus({ msg: '', ok: false }); setValidated(false); };
  const resetInput  = () => { setNum(''); setDen(''); setInDen(false); setNeg(false); };

  const inputDisplay = () => {
    const sign = neg ? '−' : '+';
    const n = num || (inDen ? '?' : '');
    const fracStr = inDen ? `${n}/${den || '?'}` : n;
    return `${sign} ${fracStr}`;
  };

  function addToActive(term) {
    if (inGroup) {
      setGroupInner(p => [...p, term]);
    } else if (side === 'left') {
      setLeft(p => [...p, term]);
    } else {
      setRight(p => [...p, term]);
    }
  }

  function commitTerm(varName) {
    const f = parsePending(num, inDen ? den : '', neg);
    if (!f) { setStatus({ msg: 'Invalid number', ok: false }); return false; }
    addToActive({ num: f.num, den: f.den, varName: varName || null });
    resetInput();
    clearStatus();
    return true;
  }

  function commitConst() {
    if (num === '' && !inDen) return;
    commitTerm(null);
  }

  // ── button handlers ──────────────────────────────────────────
  function pressDigit(d) {
    clearStatus();
    if (inDen) { if (den.length < 3) setDen(p => p + d); }
    else        { if (num.length < 4) setNum(p => p + d); }
  }

  function pressSlash() {
    if (num === '') return;
    setInDen(true); clearStatus();
  }

  function pressX() { commitTerm('x'); }
  function pressY() { commitTerm('y'); }

  function pressPlus() {
    commitConst(); setNeg(false); clearStatus();
  }

  function pressMinus() {
    if (num === '' && !inDen) { setNeg(true); clearStatus(); return; }
    commitConst(); setNeg(true); clearStatus();
  }

  function pressOpenParen() {
    if (inGroup) return;
    const f = parsePending(num, inDen ? den : '', neg) || frac(1, 1);
    setGroupMul({ num: f.num, den: f.den });
    setGroupInner([]);
    setInGroup(true);
    resetInput();
    clearStatus();
  }

  function pressCloseParen() {
    if (!inGroup) return;
    commitConst();
    setGroupInner(inner => {
      if (inner.length === 0) {
        setInGroup(false);
        setGroupMul(null);
        return [];
      }
      const group = { type: 'group', mul: groupMul, inner };
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
    if (inGroup) {
      if (groupInner.length > 0) { setGroupInner(p => p.slice(0,-1)); return; }
      setInGroup(false); setGroupMul(null); return;
    }
    if (side === 'right' && getRight().length === 0) { setSide('left'); return; }
    if (side === 'left') setLeft(p  => p.slice(0,-1));
    else                 setRight(p => p.slice(0,-1));
    setNeg(false);
  }

  function pressClear() {
    setLeft(() => []); setRight(() => []); setSide('left');
    resetInput();
    setInGroup(false); setGroupMul(null); setGroupInner([]);
    clearStatus();
  }

  // Switch active equation
  function switchEq(key) {
    if (key === activeEq) return;
    // Commit any pending input first
    commitConst();
    setSide('left');
    resetInput();
    setInGroup(false); setGroupMul(null); setGroupInner([]);
    setActiveEq(key);
    clearStatus();
  }

  // ── validate ─────────────────────────────────────────────────
  function validate() {
    if (inGroup) { setStatus({ msg: 'Close the bracket with ) first', ok: false }); return; }

    // Finalise any pending input
    let fl1 = [...eq1Left], fr1 = [...eq1Right];
    let fl2 = [...eq2Left], fr2 = [...eq2Right];

    // Absorb pending input into active eq
    const pf = parsePending(num, inDen ? den : '', neg);
    if (pf && num !== '') {
      const t = { num: pf.num, den: pf.den, varName: null };
      if (activeEq === 'eq1') {
        if (side === 'left') fl1 = [...fl1, t]; else fr1 = [...fr1, t];
      } else {
        if (side === 'left') fl2 = [...fl2, t]; else fr2 = [...fr2, t];
      }
    }

    if (fl1.length === 0) { setStatus({ msg: 'Add terms to Eq 1 left side', ok: false }); return; }
    if (fr1.length === 0) { setStatus({ msg: 'Add terms to Eq 1 right side', ok: false }); return; }
    if (fl2.length === 0) { setStatus({ msg: 'Add terms to Eq 2 left side', ok: false }); return; }
    if (fr2.length === 0) { setStatus({ msg: 'Add terms to Eq 2 right side', ok: false }); return; }

    const allFlat = t => t.type === 'group' ? t.inner : [t];
    const hasVar1 = [...fl1, ...fr1].flatMap(allFlat).some(t => t.varName === 'x' || t.varName === 'y');
    const hasVar2 = [...fl2, ...fr2].flatMap(allFlat).some(t => t.varName === 'x' || t.varName === 'y');
    if (!hasVar1) { setStatus({ msg: 'Eq 1 needs at least one x or y term', ok: false }); return; }
    if (!hasVar2) { setStatus({ msg: 'Eq 2 needs at least one x or y term', ok: false }); return; }

    // Check equations have different variables or at least x and y between them
    const allVars = new Set(
      [...fl1, ...fr1, ...fl2, ...fr2].flatMap(allFlat).map(t => t.varName).filter(Boolean)
    );
    if (!allVars.has('x') || !allVars.has('y')) {
      setStatus({ msg: 'System needs both x and y variables', ok: false }); return;
    }

    const eq1State = buildEqState(fl1, fr1);
    const eq2State = buildEqState(fl2, fr2);
    const title1 = eqStrS(eq1State);
    const title2 = eqStrS(eq2State);

    setStatus({ msg: `System validated! ${title1}  |  ${title2}`, ok: true });
    setValidated(true);
    setSavedData({ fl1, fr1, fl2, fr2, title: `${title1} | ${title2}` });
    setEq1Left(fl1); setEq1Right(fr1);
    setEq2Left(fl2); setEq2Right(fr2);
    setNum(''); setDen(''); setInDen(false);
  }

  function save() {
    if (!validated || !savedData) return;
    const { fl1, fr1, fl2, fr2, title } = savedData;
    onSave({
      eq1: { left: fl1, right: fr1 },
      eq2: { left: fl2, right: fr2 },
      title,
      optimalSteps: 8,
    });
  }

  // ── render ───────────────────────────────────────────────────
  const renderSide = (terms, thisSide, eqKey) => {
    const isActive = activeEq === eqKey && side === thisSide;
    return (
      <div className={`builder-side ${isActive ? 'side-active' : ''}`}>
        {terms.length === 0 && !isActive && !inGroup && (
          <span className="side-empty">?</span>
        )}
        {terms.map((t, i) => (
          <span key={i} className={`btm ${t.type === 'group' ? 'btm-group' : t.varName ? 'btm-var' : 'btm-const'}`}>
            {termLabel(t, i)}
          </span>
        ))}
        {isActive && (
          inGroup ? (
            <span className="btm btm-group">
              {groupMul && (Math.abs(groupMul.num) !== 1 || groupMul.den !== 1)
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
  };

  const canOpenParen  = !inGroup;
  const canCloseParen = inGroup;
  const canEquals     = side === 'left' && !inGroup;

  return (
    <div className="equation-builder system-equation-builder">
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="builder-title">MAKE A SYSTEM</div>
        <div />
      </div>

      {/* Eq toggle buttons */}
      <div className="system-eq-toggle">
        <button
          className={`pixel-btn ${activeEq === 'eq1' ? 'btn-eq-active' : 'btn-eq-inactive'}`}
          onClick={() => switchEq('eq1')}
        >
          EQ 1
        </button>
        <button
          className={`pixel-btn ${activeEq === 'eq2' ? 'btn-eq-active' : 'btn-eq-inactive'}`}
          onClick={() => switchEq('eq2')}
        >
          EQ 2
        </button>
      </div>

      {/* Equation previews */}
      <div className={`builder-preview ${activeEq === 'eq1' ? 'preview-active' : ''}`}>
        <div className="eq-label-small">EQ 1</div>
        {renderSide(eq1Left, 'left', 'eq1')}
        <div
          className={`builder-eq ${activeEq === 'eq1' && side === 'right' ? 'eq-done' : ''}`}
          onClick={activeEq === 'eq1' && canEquals ? pressEquals : undefined}
          style={{ cursor: activeEq === 'eq1' && canEquals ? 'pointer' : 'default' }}
        >=</div>
        {renderSide(eq1Right, 'right', 'eq1')}
      </div>

      <div className={`builder-preview ${activeEq === 'eq2' ? 'preview-active' : ''}`}>
        <div className="eq-label-small">EQ 2</div>
        {renderSide(eq2Left, 'left', 'eq2')}
        <div
          className={`builder-eq ${activeEq === 'eq2' && side === 'right' ? 'eq-done' : ''}`}
          onClick={activeEq === 'eq2' && canEquals ? pressEquals : undefined}
          style={{ cursor: activeEq === 'eq2' && canEquals ? 'pointer' : 'default' }}
        >=</div>
        {renderSide(eq2Right, 'right', 'eq2')}
      </div>

      <div className="builder-hint">
        {inGroup
          ? 'Inside brackets — add terms, then press ) to close'
          : side === 'left'
            ? 'Press x or y for variables, = to move to right side'
            : `Building right side of Eq ${activeEq === 'eq1' ? 1 : 2}. Press VALIDATE when done.`}
      </div>

      {/* Numpad */}
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
          <button className="pad-btn pad-y" onClick={pressY}>y</button>
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
          SAVE SYSTEM
        </button>
      </div>
    </div>
  );
}
