import TermTile from './TermTile';

export default function EquationBoard({
  state,
  selected,          // { id, side } | null
  second,            // { id, side } | null  (second term for combine)
  onPointerDown,
  onDoubleClick,
  equalsRef,         // forwarded ref so GameScreen can measure the = position
  dropSide,          // 'left' | 'right' | null  (highlight during drag)
  actionBar,
  substReadyIds,     // Set of term ids that can be substituted (system mode)
}) {
  const { left, right } = state;

  const renderSide = (terms, side) => {
    if (terms.length === 0) return <span className="eq-zero">0</span>;
    return terms.map(term => {
      const isSel = selected?.id === term.id || second?.id === term.id;
      const isSubstReady = substReadyIds ? substReadyIds.has(term.id) : false;
      return (
        <TermTile
          key={term.id}
          term={term}
          selected={isSel}
          onPointerDown={onPointerDown}
          onDoubleClick={onDoubleClick}
          side={side}
          isSubstReady={isSubstReady}
        />
      );
    });
  };

  return (
    <div className="equation-board">
      <div className={`eq-side eq-left ${dropSide === 'left' ? 'drop-target' : ''}`}>
        {renderSide(left, 'left')}
      </div>

      <div className="eq-equals" ref={equalsRef}>=</div>

      <div className={`eq-side eq-right ${dropSide === 'right' ? 'drop-target' : ''}`}>
        {renderSide(right, 'right')}
      </div>

      {actionBar && (
        <div className="action-bar">{actionBar}</div>
      )}
    </div>
  );
}
