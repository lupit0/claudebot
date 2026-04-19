import { useEffect, useRef, useState } from 'react';
import sheepFly   from '/sheep-fly.png';
import sheepSleep from '/sheep-sleep.png';

const COLS         = 5;
const TOTAL_FRAMES = 25;

// Size 128 = exact 2x downscale from 256px source → no fractional pixel artifacts
function SheepSprite({ sheet, fps = 10, size = 128 }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % TOTAL_FRAMES), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);

  const col     = frame % COLS;
  const row     = Math.floor(frame / COLS);
  const sheetPx = size * COLS;

  return (
    <div style={{ width: size, height: size, overflow: 'hidden', position: 'relative' }}>
      <img
        src={sheet}
        draggable={false}
        style={{
          position:       'absolute',
          width:          sheetPx,
          height:         sheetPx,
          left:           -(col * size),
          top:            -(row * size),
          imageRendering: 'pixelated',
          display:        'block',
          userSelect:     'none',
        }}
        alt=""
      />
    </div>
  );
}

// Named export for VictoryScreen
export function SheepSVG({ pixelSize = 7 }) {
  const size = Math.round(pixelSize * 14);
  return <SheepSprite sheet={sheepFly} fps={10} size={size} />;
}

// Game-screen mascot driven by mood prop
export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');
  const wrapRef   = useRef(null);
  const dodgeRef  = useRef(null);

  useEffect(() => {
    if (mood === 'idle' || mood === 'celebrate') { setAnim(mood); return; }
    if (mood === 'happy') return; // no animation for step-correct events
    setAnim(mood);
    const dur = mood === 'win' ? 3500 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  function handleClick() {
    if (anim === 'win') return;
    const el = wrapRef.current;
    if (!el) return;
    setAnim('dodging');
    el.style.transition = 'left 1.6s ease, right 1.6s ease, margin-left 1.6s ease, bottom 1.6s ease, opacity 0.8s ease';
    el.style.left        = 'auto';
    el.style.right       = '8px';
    el.style.marginLeft  = '0';
    el.style.opacity     = '0.75';
    clearTimeout(dodgeRef.current);
    dodgeRef.current = setTimeout(() => {
      setAnim('idle');
      el.style.transition = 'left 1.6s ease, right 1.6s ease, margin-left 1.6s ease, bottom 1.6s ease, opacity 0.8s ease';
      el.style.left       = '50%';
      el.style.right      = 'auto';
      el.style.marginLeft = '-64px';
      el.style.opacity    = '1';
    }, 5000);
  }

  const flying = anim === 'win' || anim === 'celebrate' || anim === 'dodging';
  const fps    = anim === 'thinking' ? 6
               : anim === 'celebrate' || anim === 'dodging' ? 14
               : 10;

  return (
    <div
      ref={wrapRef}
      className={`sheep-mascot sheep-${anim}`}
      onClick={handleClick}
      aria-hidden="true"
    >
      <SheepSprite sheet={flying ? sheepFly : sheepSleep} fps={fps} size={128} />
    </div>
  );
}
