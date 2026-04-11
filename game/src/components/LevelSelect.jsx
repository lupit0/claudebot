import { LEVELS, TIERS } from '../utils/levels';

export default function LevelSelect({ completed, onSelect, onReset }) {
  function handleReset() {
    if (completed.size === 0) return;
    if (window.confirm('Reset all progress? This cannot be undone.')) {
      onReset();
    }
  }

  return (
    <div className="level-select">
      <div className="game-title">
        <div className="title-line1">EQUATION</div>
        <div className="title-line2">QUEST</div>
        <div className="title-sub">Solve for X!</div>
      </div>
      <div className="select-toolbar">
        <span className="progress-label">
          {completed.size}/{LEVELS.length} SOLVED
        </span>
        <button
          className="pixel-btn btn-recycle"
          onClick={handleReset}
          disabled={completed.size === 0}
          title="Reset all progress"
        >↺ RESET</button>
      </div>

      {TIERS.map(tier => (
        <div key={tier.id} className="tier-section" style={{ '--tier-color': tier.color }}>
          <div className="tier-header">
            <span className="tier-star">★</span>
            {tier.name.toUpperCase()}
          </div>
          <div className="tier-levels">
            {tier.levels.map(lvlId => {
              const lvl  = LEVELS.find(l => l.id === lvlId);
              const done = completed.has(lvlId);
              return (
                <button
                  key={lvlId}
                  className={`level-btn ${done ? 'done' : ''}`}
                  onClick={() => onSelect(lvl)}
                  style={{ '--tier-color': tier.color }}
                >
                  <span className="level-num">LV{lvlId}</span>
                  <span className="level-eq">{lvl.title}</span>
                  {done && <span className="done-star">★</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
