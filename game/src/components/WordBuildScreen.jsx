import { useState } from 'react';
import SheepMascot from './SheepMascot';
import { frac } from '../utils/fractions';

// ─── Evaluation helpers ──────────────────────────────────────

function evalTerm(t, sol) {
  if (t.type === 'group') {
    const mul = t.mul.num / t.mul.den;
    const inner = t.inner.reduce((s, u) => s + evalTerm(u, sol), 0);
    return mul * inner;
  }
  const coef = t.num / t.den;
  if (t.varName === 'x') return coef * (sol.x ?? 0);
  if (t.varName === 'y') return coef * (sol.y ?? 0);
  return coef;
}

function evalSide(terms, sol) {
  return terms.reduce((s, t) => s + evalTerm(t, sol), 0);
}

// ─── Display helpers ─────────────────────────────────────────

function termLabel(t, index) {
  if (t.type === 'group') {
    const mulNeg = t.mul.num < 0;
    const sign   = index === 0 ? (mulNeg ? '−' : '') : (mulNeg ? ' − ' : ' + ');
    const absN   = Math.abs(t.mul.num);
    const mulStr = (absN === 1 && t.mul.den === 1)
      ? '' : (t.mul.den === 1 ? String(absN) : `${absN}/${t.mul.den}`);
    const inner  = t.inner.map((u, j) => termLabel(u, j)).join('');
    return `${sign}${mulStr}(${inner})`;
  }
  const neg  = t.num < 0;
  const sign = index === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ');
  const abs  = Math.abs(t.num);
  const coef = t.den === 1 ? String(abs) : `${abs}/${t.den}`;
  if (t.varName) return sign + (abs === 1 && t.den === 1 ? t.varName : `${coef}${t.varName}`);
  return sign + coef;
}

// ─── Parse pending input ─────────────────────────────────────

function parsePending(numStr, denStr, negative) {
  const n = Number(numStr || '1');
  const d = Number(denStr || '1');
  if (!numStr && !denStr) return frac(negative ? -1 : 1, 1);
  if (isNaN(n) || isNaN(d) || d === 0 || n === 0) return null;
  return frac(negative ? -n : n, d);
}

// ─── Builder hook ─────────────────────────────────────────────
// Each instance maintains its own independent builder state.

function useBuilderState() {
  const [left,       setLeft]       = useState([]);
  const [right,      setRight]      = useState([]);
  const [side,       setSide]       = useState('left');
  const [num,        setNum]        = useState('');
  const [den,        setDen]        = useState('');
  const [inDen,      setInDen]      = useState(false);
  const [neg,        setNeg]        = useState(false);
  const [inGroup,    setInGroup]    = useState(false);
  const [groupMul,   setGroupMul]   = useState(null);
  const [groupInner, setGroupInner] = useState([]);

  const resetInput = () => { setNum(''); setDen(''); setInDen(false); setNeg(false); };

  function addToActive(term) {
    if (inGroup) setGroupInner(p => [...p, term]);
    else if (side === 'left') setLeft(p => [...p, term]);
    else setRight(p => [...p, term]);
  }

  function commitConst() {
    if (num === '' && !inDen) return;
    const f = parsePending(num, inDen ? den : '', neg);
    if (!f) return;
    addToActive({ num: f.num, den: f.den, varName: null });
    resetInput();
  }

  function pressDigit(d) {
    if (inDen) { if (den.length < 3) setDen(p => p + d); }
    else       { if (num.length < 4) setNum(p => p + d); }
  }

  function pressSlash() { if (num !== '') setInDen(true); }

  function pressVar(v) {
    const f = parsePending(num, inDen ? den : '', neg);
    if (!f) return;
    addToActive({ num: f.num, den: f.den, varName: v });
    resetInput();
  }

  function pressPlus()  { commitConst(); setNeg(false); }
  function pressMinus() {
    if (num === '' && !inDen) { setNeg(true); return; }
    commitConst(); setNeg(true);
  }

  function pressOpenParen() {
    if (inGroup) return;
    const f = parsePending(num, inDen ? den : '', neg);
    setGroupMul(f ? { num: f.num, den: f.den } : { num: 1, den: 1 });
    setGroupInner([]);
    setInGroup(true);
    resetInput();
  }

  function pressCloseParen() {
    if (!inGroup) return;
    commitConst();
    setGroupInner(inner => {
      if (inner.length === 0) { setInGroup(false); setGroupMul(null); return []; }
      const group = { type: 'group', mul: groupMul, inner };
      if (side === 'left') setLeft(p => [...p, group]);
      else                 setRight(p => [...p, group]);
      setInGroup(false);
      setGroupMul(null);
      resetInput();
      return [];
    });
  }

  function pressEquals() {
    if (side === 'right' || inGroup) return;
    commitConst();
    setSide('right'); setNeg(false);
  }

  function pressBackspace() {
    if (inDen && den.length > 0)  { setDen(p => p.slice(0, -1)); return; }
    if (inDen)                     { setInDen(false); setDen(''); return; }
    if (num.length > 0)            { setNum(p => p.slice(0, -1)); return; }
    if (inGroup) {
      if (groupInner.length > 0) { setGroupInner(p => p.slice(0, -1)); return; }
      setInGroup(false); setGroupMul(null); return;
    }
    if (side === 'right' && right.length === 0) { setSide('left'); return; }
    if (side === 'left') setLeft(p => p.slice(0, -1));
    else                 setRight(p => p.slice(0, -1));
    setNeg(false);
  }

  // Removes the last committed term (ignores pending digit input)
  function pressDeleteTerm() {
    resetInput();
    if (inGroup) {
      if (groupInner.length > 0) { setGroupInner(p => p.slice(0, -1)); return; }
      setInGroup(false); setGroupMul(null); return;
    }
    if (side === 'right' && right.length === 0) { setSide('left'); return; }
    if (side === 'left') setLeft(p => p.slice(0, -1));
    else                 setRight(p => p.slice(0, -1));
    setNeg(false);
  }

  function pressClear() {
    setLeft([]); setRight([]); setSide('left');
    resetInput();
    setInGroup(false); setGroupMul(null); setGroupInner([]);
  }

  // Returns finalised sides (committing any pending constant)
  function getFinalisedSides() {
    let fl = [...left], fr = [...right];
    const pf = parsePending(num, inDen ? den : '', neg);
    if (pf && num !== '') {
      const t = { num: pf.num, den: pf.den, varName: null };
      if (side === 'left') fl = [...fl, t]; else fr = [...fr, t];
    }
    return { left: fl, right: fr };
  }

  const inputDisplay = () => {
    const sign = neg ? '−' : '+';
    const n = num || (inDen ? '?' : '');
    const fracStr = inDen ? `${n}/${den || '?'}` : n;
    return `${sign} ${fracStr}`;
  };

  function renderSide(terms, thisSide) {
    return (
      <div className={`builder-side ${side === thisSide ? 'side-active' : ''}`}>
        {terms.length === 0 && side !== thisSide && !inGroup && (
          <span className="side-empty">?</span>
        )}
        {terms.map((t, i) => (
          <span key={i} className={`btm ${t.type === 'group' ? 'btm-group' : t.varName ? 'btm-var' : 'btm-const'}`}>
            {termLabel(t, i)}
          </span>
        ))}
        {side === thisSide && (
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
  }

  return {
    left, right, side, num, inDen, neg, inGroup, groupMul, groupInner,
    pressDigit, pressSlash, pressVar, pressPlus, pressMinus,
    pressOpenParen, pressCloseParen, pressEquals, pressBackspace, pressDeleteTerm, pressClear,
    getFinalisedSides, renderSide,
    canEquals:     side === 'left' && !inGroup,
    canOpenParen:  !inGroup,
    canCloseParen: inGroup,
  };
}

// ─── Main component ───────────────────────────────────────────

export default function WordBuildScreen({ problem, onBuilt, onBack }) {
  const isSystem = problem.equationCount === 2;

  const [activeEq,   setActiveEq]   = useState(1);
  const [sheepMood,  setSheepMood]  = useState('thinking');
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  // Two independent builder instances (b2 only used for system problems)
  const b1 = useBuilderState();
  const b2 = useBuilderState();

  // Route all numpad interactions to the active builder
  const active = (isSystem && activeEq === 2) ? b2 : b1;

  // ── Validation and submission ────────────────────────────
  function check() {
    setError(''); setSuccess('');

    const s1 = b1.getFinalisedSides();
    if (!s1.left.length || !s1.right.length) {
      setError('Build the equation on both sides of =');
      return;
    }

    const sol = problem.solution;

    // Validate eq1 at known solution
    const lhs1 = evalSide(s1.left, sol);
    const rhs1 = evalSide(s1.right, sol);
    if (Math.abs(lhs1 - rhs1) > 0.001) {
      setSheepMood('thinking');
      setError("That equation doesn't fit the answer — check your equation and try again.");
      return;
    }

    // Constraining check: equation must NOT also hold at tweaked values
    const tw = { x: sol.x + 1, y: sol.y != null ? sol.y + 1 : 1 };
    const tl1 = evalSide(s1.left, tw);
    const tr1 = evalSide(s1.right, tw);
    if (Math.abs(tl1 - tr1) < 0.001) {
      setError('Equation is always true — make it more specific! (e.g. write x + 5 = 12, not 0 = 0)');
      return;
    }

    if (isSystem) {
      const s2 = b2.getFinalisedSides();
      if (!s2.left.length || !s2.right.length) {
        setError('Build equation 2 on both sides of = (use the EQ 2 tab)');
        return;
      }

      const lhs2 = evalSide(s2.left, sol);
      const rhs2 = evalSide(s2.right, sol);
      if (Math.abs(lhs2 - rhs2) > 0.001) {
        setError("Equation 2 doesn't fit the answer — check and try again.");
        return;
      }

      const tl2 = evalSide(s2.left, tw);
      const tr2 = evalSide(s2.right, tw);
      if (Math.abs(tl1 - tr1) < 0.001 && Math.abs(tl2 - tr2) < 0.001) {
        setError('Both equations are too general — at least one must constrain the unknowns.');
        return;
      }

      setSheepMood('win');
      setSuccess('Both equations are correct! Now solve the system...');
      setTimeout(() => onBuilt(s1, s2), 1400);
      return;
    }

    setSheepMood('win');
    setSuccess('Correct equation! Now solve it...');
    setTimeout(() => onBuilt(s1, null), 1400);
  }

  // ── Render ───────────────────────────────────────────────
  const eqLeft  = activeEq === 2 ? b2.left  : b1.left;
  const eqRight = activeEq === 2 ? b2.right : b1.right;

  return (
    <div className="equation-builder word-build-screen">

      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">WORD QUEST</span>
          <span className="level-num">W{problem.id - 100}</span>
        </div>
        <div style={{ width: 86 }} />
      </div>

      {/* Problem card */}
      <div className="word-problem-card">
        <div className="word-problem-text">{problem.problem}</div>
        <div className="word-problem-hint">💡 {problem.hint}</div>
      </div>

      {/* Equation-tabs for system problems */}
      {isSystem && (
        <div className="word-eq-tabs">
          <button
            className={`word-eq-tab ${activeEq === 1 ? 'active' : ''}`}
            onClick={() => setActiveEq(1)}
          >EQ 1</button>
          <button
            className={`word-eq-tab ${activeEq === 2 ? 'active' : ''}`}
            onClick={() => setActiveEq(2)}
          >EQ 2</button>
        </div>
      )}

      {/* Equation display */}
      <div className="builder-preview">
        {active.renderSide(eqLeft, 'left')}
        <div
          className={`builder-eq ${active.side === 'right' ? 'eq-done' : ''}`}
          onClick={active.canEquals ? active.pressEquals : undefined}
          style={{ cursor: active.canEquals ? 'pointer' : 'default', opacity: active.canEquals ? 1 : 0.4 }}
        >=</div>
        {active.renderSide(eqRight, 'right')}
      </div>

      {/* Summary strip for system — shows both equations at a glance */}
      {isSystem && (
        <div className="word-system-summary">
          <span style={{ opacity: activeEq === 1 ? 1 : 0.5 }}>
            EQ1: {b1.left.map((t,i)=>termLabel(t,i)).join('') || '?'} = {b1.right.map((t,i)=>termLabel(t,i)).join('') || '?'}
          </span>
          <span style={{ opacity: activeEq === 2 ? 1 : 0.5 }}>
            EQ2: {b2.left.map((t,i)=>termLabel(t,i)).join('') || '?'} = {b2.right.map((t,i)=>termLabel(t,i)).join('') || '?'}
          </span>
        </div>
      )}

      {/* Builder hint */}
      <div className="builder-hint">
        {active.inGroup
          ? 'Inside brackets — add terms, then press ) to close'
          : active.side === 'left'
            ? 'Type a number then press x (or y). Press = when left side is done.'
            : 'Build the right side. Press CHECK when done.'}
      </div>

      {/* Numpad */}
      <div className="builder-pad">
        <div className="pad-row">
          <button className="pad-btn" onClick={() => active.pressDigit('7')}>7</button>
          <button className="pad-btn" onClick={() => active.pressDigit('8')}>8</button>
          <button className="pad-btn" onClick={() => active.pressDigit('9')}>9</button>
          <button className="pad-btn pad-plus"  onClick={active.pressPlus}>+</button>
          <button className="pad-btn pad-minus" onClick={active.pressMinus}>−</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => active.pressDigit('4')}>4</button>
          <button className="pad-btn" onClick={() => active.pressDigit('5')}>5</button>
          <button className="pad-btn" onClick={() => active.pressDigit('6')}>6</button>
          <button className="pad-btn pad-frac"  onClick={active.pressSlash} disabled={active.num === ''}>/</button>
          <button className="pad-btn pad-back"  onClick={active.pressBackspace}>⌫</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => active.pressDigit('1')}>1</button>
          <button className="pad-btn" onClick={() => active.pressDigit('2')}>2</button>
          <button className="pad-btn" onClick={() => active.pressDigit('3')}>3</button>
          <button className="pad-btn pad-eq"    onClick={active.pressEquals}     disabled={!active.canEquals}>=</button>
          <button className="pad-btn pad-del"   onClick={active.pressDeleteTerm} title="Delete last term">DEL</button>
        </div>
        <div className="pad-row">
          <button className="pad-btn" onClick={() => active.pressDigit('0')}>0</button>
          <button className="pad-btn pad-paren" onClick={active.pressOpenParen}  disabled={!active.canOpenParen}>(</button>
          <button className="pad-btn pad-paren" onClick={active.pressCloseParen} disabled={!active.canCloseParen}>)</button>
          <button className="pad-btn pad-x"     onClick={() => active.pressVar('x')}>x</button>
          {isSystem
            ? <button className="pad-btn pad-y"   onClick={() => active.pressVar('y')}>y</button>
            : <button className="pad-btn pad-clr" onClick={active.pressClear} title="Clear all">CLR</button>
          }
        </div>
      </div>

      {error   && <div className="builder-status status-err">{error}</div>}
      {success && <div className="builder-status status-ok">✓ {success}</div>}

      <div className="builder-actions">
        <button className="pixel-btn btn-validate" onClick={check}>
          CHECK EQUATION{isSystem ? 'S' : ''}
        </button>
      </div>

      <SheepMascot mood={sheepMood} />
    </div>
  );
}
