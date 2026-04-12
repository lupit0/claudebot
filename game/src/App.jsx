import { useState, useEffect } from 'react';
import LevelSelect         from './components/LevelSelect';
import GameScreen          from './components/GameScreen';
import SystemGameScreen    from './components/SystemGameScreen';
import VictoryScreen       from './components/VictoryScreen';
import EquationBuilder     from './components/EquationBuilder';
import SystemEquationBuilder from './components/SystemEquationBuilder';
import { LEVELS }          from './utils/levels';
import { SYSTEM_LEVELS }   from './utils/systemLevels';
import { makeTerm, makeGroup } from './utils/equations';
import { makeTermS, makeGroupS } from './utils/systemEquations';
import { randomEquation }  from './utils/random';
import { WORD_PROBLEMS }   from './utils/wordProblems';
import WordBuildScreen     from './components/WordBuildScreen';
import './App.css';

function loadCompleted() {
  try {
    const raw = localStorage.getItem('eq-quest-completed');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function rawToTerm(t) {
  if (t.type === 'group') {
    return makeGroup(t.mul.num, t.mul.den,
      t.inner.map(u => makeTerm(u.num, u.den, u.isVar || u.varName === 'x')));
  }
  return makeTerm(t.num, t.den, t.isVar || t.varName === 'x');
}

function rawToTermS(t) {
  if (t.type === 'group') {
    return makeGroupS(t.mul.num, t.mul.den, t.inner.map(u => {
      const vn = u.varName !== undefined ? u.varName : (u.isVar ? 'x' : null);
      return makeTermS(u.num, u.den, vn);
    }));
  }
  const varName = t.varName !== undefined ? t.varName : (t.isVar ? 'x' : null);
  return makeTermS(t.num, t.den, varName);
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

function loadSystemCustomLevels() {
  try {
    const raw = localStorage.getItem('eq-quest-system-custom');
    if (!raw) return [];
    return JSON.parse(raw).map(d => ({
      id: d.id,
      tier: 0,
      tierName: 'Custom System',
      title: d.title,
      hint: 'Solve the system!',
      optimalSteps: d.optimalSteps,
      isCustom: true,
      isSystem: true,
      _rawEq1: { left: d.eq1.left, right: d.eq1.right },
      _rawEq2: { left: d.eq2.left, right: d.eq2.right },
      initial: () => ({
        eq1: {
          left:  d.eq1.left.map(rawToTermS),
          right: d.eq1.right.map(rawToTermS),
        },
        eq2: {
          left:  d.eq2.left.map(rawToTermS),
          right: d.eq2.right.map(rawToTermS),
        },
      }),
    }));
  } catch { return []; }
}

function saveSystemCustomToStorage(levels) {
  try {
    localStorage.setItem('eq-quest-system-custom', JSON.stringify(
      levels.map(l => ({
        id: l.id,
        title: l.title,
        optimalSteps: l.optimalSteps,
        eq1: { left: l._rawEq1.left, right: l._rawEq1.right },
        eq2: { left: l._rawEq2.left, right: l._rawEq2.right },
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
  const [systemCustomLevels, setSystemCustomLevels] = useState(loadSystemCustomLevels);
  const [wordProblem,   setWordProblem]   = useState(null);
  const [wordCompleted, setWordCompleted] = useState(() => {
    try {
      const raw = localStorage.getItem('eq-quest-word-completed');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    try {
      localStorage.setItem('eq-quest-completed', JSON.stringify([...completed]));
    } catch { /* storage might be blocked */ }
  }, [completed]);

  useEffect(() => {
    try {
      localStorage.setItem('eq-quest-word-completed', JSON.stringify([...wordCompleted]));
    } catch { /* storage might be blocked */ }
  }, [wordCompleted]);

  function startLevel(lvl) {
    setLevel(lvl);
    if (lvl.isSystem) {
      setScreen('system-game');
    } else {
      setScreen('game');
    }
  }

  function startWordLevel(problem) {
    setWordProblem(problem);
    setScreen('word-build');
  }

  function handleWordBuilt(s1, s2) {
    const prob = wordProblem;
    if (s2) {
      // System word problem
      const lvl = {
        id: prob.id, tier: prob.tier, tierName: prob.tierName,
        title: prob.title, hint: prob.hint, optimalSteps: prob.optimalSteps,
        isWord: true, isSystem: true,
        initial: () => ({
          eq1: { left: s1.left.map(rawToTermS), right: s1.right.map(rawToTermS) },
          eq2: { left: s2.left.map(rawToTermS), right: s2.right.map(rawToTermS) },
        }),
      };
      setLevel(lvl);
      setScreen('system-game');
    } else {
      // Single-variable word problem
      const lvl = {
        id: prob.id, tier: prob.tier, tierName: prob.tierName,
        title: prob.title, hint: prob.hint, optimalSteps: prob.optimalSteps,
        isWord: true,
        initial: () => ({
          left:  s1.left.map(rawToTerm),
          right: s1.right.map(rawToTerm),
        }),
      };
      setLevel(lvl);
      setScreen('game');
    }
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
    if (level?.isWord) {
      setWordCompleted(prev => new Set([...prev, level.id]));
    } else {
      setCompleted(prev => new Set([...prev, level.id]));
    }
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

  function handleSaveSystemCustomLevel({ eq1, eq2, title, optimalSteps }) {
    const newId = -(Date.now()); // negative unique id
    const lvl = {
      id: newId,
      tier: 0,
      tierName: 'Custom System',
      title,
      hint: 'Solve the system!',
      optimalSteps,
      isCustom: true,
      isSystem: true,
      _rawEq1: eq1,
      _rawEq2: eq2,
      initial: () => ({
        eq1: {
          left:  eq1.left.map(rawToTermS),
          right: eq1.right.map(rawToTermS),
        },
        eq2: {
          left:  eq2.left.map(rawToTermS),
          right: eq2.right.map(rawToTermS),
        },
      }),
    };
    const next = [...systemCustomLevels, lvl];
    setSystemCustomLevels(next);
    saveSystemCustomToStorage(next);
    setScreen('select');
  }

  function deleteSystemCustomLevel(id) {
    const next = systemCustomLevels.filter(l => l.id !== id);
    setSystemCustomLevels(next);
    saveSystemCustomToStorage(next);
  }

  function handleSystemWin(steps, sol, startEqStr, optSteps) {
    setStepsUsed(steps);
    setSolution(sol);
    setStartEq(startEqStr || '');
    setOptimal(optSteps ?? level?.optimalSteps ?? 8);
    if (level?.isWord) {
      setWordCompleted(prev => new Set([...prev, level.id]));
    } else {
      setCompleted(prev => new Set([...prev, level.id]));
    }
    setScreen('victory');
  }

  // nextLevel: for system levels, look in SYSTEM_LEVELS; for regular, look in LEVELS
  const nextLevel = (() => {
    if (!level || level.isCustom) return null;
    if (level.isSystem) {
      return SYSTEM_LEVELS.find(l => l.id === level.id + 1) || null;
    }
    return LEVELS.find(l => l.id === level.id + 1) || null;
  })();

  return (
    <div className="app">
      {screen === 'select' && (
        <LevelSelect
          completed={completed}
          overrides={overrides}
          customLevels={customLevels}
          wordProblems={WORD_PROBLEMS}
          wordCompleted={wordCompleted}
          onSelect={startLevel}
          onSelectWord={startWordLevel}
          onReset={resetAll}
          onBuild={() => setScreen('builder')}
          onDeleteCustom={deleteCustomLevel}
          systemCustomLevels={systemCustomLevels}
          onBuildSystem={() => setScreen('system-builder')}
          onDeleteSystemCustom={deleteSystemCustomLevel}
        />
      )}
      {screen === 'builder' && (
        <EquationBuilder
          onSave={handleSaveCustomLevel}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'system-builder' && (
        <SystemEquationBuilder
          onSave={handleSaveSystemCustomLevel}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'word-build' && wordProblem && (
        <WordBuildScreen
          problem={wordProblem}
          onBuilt={handleWordBuilt}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'game' && level && (
        <GameScreen
          key={level.id + '-' + Date.now()}
          level={level}
          initialState={overrides[level.id] || null}
          wordContext={level?.isWord ? level : null}
          onWin={handleWin}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'system-game' && level && (
        <SystemGameScreen
          key={level.id + '-' + Date.now()}
          level={level}
          wordContext={level?.isWord ? level : null}
          onWin={handleSystemWin}
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

