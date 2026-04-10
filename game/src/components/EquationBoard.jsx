import TermTile from './TermTile';

export default function EquationBoard({
  state,
  selected,          // { id, side } | null
  onSelectTerm,
  onDoubleClick,
  actionBar,         // rendered action buttons, passed from parent
}) {
  const { left, right } = state;

  return (
    <div className="equation-board">
      <div className="eq-side eq-left">
        {left.length === 0
          ? <span className="eq-zero">0</span>
          : left.map(term => (
              <TermTile
                key={term.id}
                term={term}
                selected={selected?.id === term.id}
                onSelect={onSelectTerm}
                onDoubleClick={onDoubleClick}
                side="left"
              />
            ))
        }
      </div>

      <div className="eq-equals">=</div>

      <div className="eq-side eq-right">
        {right.length === 0
          ? <span className="eq-zero">0</span>
          : right.map(term => (
              <TermTile
                key={term.id}
                term={term}
                selected={selected?.id === term.id}
                onSelect={onSelectTerm}
                onDoubleClick={onDoubleClick}
                side="right"
              />
            ))
        }
      </div>

      {actionBar && (
        <div className="action-bar">
          {actionBar}
        </div>
      )}
    </div>
  );
}
