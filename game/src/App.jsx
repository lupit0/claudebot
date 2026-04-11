import { useState, useEffect } from 'react';
import LevelSelect      from './components/LevelSelect';
import GameScreen       from './components/GameScreen';
import VictoryScreen    from './components/VictoryScreen';
import EquationBuilder  from './components/EquationBuilder';
import { LEVELS }       from './utils/levels';
import { makeTerm, makeGroup } from './utils/equations';
import { randomEquation } from './utils/random';
import './App.css';

function loadCompleted() {
  try {
    const raw = localStorage.getItem('eq-quest-completed');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function rawToTerm(t) {
  if (t.type === 'group') {
    return makeGroup(t.mul.num, t.mul.den, t.inner.map(u => makeTerm(u.num, u.den, u.isVar)));
  }
  return makeTerm(t.num, t.den, t.isVar);
}

function loadCustomLevels() {
  try {
    const raw = localStorage.getItem('eq-quest-custom');
    if (!raw) return [];
    return JSON.parse(raw).map(d => ({
      id: d.id,
      tier: 0,
      tierName: 'Custom',
      title: d.title,
      hint: 'Solve for x!',
      optimalSteps: d.optimalSteps,
      isCustom: true,
      _raw: { left: d.left, right: d.right },
      initial: () => ({
        left:  d.left.map(rawToTerm),
        right: d.right.map(rawToTerm),
      }),
    }));
  } catch { return []; }
}

function saveCustomToStorage(levels) {
  try {
    localStorage.setItem('eq-quest-custom', JSON.stringify(
      levels.map(l => ({
        id: l.id, title: l.title, optimalSteps: l.optimalSteps,
        left: l._raw.left, right: l._raw.right,
      }))
    ));
  } catch { /* storage blocked */ }
}

export default function App() {
  const [screen,    setScreen]    = useState('select');
  const [level,     setLevel]     = useState(null);
  const [stepsUsed, setStepsUsed] = useState(0);
  const [solution,  setSolution]  = useState(null);
  const [startEq,   setStartEq]   = useState('');
  const [optimal,   setOptimal]   = useState(1);
  const [completed, setCompleted] = useState(loadCompleted);
  const [overrides, setOverrides] = useState({});
  const [customLevels, setCustomLevels] = useState(loadCustomLevels);

  useEffect(() => {
    try {
      localStorage.setItem('eq-quest-completed', JSON.stringify([...completed]));
    } catch { /* storage might be blocked */ }
  }, [completed]);

  function startLevel(lvl) {
    setLevel(lvl);
    setScreen('game');
  }

  function resetAll() {
    setCompleted(new Set());
    const next = {};
    LEVELS.forEach(l => {
      const eq = randomEquation(l.tier);
      if (eq) next[l.id] = eq;
    });
    setOverrides(next);
  }

  function handleWin(steps, sol, startEqStr, optSteps) {
    setStepsUsed(steps);
    setSolution(sol);
    setStartEq(startEqStr || '');
    setOptimal(optSteps ?? level?.optimalSteps ?? 4);
    setCompleted(prev => new Set([...prev, level.id]));
    setScreen('victory');
  }

  function handleSaveCustomLevel({ left, right, title, optimalSteps }) {
    const newId = -(customLevels.length + 1);
    const lvl = {
      id: newId,
      tier: 0,
      tierName: 'Custom',
      title,
      hint: 'Solve for x!',
      optimalSteps,
      isCustom: true,
      _raw: { left, right },
      initial: () => ({
        left:  left.map(t  => makeTerm(t.num, t.den, t.isVar)),
        right: right.map(t => makeTerm(t.num, t.den, t.isVar)),
      }),
    };
    const next = [...customLevels, lvl];
    setCustomLevels(next);
    saveCustomToStorage(next);
    setScreen('select');
  }

  function deleteCustomLevel(id) {
    const next = customLevels.filter(l => l.id !== id);
    setCustomLevels(next);
    saveCustomToStorage(next);
  }

  // Custom levels never have a "next" in the built-in progression
  const nextLevel = level && !level.isCustom
    ? LEVELS.find(l => l.id === level.id + 1)
    : null;

  return (
    <div className="app">
      {screen === 'select' && (
        <LevelSelect
          completed={completed}
          overrides={overrides}
          customLevels={customLevels}
          onSelect={startLevel}
          onReset={resetAll}
          onBuild={() => setScreen('builder')}
          onDeleteCustom={deleteCustomLevel}
        />
      )}
      {screen === 'builder' && (
        <EquationBuilder
          onSave={handleSaveCustomLevel}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'game' && level && (
        <GameScreen
          key={level.id + '-' + Date.now()}
          level={level}
          initialState={overrides[level.id] || null}
          onWin={handleWin}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'victory' && level && (
        <VictoryScreen
          level={level}
          steps={stepsUsed}
          solution={solution}
          startEq={startEq}
          optimal={optimal}
          onReplay={() => startLevel(level)}
          onNext={nextLevel ? () => startLevel(nextLevel) : null}
          onBack={() => setScreen('select')}
        />
      )}
    </div>
  );
}

