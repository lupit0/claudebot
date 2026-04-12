import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import idleData      from '../assets/lottie/idle_61_sleepy_sheepton.json';
import thinkingData  from '../assets/lottie/thinking_18_counting_sheeps.json';
import happyData     from '../assets/lottie/happy_155_bouncing_sheep.json';
import winData       from '../assets/lottie/win_01_love_sheep.json';
import celebrateData from '../assets/lottie/celebrate_100_sheep_lyteky.json';

const MOODS = {
  idle:      { data: idleData,       loop: true  },
  thinking:  { data: thinkingData,   loop: true  },
  happy:     { data: happyData,      loop: false },
  win:       { data: winData,        loop: false },
  celebrate: { data: celebrateData,  loop: true  },
};

// Named export: used in VictoryScreen (replaces old SVG grid)
export function SheepSVG({ pixelSize = 10 }) {
  const size = pixelSize * 15; // keep same relative sizing as before
  return (
    <Lottie
      animationData={celebrateData}
      loop={true}
      style={{ width: size, height: size }}
    />
  );
}

// Corner mascot — fixed bottom-right, driven by mood prop
export default function SheepMascot({ mood }) {
  const [anim, setAnim] = useState('idle');

  useEffect(() => {
    if (mood === 'idle' || mood === 'celebrate') {
      setAnim(mood);
      return;
    }
    setAnim(mood);
    const dur = mood === 'win' ? 2200 : mood === 'thinking' ? 1400 : 700;
    const t = setTimeout(() => setAnim('idle'), dur);
    return () => clearTimeout(t);
  }, [mood]);

  const { data, loop } = MOODS[anim] ?? MOODS.idle;

  return (
    <div className="sheep-mascot" aria-hidden="true">
      {/* key forces remount on mood change, restarting the animation */}
      <Lottie key={anim} animationData={data} loop={loop} />
    </div>
  );
}
