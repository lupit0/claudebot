import { useState } from 'react';
import LevelSelect   from './components/LevelSelect';
import GameScreen    from './components/GameScreen';
import VictoryScreen from './components/VictoryScreen';
import { LEVELS }   from './utils/levels';
import './App.css';

export default function App() {
  const [screen,    setScreen]    = useState('select');
  const [level,     setLevel]     = useState(null);
  const [stepsUsed, setStepsUsed] = useState(0);
  const [completed, setCompleted] = useState(new Set());

  function startLevel(lvl) {
    setLevel(lvl);
    setScreen('game');
  }

  function handleWin(steps) {
    setStepsUsed(steps);
    setCompleted(prev => new Set([...prev, level.id]));
    setScreen('victory');
  }

  const nextLevel = level ? LEVELS.find(l => l.id === level.id + 1) : null;

  return (
    <div className="app">
      {screen === 'select' && (
        <LevelSelect completed={completed} onSelect={startLevel} />
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
          onReplay={() => startLevel(level)}
          onNext={nextLevel ? () => startLevel(nextLevel) : null}
          onBack={() => setScreen('select')}
        />
      )}
    </div>
  );
}
