import { makeTermS } from './systemEquations';

// System levels: 2-variable simultaneous equations
// Level format: { id, tier, tierName, isSystem:true, title, hint, optimalSteps, initial }
// initial() returns { eq1: {left,right}, eq2: {left,right} }

export const SYSTEM_LEVELS = [
  // ══════════════ TIER 6: Simultaneous I ══════════════
  {
    id: 24, tier: 6, tierName: 'Simultaneous I', isSystem: true,
    title: 'x+y=10 | x-y=2',
    hint: 'Try isolating x in equation 1 first',
    optimalSteps: 8,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(10,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(-1,1,'y')],
        right: [makeTermS(2,1,null)],
      },
    }),
  },
  {
    id: 25, tier: 6, tierName: 'Simultaneous I', isSystem: true,
    title: 'x=3 | x+y=7',
    hint: 'x is already isolated! Substitute it',
    optimalSteps: 4,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x')],
        right: [makeTermS(3,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(7,1,null)],
      },
    }),
  },
  {
    id: 26, tier: 6, tierName: 'Simultaneous I', isSystem: true,
    title: 'y=x+1 | 2x+y=10',
    hint: 'y is isolated in equation 1 already',
    optimalSteps: 6,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'y')],
        right: [makeTermS(1,1,'x'), makeTermS(1,1,null)],
      },
      eq2: {
        left:  [makeTermS(2,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(10,1,null)],
      },
    }),
  },
  {
    id: 27, tier: 6, tierName: 'Simultaneous I', isSystem: true,
    title: 'x=2y | x+y=9',
    hint: 'x is already isolated! Substitute it',
    optimalSteps: 6,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x')],
        right: [makeTermS(2,1,'y')],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(9,1,null)],
      },
    }),
  },
  {
    id: 28, tier: 6, tierName: 'Simultaneous I', isSystem: true,
    title: 'x+2y=11 | x-y=2',
    hint: 'Isolate x in equation 2 first',
    optimalSteps: 8,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x'), makeTermS(2,1,'y')],
        right: [makeTermS(11,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(-1,1,'y')],
        right: [makeTermS(2,1,null)],
      },
    }),
  },

  // ══════════════ TIER 7: Simultaneous II ══════════════
  {
    id: 29, tier: 7, tierName: 'Simultaneous II', isSystem: true,
    title: 'x+y=7 | 2x-y=5',
    hint: 'Try isolating y in equation 1',
    optimalSteps: 9,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(7,1,null)],
      },
      eq2: {
        left:  [makeTermS(2,1,'x'), makeTermS(-1,1,'y')],
        right: [makeTermS(5,1,null)],
      },
    }),
  },
  {
    id: 30, tier: 7, tierName: 'Simultaneous II', isSystem: true,
    title: '2x+y=9 | x+2y=9',
    hint: 'Isolate y in equation 1',
    optimalSteps: 10,
    initial: () => ({
      eq1: {
        left:  [makeTermS(2,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(9,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(2,1,'y')],
        right: [makeTermS(9,1,null)],
      },
    }),
  },
  {
    id: 31, tier: 7, tierName: 'Simultaneous II', isSystem: true,
    title: '3x+2y=13 | x+y=5',
    hint: 'Isolate x in equation 2',
    optimalSteps: 10,
    initial: () => ({
      eq1: {
        left:  [makeTermS(3,1,'x'), makeTermS(2,1,'y')],
        right: [makeTermS(13,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(5,1,null)],
      },
    }),
  },
  {
    id: 32, tier: 7, tierName: 'Simultaneous II', isSystem: true,
    title: '2x+y=8 | x+3y=9',
    hint: 'Isolate y in equation 1',
    optimalSteps: 11,
    initial: () => ({
      eq1: {
        left:  [makeTermS(2,1,'x'), makeTermS(1,1,'y')],
        right: [makeTermS(8,1,null)],
      },
      eq2: {
        left:  [makeTermS(1,1,'x'), makeTermS(3,1,'y')],
        right: [makeTermS(9,1,null)],
      },
    }),
  },
  {
    id: 33, tier: 7, tierName: 'Simultaneous II', isSystem: true,
    title: 'x+2y=10 | 3x-2y=2',
    hint: 'Try adding the equations — or isolate x',
    optimalSteps: 11,
    initial: () => ({
      eq1: {
        left:  [makeTermS(1,1,'x'), makeTermS(2,1,'y')],
        right: [makeTermS(10,1,null)],
      },
      eq2: {
        left:  [makeTermS(3,1,'x'), makeTermS(-2,1,'y')],
        right: [makeTermS(2,1,null)],
      },
    }),
  },
];

export const SYSTEM_TIERS = [
  { id: 6, name: 'Simultaneous I',  color: '#4ecdc4', levels: [24,25,26,27,28] },
  { id: 7, name: 'Simultaneous II', color: '#ff6b9d', levels: [29,30,31,32,33] },
];
