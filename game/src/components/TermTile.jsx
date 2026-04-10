import { termMagLabel } from '../utils/fractions';

// A single draggable term tile
export default function TermTile({ term, selected, onSelect, onDoubleClick, side }) {
  if (term.type === 'group') {
    return (
      <GroupTile
        group={term}
        selected={selected}
        onSelect={onSelect}
        onDoubleClick={onDoubleClick}
        side={side}
      />
    );
  }

  const isVar = term.isVar;
  const label = termMagLabel(term.coeff, isVar);
  const sign  = term.coeff.num < 0 ? '−' : '+';

  return (
    <button
      className={[
        'term-tile',
        isVar ? 'term-var' : 'term-const',
        selected ? 'term-selected' : '',
        side,
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(term.id, side)}
      onDoubleClick={() => onDoubleClick && onDoubleClick(term.id, side)}
      title={selected ? 'Click again to deselect, or use an action' : 'Click to select'}
    >
      <span className="term-sign">{sign}</span>
      <span className="term-label">{label}</span>
    </button>
  );
}

function GroupTile({ group, selected, onSelect, onDoubleClick, side }) {
  const mNum = Math.abs(group.multiplier.num);
  const mDen = group.multiplier.den;
  const mSign = group.multiplier.num < 0 ? '−' : '';
  const mStr = mDen === 1
    ? (mNum === 1 ? '' : `${mSign}${mNum}`)
    : `${mSign}${mNum}/${mDen}`;

  const innerStr = group.inner.map((t, i) => {
    const s = i === 0
      ? (t.coeff.num < 0 ? '−' : '')
      : (t.coeff.num < 0 ? ' − ' : ' + ');
    return s + termMagLabel(t.coeff, t.isVar);
  }).join('');

  return (
    <button
      className={[
        'term-tile term-group',
        selected ? 'term-selected' : '',
        side,
      ].filter(Boolean).join(' ')}
      onClick={() => onSelect(group.id, side)}
      onDoubleClick={() => onDoubleClick && onDoubleClick(group.id, side)}
      title="Double-click to expand parentheses!"
    >
      <span className="term-sign">{group.multiplier.num < 0 ? '−' : '+'}</span>
      <span className="term-label">
        {mStr}({innerStr})
      </span>
      <span className="expand-hint">✕2</span>
    </button>
  );
}
