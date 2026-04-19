import { useEffect, useRef, useState } from 'react';
import sheepFly   from '/sheep-fly.png';
import sheepSleep from '/sheep-sleep.png';

const COLS         = 5;
const TOTAL_FRAMES = 25;

function SheepSprite({ sheet, fps = 10, size = 128, flipH = false }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % TOTAL_FRAMES), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);

  const col     = frame % COLS;
  const row     = Math.floor(frame / COLS);
  const sheetPx = size * COLS;

  return (
    <div style={{
      width: size, height: size, overflow: 'hidden', position: 'relative',
      ...(flipH ? { transform: 'scaleX(-1)' } : {}),
    }}>
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
export function SheepSVG({ pixelSize = 7, flipH = false }) {
  const size = Math.round(pixelSize * 14);
  return <SheepSprite sheet={sheepFly} fps={10} size={size} flipH={flipH} />;
}

// Game-screen mascot — only rendered on single-equation screens
export default function SheepMascot({ mood }) {
  const [anim,         setAnim]         = useState('idle');
  const [pos,          setPos]          = useState('center'); // 'center' | 'left' | 'right'
  const [transitioning,setTransitioning]= useState(false);
  const [flipH,        setFlipH]        = useState(false);
  const wrapRef  = useRef(null);
  const moveRef  = useRef(null);

  useEffect(() => {
    if (mood === 'idle' || mood === 'celebrate') { setAnim(mood); return; }
    if (mood === 'happy') return; // no visual response for step-correct events
    setAnim(mood);
    const dur = mood === 'win' ? 3500 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  function handleClick() {
    if (anim === 'win') return;
    if (transitioning) return;
    const el = wrapRef.current;
    if (!el) return;

    clearTimeout(moveRef.current);
    setTransitioning(true);

    const TRAVEL = '1.6s ease';
    el.style.transition = `left ${TRAVEL}, right ${TRAVEL}, margin-left ${TRAVEL}`;

    if (pos === 'center') {
      const goRight = Math.random() < 0.5;
      setFlipH(!goRight); // face left when going left
      setAnim('dodging');
      if (goRight) {
        el.style.left = 'auto'; el.style.right = '8px'; el.style.marginLeft = '0';
      } else {
        el.style.left = '8px'; el.style.right = 'auto'; el.style.marginLeft = '0';
      }
      moveRef.current = setTimeout(() => {
        setPos(goRight ? 'right' : 'left');
        setAnim('idle');
        setTransitioning(false);
      }, 1600);
    } else {
      // At an edge — fly back to center, facing direction of travel
      const fromRight = pos === 'right';
      setFlipH(fromRight); // going right→center means going left → flip
      setAnim('dodging');
      el.style.left = '50%'; el.style.right = 'auto'; el.style.marginLeft = '-64px';
      moveRef.current = setTimeout(() => {
        setPos('center');
        setAnim('idle');
        setFlipH(false);
        setTransitioning(false);
      }, 1600);
    }
  }

  const flying = anim === 'win' || anim === 'celebrate' || anim === 'dodging';
  const fps    = anim === 'thinking'  ? 6
               : anim === 'celebrate' || anim === 'dodging' ? 14
               : 10;

  return (
    <div
      ref={wrapRef}
      className={`sheep-mascot sheep-${anim}`}
      onClick={handleClick}
      aria-hidden="true"
    >
      <SheepSprite
        sheet={flying ? sheepFly : sheepSleep}
        fps={fps}
        size={128}
        flipH={flipH && anim !== 'win'}
      />
    </div>
  );
}
