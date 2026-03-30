export type ClefType = 'treble' | 'bass';

export interface PianoNote {
  /** MIDI key number (e.g. 60 = Middle C) */
  midi: number;
  /** VexFlow key string (e.g. "c/4") */
  key: string;
  /** VexFlow duration string (e.g. "q" for quarter) */
  duration: string;
  /** Whether this is a rest */
  isRest: boolean;
}

export interface PianoBeat {
  notes: PianoNote[];
  duration: string;
  isRest: boolean;
}

export interface PianoBar {
  beats: PianoBeat[];
  timeSignature: { numerator: number; denominator: number };
}

export interface TrackData {
  index: number;
  name: string;
  bars: PianoBar[];
  isPercussion: boolean;
}

export interface TrackSettings {
  clef: ClefType;
  octaveShift: number;
  enabled: boolean;
}

export interface ParsedScore {
  title: string;
  artist: string;
  tracks: TrackData[];
  tempo: number;
}
