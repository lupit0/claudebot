import { useState, useEffect } from 'react';
import LevelSelect   from './components/LevelSelect';
import GameScreen    from './components/GameScreen';
import VictoryScreen from './components/VictoryScreen';
import { LEVELS }   from './utils/levels';
import { randomEquation } from './utils/random';
import './App.css';

function loadCompleted() {
  try {
    const raw = localStorage.getItem('eq-quest-completed');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

export default function App() {
  const [screen,    setScreen]    = useState('select');
  const [level,     setLevel]     = useState(null);
  const [stepsUsed, setStepsUsed] = useState(0);
  const [solution,  setSolution]  = useState(null);
  const [startEq,   setStartEq]   = useState('');
  const [optimal,   setOptimal]   = useState(1);
  const [completed, setCompleted] = useState(loadCompleted);
  // Per-level equation overrides, populated on reset to give fresh random equations
  const [overrides, setOverrides] = useState({});

  // Persist completed set to localStorage whenever it changes
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
    // Generate a fresh random equation for every level
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
    setOptimal(optSteps  ?? level?.optimalSteps ?? 4);
    setCompleted(prev => new Set([...prev, level.id]));
    setScreen('victory');
  }

  const nextLevel = level ? LEVELS.find(l => l.id === level.id + 1) : null;

  return (
    <div className="app">
      {screen === 'select' && (
        <LevelSelect
          completed={completed}
          overrides={overrides}
          onSelect={startLevel}
          onReset={resetAll}
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
