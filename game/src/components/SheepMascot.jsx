import { useEffect, useState } from 'react';

// ─── Colour palette ───────────────────────────────────
const W = '#f4f0df'; // wool – light cream
const w = '#c4c0af'; // wool – shadow dimple (fleece texture)
const d = '#a8a498'; // wool – deep shadow (belly)
const B = '#1c110a'; // face / ears – near-black brown
const E = '#f8f8f8'; // eye white
const u = '#0e0906'; // pupil
const N = '#df7888'; // pink nose
const L = '#2c1c0c'; // legs
const H = '#0e0906'; // hooves

//  Pixel grid  (col, row, color)
//  Canvas: 15 cols × 14 rows
//
//       0  1  2  3  4  5  6  7  8  9  10 11 12 13 14
//  r0   .  .  .  W  W  W  W  .  .  .  .  .  .  .  .
//  r1   .  .  W  W  W  W  W  W  W  .  .  .  .  .  .
//  r2   .  W  W  W  W  W  W  W  W  W  .  .  .  .  .
//  r3   .  W  w  W  W  w  W  W  w  W  .  B  B  .  .   ← ear
//  r4   W  W  W  W  W  W  W  W  W  W  B  B  B  B  .
//  r5   W  W  w  W  W  w  W  W  w  W  B  E  u  N  N   ← eye + nose
//  r6   W  W  W  W  W  W  W  W  W  .  B  B  B  B  .
//  r7   .  W  W  W  W  W  W  W  W  .  B  B  B  B  .
//  r8   .  .  W  W  W  W  W  W  .  .  .  .  .  .  .
//  r9   .  .  .  W  W  d  W  W  .  .  .  .  .  .  .   ← belly shadow
//  r10  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .   ← gap
//  r11  .  .  L  L  .  .  L  L  .  .  .  .  .  .  .   ← legs
//  r12  .  .  L  L  .  .  L  L  .  .  .  .  .  .  .
//  r13  .  .  H  H  H  .  H  H  H  .  .  .  .  .  .   ← hooves

const PIXELS = [
  // ── Wool body ──────────────────────────────────────
  [3,0,W],[4,0,W],[5,0,W],[6,0,W],
  [2,1,W],[3,1,W],[4,1,W],[5,1,W],[6,1,W],[7,1,W],[8,1,W],
  [1,2,W],[2,2,W],[3,2,W],[4,2,W],[5,2,W],[6,2,W],[7,2,W],[8,2,W],[9,2,W],
  // row 3: fleece dimples
  [1,3,W],[2,3,w],[3,3,W],[4,3,W],[5,3,w],[6,3,W],[7,3,W],[8,3,w],[9,3,W],
  // row 4: full width
  [0,4,W],[1,4,W],[2,4,W],[3,4,W],[4,4,W],[5,4,W],[6,4,W],[7,4,W],[8,4,W],[9,4,W],
  // row 5: dimples + shadow
  [0,5,W],[1,5,W],[2,5,w],[3,5,W],[4,5,W],[5,5,w],[6,5,W],[7,5,W],[8,5,w],[9,5,W],
  // row 6
  [0,6,W],[1,6,W],[2,6,W],[3,6,W],[4,6,W],[5,6,W],[6,6,W],[7,6,W],[8,6,W],
  // row 7
  [1,7,W],[2,7,W],[3,7,W],[4,7,W],[5,7,W],[6,7,W],[7,7,W],[8,7,W],
  // row 8
  [2,8,W],[3,8,W],[4,8,W],[5,8,W],[6,8,W],[7,8,W],
  // row 9: belly with shadow centre
  [3,9,W],[4,9,W],[5,9,d],[6,9,W],[7,9,W],

  // ── Head (right side) ──────────────────────────────
  [11,3,B],[12,3,B],                          // ear tuft
  [10,4,B],[11,4,B],[12,4,B],[13,4,B],
  [10,5,B],[11,5,E],[12,5,u],[13,5,N],[14,5,N],  // eye + nose
  [10,6,B],[11,6,B],[12,6,B],[13,6,B],
  [10,7,B],[11,7,B],[12,7,B],[13,7,B],

  // ── Legs ───────────────────────────────────────────
  [2,11,L],[3,11,L],[6,11,L],[7,11,L],
  [2,12,L],[3,12,L],[6,12,L],[7,12,L],

  // ── Hooves ─────────────────────────────────────────
  [2,13,H],[3,13,H],[4,13,H],
  [5,13,H],[6,13,H],[7,13,H],
];

// Reusable SVG sheep at any pixel size
export function SheepSVG({ pixelSize = 7 }) {
  const W_PX = 15 * pixelSize;
  const H_PX = 14 * pixelSize;
  return (
    <svg
      width={W_PX}
      height={H_PX}
      viewBox={`0 0 ${W_PX} ${H_PX}`}
      style={{ imageRendering: 'pixelated', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      {PIXELS.map(([c, r, color], i) => (
        <rect
          key={i}
          x={c * pixelSize}
          y={r * pixelSize}
          width={pixelSize}
          height={pixelSize}
          fill={color}
        />
      ))}
    </svg>
  );
}

// Game-screen mascot: fixed corner, driven by mood prop
export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');

  useEffect(() => {
    // 'celebrate' loops forever — no auto-reset
    if (mood === 'idle' || mood === 'celebrate') {
      setAnim(mood);
      return;
    }
    setAnim(mood);
    const dur = mood === 'win' ? 2200 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  return (
    <div className={`sheep-mascot sheep-${anim}`} aria-hidden="true">
      <SheepSVG pixelSize={7} />
    </div>
  );
}
