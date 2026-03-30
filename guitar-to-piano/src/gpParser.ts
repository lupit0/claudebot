import { importer, type model } from '@coderline/alphatab';
import type { TrackData, PianoBar, PianoBeat, PianoNote } from './types';

type Score = model.Score;
type Beat = model.Beat;
type Note = model.Note;

const { ScoreLoader } = importer;

const NOTE_NAMES = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
const NOTE_ACCIDENTALS = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];

function midiToVexKey(midi: number): string {
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[noteIndex];
  const accidental = NOTE_ACCIDENTALS[noteIndex];
  return `${name}${accidental}/${octave}`;
}

function alphaTabDurationToVex(duration: number): string {
  switch (duration) {
    case -4: return '1/2'; // quadruple whole
    case -2: return '1/2'; // double whole
    case 1: return 'w';    // whole
    case 2: return 'h';    // half
    case 4: return 'q';    // quarter
    case 8: return '8';    // eighth
    case 16: return '16';  // sixteenth
    case 32: return '32';  // thirty-second
    case 64: return '64';  // sixty-fourth
    default: return 'q';
  }
}

function convertNote(note: Note): PianoNote {
  const midi = note.realValue;
  return {
    midi,
    key: midiToVexKey(midi),
    duration: '',
    isRest: false,
  };
}

function convertBeat(beat: Beat): PianoBeat {
  const duration = alphaTabDurationToVex(beat.duration);

  if (beat.isRest || beat.notes.length === 0) {
    return {
      notes: [],
      duration,
      isRest: true,
    };
  }

  const notes: PianoNote[] = beat.notes.map((note) => ({
    ...convertNote(note),
    duration,
  }));

  return {
    notes,
    duration,
    isRest: false,
  };
}

export function parseGuitarProFile(data: Uint8Array): {
  title: string;
  artist: string;
  tempo: number;
  tracks: TrackData[];
} {
  const score: Score = ScoreLoader.loadScoreFromBytes(data);

  const tracks: TrackData[] = score.tracks.map((track, trackIndex) => {
    const bars: PianoBar[] = [];

    for (let barIndex = 0; barIndex < score.masterBars.length; barIndex++) {
      const masterBar = score.masterBars[barIndex];
      const beats: PianoBeat[] = [];

      // Iterate all staves of the track
      for (const staff of track.staves) {
        if (barIndex < staff.bars.length) {
          const bar = staff.bars[barIndex];
          // Use voice 0 (primary voice)
          if (bar.voices.length > 0) {
            const voice = bar.voices[0];
            for (const beat of voice.beats) {
              beats.push(convertBeat(beat));
            }
          }
        }
      }

      bars.push({
        beats: beats.length > 0 ? beats : [{ notes: [], duration: 'w', isRest: true }],
        timeSignature: {
          numerator: masterBar.timeSignatureNumerator,
          denominator: masterBar.timeSignatureDenominator,
        },
      });
    }

    return {
      index: trackIndex,
      name: track.name || `Track ${trackIndex + 1}`,
      bars,
      isPercussion: track.isPercussion,
    };
  });

  return {
    title: score.title || 'Untitled',
    artist: score.artist || 'Unknown Artist',
    tempo: score.tempo,
    tracks,
  };
}
