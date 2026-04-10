import { useEffect, useState } from 'react';

const MESSAGES = [
  'AMAZING!', 'BRILLIANT!', 'PERFECT!', 'STELLAR!', 'FANTASTIC!', 'YOU ROCK!',
];

export default function VictoryScreen({ level, steps, onNext, onReplay, onBack }) {
  const [msg] = useState(() => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
  const [stars, setStars] = useState(0);

  useEffect(() => {
    // Animate stars appearing
    const t1 = setTimeout(() => setStars(1), 300);
    const t2 = setTimeout(() => setStars(2), 600);
    const t3 = setTimeout(() => setStars(3), 900);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const starRating = steps <= 4 ? 3 : steps <= 7 ? 2 : 1;

  return (
    <div className="victory-screen">
      <div className="victory-burst">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="confetti" style={{
            '--angle': `${(i / 20) * 360}deg`,
            '--delay': `${(i * 0.05).toFixed(2)}s`,
            '--color': ['#ffd700','#ff6b6b','#6fcf97','#56ccf2','#9b51e0','#f2994a'][i % 6],
          }} />
        ))}
      </div>

      <div className="victory-content">
        <div className="victory-msg">{msg}</div>
        <div className="victory-title">{level.title}</div>
        <div className="victory-sub">SOLVED IN {steps} STEP{steps !== 1 ? 'S' : ''}!</div>

        <div className="star-row">
          {[1, 2, 3].map(s => (
            <span key={s} className={`star-icon ${stars >= s ? 'lit' : ''} ${stars >= s && s <= starRating ? 'gold' : ''}`}>
              ★
            </span>
          ))}
        </div>

        <div className="victory-buttons">
          <button className="pixel-btn btn-replay" onClick={onReplay}>REPLAY</button>
          {onNext && <button className="pixel-btn btn-next" onClick={onNext}>NEXT LEVEL →</button>}
          <button className="pixel-btn btn-levels" onClick={onBack}>ALL LEVELS</button>
        </div>
      </div>
    </div>
  );
}
