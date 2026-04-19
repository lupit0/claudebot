import { useEffect, useRef, useState } from 'react';
import sheepFly   from '/sheep-fly.png';
import sheepSleep from '/sheep-sleep.png';

const COLS         = 5;
const TOTAL_FRAMES = 25;
const SRC_FRAME    = 256;

function SheepSprite({ sheet, fps = 10, size = 160 }) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);
  const frameRef  = useRef(0);

  function paint(f) {
    const cvs = canvasRef.current;
    const img = imgRef.current;
    if (!cvs || !img) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(
      img,
      (f % COLS) * SRC_FRAME, Math.floor(f / COLS) * SRC_FRAME,
      SRC_FRAME, SRC_FRAME,
      0, 0, size, size,
    );
  }

  useEffect(() => {
    const img = new Image();
    img.onload = () => { imgRef.current = img; paint(frameRef.current); };
    img.src = sheet;
    return () => { imgRef.current = null; };
  }, [sheet]);

  useEffect(() => {
    const id = setInterval(() => {
      frameRef.current = (frameRef.current + 1) % TOTAL_FRAMES;
      paint(frameRef.current);
    }, 1000 / fps);
    return () => clearInterval(id);
  }, [fps, size, sheet]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', display: 'block', background: 'transparent' }}
      aria-hidden="true"
    />
  );
}

// Named export for VictoryScreen
export function SheepSVG({ pixelSize = 7 }) {
  const size = Math.round(pixelSize * 14);
  return <SheepSprite sheet={sheepFly} fps={10} size={size} />;
}

// Full-page overlay mascot driven by mood prop
export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');

  useEffect(() => {
    if (mood === 'idle' || mood === 'celebrate') { setAnim(mood); return; }
    setAnim(mood);
    const dur = mood === 'win' ? 3500 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  const flying = anim === 'happy' || anim === 'win' || anim === 'celebrate';
  const fps    = anim === 'thinking' ? 6
               : anim === 'happy' || anim === 'celebrate' ? 16
               : 10;

  return (
    <div className={`sheep-mascot sheep-${anim}`} aria-hidden="true">
      <SheepSprite sheet={flying ? sheepFly : sheepSleep} fps={fps} size={160} />
    </div>
  );
}
