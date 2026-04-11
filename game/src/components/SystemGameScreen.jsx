import { useState, useRef, useCallback } from 'react';
import EquationBoard from './EquationBoard';
import SheepMascot from './SheepMascot';
import {
  moveTermS, combineTermsS, multiplyEqS, expandGroupS,
  detectIsolated, substituteById,
  checkSystemWin, extractSystemSolution, systemStr, suggestSystemHint,
} from '../utils/systemEquations';
import { frac } from '../utils/fractions';

const MULTIPLY_PRESETS = ['2','3','4','5','6','1/2','1/3','1/4','2/3','3/2','3/4','4/3','-1'];
const DIVIDE_PRESETS   = ['2','3','4','5','6','8','10'];

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

export default function SystemGameScreen({ level, onWin, onBack }) {
  const [eq1, setEq1] = useState(() => level.initial().eq1);
  const [eq2, setEq2] = useState(() => level.initial().eq2);
  const [activeEq, setActiveEq] = useState('eq1');
  // selected: { termId, eqKey:'eq1'|'eq2', side }
  const [selected, setSelected] = useState(null);
  // second: { termId, eqKey, side } — for combine
  const [second, setSecond] = useState(null);
  const [history, setHistory] = useState([]);  // [{eq1, eq2}]
  const [steps, setSteps] = useState(0);
  const [hintMsg, setHintMsg] = useState('');
  const [sheepMood, setSheepMood] = useState('idle');
  const [flash, setFlash] = useState('');
  const [mulOpen, setMulOpen] = useState(false);
  const [mulInput, setMulInput] = useState('');
  const [mulError, setMulError] = useState('');
  const [divOpen, setDivOpen] = useState(false);
  const [divInput, setDivInput] = useState('');
  const [divError, setDivError] = useState('');

  // Store initial eq strings for win callback
  const initialEq1Ref = useRef(eq1);
  const initialEq2Ref = useRef(eq2);

  // Latest refs for callbacks
  const latestRef = useRef({});
  latestRef.current = { eq1, eq2, activeEq, selected, second, steps, history };

  function pushState(newEq1, newEq2) {
    const cur = latestRef.current;
    setHistory(h => [...h, { eq1: cur.eq1, eq2: cur.eq2 }]);
    setSteps(s => s + 1);
    setEq1(newEq1);
    setEq2(newEq2);
    setSelected(null);
    setSecond(null);
    setFlash('correct');
    setSheepMood('happy');
    setTimeout(() => setSheepMood('idle'), 700);
    setTimeout(() => setFlash(''), 600);

    // Check win
    if (checkSystemWin(newEq1, newEq2)) {
      const sol = extractSystemSolution(newEq1, newEq2);
      const startStr = systemStr(initialEq1Ref.current, initialEq2Ref.current);
      setSheepMood('win');
      setTimeout(() => {
        onWin(cur.steps + 1, sol.str, startStr, level.optimalSteps);
      }, 700);
    }
  }

  function undo() {
    const cur = latestRef.current;
    if (cur.history.length === 0) return;
    const prev = cur.history[cur.history.length - 1];
    setHistory(h => h.slice(0, -1));
    setEq1(prev.eq1);
    setEq2(prev.eq2);
    setSelected(null);
    setSecond(null);
    setSteps(s => Math.max(0, s - 1));
  }

  // ── Term tap handler ──────────────────────────────────────────
  const handleTermClick = useCallback((e, term, side, eqKey) => {
    const cur = latestRef.current;
    const { selected: curSel, second: curSec, eq1: cEq1, eq2: cEq2 } = cur;

    setActiveEq(eqKey);

    const termId = term.id;

    // Tapping the same term again → deselect
    if (curSel?.termId === termId) {
      setSelected(null);
      setSecond(null);
      return;
    }

    if (!curSel) {
      // Nothing selected — select this term
      setSelected({ termId, eqKey, side });
      setSecond(null);
      return;
    }

    // Something already selected
    if (curSel.eqKey === eqKey && curSel.side === side) {
      // Same equation, same side — check for combine (like terms)
      const eq = eqKey === 'eq1' ? cEq1 : cEq2;
      const allTerms = [...eq.left, ...eq.right];
      const primary = allTerms.find(t => t.id === curSel.termId);
      const target  = allTerms.find(t => t.id === termId);
      if (primary && target &&
          primary.type !== 'group' && target.type !== 'group' &&
          primary.varName === target.varName) {
        // Like terms → mark as second
        setSecond({ termId, eqKey, side });
        return;
      }
    }

    // Otherwise switch primary selection
    setSelected({ termId, eqKey, side });
    setSecond(null);
  }, []);

  // ── Double-click to expand group ──────────────────────────────
  function handleDoubleClick(termId, side, eqKey) {
    const cur = latestRef.current;
    const eq = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const term = [...eq.left, ...eq.right].find(t => t.id === termId);
    if (term?.type === 'group') {
      const newEq = expandGroupS(eq, termId, side);
      const [newEq1, newEq2] = eqKey === 'eq1'
        ? [newEq, cur.eq2]
        : [cur.eq1, newEq];
      pushState(newEq1, newEq2);
    }
  }

  // ── Determine substitution availability ──────────────────────
  // Which terms in each equation can be substituted?
  const iso1 = detectIsolated(eq1);
  const iso2 = detectIsolated(eq2);

  // Compute subst-ready term ids for eq1 (terms whose varName matches what's isolated in eq2)
  const substReadyEq1 = new Set();
  const substReadyEq2 = new Set();
  if (iso2) {
    const isoVarName = iso2.varName;
    [...eq1.left, ...eq1.right].forEach(t => {
      if (t.varName === isoVarName && t.type !== 'group') {
        substReadyEq1.add(t.id);
      }
    });
  }
  if (iso1) {
    const isoVarName = iso1.varName;
    [...eq2.left, ...eq2.right].forEach(t => {
      if (t.varName === isoVarName && t.type !== 'group') {
        substReadyEq2.add(t.id);
      }
    });
  }

  // ── Action bar logic ──────────────────────────────────────────
  const getSelectedTerm = () => {
    if (!selected) return null;
    const cur = latestRef.current;
    const eq = selected.eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    return [...eq.left, ...eq.right].find(t => t.id === selected.termId) || null;
  };

  const selectedTerm = getSelectedTerm();

  // Can substitute? The selected term's varName is isolated in the OTHER equation
  const canSubstitute = (() => {
    if (!selected || !selectedTerm || selectedTerm.type === 'group') return false;
    const iso = selected.eqKey === 'eq1' ? iso2 : iso1;
    return !!(iso && iso.varName === selectedTerm.varName);
  })();

  const canCombine = !!(selected && second && selected.eqKey === second.eqKey);
  const canExpand  = selectedTerm?.type === 'group';
  const canMove    = !!(selected && selectedTerm && !canExpand);

  // ── Action handlers ───────────────────────────────────────────
  function doSubstitute() {
    if (!canSubstitute || !selectedTerm || !selected) return;
    const cur = latestRef.current;
    const iso = selected.eqKey === 'eq1' ? iso2 : iso1;
    if (!iso) return;
    const eq = selected.eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = substituteById(eq, selected.termId, iso.exprTerms, iso.negated);
    const [newEq1, newEq2] = selected.eqKey === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doCombine() {
    if (!canCombine || !selected || !second) return;
    const cur = latestRef.current;
    const eqKey = selected.eqKey;
    const eq = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = combineTermsS(eq, selected.termId, second.termId, selected.side);
    const [newEq1, newEq2] = eqKey === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doMove() {
    if (!selected || !selectedTerm || canExpand) return;
    const cur = latestRef.current;
    const eqKey = selected.eqKey;
    const eq = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = moveTermS(eq, selected.termId, selected.side);
    const [newEq1, newEq2] = eqKey === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doExpand() {
    if (!selected || !canExpand) return;
    handleDoubleClick(selected.termId, selected.side, selected.eqKey);
  }

  // ── Multiply / Divide the active equation ────────────────────
  function doMultiply() {
    const f = parseFrac(mulInput);
    if (!f) { setMulError('Enter a number like 2, 1/3, -1'); return; }
    const cur = latestRef.current;
    const eq = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, f.num, f.den);
    const [newEq1, newEq2] = cur.activeEq === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
    setMulOpen(false); setMulInput(''); setMulError('');
  }

  function doDivide() {
    const f = parseFrac(divInput);
    if (!f) { setDivError('Enter a number like 2 or 3'); return; }
    const cur = latestRef.current;
    const eq = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, f.den, f.num); // ÷n = ×(1/n)
    const [newEq1, newEq2] = cur.activeEq === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
    setDivOpen(false); setDivInput(''); setDivError('');
  }

  function changeSign() {
    const cur = latestRef.current;
    const eq = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, -1, 1);
    const [newEq1, newEq2] = cur.activeEq === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function showHint() {
    const cur = latestRef.current;
    const msg = suggestSystemHint(cur.eq1, cur.eq2);
    setHintMsg(msg);
    setSheepMood('thinking');
    setTimeout(() => {
      setSheepMood('idle');
      setTimeout(() => setHintMsg(''), 3000);
    }, 1000);
  }

  // ── Action bar JSX ────────────────────────────────────────────
  const actionBar = selected ? (
    <div className="action-buttons system-action-buttons">
      {canSubstitute && (
        <button className="action-btn btn-substitute" onClick={doSubstitute}>
          SUBSTITUTE {selectedTerm?.varName}
        </button>
      )}
      {canExpand && (
        <button className="action-btn btn-expand" onClick={doExpand}>
          EXPAND ( )
        </button>
      )}
      {canCombine && (
        <button className="action-btn btn-combine" onClick={doCombine}>
          COMBINE
        </button>
      )}
      {canMove && !canSubstitute && !canCombine && (
        <button className="action-btn btn-move" onClick={doMove}>
          MOVE TERM
        </button>
      )}
      <button className="action-btn btn-cancel"
        onClick={() => { setSelected(null); setSecond(null); }}>
        ✕
      </button>
    </div>
  ) : null;

  // ── Build per-board selected/second props ─────────────────────
  const sel1 = selected?.eqKey === 'eq1'
    ? { id: selected.termId, side: selected.side }
    : null;
  const sec1 = second?.eqKey === 'eq1'
    ? { id: second.termId, side: second.side }
    : null;
  const sel2 = selected?.eqKey === 'eq2'
    ? { id: selected.termId, side: selected.side }
    : null;
  const sec2 = second?.eqKey === 'eq2'
    ? { id: second.termId, side: second.side }
    : null;

  return (
    <div className={`system-game-screen ${flash}`}>
      {/* Header */}
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">{level.tierName}</span>
          <span className="level-num">LV {level.id}</span>
        </div>
        <div className="header-right">
          <button className="pixel-btn btn-hint" onClick={showHint} title="Show a hint">💡</button>
          <button className="pixel-btn btn-undo" onClick={undo} disabled={history.length === 0}>UNDO</button>
        </div>
      </div>

      {/* Hint bar */}
      <div className="hint-bar">
        {hintMsg
          ? <span className="hint-active">🐑 {hintMsg}</span>
          : <>💡 {level.hint}</>
        }
      </div>

      {/* System boards */}
      <div className="system-boards">
        {/* Equation 1 */}
        <div
          className={`system-eq-wrapper ${activeEq === 'eq1' ? 'eq-active' : ''}`}
          onClick={() => setActiveEq('eq1')}
        >
          <div className="eq-label">EQ 1</div>
          <EquationBoard
            state={eq1}
            selected={sel1}
            second={sec1}
            onPointerDown={(e, term, side) => handleTermClick(e, term, side, 'eq1')}
            onDoubleClick={(termId, side) => handleDoubleClick(termId, side, 'eq1')}
            substReadyIds={substReadyEq1}
          />
        </div>

        {/* Action bar between the two equations */}
        {actionBar && (
          <div className="system-action-bar">
            {actionBar}
          </div>
        )}

        {/* Equation 2 */}
        <div
          className={`system-eq-wrapper ${activeEq === 'eq2' ? 'eq-active' : ''}`}
          onClick={() => setActiveEq('eq2')}
        >
          <div className="eq-label">EQ 2</div>
          <EquationBoard
            state={eq2}
            selected={sel2}
            second={sec2}
            onPointerDown={(e, term, side) => handleTermClick(e, term, side, 'eq2')}
            onDoubleClick={(termId, side) => handleDoubleClick(termId, side, 'eq2')}
            substReadyIds={substReadyEq2}
          />
        </div>
      </div>

      {/* Operation buttons for active equation */}
      <div className="ops-toolbar">
        <div className="active-eq-label">
          Active: <span className="active-eq-name">{activeEq === 'eq1' ? 'EQ 1' : 'EQ 2'}</span>
        </div>
        <button className={`pixel-btn btn-multiply ${mulOpen ? 'active' : ''}`}
          onClick={() => { setMulOpen(o => !o); setDivOpen(false); }}>
          × BOTH SIDES
        </button>
        <button className={`pixel-btn btn-divide ${divOpen ? 'active' : ''}`}
          onClick={() => { setDivOpen(o => !o); setMulOpen(false); }}>
          ÷ BOTH SIDES
        </button>
        <button className="pixel-btn btn-sign" onClick={changeSign}>
          ± SIGN
        </button>
      </div>

      {/* Multiply panel */}
      {mulOpen && (
        <div className="mul-input-row">
          <span className="mul-label">Multiply {activeEq === 'eq1' ? 'Eq 1' : 'Eq 2'} both sides by:</span>
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
          <span className="mul-label">Divide {activeEq === 'eq1' ? 'Eq 1' : 'Eq 2'} both sides by:</span>
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

      {/* Steps counter */}
      <div className="system-steps-bar">
        <span className="steps-label">STEPS: {steps}</span>
        {level.optimalSteps && (
          <span className="steps-optimal">TARGET: {level.optimalSteps}</span>
        )}
      </div>

      <SheepMascot mood={sheepMood} />
    </div>
  );
}
