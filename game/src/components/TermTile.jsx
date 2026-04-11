import { termMagLabel } from '../utils/fractions';

/**
 * TermTile — draggable / tappable tile for one equation term.
 *
 * Drag interaction is handled by the parent (GameScreen):
 *   onPointerDown(e, term, side)  ← called here, logic lives in GameScreen
 *
 * Tap/select:  handled via onClick (fired only when no drag occurred)
 * Double-tap:  expand a group term
 */
export default function TermTile({ term, selected, onPointerDown, onDoubleClick, side }) {
  if (term.type === 'group') {
    return (
      <GroupTile
        group={term}
        selected={selected}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        side={side}
      />
    );
  }

  const isVar = term.isVar;
  const label = termMagLabel(term.coeff, isVar);
  const isNeg = term.coeff.num < 0;

  return (
    <button
      className={[
        'term-tile',
        isVar    ? 'term-var'      : 'term-const',
        selected ? 'term-selected' : '',
      ].filter(Boolean).join(' ')}
      onPointerDown={e => onPointerDown(e, term, side)}
      onDoubleClick={() => onDoubleClick?.(term.id, side)}
      // Prevent context menu on long-press (mobile)
      onContextMenu={e => e.preventDefault()}
      draggable={false}
    >
      <span className={`term-sign ${isNeg ? 'sign-neg' : 'sign-pos'}`}>
        {isNeg ? '−' : '+'}
      </span>
      <span className="term-label">{label}</span>
    </button>
  );
}

function GroupTile({ group, selected, onPointerDown, onDoubleClick, side }) {
  const mNum  = Math.abs(group.multiplier.num);
  const mDen  = group.multiplier.den;
  const mSign = group.multiplier.num < 0 ? '−' : '+';
  const mStr  = mDen === 1
    ? (mNum === 1 ? '' : `${mNum}`)
    : `${mNum}/${mDen}`;

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
      ].filter(Boolean).join(' ')}
      onPointerDown={e => onPointerDown(e, group, side)}
      onDoubleClick={() => onDoubleClick?.(group.id, side)}
      onContextMenu={e => e.preventDefault()}
      draggable={false}
      title="Double-tap to expand!"
    >
      <span className={`term-sign ${group.multiplier.num < 0 ? 'sign-neg' : 'sign-pos'}`}>
        {mSign}
      </span>
      <span className="term-label">{mStr}({innerStr})</span>
      <span className="expand-hint">×</span>
    </button>
  );
}
