import { useState, useEffect } from 'react';
import EquationBoard from './EquationBoard';
import {
  moveTerm, combineTerms, multiplyBothSides, expandGroup, checkWin, narrate, equationStr,
} from '../utils/equations';
import { frac } from '../utils/fractions';

const MULTIPLY_PRESETS = ['2', '3', '4', '5', '6', '1/2', '1/3', '1/4', '2/3', '3/2', '3/4', '4/3', '-1'];

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
  const [history,  setHistory]  = useState([level.initial()]);
  const [step,     setStep]     = useState(0);
  const [narrates, setNarrates] = useState([equationStr(level.initial())]);
  const [selected, setSelected] = useState(null);   // { id, side }
  const [second,   setSecond]   = useState(null);   // second selected term for combine
  const [mulOpen,  setMulOpen]  = useState(false);
  const [mulInput, setMulInput] = useState('');
  const [mulError, setMulError] = useState('');
  const [flash,    setFlash]    = useState('');     // 'correct' | 'wrong'
  const [won,      setWon]      = useState(false);

  const state = history[step];

  // push a new state onto history
  function push(newState, op) {
    const next = history.slice(0, step + 1);
    setHistory([...next, newState]);
    setStep(step + 1);
    setNarrates(prev => [...prev.slice(0, step + 1), narrate(state, newState, op)]);
    setSelected(null);
    setSecond(null);

    // Show flash
    setFlash('correct');
    setTimeout(() => setFlash(''), 600);

    // Check win
    if (checkWin(newState)) {
      setTimeout(() => { setWon(true); onWin(step + 1); }, 700);
    }
  }

  function undo() {
    if (step === 0) return;
    setStep(step - 1);
    setSelected(null);
    setSecond(null);
    setMulOpen(false);
  }

  function handleSelect(id, side) {
    // Deselect if clicking the already-selected term
    if (selected?.id === id) {
      setSelected(null);
      setSecond(null);
      return;
    }

    // If no primary selected yet → select it as primary
    if (!selected) {
      setSelected({ id, side });
      setSecond(null);
      return;
    }

    // If same side → check for combine (must be like terms)
    if (side === selected.side) {
      const primary = [...state.left, ...state.right].find(t => t.id === selected.id);
      const target  = [...state.left, ...state.right].find(t => t.id === id);
      if (primary && target && primary.type !== 'group' && target.type !== 'group'
          && primary.isVar === target.isVar) {
        // Select as second for combine
        setSecond({ id, side });
      } else {
        // Switch primary selection
        setSelected({ id, side });
        setSecond(null);
      }
      return;
    }

    // Different side → switch primary
    setSelected({ id, side });
    setSecond(null);
  }

  function handleDoubleClick(id, side) {
    const term = [...state.left, ...state.right].find(t => t.id === id);
    if (term?.type === 'group') {
      push(expandGroup(state, id, side), { type: 'expand' });
    }
  }

  function doMove() {
    if (!selected) return;
    push(moveTerm(state, selected.id, selected.side), { type: 'move', fromSide: selected.side });
  }

  function doCombine() {
    if (!selected || !second) return;
    push(combineTerms(state, selected.id, second.id, selected.side), { type: 'combine', side: selected.side });
  }

  function doMultiply() {
    const f = parseFrac(mulInput);
    if (!f) { setMulError('Enter a valid number like 2, 1/3, -1'); return; }
    push(multiplyBothSides(state, f.num, f.den), { type: 'multiply', num: f.num, den: f.den });
    setMulOpen(false);
    setMulInput('');
    setMulError('');
  }

  // Keyboard shortcut: Enter to apply when multiply panel open
  useEffect(() => {
    const handler = e => { if (e.key === 'Enter' && mulOpen) doMultiply(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const selectedTerm = selected
    ? [...state.left, ...state.right].find(t => t.id === selected.id)
    : null;

  const canMove    = !!selected;
  const canCombine = !!selected && !!second;
  const canExpand  = selectedTerm?.type === 'group';

  const actionBar = selected ? (
    <div className="action-buttons">
      {canExpand ? (
        <button className="action-btn btn-expand" onClick={() => handleDoubleClick(selected.id, selected.side)}>
          EXPAND ( )
        </button>
      ) : (
        <button className="action-btn btn-move" onClick={doMove}>
          {selected.side === 'left' ? 'MOVE →' : '← MOVE'}
        </button>
      )}
      {canCombine && (
        <button className="action-btn btn-combine" onClick={doCombine}>
          COMBINE
        </button>
      )}
      <button className="action-btn btn-cancel" onClick={() => { setSelected(null); setSecond(null); }}>
        ✕
      </button>
    </div>
  ) : null;

  return (
    <div className={`game-screen ${flash}`}>
      {/* Header */}
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">{level.tierName}</span>
          <span className="level-num">LV {level.id}</span>
        </div>
        <button className="pixel-btn btn-undo" onClick={undo} disabled={step === 0}>UNDO</button>
      </div>

      {/* Hint */}
      <div className="hint-bar">💡 {level.hint}</div>

      {/* Equation board */}
      <EquationBoard
        state={state}
        selected={selected || second}
        onSelectTerm={handleSelect}
        onDoubleClick={handleDoubleClick}
        actionBar={actionBar}
      />

      {/* Multiply panel */}
      <div className="multiply-panel">
        {!mulOpen ? (
          <button className="pixel-btn btn-multiply" onClick={() => setMulOpen(true)}>
            × BOTH SIDES
          </button>
        ) : (
          <div className="mul-input-row">
            <span className="mul-label">Multiply by:</span>
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
              <button className="pixel-btn btn-cancel-mul" onClick={() => { setMulOpen(false); setMulError(''); }}>✕</button>
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
