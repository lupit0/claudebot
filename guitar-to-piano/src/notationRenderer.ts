import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow';
import type { PianoBar, ClefType } from './types';

const NOTE_NAMES = ['c', 'c', 'd', 'd', 'e', 'f', 'f', 'g', 'g', 'a', 'a', 'b'];
const NOTE_ACCIDENTALS = ['', '#', '', '#', '', '', '#', '', '#', '', '#', ''];

function shiftMidiKey(midiKey: number, octaveShift: number): string {
  const shifted = midiKey + octaveShift * 12;
  const noteIndex = shifted % 12;
  const octave = Math.floor(shifted / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${NOTE_ACCIDENTALS[noteIndex]}/${octave}`;
}

function hasAccidental(key: string): string | null {
  if (key.includes('#')) return '#';
  if (key.includes('b') && !key.startsWith('b')) return 'b';
  return null;
}

export function renderNotation(
  container: HTMLElement,
  bars: PianoBar[],
  clef: ClefType,
  octaveShift: number
): void {
  container.innerHTML = '';

  if (bars.length === 0) return;

  const staveWidth = 300;
  const staveHeight = 140;
  const stavesPerRow = Math.max(1, Math.floor((container.clientWidth - 40) / staveWidth));
  const totalRows = Math.ceil(bars.length / stavesPerRow);
  const svgWidth = Math.min(container.clientWidth, stavesPerRow * staveWidth + 40);
  const svgHeight = totalRows * staveHeight + 40;

  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(svgWidth, svgHeight);
  const context = renderer.getContext();
  context.setFont('Arial', 10);

  const clefName = clef === 'treble' ? 'treble' : 'bass';

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const row = Math.floor(i / stavesPerRow);
    const col = i % stavesPerRow;
    const x = col * staveWidth + 20;
    const y = row * staveHeight + 20;

    const stave = new Stave(x, y, staveWidth - 10);

    if (col === 0) {
      stave.addClef(clefName);
    }
    if (i === 0) {
      stave.addTimeSignature(`${bar.timeSignature.numerator}/${bar.timeSignature.denominator}`);
    }

    stave.setContext(context).draw();

    const vexNotes: StaveNote[] = [];

    for (const beat of bar.beats) {
      if (beat.isRest) {
        const rest = new StaveNote({
          clef: clefName,
          keys: [clef === 'treble' ? 'b/4' : 'd/3'],
          duration: `${beat.duration}r`,
        });
        vexNotes.push(rest);
      } else {
        const keys = beat.notes.map((n) => shiftMidiKey(n.midi, octaveShift));
        try {
          const staveNote = new StaveNote({
            clef: clefName,
            keys,
            duration: beat.duration,
          });

          // Add accidentals
          keys.forEach((key, idx) => {
            const acc = hasAccidental(key);
            if (acc) {
              staveNote.addModifier(new Accidental(acc), idx);
            }
          });

          vexNotes.push(staveNote);
        } catch {
          // If VexFlow can't render this note combination, add a rest instead
          const rest = new StaveNote({
            clef: clefName,
            keys: [clef === 'treble' ? 'b/4' : 'd/3'],
            duration: `${beat.duration}r`,
          });
          vexNotes.push(rest);
        }
      }
    }

    if (vexNotes.length > 0) {
      try {
        const voice = new Voice({
          numBeats: bar.timeSignature.numerator,
          beatValue: bar.timeSignature.denominator,
        }).setMode(Voice.Mode.SOFT);

        voice.addTickables(vexNotes);
        new Formatter().joinVoices([voice]).format([voice], staveWidth - 80);
        voice.draw(context, stave);
      } catch {
        // Silently handle formatting errors for complex time signatures
      }
    }
  }

  // Style the SVG
  const svg = container.querySelector('svg');
  if (svg) {
    svg.style.background = 'transparent';
    // Make all notation elements light colored for dark theme
    const paths = svg.querySelectorAll('path, line, rect');
    paths.forEach((el) => {
      const htmlEl = el as SVGElement;
      if (htmlEl.getAttribute('fill') !== 'none') {
        htmlEl.setAttribute('fill', '#e2e8f0');
      }
      if (htmlEl.getAttribute('stroke')) {
        htmlEl.setAttribute('stroke', '#e2e8f0');
      }
    });
    const texts = svg.querySelectorAll('text');
    texts.forEach((el) => {
      el.setAttribute('fill', '#e2e8f0');
    });
  }
}
