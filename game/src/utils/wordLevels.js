import { WORD_PROBLEMS } from './wordProblems';

export { WORD_PROBLEMS };

export const WORD_TIERS = [
  { id: 1, name: 'Word Starters',      color: '#a8e6cf', levels: WORD_PROBLEMS.filter(p => p.tier === 1).map(p => p.id) },
  { id: 2, name: 'Two Steps',          color: '#dcedc1', levels: WORD_PROBLEMS.filter(p => p.tier === 2).map(p => p.id) },
  { id: 3, name: 'Brackets',           color: '#ffd3b6', levels: WORD_PROBLEMS.filter(p => p.tier === 3).map(p => p.id) },
  { id: 4, name: 'Fractions & Ratios', color: '#ffaaa5', levels: WORD_PROBLEMS.filter(p => p.tier === 4).map(p => p.id) },
  { id: 5, name: 'Challenge',          color: '#ff8b94', levels: WORD_PROBLEMS.filter(p => p.tier === 5).map(p => p.id) },
  { id: 6, name: 'Word Systems I',     color: '#a29bfe', levels: WORD_PROBLEMS.filter(p => p.tier === 6).map(p => p.id) },
  { id: 7, name: 'Word Systems II',    color: '#6c5ce7', levels: WORD_PROBLEMS.filter(p => p.tier === 7).map(p => p.id) },
];
