import { useState, useCallback } from 'react';
import SheepMascot from './SheepMascot';

const makeTerm = (num, den = 1, isVar = false) => ({
  type: 'term',
  num,
  den,
  isVar,
});
const makeGroup = (mulNum, mulDen, inner) => ({
  type: 'group',
  mul: { num: mulNum, den: mulDen },
  inner,
});

function cloneBuilder(b) {
  return JSON.parse(JSON.stringify(b));
}

function builderToStringSide(side) {
  if (!side.length) return '0';
  return side.map((t, i) => {
    const sign = t.num < 0 ? '-' : (i > 0 ? '+' : '');
    const abs = Math.abs(t.num);
    if (t.type === 'group') {
      const mul = `${t.mul.den === 1 ? t.mul.num : `${t.mul.num}/${t.mul.den}`}`;
      const inside = t.inner.map((u, j) => {
        const s2 = u.num < 0 ? '-' : (j > 0 ? '+' : '');
        const a2 = Math.abs(u.num);
        const core = u.isVar || u.varName ? (a2 === 1 ? 'x' : `${a2}x`) : `${a2}`;
        return `${s2}${core}`;
      }).join('');
      return `${sign}${mul}(${inside})`;
    }
    const core = t.isVar || t.varName ? (abs === 1 ? 'x' : `${abs}x`) : `${abs}`;
    return `${sign}${core}`;
  }).join(' ');
}

export default function WordBuildScreen({ problem, onBuilt, onBack }) {
  const isSystem = problem?.equationCount === 2;
  const [activeEq, setActiveEq] = useState(1);
  const [b1, setB1] = useState({ left: [], right: [] });
  const [b2, setB2] = useState({ left: [], right: [] });
  const [side, setSide] = useState('left');
  const [sheepMood, setSheepMood] = useState('thinking');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [input, setInput] = useState({ sign: 1, num: '', den: '', inDen: false, isVar: false, asGroup: false });

  const current = isSystem ? (activeEq === 1 ? b1 : b2) : b1;
  const setCurrent = isSystem ? (activeEq === 1 ? setB1 : setB2) : setB1;

  const resetInput = () => setInput({ sign: 1, num: '', den: '', inDen: false, isVar: false, asGroup: false });

  const pressDigit = d => setInput(s => {
    const n = { ...s };
    if (n.inDen) {
      if (n.den.length < 3) n.den += d;
    } else {
      if (n.num.length < 3) n.num += d;
    }
    return n;
  });

  const pressSlash = () => setInput(s => ({ ...s, inDen: true }));
  const toggleVar = () => setInput(s => ({ ...s, isVar: !s.isVar }));
  const toggleSign = () => setInput(s => ({ ...s, sign: s.sign * -1 }));
  const clearInput = () => resetInput();

  const addTerm = useCallback(() => {
    setError(''); setSuccess('');
    const num = Number(input.num || '0');
    const den = Number(input.den || '1');
    if (!num || !den) { setError('Enter a valid number first'); return; }
    const term = makeTerm(input.sign * num, den, input.isVar);
    const next = cloneBuilder(current);
    next[side].push(term);
    setCurrent(next);
    setSheepMood('happy');
    setTimeout(() => setSheepMood('thinking'), 500);
    resetInput();
  }, [input, current, side, setCurrent]);

  const addGroup = useCallback(() => {
    setError(''); setSuccess('');
    const num = Number(input.num || '0');
    const den = Number(input.den || '1');
    if (!num || !den) { setError('Enter group multiplier first'); return; }
    const group = makeGroup(input.sign * num, den, [makeTerm(1, 1, true), makeTerm(1, 1, false)]);
    const next = cloneBuilder(current);
    next[side].push(group);
    setCurrent(next);
    setSheepMood('happy');
    setTimeout(() => setSheepMood('thinking'), 500);
    resetInput();
  }, [input, current, side, setCurrent]);

  const backspace = () => {
    setInput(s => {
      const n = { ...s };
      if (n.inDen && n.den) n.den = n.den.slice(0, -1);
      else if (n.inDen && !n.den) n.inDen = false;
      else n.num = n.num.slice(0, -1);
      return n;
    });
  };

  const undo = () => {
    const next = cloneBuilder(current);
    next[side].pop();
    setCurrent(next);
  };

  const check = () => {
    setError('');
    if (!b1.left.length || !b1.right.length) { setError('Build equation 1 on both sides'); return; }
    if (isSystem && (!b2.left.length || !b2.right.length)) { setError('Build equation 2 on both sides'); return; }
    setSuccess('Looks good. Opening solver…');
    setTimeout(() => onBuilt(b1, isSystem ? b2 : null), 500);
  };

  const renderBuilder = (b, label='') => (
    <div className="builder-preview word-builder-preview">
      {label && <div className="word-eq-label">{label}</div>}
      <div className={`builder-side ${side === 'left' ? 'side-active' : ''}`} onClick={() => setSide('left')}>
        <span className="side-empty">{builderToStringSide(b.left)}</span>
      </div>
      <div className="builder-eq eq-done">=</div>
      <div className={`builder-side ${side === 'right' ? 'side-active' : ''}`} onClick={() => setSide('right')}>
        <span className="side-empty">{builderToStringSide(b.right)}</span>
      </div>
    </div>
  );

  const pad = (
    <div className="builder-pad">
      <div className="pad-row">
        {['7','8','9'].map(d => <button key={d} className="pad-btn" onClick={() => pressDigit(d)}>{d}</button>)}
        <button className="pad-btn pad-op" onClick={toggleSign}>±</button>
      </div>
      <div className="pad-row">
        {['4','5','6'].map(d => <button key={d} className="pad-btn" onClick={() => pressDigit(d)}>{d}</button>)}
        <button className="pad-btn pad-op" onClick={pressSlash}>/</button>
      </div>
      <div className="pad-row">
        {['1','2','3'].map(d => <button key={d} className="pad-btn" onClick={() => pressDigit(d)}>{d}</button>)}
        <button className={`pad-btn pad-op ${input.isVar ? 'active' : ''}`} onClick={toggleVar}>x</button>
      </div>
      <div className="pad-row">
        <button className="pad-btn" onClick={() => pressDigit('0')}>0</button>
        <button className="pad-btn pad-action" onClick={addTerm}>ADD TERM</button>
        <button className="pad-btn pad-action" onClick={addGroup}>ADD GROUP</button>
      </div>
      <div className="pad-row">
        <button className="pad-btn pad-op" onClick={backspace}>⌫</button>
        <button className="pad-btn pad-op" onClick={clearInput}>CLEAR</button>
        <button className="pad-btn pad-op" onClick={undo}>UNDO</button>
      </div>
    </div>
  );

  return (
    <div className="equation-builder word-build-screen">
      <div className="game-header">
        <button className="pixel-btn btn-back" onClick={onBack}>← BACK</button>
        <div className="level-badge">
          <span className="tier-name">WORD QUEST</span>
          <span className="level-num">LV {problem.id}</span>
        </div>
        <div style={{ width: 86 }} />
      </div>

      <div className="word-problem-card">
        <div className="word-problem-icon">📖</div>
        <div className="word-problem-text">{problem.problem}</div>
        <div className="word-problem-hint">💡 {problem.hint}</div>
      </div>

      {isSystem && (
        <div className="word-eq-tabs">
          <button className={`word-eq-tab ${activeEq === 1 ? 'active' : ''}`} onClick={() => setActiveEq(1)}>EQ 1</button>
          <button className={`word-eq-tab ${activeEq === 2 ? 'active' : ''}`} onClick={() => setActiveEq(2)}>EQ 2</button>
        </div>
      )}

      <div className="word-builder-section">
        {isSystem && activeEq === 1 && renderBuilder(b1, 'EQ 1')}
        {isSystem && activeEq === 2 && renderBuilder(b2, 'EQ 2')}
        {!isSystem && renderBuilder(b1, '')}
      </div>

      {pad}

      {error && <div className="builder-status status-err">{error}</div>}
      {success && <div className="builder-status status-ok">✓ {success}</div>}

      <div className="builder-actions">
        <button className="pixel-btn btn-validate" onClick={check}>CHECK EQUATION{isSystem ? 'S' : ''}</button>
      </div>

      <SheepMascot mood={sheepMood} />
    </div>
  );
}
