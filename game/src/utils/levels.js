import { makeTerm, makeGroup } from './equations';

// Each level: { id, tier, tierName, title, hint, initial }
// initial() returns a fresh { left: [], right: [] }  (factory so IDs are fresh each play)

export const LEVELS = [
  // ══════════════ TIER 1: One-step integers ══════════════
  {
    id: 1, tier: 1, tierName: 'Beginner',
    title: 'x + 5 = 12',
    hint: 'Move +5 to the right!',
    initial: () => ({
      left:  [makeTerm(1,1,true), makeTerm(5,1,false)],
      right: [makeTerm(12,1,false)],
    }),
  },
  {
    id: 2, tier: 1, tierName: 'Beginner',
    title: 'x − 4 = 9',
    hint: 'Move −4 to the right!',
    initial: () => ({
      left:  [makeTerm(1,1,true), makeTerm(-4,1,false)],
      right: [makeTerm(9,1,false)],
    }),
  },
  {
    id: 3, tier: 1, tierName: 'Beginner',
    title: '3x = 18',
    hint: 'Divide both sides by 3 (multiply by ⅓)',
    initial: () => ({
      left:  [makeTerm(3,1,true)],
      right: [makeTerm(18,1,false)],
    }),
  },
  {
    id: 4, tier: 1, tierName: 'Beginner',
    title: 'x/4 = 3',
    hint: 'Multiply both sides by 4!',
    initial: () => ({
      left:  [makeTerm(1,4,true)],
      right: [makeTerm(3,1,false)],
    }),
  },

  // ══════════════ TIER 2: Two-step integers ══════════════
  {
    id: 5, tier: 2, tierName: 'Explorer',
    title: '2x + 3 = 11',
    hint: 'First move +3, then divide by 2',
    initial: () => ({
      left:  [makeTerm(2,1,true), makeTerm(3,1,false)],
      right: [makeTerm(11,1,false)],
    }),
  },
  {
    id: 6, tier: 2, tierName: 'Explorer',
    title: '3x − 5 = 10',
    hint: 'Move −5 first, then divide by 3',
    initial: () => ({
      left:  [makeTerm(3,1,true), makeTerm(-5,1,false)],
      right: [makeTerm(10,1,false)],
    }),
  },
  {
    id: 7, tier: 2, tierName: 'Explorer',
    title: '5x − 3 = 22',
    hint: 'Move −3, then divide by 5',
    initial: () => ({
      left:  [makeTerm(5,1,true), makeTerm(-3,1,false)],
      right: [makeTerm(22,1,false)],
    }),
  },
  {
    id: 8, tier: 2, tierName: 'Explorer',
    title: '4x − 8 = 0',
    hint: 'Move −8 to the right, then divide by 4',
    initial: () => ({
      left:  [makeTerm(4,1,true), makeTerm(-8,1,false)],
      right: [makeTerm(0,1,false)],
    }),
  },

  // ══════════════ TIER 3: Variables on both sides ══════════════
  {
    id: 9, tier: 3, tierName: 'Adventurer',
    title: '2x + 3 = x + 8',
    hint: 'Move the x from the right, then move +3',
    initial: () => ({
      left:  [makeTerm(2,1,true), makeTerm(3,1,false)],
      right: [makeTerm(1,1,true), makeTerm(8,1,false)],
    }),
  },
  {
    id: 10, tier: 3, tierName: 'Adventurer',
    title: '4x − 2 = 2x + 6',
    hint: 'Get all x on one side first',
    initial: () => ({
      left:  [makeTerm(4,1,true), makeTerm(-2,1,false)],
      right: [makeTerm(2,1,true), makeTerm(6,1,false)],
    }),
  },
  {
    id: 11, tier: 3, tierName: 'Adventurer',
    title: '5x + 1 = 3x + 9',
    hint: 'Move 3x left, then move +1 right',
    initial: () => ({
      left:  [makeTerm(5,1,true), makeTerm(1,1,false)],
      right: [makeTerm(3,1,true), makeTerm(9,1,false)],
    }),
  },
  {
    id: 12, tier: 3, tierName: 'Adventurer',
    title: '2x − 20 = x + 22',
    hint: 'This is the classic! Move x right, move −20 right',
    initial: () => ({
      left:  [makeTerm(2,1,true), makeTerm(-20,1,false)],
      right: [makeTerm(1,1,true), makeTerm(22,1,false)],
    }),
  },

  // ══════════════ TIER 4: Fractions ══════════════
  {
    id: 13, tier: 4, tierName: 'Fraction Fighter',
    title: 'x/2 + 3 = 7',
    hint: 'Move +3 first, then multiply both sides by 2',
    initial: () => ({
      left:  [makeTerm(1,2,true), makeTerm(3,1,false)],
      right: [makeTerm(7,1,false)],
    }),
  },
  {
    id: 14, tier: 4, tierName: 'Fraction Fighter',
    title: '(2/3)x = 8',
    hint: 'Multiply both sides by 3/2',
    initial: () => ({
      left:  [makeTerm(2,3,true)],
      right: [makeTerm(8,1,false)],
    }),
  },
  {
    id: 15, tier: 4, tierName: 'Fraction Fighter',
    title: '(3/4)x − 1 = 5',
    hint: 'Move −1, then multiply by 4/3',
    initial: () => ({
      left:  [makeTerm(3,4,true), makeTerm(-1,1,false)],
      right: [makeTerm(5,1,false)],
    }),
  },
  {
    id: 16, tier: 4, tierName: 'Fraction Fighter',
    title: 'x/3 − 2 = x/6 + 1',
    hint: 'Multiply both sides by 6 first!',
    initial: () => ({
      left:  [makeTerm(1,3,true), makeTerm(-2,1,false)],
      right: [makeTerm(1,6,true), makeTerm(1,1,false)],
    }),
  },
  {
    id: 17, tier: 4, tierName: 'Fraction Fighter',
    title: 'x/2 + x/3 = 5',
    hint: 'Multiply both sides by 6, then combine',
    initial: () => ({
      left:  [makeTerm(1,2,true), makeTerm(1,3,true)],
      right: [makeTerm(5,1,false)],
    }),
  },
  {
    id: 18, tier: 4, tierName: 'Fraction Fighter',
    title: '(3/4)x − 2 = (1/2)x + 1',
    hint: 'Move the x/2 left, move −2 right, then clear fractions',
    initial: () => ({
      left:  [makeTerm(3,4,true), makeTerm(-2,1,false)],
      right: [makeTerm(1,2,true), makeTerm(1,1,false)],
    }),
  },

  // ══════════════ TIER 5: Parentheses ══════════════
  {
    id: 19, tier: 5, tierName: 'Master',
    title: '2(x + 3) = 14',
    hint: 'Double-tap the group to expand the parentheses first!',
    initial: () => ({
      left:  [makeGroup(2,1, [makeTerm(1,1,true), makeTerm(3,1,false)])],
      right: [makeTerm(14,1,false)],
    }),
  },
  {
    id: 20, tier: 5, tierName: 'Master',
    title: '3(x − 2) = x + 6',
    hint: 'Expand first, then get all x on one side',
    initial: () => ({
      left:  [makeGroup(3,1, [makeTerm(1,1,true), makeTerm(-2,1,false)])],
      right: [makeTerm(1,1,true), makeTerm(6,1,false)],
    }),
  },
  {
    id: 21, tier: 5, tierName: 'Master',
    title: '2(x + 1) = 3(x − 2)',
    hint: 'Expand both groups, then collect x on one side',
    initial: () => ({
      left:  [makeGroup(2,1, [makeTerm(1,1,true), makeTerm(1,1,false)])],
      right: [makeGroup(3,1, [makeTerm(1,1,true), makeTerm(-2,1,false)])],
    }),
  },
  {
    id: 22, tier: 5, tierName: 'Master',
    title: '(1/2)(x + 4) = 3',
    hint: 'Expand the group, then solve!',
    initial: () => ({
      left:  [makeGroup(1,2, [makeTerm(1,1,true), makeTerm(4,1,false)])],
      right: [makeTerm(3,1,false)],
    }),
  },
  {
    id: 23, tier: 5, tierName: 'Master',
    title: '4(x/3 + 1) = x + 7',
    hint: 'Expand first, then collect x and constants',
    initial: () => ({
      left:  [makeGroup(4,1, [makeTerm(1,3,true), makeTerm(1,1,false)])],
      right: [makeTerm(1,1,true), makeTerm(7,1,false)],
    }),
  },
];

export const TIERS = [
  { id: 1, name: 'Beginner',        color: '#6fcf97', levels: [1,2,3,4] },
  { id: 2, name: 'Explorer',        color: '#56ccf2', levels: [5,6,7,8] },
  { id: 3, name: 'Adventurer',      color: '#f2994a', levels: [9,10,11,12] },
  { id: 4, name: 'Fraction Fighter',color: '#9b51e0', levels: [13,14,15,16,17,18] },
  { id: 5, name: 'Master',          color: '#eb5757', levels: [19,20,21,22,23] },
];

export function getLevelById(id) {
  return LEVELS.find(l => l.id === id);
}
