import { useEffect, useState } from 'react';
import sheepFly   from '/sheep-fly.png';
import sheepSleep from '/sheep-sleep.png';

const COLS         = 5;
const TOTAL_FRAMES = 25;

function SheepSprite({ sheet, fps = 10, size = 112 }) {
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
        width={sheetPx}
        height={sheetPx}
        style={{
          position:      'absolute',
          left:          -(col * size),
          top:           -(row * size),
          imageRendering: 'pixelated',
          display:       'block',
        }}
        alt=""
      />
    </div>
  );
}

// Named export kept for VictoryScreen
export function SheepSVG({ pixelSize = 7 }) {
  const size = Math.round(pixelSize * 14);
  return <SheepSprite sheet={sheepFly} fps={10} size={size} />;
}

// Game-screen mascot driven by mood prop
export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');

  useEffect(() => {
    if (mood === 'idle' || mood === 'celebrate') { setAnim(mood); return; }
    setAnim(mood);
    const dur = mood === 'win' ? 2200 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  const flying = anim === 'happy' || anim === 'win' || anim === 'celebrate';
  const fps = anim === 'thinking' ? 6
            : anim === 'happy' || anim === 'celebrate' ? 16
            : 10;

  return (
    <div className={`sheep-mascot sheep-${anim}`} aria-hidden="true">
      <SheepSprite sheet={flying ? sheepFly : sheepSleep} fps={fps} size={112} />
    </div>
  );
}
