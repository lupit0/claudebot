import { useEffect, useRef } from 'react';
import { renderNotation } from '../notationRenderer';
import type { PianoBar, ClefType } from '../types';

interface NotationDisplayProps {
  bars: PianoBar[];
  clef: ClefType;
  octaveShift: number;
  trackName: string;
}

export function NotationDisplay({ bars, clef, octaveShift, trackName }: NotationDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return;

    // Small delay to ensure container is measured
    const timer = requestAnimationFrame(() => {
      if (containerRef.current) {
        renderNotation(containerRef.current, bars, clef, octaveShift);
      }
    });

    return () => cancelAnimationFrame(timer);
  }, [bars, clef, octaveShift]);

  // Re-render on window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && bars.length > 0) {
        renderNotation(containerRef.current, bars, clef, octaveShift);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bars, clef, octaveShift]);

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
          <h3 className="font-medium text-slate-200">{trackName}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="bg-slate-700/50 px-2.5 py-1 rounded-full capitalize">
            {clef} clef
          </span>
          {octaveShift !== 0 && (
            <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-full">
              {octaveShift > 0 ? '+' : ''}{octaveShift} octave{Math.abs(octaveShift) !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="p-6 overflow-x-auto min-h-[200px]"
      />
    </div>
  );
}
