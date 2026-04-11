import { useState, useEffect } from 'react';
import LevelSelect   from './components/LevelSelect';
import GameScreen    from './components/GameScreen';
import VictoryScreen from './components/VictoryScreen';
import { LEVELS }   from './utils/levels';
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
  const [solution,  setSolution]  = useState(null); // e.g. 'x = 42'
  const [completed, setCompleted] = useState(loadCompleted);

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

  function handleWin(steps, sol) {
    setStepsUsed(steps);
    setSolution(sol);
    setCompleted(prev => new Set([...prev, level.id]));
    setScreen('victory');
  }

  const nextLevel = level ? LEVELS.find(l => l.id === level.id + 1) : null;

  return (
    <div className="app">
      {screen === 'select' && (
        <LevelSelect
          completed={completed}
          onSelect={startLevel}
          onReset={() => setCompleted(new Set())}
        />
      )}
      {screen === 'game' && level && (
        <GameScreen
          key={level.id + '-' + Date.now()}
          level={level}
          onWin={handleWin}
          onBack={() => setScreen('select')}
        />
      )}
      {screen === 'victory' && level && (
        <VictoryScreen
          level={level}
          steps={stepsUsed}
          solution={solution}
          onReplay={() => startLevel(level)}
          onNext={nextLevel ? () => startLevel(nextLevel) : null}
          onBack={() => setScreen('select')}
        />
      )}
    </div>
  );
}
