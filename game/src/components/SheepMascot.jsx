import { useEffect, useState } from 'react';

// The sheep is drawn via CSS box-shadow on a 4px×4px anchor element.
// Each entry: xOffset yOffset blur color  (blur is always 0 = hard pixel)
// Pixel grid (each pixel = 4px):
//   cols 0-8, rows 0-7
//
//   . . W W W . . . .   row 0  (wool top)
//   . W W W W W . . .   row 1
//   W W W W W W B B .   row 2  (body + black head)
//   W W W W W . B E B   row 3  (E = white eye dot)
//   . W W W W . . . .   row 4
//   . . . . . . . . .   row 5
//   . L . . L . . . .   row 6  (legs)
//   . L . . L . . . .   row 7

const P = 4; // pixel size in CSS px
const W = '#e8e8e8'; // wool
const B = '#222';    // black
const E = '#fff';    // eye highlight

function px(col, row, color) {
  return `${col * P}px ${row * P}px 0 ${color}`;
}

const SHEEP_SHADOW = [
  // Row 0: wool cols 2,3,4
  px(2,0,W), px(3,0,W), px(4,0,W),
  // Row 1: wool cols 1-5
  px(1,1,W), px(2,1,W), px(3,1,W), px(4,1,W), px(5,1,W),
  // Row 2: wool 0-5, black 6,7
  px(0,2,W), px(1,2,W), px(2,2,W), px(3,2,W), px(4,2,W), px(5,2,W),
  px(6,2,B), px(7,2,B),
  // Row 3: wool 0-4, black 6, eye 7, black 8
  px(0,3,W), px(1,3,W), px(2,3,W), px(3,3,W), px(4,3,W),
  px(6,3,B), px(7,3,E), px(8,3,B),
  // Row 4: wool 1-4
  px(1,4,W), px(2,4,W), px(3,4,W), px(4,4,W),
  // Row 6-7: legs at cols 1 and 4
  px(1,6,B), px(4,6,B),
  px(1,7,B), px(4,7,B),
].join(', ');

export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');

  useEffect(() => {
    if (mood === 'idle') { setAnim('idle'); return; }
    setAnim(mood);
    // Reset to idle after animation completes (win lingers longer)
    const dur = mood === 'win' ? 2200 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  return (
    <div className={`sheep-mascot sheep-${anim}`} aria-hidden="true">
      <div
        className="sheep-px"
        style={{ boxShadow: SHEEP_SHADOW }}
      />
    </div>
  );
}
