import { useState, useRef, useCallback } from 'react';
import EquationBoard from './EquationBoard';
import SheepMascot from './SheepMascot';
import { termMagLabel, frac } from '../utils/fractions';
import {
  moveTermS, combineTermsS, multiplyEqS, expandGroupS,
  detectIsolated, substituteById, addEquations,
  checkSystemWin, extractSystemSolution, systemStr, suggestSystemHint,
} from '../utils/systemEquations';

const DRAG_THRESHOLD = 6;
const MULTIPLY_PRESETS = ['2','3','4','5','6','1/2','1/3','1/4','2/3','3/2','3/4','-1'];
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
  const [selected, setSelected] = useState(null);   // { termId, eqKey, side }
  const [second,   setSecond]   = useState(null);   // { termId, eqKey, side }
  const [history,  setHistory]  = useState([]);
  const [steps,    setSteps]    = useState(0);
  const [hintMsg,  setHintMsg]  = useState('');
  const [sheepMood,setSheepMood]= useState('idle');
  const [flash,    setFlash]    = useState('');
  const [dropSide, setDropSide] = useState(null);
  const [dropEq,   setDropEq]   = useState(null);
  const [mulOpen,      setMulOpen]      = useState(false);
  const [mulInput,     setMulInput]     = useState('');
  const [mulError,     setMulError]     = useState('');
  const [divOpen,      setDivOpen]      = useState(false);
  const [divInput,     setDivInput]     = useState('');
  const [divError,     setDivError]     = useState('');
  const [eqDropTarget, setEqDropTarget] = useState(null);  // 'eq1' | 'eq2' | null
  const [combinePopup, setCombinePopup] = useState(null);  // { source, target } | null

  const ghostRef     = useRef(null);
  const equalsRef1   = useRef(null);
  const equalsRef2   = useRef(null);
  const dragRef      = useRef(null);
  const eqGhostRef   = useRef(null);
  const eqWrapper1Ref = useRef(null);
  const eqWrapper2Ref = useRef(null);

  // Capture initial states once for the win callback
  const initialEq1Ref = useRef(null);
  const initialEq2Ref = useRef(null);
  if (!initialEq1Ref.current) {
    const init = level.initial();
    initialEq1Ref.current = init.eq1;
    initialEq2Ref.current = init.eq2;
  }

  // Always-current snapshot — lets stable callbacks read live state
  const latestRef = useRef({});
  latestRef.current = { eq1, eq2, activeEq, selected, second, steps, history };

  // ── Core mutation ─────────────────────────────────────────────
  const pushState = useCallback((newEq1, newEq2) => {
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

    if (checkSystemWin(newEq1, newEq2)) {
      const sol      = extractSystemSolution(newEq1, newEq2);
      const startStr = systemStr(initialEq1Ref.current, initialEq2Ref.current);
      setSheepMood('win');
      setTimeout(() => {
        onWin(cur.steps + 1, sol.str, startStr, level.optimalSteps);
      }, 700);
    }
  }, [level.optimalSteps, onWin]);

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

  // ── Drag / tap (stable callback, reads live state via latestRef) ──
  const handleTermPointerDown = useCallback((e, term, side, eqKey) => {
    if ((e.button !== 0 && e.pointerType === 'mouse') || !e.isPrimary) return;

    dragRef.current = {
      termId: term.id, side, eqKey,
      coeff: term.coeff, type: term.type,
      varLabel: term.varName ?? (term.isVar ? 'x' : null),
      startX: e.clientX, startY: e.clientY,
      isDragging: false,
    };

    const ghost = ghostRef.current;
    if (ghost) {
      const vl = term.varName ?? (term.isVar ? 'x' : null);
      ghost.textContent = term.type === 'group'
        ? '(group)'
        : (term.coeff.num < 0 ? '- ' : '+ ') + termMagLabel(term.coeff, vl);
      ghost.className = `drag-ghost ${(vl || term.type === 'group') ? 'term-var' : 'term-const'}`;
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
        const eqRef  = dragRef.current.eqKey === 'eq1' ? equalsRef1 : equalsRef2;
        const eqRect = eqRef.current?.getBoundingClientRect();
        if (eqRect) {
          const cx = eqRect.left + eqRect.width / 2;
          const ds = dragRef.current.side === 'left'  ? (ev.clientX > cx ? 'right' : null)
                   : dragRef.current.side === 'right' ? (ev.clientX < cx ? 'left'  : null)
                   : null;
          setDropSide(ds);
          setDropEq(dragRef.current.eqKey);
        }
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('pointermove',   onMove);
      window.removeEventListener('pointerup',     onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) ghost.style.display = 'none';
      setDropSide(null);
      setDropEq(null);

      const info = dragRef.current;
      if (!info) return;
      dragRef.current = null;

      const cur = latestRef.current;

      if (info.isDragging) {
        // Check if term crossed the = sign of its equation
        const eqRef = info.eqKey === 'eq1' ? equalsRef1 : equalsRef2;
        const eqEl  = eqRef.current;
        if (!eqEl) return;
        const rect    = eqEl.getBoundingClientRect();
        const cx      = rect.left + rect.width / 2;
        const crossed = (info.side === 'left'  && ev.clientX > cx) ||
                        (info.side === 'right' && ev.clientX < cx);
        if (!crossed) return;

        const eq    = info.eqKey === 'eq1' ? cur.eq1 : cur.eq2;
        const newEq = moveTermS(eq, info.termId, info.side);
        const [newEq1, newEq2] = info.eqKey === 'eq1'
          ? [newEq, cur.eq2]
          : [cur.eq1, newEq];
        pushState(newEq1, newEq2);

      } else {
        // Tap: select / set-second / deselect
        const { termId, side: tapSide, eqKey: tapEqKey } = info;
        const { selected: curSel, eq1: cEq1, eq2: cEq2 } = cur;

        setActiveEq(tapEqKey);

        if (curSel?.termId === termId) {
          setSelected(null); setSecond(null); return;
        }
        if (!curSel) {
          setSelected({ termId, eqKey: tapEqKey, side: tapSide });
          setSecond(null);
          return;
        }
        // Same equation, same side → check for combine
        if (curSel.eqKey === tapEqKey && curSel.side === tapSide) {
          const eq  = tapEqKey === 'eq1' ? cEq1 : cEq2;
          const all = [...eq.left, ...eq.right];
          const primary = all.find(t => t.id === curSel.termId);
          const target  = all.find(t => t.id === termId);
          if (primary && target &&
              primary.type !== 'group' && target.type !== 'group' &&
              primary.varName === target.varName) {
            setSecond({ termId, eqKey: tapEqKey, side: tapSide });
            return;
          }
        }
        setSelected({ termId, eqKey: tapEqKey, side: tapSide });
        setSecond(null);
      }
    };

    window.addEventListener('pointermove',   onMove);
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onUp);
  }, [pushState]);

  // ── Double-click to expand group ──────────────────────────────
  function handleDoubleClick(termId, side, eqKey) {
    const cur  = latestRef.current;
    const eq   = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const term = [...eq.left, ...eq.right].find(t => t.id === termId);
    if (term?.type === 'group') {
      const newEq = expandGroupS(eq, termId, side);
      const [newEq1, newEq2] = eqKey === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
      pushState(newEq1, newEq2);
    }
  }

  // ── Substitution readiness ────────────────────────────────────
  const iso1 = detectIsolated(eq1);
  const iso2 = detectIsolated(eq2);

  const substReadyEq1 = new Set();
  const substReadyEq2 = new Set();
  if (iso2) {
    [...eq1.left, ...eq1.right].forEach(t => {
      if (t.varName === iso2.varName && t.type !== 'group') substReadyEq1.add(t.id);
    });
  }
  if (iso1) {
    [...eq2.left, ...eq2.right].forEach(t => {
      if (t.varName === iso1.varName && t.type !== 'group') substReadyEq2.add(t.id);
    });
  }

  // ── Selected term ─────────────────────────────────────────────
  const selectedTerm = (() => {
    if (!selected) return null;
    const eq = selected.eqKey === 'eq1' ? eq1 : eq2;
    return [...eq.left, ...eq.right].find(t => t.id === selected.termId) || null;
  })();

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
    const eq    = selected.eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = substituteById(eq, selected.termId, iso.exprTerms, iso.negated);
    const [newEq1, newEq2] = selected.eqKey === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doCombine() {
    if (!canCombine) return;
    const cur   = latestRef.current;
    const eqKey = selected.eqKey;
    const eq    = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = combineTermsS(eq, selected.termId, second.termId, selected.side);
    const [newEq1, newEq2] = eqKey === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doMove() {
    if (!selected || !selectedTerm || canExpand) return;
    const cur   = latestRef.current;
    const eqKey = selected.eqKey;
    const eq    = eqKey === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = moveTermS(eq, selected.termId, selected.side);
    const [newEq1, newEq2] = eqKey === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doExpand() {
    if (!selected || !canExpand) return;
    handleDoubleClick(selected.termId, selected.side, selected.eqKey);
  }

  // ── EQ-label drag (elimination / combination) ─────────────────
  const handleEqLabelPointerDown = useCallback((e, eqKey) => {
    if ((e.button !== 0 && e.pointerType === 'mouse') || !e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();

    const startX = e.clientX, startY = e.clientY;
    let isDragging = false;
    let overTarget = null;

    const ghost = eqGhostRef.current;
    const otherKey = eqKey === 'eq1' ? 'eq2' : 'eq1';
    const otherRef = eqKey === 'eq1' ? eqWrapper2Ref : eqWrapper1Ref;

    if (ghost) {
      ghost.textContent = eqKey === 'eq1' ? 'EQ 1' : 'EQ 2';
      ghost.style.left = e.clientX + 'px';
      ghost.style.top  = e.clientY + 'px';
    }

    const onMove = (ev) => {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (!isDragging && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        isDragging = true;
        if (ghost) ghost.style.display = 'flex';
      }
      if (!isDragging) return;
      if (ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top  = ev.clientY + 'px';
      }
      const rect = otherRef.current?.getBoundingClientRect();
      const isOver = rect
        && ev.clientX >= rect.left - 24 && ev.clientX <= rect.right  + 24
        && ev.clientY >= rect.top  - 24 && ev.clientY <= rect.bottom + 24;
      const next = isOver ? otherKey : null;
      if (next !== overTarget) { overTarget = next; setEqDropTarget(next); }
    };

    const onUp = () => {
      window.removeEventListener('pointermove',   onMove);
      window.removeEventListener('pointerup',     onUp);
      window.removeEventListener('pointercancel', onUp);
      if (ghost) ghost.style.display = 'none';
      setEqDropTarget(null);
      if (isDragging && overTarget) {
        setCombinePopup({ source: eqKey, target: overTarget });
      }
    };

    window.addEventListener('pointermove',   onMove);
    window.addEventListener('pointerup',     onUp);
    window.addEventListener('pointercancel', onUp);
  }, []);

  function doAddEquations(sign) {
    const cur = latestRef.current;
    if (!combinePopup) return;
    setCombinePopup(null);
    const targetEq = combinePopup.target === 'eq1' ? cur.eq1 : cur.eq2;
    const sourceEq = combinePopup.source === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = addEquations(targetEq, sourceEq, sign);
    const [newEq1, newEq2] = combinePopup.target === 'eq1'
      ? [newEq, cur.eq2]
      : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function doMultiply() {
    const f = parseFrac(mulInput);
    if (!f) { setMulError('Enter a number like 2, 1/3, -1'); return; }
    const cur   = latestRef.current;
    const eq    = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, f.num, f.den);
    const [newEq1, newEq2] = cur.activeEq === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
    setMulOpen(false); setMulInput(''); setMulError('');
  }

  function doDivide() {
    const f = parseFrac(divInput);
    if (!f) { setDivError('Enter a number like 2 or 3'); return; }
    const cur   = latestRef.current;
    const eq    = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, f.den, f.num);
    const [newEq1, newEq2] = cur.activeEq === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
    setDivOpen(false); setDivInput(''); setDivError('');
  }

  function changeSign() {
    const cur   = latestRef.current;
    const eq    = cur.activeEq === 'eq1' ? cur.eq1 : cur.eq2;
    const newEq = multiplyEqS(eq, -1, 1);
    const [newEq1, newEq2] = cur.activeEq === 'eq1' ? [newEq, cur.eq2] : [cur.eq1, newEq];
    pushState(newEq1, newEq2);
  }

  function showHint() {
    const cur = latestRef.current;
    const msg = suggestSystemHint(cur.eq1, cur.eq2);
    setHintMsg(msg);
    setSheepMood('thinking');
    setTimeout(() => { setSheepMood('idle'); setTimeout(() => setHintMsg(''), 3000); }, 1000);
  }

  // ── Action bar ────────────────────────────────────────────────
  const actionBar = selected ? (
    <div className="action-buttons system-action-buttons">
      {canSubstitute && (
        <button className="action-btn btn-substitute" onClick={doSubstitute}>
          SUBSTITUTE {selectedTerm?.varName?.toUpperCase()}
        </button>
      )}
      {canExpand && (
        <button className="action-btn btn-expand" onClick={doExpand}>EXPAND ( )</button>
      )}
      {canCombine && (
        <button className="action-btn btn-combine" onClick={doCombine}>COMBINE</button>
      )}
      {canMove && !canSubstitute && (
        <button className="action-btn btn-move" onClick={doMove}>MOVE TERM</button>
      )}
      <button className="action-btn btn-cancel"
        onClick={() => { setSelected(null); setSecond(null); }}>✕</button>
    </div>
  ) : null;

  // Per-board selection props
  const sel1 = selected?.eqKey === 'eq1' ? { id: selected.termId, side: selected.side } : null;
  const sec1 = second?.eqKey   === 'eq1' ? { id: second.termId,   side: second.side   } : null;
  const sel2 = selected?.eqKey === 'eq2' ? { id: selected.termId, side: selected.side } : null;
  const sec2 = second?.eqKey   === 'eq2' ? { id: second.termId,   side: second.side   } : null;

  return (
    <div className={`system-game-screen ${flash}`}>
      {/* Term drag ghost */}
      <div ref={ghostRef} className="drag-ghost" style={{ display: 'none' }} aria-hidden />
      {/* EQ-label drag ghost */}
      <div ref={eqGhostRef} className="eq-drag-ghost" style={{ display: 'none' }} aria-hidden />

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

      <div className="hint-bar">
        {hintMsg
          ? <span className="hint-active">🐑 {hintMsg}</span>
          : <>💡 {level.hint}</>}
      </div>

      <div className="system-boards">
        <div
          ref={eqWrapper1Ref}
          className={`system-eq-wrapper ${activeEq === 'eq1' ? 'eq-active' : ''} ${eqDropTarget === 'eq1' ? 'eq-drop-target' : ''}`}
          onClick={() => { if (!selected) setActiveEq('eq1'); }}
        >
          <div
            className="eq-label eq-label-drag"
            onPointerDown={e => handleEqLabelPointerDown(e, 'eq1')}
            title="Drag onto other equation to combine"
          >EQ 1</div>
          <EquationBoard
            state={eq1}
            selected={sel1}
            second={sec1}
            onPointerDown={(e, term, side) => handleTermPointerDown(e, term, side, 'eq1')}
            onDoubleClick={(termId, side) => handleDoubleClick(termId, side, 'eq1')}
            equalsRef={equalsRef1}
            dropSide={dropEq === 'eq1' ? dropSide : null}
            substReadyIds={substReadyEq1}
          />
        </div>

        {actionBar && <div className="system-action-bar">{actionBar}</div>}

        {combinePopup && (
          <div className="eq-combine-popup">
            <div className="eq-combine-label">
              EQ {combinePopup.target === 'eq1' ? '1' : '2'} &nbsp;±&nbsp; EQ {combinePopup.source === 'eq1' ? '1' : '2'}
            </div>
            <div className="eq-combine-btns">
              <button className="pixel-btn eq-sign-btn" onClick={() => doAddEquations(1)}>
                + EQ {combinePopup.source === 'eq1' ? '1' : '2'}
              </button>
              <button className="pixel-btn eq-sign-btn" onClick={() => doAddEquations(-1)}>
                - EQ {combinePopup.source === 'eq1' ? '1' : '2'}
              </button>
              <button className="pixel-btn eq-sign-cancel" onClick={() => setCombinePopup(null)}>✕</button>
            </div>
          </div>
        )}

        <div
          ref={eqWrapper2Ref}
          className={`system-eq-wrapper ${activeEq === 'eq2' ? 'eq-active' : ''} ${eqDropTarget === 'eq2' ? 'eq-drop-target' : ''}`}
          onClick={() => { if (!selected) setActiveEq('eq2'); }}
        >
          <div
            className="eq-label eq-label-drag"
            onPointerDown={e => handleEqLabelPointerDown(e, 'eq2')}
            title="Drag onto other equation to combine"
          >EQ 2</div>
          <EquationBoard
            state={eq2}
            selected={sel2}
            second={sec2}
            onPointerDown={(e, term, side) => handleTermPointerDown(e, term, side, 'eq2')}
            onDoubleClick={(termId, side) => handleDoubleClick(termId, side, 'eq2')}
            equalsRef={equalsRef2}
            dropSide={dropEq === 'eq2' ? dropSide : null}
            substReadyIds={substReadyEq2}
          />
        </div>
      </div>

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
        <button className="pixel-btn btn-sign" onClick={changeSign}>± SIGN</button>
      </div>

      {mulOpen && (
        <div className="mul-input-row">
          <span className="mul-label">Multiply {activeEq === 'eq1' ? 'Eq 1' : 'Eq 2'} both sides by:</span>
          <div className="mul-presets">
            {MULTIPLY_PRESETS.map(p => (
              <button key={p} className="preset-btn" onClick={() => setMulInput(p)}>{p}</button>
            ))}
          </div>
          <div className="mul-entry">
            <input className="mul-input" type="text" value={mulInput}
              onChange={e => { setMulInput(e.target.value); setMulError(''); }}
              placeholder="e.g. 2 or 1/3" autoFocus />
            <button className="pixel-btn btn-go" onClick={doMultiply}>GO!</button>
            <button className="pixel-btn btn-cancel-mul"
              onClick={() => { setMulOpen(false); setMulError(''); }}>✕</button>
          </div>
          {mulError && <div className="mul-error">{mulError}</div>}
        </div>
      )}

      {divOpen && (
        <div className="mul-input-row div-panel">
          <span className="mul-label">Divide {activeEq === 'eq1' ? 'Eq 1' : 'Eq 2'} both sides by:</span>
          <div className="mul-presets">
            {DIVIDE_PRESETS.map(p => (
              <button key={p} className="preset-btn" onClick={() => setDivInput(p)}>{p}</button>
            ))}
          </div>
          <div className="mul-entry">
            <input className="mul-input" type="text" value={divInput}
              onChange={e => { setDivInput(e.target.value); setDivError(''); }}
              placeholder="e.g. 3 or 4" autoFocus />
            <button className="pixel-btn btn-go" onClick={doDivide}>GO!</button>
            <button className="pixel-btn btn-cancel-mul"
              onClick={() => { setDivOpen(false); setDivError(''); }}>✕</button>
          </div>
          {divError && <div className="mul-error">{divError}</div>}
        </div>
      )}

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
