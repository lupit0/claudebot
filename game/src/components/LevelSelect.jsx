import { LEVELS, TIERS } from '../utils/levels';
import { equationStr } from '../utils/equations';

export default function LevelSelect({ completed, overrides = {}, onSelect, onReset }) {
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
          onClick={onReset}
          title="Reset progress and randomise equations"
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
              const eq   = overrides[lvlId] ? equationStr(overrides[lvlId]) : lvl.title;
              return (
                <button
                  key={lvlId}
                  className={`level-btn ${done ? 'done' : ''}`}
                  onClick={() => onSelect(lvl)}
                  style={{ '--tier-color': tier.color }}
                >
                  <span className="level-num">LV{lvlId}</span>
                  <span className="level-eq">{eq}</span>
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
