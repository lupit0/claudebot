import { useState, useRef, useEffect, useCallback } from 'react';
import EquationBoard from './EquationBoard';
import {
  moveTerm, combineTerms, multiplyBothSides, expandGroup,
  checkWin, narrate, equationStr, suggestNextStep,
} from '../utils/equations';
import { frac, termMagLabel } from '../utils/fractions';
import { sounds } from '../utils/sounds';
import { randomEquation } from '../utils/random';
import SheepMascot from './SheepMascot';

const MULTIPLY_PRESETS = ['2','3','4','5','6','1/2','1/3','1/4','2/3','3/2','3/4','4/3','-1'];
const DIVIDE_PRESETS   = ['2','3','4','5','6','8','10'];
const DRAG_THRESHOLD   = 10; // px

function parseFrac(str) {
  str = str.trim();
  if (str.includes('/')) {
    const [n, d] = str.split('/').map(Number);
    if (isNaN(n) || isNaN(d) || d === 0) return null;
    return frac(n, d);
  }
  const n = Number(str);
  if (isNaN(n) || n === 0) return null;
  return frac(n);
}

export default function GameScreen({ level, onWin, onBack }) {
  const [history,  setHistory]  = useState(() => [level.initial()]);
  const [step,     setStep]     = useState(0);
  const [narrates, setNarrates] = useState(() => [equationStr(level.initial())]);
  const [selected, setSelected] = useState(null);
  const [second,   setSecond]   = useState(null);
  const [mulOpen,  setMulOpen]  = useState(false);
  const [mulInput, setMulInput] = useState('');
  const [mulError, setMulError] = useState('');
  const [divOpen,  setDivOpen]  = useState(false);
  const [divInput, setDivInput] = useState('');
  const [divError, setDivError] = useState('');
  const [flash,      setFlash]      = useState('');
  const [dropSide,   setDropSide]   = useState(null);
  const [sheepMood,  setSheepMood]  = useState('idle');
  const [hintMsg,    setHintMsg]    = useState('');

  const state = history[step];

  // ─── latestRef: always holds the current render's values.
  // Window event-listener closures read from here so they never
  // go stale between renders (avoids the combine bug).
  const latestRef = useRef({});
  latestRef.current = { state, step, history, narrates, selected, second };

  // DOM refs
  const equalsRef = useRef(null);
  const ghostRef  = useRef(null);
  const dragRef   = useRef(null);

  // ─── push a new equation state ────────────────────────
  // Called from React event handlers (buttons) — those always
  // see the latest render, so no stale-closure issue there.
  function push(newState, op) {
    const cur = latestRef.current;
    const nextHistory  = [...cur.history.slice(0, cur.step + 1), newState];
    const nextStep     = cur.step + 1;
    const nextNarrates = [...cur.narrates.slice(0, cur.step + 1), narrate(cur.state, newState, op)];
    setHistory(nextHistory);
    setStep(nextStep);
    setNarrates(nextNarrates);
    setSelected(null);
    setSecond(null);
    setFlash('correct');
    setSheepMood('happy');
    setTimeout(() => setSheepMood('idle'), 700);
    setTimeout(() => setFlash(''), 600);
    if (checkWin(newState)) {
      // Extract solution string: find "x = N" or "N = x"
      const sol = extractSolution(newState);
      setSheepMood('win');
      setTimeout(() => onWin(nextStep, sol), 700);
    }
  }

  // ─── show the solution string from a solved state ────────
  function extractSolution(s) {
    const all = [...s.left, ...s.right];
    const varTerm   = all.find(t => t.isVar);
    const constTerm = all.find(t => !t.isVar);
    if (!varTerm || !constTerm) return null;
    const val = constTerm.coeff;
    const valStr = val.den === 1 ? String(val.num) : `${val.num}/${val.den}`;
    return `x = ${valStr}`;
  }

  // ─── show me a step ───────────────────────────────────────
  function showStep() {
    const hint = suggestNextStep(state);
    if (!hint) return;
    setHintMsg(hint.description);
    setSheepMood('thinking');
    setTimeout(() => {
      let newState, opType;
      switch (hint.type) {
        case 'expand':
          newState = expandGroup(state, hint.termId, hint.side);
          opType   = { type: 'expand' };
          break;
        case 'combine':
          newState = combineTerms(state, hint.id1, hint.id2, hint.side);
          opType   = { type: 'combine', side: hint.side };
          break;
        case 'move':
          newState = moveTerm(state, hint.termId, hint.fromSide);
          opType   = { type: 'move', fromSide: hint.fromSide };
          break;
        case 'negate':
          newState = multiplyBothSides(state, -1, 1);
          opType   = { type: 'negate' };
          break;
        case 'multiply':
          newState = multiplyBothSides(state, hint.num, hint.den);
          opType   = { type: 'multiply', num: hint.num, den: hint.den };
          break;
        default: return;
      }
      sounds.expand();
      push(newState, opType);
      setTimeout(() => setHintMsg(''), 1800);
    }, 600); // short pause so the sheep "thinks" visibly
  }

  function undo() {
    if (step === 0) return;
    setStep(s => s - 1);
    setSelected(null);
    setSecond(null);
    setMulOpen(false);
  }

  // ─── drag: pointer down on a term tile ────────────────
  // Stable callback (no deps) — reads ALL live values via latestRef.
  const handleTermPointerDown = useCallback((e, term, side) => {
    if ((e.button !== 0 && e.pointerType === 'mouse') || !e.isPrimary) return;

    dragRef.current = {
      termId: term.id, side,
      coeff: term.coeff, isVar: term.isVar, type: term.type,
      startX: e.clientX, startY: e.clientY,
      isDragging: false,
    };

    // Pre-fill ghost
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.textContent = term.type === 'group'
        ? `(group)`
        : (term.coeff.num < 0 ? '− ' : '+ ') + termMagLabel(term.coeff, term.isVar);
      ghost.className = `drag-ghost ${(term.isVar || term.type === 'group') ? 'term-var' : 'term-const'}`;
    }

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = Math.abs(ev.clientX - dragRef.current.startX);
      const dy = Math.abs(ev.clientY - dragRef.current.startY);
      if (!dragRef.current.isDragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        dragRef.current.isDragging = true;
        if (ghost) ghost.style.display = 'flex';
      }
      if (dragRef.current.isDragging && ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top  = ev.clientY + 'px';
        const eqRect = equalsRef.current?.getBoundingClientRect();
        if (eqRect) {
          const cx = eqRect.left + eqRect.width / 2;
          setDropSide(
            dragRef.current.side === 'left'  ? (ev.clientX > cx ? 'right' : null) :
            dragRef.current.side === 'right' ? (ev.clientX < cx ? 'left'  : null) : null
          );
        }
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove',   onMove);
      window.removeEventListener('pointerup',     onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) ghost.style.display = 'none';
      setDropSide(null);

      const info = dragRef.current;
      if (!info) return;
      dragRef.current = null;

      // Read LATEST values — this is why latestRef exists
      const { state: cur, step: curStep, history: curHist, narrates: curNar,
              selected: curSel, second: curSec } = latestRef.current;

      if (info.isDragging) {
        // ── drag completed: check if term crossed the = sign ──
        const eqEl = equalsRef.current;
        if (!eqEl) return;
        const rect = eqEl.getBoundingClientRect();
        const cx   = rect.left + rect.width / 2;
        const crossed = (info.side === 'left'  && ev.clientX > cx) ||
                        (info.side === 'right' && ev.clientX < cx);
        if (!crossed) return;

        const newState     = moveTerm(cur, info.termId, info.side);
        const nextStep     = curStep + 1;
        const nextHistory  = [...curHist.slice(0, nextStep), newState];
        const nextNarrates = [...curNar.slice(0, nextStep),
          narrate(cur, newState, { type: 'move', fromSide: info.side })];
        setHistory(nextHistory);
        setStep(nextStep);
        setNarrates(nextNarrates);
        setSelected(null);
        setSecond(null);
        setFlash('correct');
        setTimeout(() => setFlash(''), 600);
        sounds.move();
        if (checkWin(newState)) setTimeout(() => onWin(nextStep), 700);

      } else {
        // ── tap: select / set-second / deselect ──────────────
        sounds.select();
        const { termId, side: tapSide } = info;

        if (curSel?.id === termId) {
          // Tap selected term again → deselect
          setSelected(null); setSecond(null); return;
        }
        if (!curSel) {
          // Nothing selected → select this term
          setSelected({ id: termId, side: tapSide }); setSecond(null); return;
        }
        if (tapSide === curSel.side) {
          // Same side → check if like terms for combine
          const all     = [...cur.left, ...cur.right];
          const primary = all.find(t => t.id === curSel.id);
          const target  = all.find(t => t.id === termId);
          if (primary && target &&
              primary.type !== 'group' && target.type !== 'group' &&
              primary.isVar === target.isVar) {
            // Like terms → mark as second for combine
            setSecond({ id: termId, side: tapSide }); return;
          }
        }
        // Otherwise switch primary selection
        setSelected({ id: termId, side: tapSide }); setSecond(null);
      }
    };

    window.addEventListener('pointermove',   onMove);
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onUp);
  }, []); // ← stable forever; all live values come from latestRef

  // ─── double-tap: expand a group ───────────────────────
  function handleDoubleClick(termId, side) {
    const term = [...state.left, ...state.right].find(t => t.id === termId);
    if (term?.type === 'group') {
      sounds.expand();
      push(expandGroup(state, termId, side), { type: 'expand' });
    }
  }

  // ─── combine two selected like terms ──────────────────
  function doCombine() {
    if (!selected || !second) return;
    sounds.combine();
    push(combineTerms(state, selected.id, second.id, selected.side),
         { type: 'combine', side: selected.side });
  }

  // ─── multiply both sides ──────────────────────────────
  function doMultiply() {
    const f = parseFrac(mulInput);
    if (!f) { setMulError('Enter a number like 2, 1/3, -1'); return; }
    sounds.multiply();
    push(multiplyBothSides(state, f.num, f.den),
         { type: 'multiply', num: f.num, den: f.den });
    setMulOpen(false); setMulInput(''); setMulError('');
  }

  // ─── divide both sides ────────────────────────────────
  // Dividing by n  =  multiplying by 1/n
  // Dividing by p/q  =  multiplying by q/p
  function doDivide() {
    const f = parseFrac(divInput);
    if (!f) { setDivError('Enter a number like 2 or 3'); return; }
    sounds.multiply();
    push(multiplyBothSides(state, f.den, f.num),   // invert: ÷(p/q) = ×(q/p)
         { type: 'divide', num: f.num, den: f.den });
    setDivOpen(false); setDivInput(''); setDivError('');
  }

  // ─── change sign (× −1 on both sides) ─────────────────
  function changeSign() {
    sounds.multiply();
    push(multiplyBothSides(state, -1, 1),
         { type: 'negate' });
  }

  // ─── recycle: fresh random equation ───────────────────
  function recycle() {
    const eq = randomEquation(level.tier);
    if (!eq) return;
    sounds.recycle();
    setHistory([eq]);
    setStep(0);
    setNarrates([equationStr(eq)]);
    setSelected(null); setSecond(null);
    setMulOpen(false); setDivOpen(false);
  }

  // close the other panel when one opens
  function openMul() { setMulOpen(true);  setDivOpen(false); }
  function openDiv() { setDivOpen(true);  setMulOpen(false); }

  useEffect(() => {
    const h = e => { if (e.key === 'Enter' && mulOpen) doMultiply(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ─── action bar ───────────────────────────────────────
  const selectedTerm = selected
    ? [...state.left, ...state.right].find(t => t.id === selected.id)
    : null;
  const canCombine = !!selected && !!second;
  const canExpand  = selectedTerm?.type === 'group';

  const actionBar = selected ? (
    <div className="action-buttons">
      {canExpand && (
        <button className="action-btn btn-expand"
          onClick={() => handleDoubleClick(selected.id, selected.side)}>
          EXPAND ( )
        </button>
      )}
      {canCombine && (
        <button className="action-btn btn-combine" onClick={doCombine}>
          COMBINE
        </button>
      )}
      {!canExpand && !canCombine && (
        <span className="drag-hint-bar">← drag past = to move →</span>
      )}
      <button className="action-btn btn-cancel"
        onClick={() => { setSelected(null); setSecond(null); }}>
        ✕
      </button>
    </div>
  ) : null;

  return (
    <div className={`game-screen ${flash}`}>
      {/* Drag ghost — DOM-only, never touched by React during drag */}
      <div ref={ghostRef} className="drag-ghost" style={{ display: 'none' }} aria-hidden />

      {/* Header */}
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">{level.tierName}</span>
          <span className="level-num">LV {level.id}</span>
        </div>
        <div className="header-right">
          <button className="pixel-btn btn-hint" onClick={showStep} title="Show me the next step">💡</button>
          <button className="pixel-btn btn-recycle" onClick={recycle} title="New random equation">↺</button>
          <button className="pixel-btn btn-undo" onClick={undo} disabled={step === 0}>UNDO</button>
        </div>
      </div>

      {/* Hint bar — shows static level hint, or auto-hint message */}
      <div className="hint-bar">
        {hintMsg ? <span className="hint-active">🐑 {hintMsg}</span> : <>💡 {level.hint}</>}
      </div>

      {/* Flying sheep mascot */}
      <SheepMascot mood={sheepMood} />

      {/* Equation board */}
      <EquationBoard
        state={state}
        selected={selected}
        second={second}
        onPointerDown={handleTermPointerDown}
        onDoubleClick={handleDoubleClick}
        equalsRef={equalsRef}
        dropSide={dropSide}
        actionBar={actionBar}
      />

      {/* Operation buttons */}
      <div className="ops-toolbar">
        <button className={`pixel-btn btn-multiply ${mulOpen ? 'active' : ''}`} onClick={openMul}>
          × BOTH SIDES
        </button>
        <button className={`pixel-btn btn-divide ${divOpen ? 'active' : ''}`} onClick={openDiv}>
          ÷ BOTH SIDES
        </button>
        <button className="pixel-btn btn-sign" onClick={changeSign}>
          ± SIGN
        </button>
      </div>

      {/* Multiply panel */}
      {mulOpen && (
        <div className="mul-input-row">
          <span className="mul-label">Multiply both sides by:</span>
          <div className="mul-presets">
            {MULTIPLY_PRESETS.map(p => (
              <button key={p} className="preset-btn" onClick={() => setMulInput(p)}>{p}</button>
            ))}
          </div>
          <div className="mul-entry">
            <input
              className="mul-input"
              type="text"
              value={mulInput}
              onChange={e => { setMulInput(e.target.value); setMulError(''); }}
              placeholder="e.g. 2 or 1/3"
              autoFocus
            />
            <button className="pixel-btn btn-go" onClick={doMultiply}>GO!</button>
            <button className="pixel-btn btn-cancel-mul"
              onClick={() => { setMulOpen(false); setMulError(''); }}>✕</button>
          </div>
          {mulError && <div className="mul-error">{mulError}</div>}
        </div>
      )}

      {/* Divide panel */}
      {divOpen && (
        <div className="mul-input-row div-panel">
          <span className="mul-label">Divide both sides by:</span>
          <div className="mul-presets">
            {DIVIDE_PRESETS.map(p => (
              <button key={p} className="preset-btn" onClick={() => setDivInput(p)}>{p}</button>
            ))}
          </div>
          <div className="mul-entry">
            <input
              className="mul-input"
              type="text"
              value={divInput}
              onChange={e => { setDivInput(e.target.value); setDivError(''); }}
              placeholder="e.g. 3 or 4"
              autoFocus
            />
            <button className="pixel-btn btn-go" onClick={doDivide}>GO!</button>
            <button className="pixel-btn btn-cancel-mul"
              onClick={() => { setDivOpen(false); setDivError(''); }}>✕</button>
          </div>
          {divError && <div className="mul-error">{divError}</div>}
        </div>
      )}

      {/* Step history */}
      <div className="step-history">
        <div className="history-title">STEPS</div>
        <div className="history-list">
          {narrates.slice(0, step + 1).map((n, i) => (
            <div key={i} className={`history-row ${i === step ? 'current' : ''}`}>
              <span className="history-eq">{equationStr(history[i])}</span>
              {i > 0 && <span className="history-narrate">— {narrates[i]}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
