import { useState, useEffect, useRef, useCallback } from 'react';
import EquationBoard from './EquationBoard';
import {
  moveTerm, combineTerms, multiplyBothSides, expandGroup,
  checkWin, narrate, equationStr,
} from '../utils/equations';
import { frac, termMagLabel } from '../utils/fractions';
import { sounds } from '../utils/sounds';
import { randomEquation } from '../utils/random';

const MULTIPLY_PRESETS = ['2','3','4','5','6','1/2','1/3','1/4','2/3','3/2','3/4','4/3','-1'];
const DRAG_THRESHOLD   = 10; // px before a touch/mouse is considered a drag

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
  const initialState = useCallback(() => level.initial(), [level]);

  const [history,  setHistory]  = useState(() => [initialState()]);
  const [step,     setStep]     = useState(0);
  const [narrates, setNarrates] = useState(() => [equationStr(initialState())]);
  const [selected, setSelected] = useState(null);   // { id, side }
  const [second,   setSecond]   = useState(null);   // second term for combine
  const [mulOpen,  setMulOpen]  = useState(false);
  const [mulInput, setMulInput] = useState('');
  const [mulError, setMulError] = useState('');
  const [flash,    setFlash]    = useState('');
  const [dropSide, setDropSide] = useState(null);   // drag feedback

  // Refs for drag (avoids stale closures & re-renders during drag)
  const equalsRef  = useRef(null);
  const ghostRef   = useRef(null);
  const dragRef    = useRef(null);  // { termId, side, coeff, isVar, startX, startY, isDragging }

  const state = history[step];

  // ── push a new equation state ──────────────────────────
  function push(newState, op) {
    setHistory(h => [...h.slice(0, step + 1), newState]);
    setStep(s => s + 1);
    setNarrates(n => [...n.slice(0, step + 1), narrate(state, newState, op)]);
    setSelected(null);
    setSecond(null);
    setFlash('correct');
    setTimeout(() => setFlash(''), 600);
    if (checkWin(newState)) {
      setTimeout(() => onWin(step + 1), 700);
    }
  }

  function undo() {
    if (step === 0) return;
    setStep(s => s - 1);
    setSelected(null);
    setSecond(null);
    setMulOpen(false);
  }

  // ── tap/select logic (called when there was no real drag) ──
  function handleTap(termId, side) {
    sounds.select();

    if (selected?.id === termId) {
      setSelected(null); setSecond(null); return;
    }
    if (!selected) {
      setSelected({ id: termId, side }); setSecond(null); return;
    }
    if (side === selected.side) {
      const all = [...state.left, ...state.right];
      const primary = all.find(t => t.id === selected.id);
      const target  = all.find(t => t.id === termId);
      if (primary && target && primary.type !== 'group' && target.type !== 'group'
          && primary.isVar === target.isVar) {
        setSecond({ id: termId, side }); return;
      }
    }
    setSelected({ id: termId, side }); setSecond(null);
  }

  // ── double-tap: expand a group ─────────────────────────
  function handleDoubleClick(termId, side) {
    const term = [...state.left, ...state.right].find(t => t.id === termId);
    if (term?.type === 'group') {
      sounds.expand();
      push(expandGroup(state, termId, side), { type: 'expand' });
    }
  }

  // ── drag: pointer down on a term tile ─────────────────
  // We capture the handlers in closures here so they always see
  // the latest `state`, `push`, etc. without stale issues.
  // Ghost element is manipulated via DOM to avoid React re-renders during drag.
  const handleTermPointerDown = useCallback((e, term, side) => {
    // Ignore right-click / multi-touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!e.isPrimary) return;

    dragRef.current = {
      termId: term.id,
      side,
      coeff: term.coeff,
      isVar: term.isVar,
      type: term.type,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };

    // Pre-fill ghost label
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.textContent = (term.type === 'group')
        ? `(${term.inner?.length ?? '?'} terms)`
        : (term.coeff.num < 0 ? '− ' : '+ ') + termMagLabel(term.coeff, term.isVar);
      ghost.className = `drag-ghost ${term.isVar || term.type === 'group' ? 'term-var' : 'term-const'}`;
    }

    const onMove = (ev) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      if (!dragRef.current.isDragging && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragRef.current.isDragging = true;
        if (ghost) ghost.style.display = 'flex';
      }
      if (dragRef.current.isDragging && ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top  = ev.clientY + 'px';

        // Compute which side the ghost is hovering over
        const eqRect = equalsRef.current?.getBoundingClientRect();
        if (eqRect) {
          const cx = eqRect.left + eqRect.width / 2;
          if (dragRef.current.side === 'left')  setDropSide(ev.clientX > cx ? 'right' : null);
          if (dragRef.current.side === 'right') setDropSide(ev.clientX < cx ? 'left'  : null);
        }
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) ghost.style.display = 'none';
      setDropSide(null);

      const info = dragRef.current;
      if (!info) return;
      dragRef.current = null;

      if (info.isDragging) {
        const eqEl = equalsRef.current;
        if (eqEl) {
          const rect = eqEl.getBoundingClientRect();
          const cx   = rect.left + rect.width / 2;
          const crossed =
            (info.side === 'left'  && ev.clientX > cx) ||
            (info.side === 'right' && ev.clientX < cx);
          if (crossed) {
            // Use the current state snapshot captured at pointer-down time.
            // Because no React re-renders happen during drag (ghost is DOM-only),
            // `state` here is the same render's value — always fresh.
            const newState = moveTerm(state, info.termId, info.side);
            push(newState, { type: 'move', fromSide: info.side });
            sounds.move();
          }
        }
      } else {
        // Tap — delegate to select logic
        handleTap(info.termId, info.side);
      }
    };

    window.addEventListener('pointermove',  onMove);
    window.addEventListener('pointerup',    onUp);
    window.addEventListener('pointercancel', onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, step]); // re-create when state or step changes so closures are fresh

  // ── combine ───────────────────────────────────────────
  function doCombine() {
    if (!selected || !second) return;
    sounds.combine();
    push(combineTerms(state, selected.id, second.id, selected.side), { type: 'combine', side: selected.side });
  }

  // ── multiply both sides ───────────────────────────────
  function doMultiply() {
    const f = parseFrac(mulInput);
    if (!f) { setMulError('Enter a number like 2, 1/3, -1'); return; }
    sounds.multiply();
    push(multiplyBothSides(state, f.num, f.den), { type: 'multiply', num: f.num, den: f.den });
    setMulOpen(false); setMulInput(''); setMulError('');
  }

  // ── recycle: generate a fresh random equation ─────────
  function recycle() {
    const eq = randomEquation(level.tier);
    if (!eq) return;
    sounds.recycle();
    setHistory([eq]);
    setStep(0);
    setNarrates([equationStr(eq)]);
    setSelected(null); setSecond(null); setMulOpen(false);
  }

  useEffect(() => {
    const h = e => { if (e.key === 'Enter' && mulOpen) doMultiply(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // ── action bar ────────────────────────────────────────
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
        <div className="drag-hint-bar">← drag past = to move →</div>
      )}
      <button className="action-btn btn-cancel"
        onClick={() => { setSelected(null); setSecond(null); }}>
        ✕
      </button>
    </div>
  ) : null;

  return (
    <div className={`game-screen ${flash}`}>
      {/* Drag ghost (DOM-only, never re-rendered by React during drag) */}
      <div ref={ghostRef} className="drag-ghost" style={{ display: 'none' }} aria-hidden />

      {/* Header */}
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">{level.tierName}</span>
          <span className="level-num">LV {level.id}</span>
        </div>
        <div className="header-right">
          <button className="pixel-btn btn-recycle" onClick={recycle} title="New random equation">
            ↺
          </button>
          <button className="pixel-btn btn-undo" onClick={undo} disabled={step === 0}>
            UNDO
          </button>
        </div>
      </div>

      {/* Hint */}
      <div className="hint-bar">💡 {level.hint}</div>

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

      {/* Multiply both sides */}
      <div className="multiply-panel">
        {!mulOpen ? (
          <button className="pixel-btn btn-multiply" onClick={() => setMulOpen(true)}>
            × BOTH SIDES
          </button>
        ) : (
          <div className="mul-input-row">
            <span className="mul-label">Multiply both sides by:</span>
            <div className="mul-presets">
              {MULTIPLY_PRESETS.map(p => (
                <button key={p} className="preset-btn"
                  onClick={() => setMulInput(p)}>{p}</button>
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
      </div>

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
