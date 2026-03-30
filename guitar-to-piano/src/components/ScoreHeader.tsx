interface ScoreHeaderProps {
  title: string;
  artist: string;
  tempo: number;
  trackCount: number;
}

export function ScoreHeader({ title, artist, tempo, trackCount }: ScoreHeaderProps) {
  return (
    <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl border border-slate-700 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="text-slate-400 mt-1">{artist}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Tempo</p>
            <p className="text-lg font-mono text-amber-400">{tempo} BPM</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Tracks</p>
            <p className="text-lg font-mono text-emerald-400">{trackCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
