// Shared clock for picture and sound, so every pluck lands on a split.
import { ROOT } from './lsystem';

export const FPS = 60;
export const DURATION = 45;
export const FRAMES = FPS * DURATION;

// [start, end] of each form's hold; the gaps between are morphs.
export const HOLDS: [number, number][] = [
  [0, 7.0], // tree (grows from a single line first)
  [9.0, 13.6], // fern
  [15.6, 20.2], // lightning
  [22.2, 27.0], // river delta
  [29.0, 34.0], // lungs
  [36.6, 45], // forest
];

export const LABELS: { text: string; t0: number; t1: number }[] = [
  { text: 'tree', t0: 1.6, t1: 6.8 },
  { text: 'fern', t0: 9.2, t1: 13.4 },
  { text: 'lightning', t0: 15.8, t1: 20.0 },
  { text: 'river delta', t0: 22.4, t1: 26.8 },
  { text: 'lungs', t0: 29.2, t1: 33.8 },
  { text: 'forest', t0: 37.4, t1: 43.0 },
];

export const FADE_OUT: [number, number] = [43.6, 45];
export const PULLBACK: [number, number] = [36.4, 43.4];

// Opening growth: generation g of the rewrite appears at growStart(g).
export const GROW_DUR = 0.45;
export const growStart = (g: number) => (g === 0 ? 0.4 : 1.1 + 0.25 * (g - 1));
export const ROOT_GROW_DUR = 0.7;

// Morphs travel from the root out to the tips: generation g's progress.
export const STAGGER = 0.5;
export const morphLocal = (u: number, gen: number) => {
  const x = (u - (STAGGER * gen) / ROOT) / (1 - STAGGER);
  return x <= 0 ? 0 : x >= 1 ? 1 : x;
};

export interface Phase {
  a: number; // form index we're leaving (or holding)
  b: number; // form index we're heading to
  u: number; // 0..1 morph progress (0 in a hold)
  hold: number; // 0..1 progress through the current hold (or −1 while morphing)
}

export function phaseAt(t: number): Phase {
  for (let i = 0; i < HOLDS.length; i++) {
    const [s, e] = HOLDS[i];
    if (t >= s && t <= e) return { a: i, b: i, u: 0, hold: (t - s) / (e - s) };
    const next = HOLDS[i + 1];
    if (next && t > e && t < next[0]) return { a: i, b: i + 1, u: (t - e) / (next[0] - e), hold: -1 };
  }
  return { a: HOLDS.length - 1, b: HOLDS.length - 1, u: 0, hold: 1 };
}

// Every pluck: time, generation (→ pitch), which chord, loudness.
export interface Pluck {
  t: number;
  gen: number;
  chord: number;
  gain: number;
}

export function plucks(): Pluck[] {
  const out: Pluck[] = [];
  for (let g = 0; g < ROOT; g++) out.push({ t: growStart(g), gen: g, chord: 0, gain: 1 - g * 0.025 });
  for (let i = 0; i + 1 < HOLDS.length; i++) {
    const e = HOLDS[i][1];
    const D = HOLDS[i + 1][0] - e;
    // the moment generation g is halfway through its reshape
    for (let g = 0; g < ROOT; g += 2) {
      const u = (STAGGER * g) / ROOT + (1 - STAGGER) / 2;
      out.push({ t: e + D * u, gen: g, chord: i + 1, gain: 0.55 - g * 0.012 });
    }
  }
  return out.sort((p, q) => p.t - q.t);
}

export const LIGHTNING_STRIKES = [15.45, 17.3, 19.05];
