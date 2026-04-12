import { useState } from 'react';
import { LEVELS, TIERS } from '../utils/levels';
import { SYSTEM_LEVELS, SYSTEM_TIERS } from '../utils/systemLevels';
import { WORD_TIERS } from '../utils/wordLevels';
import { equationStr } from '../utils/equations';

export default function LevelSelect({
  completed, overrides = {}, customLevels = [], onSelect, onReset, onBuild, onDeleteCustom,
  systemCustomLevels = [], onBuildSystem, onDeleteSystemCustom,
  wordProblems = [], wordCompleted = new Set(), onSelectWord,
}) {
  const [tab, setTab] = useState('equations');

  const eqTotal   = LEVELS.length + SYSTEM_LEVELS.length;
  const wordTotal = wordProblems.length;

  return (
    <div className="level-select">
      <div className="game-title">
        <div className="title-line1">EQUATION</div>
        <div className="title-line2">QUEST</div>
        <div className="title-sub">Solve for X!</div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className="select-tabs">
        <button
          className={`select-tab ${tab === 'equations' ? 'active' : ''}`}
          onClick={() => setTab('equations')}
        >EQUATIONS</button>
        <button
          className={`select-tab ${tab === 'systems' ? 'active' : ''}`}
          onClick={() => setTab('systems')}
        >SYSTEMS</button>
        <button
          className={`select-tab ${tab === 'word' ? 'active' : ''}`}
          onClick={() => setTab('word')}
        >WORD</button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="select-toolbar">
        {tab !== 'word' && (
          <span className="progress-label">
            {completed.size}/{eqTotal} SOLVED
          </span>
        )}
        {tab === 'word' && (
          <span className="progress-label">
            {wordCompleted.size}/{wordTotal} SOLVED
          </span>
        )}
        {tab === 'equations' && (
          <button className="pixel-btn btn-build" onClick={onBuild} title="Make a custom level">
            + MAKE LEVEL
          </button>
        )}
        {tab === 'systems' && (
          <button className="pixel-btn btn-build-system" onClick={onBuildSystem} title="Make a system level">
            + MAKE SYSTEM
          </button>
        )}
        <button className="pixel-btn btn-recycle" onClick={onReset} title="Reset progress and randomise equations">
          ↺ RESET
        </button>
      </div>

      {/* ── EQUATIONS tab ───────────────────────────────── */}
      {tab === 'equations' && (
        <>
          {customLevels.length > 0 && (
            <div className="tier-section custom-tier" style={{ '--tier-color': '#f2994a' }}>
              <div className="tier-header">
                <span className="tier-star">★</span>
                CUSTOM LEVELS
              </div>
              <div className="tier-levels">
                {customLevels.map(lvl => {
                  const done = completed.has(lvl.id);
                  return (
                    <div key={lvl.id} className="custom-level-row">
                      <button
                        className={`level-btn custom-level-btn ${done ? 'done' : ''}`}
                        onClick={() => onSelect(lvl)}
                        style={{ '--tier-color': '#f2994a' }}
                      >
                        <span className="level-num">★</span>
                        <span className="level-eq">{lvl.title}</span>
                        {done && <span className="done-star">★</span>}
                      </button>
                      <button
                        className="custom-delete-btn"
                        onClick={() => onDeleteCustom(lvl.id)}
                        title="Delete this level"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
        </>
      )}

      {/* ── SYSTEMS tab ─────────────────────────────────── */}
      {tab === 'systems' && (
        <>
          {systemCustomLevels.length > 0 && (
            <div className="tier-section custom-tier" style={{ '--tier-color': '#ff6b9d' }}>
              <div className="tier-header">
                <span className="tier-star">★</span>
                CUSTOM SYSTEMS
              </div>
              <div className="tier-levels">
                {systemCustomLevels.map(lvl => {
                  const done = completed.has(lvl.id);
                  return (
                    <div key={lvl.id} className="custom-level-row">
                      <button
                        className={`level-btn system-level-btn custom-level-btn ${done ? 'done' : ''}`}
                        onClick={() => onSelect(lvl)}
                        style={{ '--tier-color': '#ff6b9d' }}
                      >
                        <span className="level-num">★</span>
                        <span className="level-eq">{lvl.title}</span>
                        {done && <span className="done-star">★</span>}
                      </button>
                      <button
                        className="custom-delete-btn"
                        onClick={() => onDeleteSystemCustom(lvl.id)}
                        title="Delete this level"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {SYSTEM_TIERS.map(tier => (
            <div key={tier.id} className="tier-section" style={{ '--tier-color': tier.color }}>
              <div className="tier-header">
                <span className="tier-star">★</span>
                {tier.name.toUpperCase()}
              </div>
              <div className="tier-levels">
                {tier.levels.map(lvlId => {
                  const lvl  = SYSTEM_LEVELS.find(l => l.id === lvlId);
                  const done = completed.has(lvlId);
                  return (
                    <button
                      key={lvlId}
                      className={`level-btn system-level-btn ${done ? 'done' : ''}`}
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
        </>
      )}

      {/* ── WORD tab ────────────────────────────────────── */}
      {tab === 'word' && (
        <>
          {WORD_TIERS.map(tier => {
            const problems = wordProblems.filter(p => p.tier === tier.id);
            return (
              <div key={tier.id} className="tier-section" style={{ '--tier-color': tier.color }}>
                <div className="tier-header">
                  <span className="tier-star">★</span>
                  {tier.name.toUpperCase()}
                </div>
                <div className="tier-levels">
                  {problems.map(prob => {
                    const done = wordCompleted.has(prob.id);
                    return (
                      <button
                        key={prob.id}
                        className={`level-btn word-level-btn ${done ? 'done' : ''}`}
                        onClick={() => onSelectWord(prob)}
                        style={{ '--tier-color': tier.color }}
                      >
                        <span className="level-num">W{prob.id - 100}</span>
                        <span className="level-eq">{prob.title}</span>
                        {done && <span className="done-star">★</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
