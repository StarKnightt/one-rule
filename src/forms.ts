// Six shapes for one tree. Each layout walks the same L-system topology and
// decides where every segment ends. Segments a form doesn't need collapse to a
// point (length 0) so they can grow back out in the next form.

import { Topology, rnd } from './lsystem';

export const W = 1920;
export const H = 1080;
const PI = Math.PI;
const UP = -PI / 2;
const DOWN = PI / 2;

export interface Form {
  name: string;
  ox: number; // where the root segment starts
  oy: number;
  ex: Float32Array; // absolute end point of each segment
  ey: Float32Array;
  w: Float32Array; // line width, px
  a: Float32Array; // alpha
  th: Float32Array; // derived: angle relative to parent (root: absolute)
  len: Float32Array; // derived: segment length
  jag: number; // zig-zag subdivision (lightning)
  meander: number; // smooth S-curve subdivision (rivers)
  color: [number, number, number];
  sway: number; // wind amplitude during the hold
  glow: number;
  wig: Float32Array; // per-segment multiplier on jag / meander
}

export const wrap = (a: number) => {
  while (a > PI) a -= 2 * PI;
  while (a <= -PI) a += 2 * PI;
  return a;
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
};

function blank(T: Topology, name: string): Form {
  const n = T.n;
  return {
    name,
    ox: W / 2,
    oy: H,
    ex: new Float32Array(n),
    ey: new Float32Array(n),
    w: new Float32Array(n),
    a: new Float32Array(n),
    th: new Float32Array(n),
    len: new Float32Array(n),
    jag: 0,
    meander: 0,
    color: [244, 242, 238],
    sway: 0,
    glow: 0.35,
    wig: new Float32Array(n).fill(1),
  };
}

// Preorder layout ⇒ a subtree is the contiguous range [i, i + size).
function hide(T: Topology, F: Form, i: number, x: number, y: number) {
  const end = i + T.size[i];
  for (let k = i; k < end; k++) {
    F.ex[k] = x;
    F.ey[k] = y;
    F.w[k] = 0;
    F.a[k] = 0;
  }
}

function put(F: Form, i: number, sx: number, sy: number, dir: number, L: number) {
  F.ex[i] = sx + L * Math.cos(dir);
  F.ey[i] = sy + L * Math.sin(dir);
}

// Absolute end points → (relative angle, length), the space we morph in.
function finalize(T: Topology, F: Form): Form {
  const dir = new Float32Array(T.n);
  for (let i = 0; i < T.n; i++) {
    const p = T.parent[i];
    const sx = p < 0 ? F.ox : F.ex[p];
    const sy = p < 0 ? F.oy : F.ey[p];
    const pd = p < 0 ? 0 : dir[p];
    const dx = F.ex[i] - sx;
    const dy = F.ey[i] - sy;
    const L = Math.hypot(dx, dy);
    const d = L > 1e-3 ? Math.atan2(dy, dx) : pd;
    dir[i] = d;
    F.len[i] = L;
    F.th[i] = p < 0 ? d : wrap(d - pd);
  }
  return F;
}

// ─── tree ────────────────────────────────────────────────────────────────────
// Shared by the opening tree and every tree in the forest.
function growTree(
  T: Topology,
  F: Form,
  i: number,
  sx: number,
  sy: number,
  dir: number,
  s: number,
  top: number,
  wScale: number,
  alpha: number,
) {
  const b = T.budget[i];
  const bTop = T.budget[top];
  let L = s * 118 * Math.pow(0.86, bTop - b) * (0.85 + 0.3 * rnd(T, i, 0));
  if (i === top) L *= 1.2;
  put(F, i, sx, sy, dir, L);
  F.w[i] = Math.max(0.6, wScale * 22 * Math.pow(T.size[i] / T.size[top], 0.42));
  F.a[i] = alpha;
  const ex = F.ex[i];
  const ey = F.ey[i];
  const side = (T.axisIndex[i] % 2 ? 1 : -1) * (rnd(T, i, 1) < 0.15 ? -1 : 1);
  const A = T.childA[i];
  const B = T.childB[i];
  if (A >= 0) {
    let d = dir + side * (0.2 + 0.14 * rnd(T, i, 2));
    d += 0.1 * wrap(UP - d);
    growTree(T, F, A, ex, ey, d, s, top, wScale, alpha);
  }
  if (B >= 0) {
    let d = dir - side * (0.5 + 0.3 * rnd(T, i, 3));
    d += 0.06 * wrap(UP - d);
    growTree(T, F, B, ex, ey, d, s, top, wScale, alpha);
  }
}

export function tree(T: Topology): Form {
  const F = blank(T, 'tree');
  F.ox = 960;
  F.oy = 1050;
  F.sway = 0.004;
  growTree(T, F, 0, F.ox, F.oy, UP, 1, 0, 1, 1);
  return finalize(T, F);
}

// ─── fern ────────────────────────────────────────────────────────────────────
// kind 0 = stipe + rachis, 1 = pinna, 2 = pinnule, 3 = lobe. Pinnae come in
// opposite pairs: a pinna's first side shoot is its mirror twin across the
// rachis, which doubles the pinna count the rule alone would give.
interface FernAxis {
  kind: number;
  base?: number; // pinna: turn away from the rachis after its first segment
  twin?: boolean;
  len: number; // total length of this axis
  side: number;
}

export function fern(T: Topology): Form {
  const F = blank(T, 'fern');
  F.ox = 1000;
  F.oy = 1090;
  F.color = [236, 245, 232];
  F.sway = 0.003;
  const RACHIS = T.budget[0];
  const STIPE = 2;

  const taperSum = (n: number) => {
    let s = 0;
    for (let j = 0; j < n; j++) s += 1 - 0.55 * (j / n);
    return s;
  };
  // lanceolate blade: lowest pinnae a little short, widest a quarter of the way up
  const env = (f: number) =>
    Math.pow(Math.sin(PI * 0.5 * Math.min(1, (f + 0.15) / 0.4)), 0.8) * Math.pow(1 - f, 0.8);

  const visit = (i: number, sx: number, sy: number, dir: number, ax: FernAxis) => {
    const ar = T.axisRoot[i];
    const j = T.axisIndex[i];
    const n = T.budget[ar];
    let L: number;
    let curve: number;
    if (ax.kind === 0) {
      L = j < STIPE ? 70 : 60 * Math.pow(0.962, j - STIPE);
      F.w[i] = 0.9 + 5 * (1 - j / RACHIS);
      curve = 0.006 + 0.08 * Math.pow(j / (RACHIS - 1), 3);
    } else {
      L = (ax.len * (1 - 0.55 * (j / n))) / taperSum(n);
      // a pinna's first segment runs along the rachis; the twin's is longer, so
      // pairs come out subalternate rather than strictly opposite
      if (ax.kind === 1 && j === 0) L = ax.twin ? 24 : 3;
      F.w[i] = ax.kind === 1 ? 0.6 + 1.3 * (1 - j / n) : ax.kind === 2 ? 0.9 : 0.7;
      curve = -ax.side * (ax.kind === 1 ? 0.008 : 0.03);
    }
    F.a[i] = ax.kind < 3 ? 1 : 0.7;
    put(F, i, sx, sy, dir, L);
    const ex = F.ex[i];
    const ey = F.ey[i];
    const A = T.childA[i];
    const B = T.childB[i];
    const turn = ax.kind === 1 && j === 0 ? ax.base! : 0;
    if (A >= 0) visit(A, ex, ey, dir + curve + turn, ax);
    if (B < 0) return;
    const side = j % 2 ? 1 : -1;
    if (ax.kind === 0) {
      if (j < STIPE) return hide(T, F, B, ex, ey);
      const f = (j - STIPE) / (RACHIS - STIPE - 2);
      const s = j % 2 ? 1 : -1;
      visit(B, ex, ey, dir, { kind: 1, len: 300 * env(f), side: s, base: s * (1.42 - 0.4 * f) });
    } else if (ax.kind === 1 && j === 0) {
      if (ax.twin) return hide(T, F, B, ex, ey);
      // the twin pinna, mirrored across the rachis
      visit(B, ex, ey, dir, { kind: 1, len: ax.len * 0.97, side: -ax.side, base: -ax.base!, twin: true });
    } else if (ax.kind === 1) {
      const len = 0.17 * ax.len * Math.pow(1 - j / n, 0.6) * (j === 1 ? 0.8 : 1);
      visit(B, ex, ey, dir + side * 1.15, { kind: 2, len, side });
    } else hide(T, F, B, ex, ey);
  };
  visit(0, F.ox, F.oy, UP - 0.2, { kind: 0, len: 0, side: 1 });
  return finalize(T, F);
}

// ─── lightning ───────────────────────────────────────────────────────────────
export function lightning(T: Topology): Form {
  const F = blank(T, 'lightning');
  F.ox = 1010;
  F.oy = -30;
  F.jag = 0.45;
  F.color = [226, 232, 255];
  F.glow = 1.3;
  const widths = [4.5, 2.0, 1.2, 0.8, 0.6];
  const alphas = [1, 0.85, 0.65, 0.5, 0.4];
  const pBranch = [0.7, 0.4, 0.2, 0.08, 0];

  const visit = (i: number, sx: number, sy: number, dir: number, axisDir: number) => {
    const o = Math.min(4, T.order[i]);
    const ar = T.axisRoot[i];
    const j = T.axisIndex[i];
    const n = T.budget[ar];
    const maxJ = o === 0 ? 99 : Math.floor(n * (0.3 + 0.5 * rnd(T, ar, 3)));
    if (j > maxJ) return hide(T, F, i, sx, sy);
    const L = o === 0 ? 48 + 22 * rnd(T, i, 0) : (40 + 24 * rnd(T, i, 0)) * Math.pow(0.88, o - 1);
    put(F, i, sx, sy, dir, L);
    F.w[i] = widths[o] * (1 - 0.4 * (j / Math.max(n, 1)));
    F.a[i] = alphas[o];
    const ex = F.ex[i];
    const ey = F.ey[i];
    const A = T.childA[i];
    const B = T.childB[i];
    if (A >= 0) {
      let d = dir + (rnd(T, i, 1) - 0.5) * 2.6;
      d += 0.35 * wrap(axisDir - d);
      visit(A, ex, ey, d, axisDir);
    }
    if (B >= 0) {
      if (rnd(T, i, 2) < pBranch[o]) {
        const sgn = rnd(T, i, 3) < 0.5 ? -1 : 1;
        let d = dir + sgn * (0.3 + 0.55 * rnd(T, B, 2));
        d = DOWN + Math.max(-1.2, Math.min(1.2, wrap(d - DOWN)));
        visit(B, ex, ey, d, d);
      } else hide(T, F, B, ex, ey);
    }
  };
  visit(0, F.ox, F.oy, DOWN + 0.1, DOWN);
  return finalize(T, F);
}

// ─── river delta (seen from above) ───────────────────────────────────────────
export function delta(T: Topology): Form {
  const F = blank(T, 'river delta');
  F.ox = 960;
  F.oy = -40;
  F.meander = 1;
  F.color = [228, 240, 246];
  const ax = 960;
  const ay = 300;
  const coast = (phi: number) =>
    760 * (1 + 0.05 * Math.sin(7 * phi + 0.4) + 0.03 * Math.sin(13 * phi + 1.3));

  // trunk: the river comes in from the top and reaches the apex in 4 reaches
  const offs = [-26, 20, -10, 0];
  let i = 0;
  let sx = F.ox;
  let sy = F.oy;
  for (let j = 0; j < 4; j++) {
    F.ex[i] = ax + offs[j];
    F.ey[i] = F.oy + ((ay - F.oy) * (j + 1)) / 4;
    F.w[i] = 14;
    F.wig[i] = 0.7;
    F.a[i] = 1;
    sx = F.ex[i];
    sy = F.ey[i];
    if (j < 3) hide(T, F, T.childB[i], sx, sy);
    i = T.childA[i];
  }

  // Each channel walks toward the middle of the stretch of coast it feeds; at a
  // split the two children leave ~70° apart (Edmonds & Slingerland's deltas,
  // experimental deltas) and then bend back toward their own stretch.
  const fan = (
    i: number,
    sx: number,
    sy: number,
    dirIn: number,
    p0: number,
    p1: number,
    flow: number,
    fresh: boolean,
  ) => {
    const b = T.budget[i];
    const rs = Math.hypot(sx - ax, sy - ay);
    const pm = (p0 + p1) / 2;
    const R = coast(pm);
    if (rs >= R - 4) return hide(T, F, i, sx, sy);
    const bearing = Math.atan2(ay + R * Math.sin(pm) - sy, ax + R * Math.cos(pm) - sx);
    const d = dirIn + (fresh ? 0.06 : 0.5) * wrap(bearing - dirIn);
    let L = Math.max(25, Math.min(220, (R - rs) / Math.min(b, 5)));
    L *= (0.75 + 0.5 * rnd(T, i, 1)) * (0.55 + 0.45 * Math.min(1, flow * 4 + 0.2));
    if (fresh) L *= 0.7;
    L = Math.min(L, R - rs + 2);
    put(F, i, sx, sy, d, L);
    F.w[i] = Math.max(0.7, 13 * Math.sqrt(flow));
    F.wig[i] = 0.35 + 0.9 * Math.sqrt(flow);
    F.a[i] = 1;
    const ex = F.ex[i];
    const ey = F.ey[i];
    const r = Math.hypot(ex - ax, ey - ay);
    const A = T.childA[i];
    const B = T.childB[i];
    // a few small channels silt up before reaching the sea
    if (flow < 0.06 && rnd(T, i, 0) < 0.12) {
      if (A >= 0) hide(T, F, A, ex, ey);
      if (B >= 0) hide(T, F, B, ex, ey);
      return;
    }
    if (B >= 0 && rnd(T, i, 2) < 0.75 && (p1 - p0) * r > 60 && r < R * 0.9) {
      const fa = 0.55 + 0.2 * rnd(T, i, 3); // asymmetric split
      const aLow = rnd(T, B, 0) < 0.5;
      const pc = p0 + (p1 - p0) * (aLow ? fa : 1 - fa);
      const turn = 0.66;
      if (A >= 0) fan(A, ex, ey, d + (aLow ? -turn : turn), aLow ? p0 : pc, aLow ? pc : p1, flow * fa, true);
      fan(B, ex, ey, d + (aLow ? turn : -turn), aLow ? pc : p0, aLow ? p1 : pc, flow * (1 - fa), true);
    } else {
      if (B >= 0) hide(T, F, B, ex, ey);
      if (A >= 0) fan(A, ex, ey, d, p0, p1, flow, false);
    }
  };
  fan(i, sx, sy, DOWN, 0.5, PI - 0.5, 1, false);
  return finalize(T, F);
}

// ─── lungs (bronchial tree) ──────────────────────────────────────────────────
// 2D take on Kitaoka's airway model: every branch points at the centroid of
// the lung volume it supplies, then that volume is cut in two along the branch
// in proportion to the two child subtrees.
export function inLung(x: number, y: number): boolean {
  const right = x < 960; // patient's right lung is on the viewer's left
  const u = Math.abs(x - 960);
  let m = 62 + 18 * clamp01((y - 300) / 300);
  m += right ? 40 * smooth((y - 650) / 250) : 175 * smooth((y - 520) / 260);
  const lat = 455 * Math.sqrt(clamp01((y - 150) / 420));
  const top = 165 + 0.0032 * (u - 210) * (u - 210);
  const base = Math.min(1050, (right ? 905 : 935) + 0.0007 * (u - 60) * (u - 60));
  return u > m && u < lat && y > top && y < base;
}

export function lungs(T: Topology): Form {
  const F = blank(T, 'lungs');
  F.ox = 960;
  F.oy = -20;
  F.color = [246, 236, 234];
  const px: number[] = [];
  const py: number[] = [];
  const cell: number[] = [];
  let h = 0;
  for (let y = 140; y < 1060; y += 8)
    for (let x = 400; x < 1520; x += 8) {
      h++;
      const jx = x + (Math.sin(h * 12.9898) * 43758.5453 % 1) * 6;
      const jy = y + (Math.sin(h * 78.233) * 12543.1234 % 1) * 6;
      if (inLung(jx, jy)) {
        px.push(jx);
        py.push(jy);
        cell.push(((y - 140) / 8) * 1000 + (x - 400) / 8);
      }
    }
  const total = px.length;

  // trachea
  F.ex[0] = 960;
  F.ey[0] = 330;
  F.w[0] = 30;
  F.a[0] = 1;

  const visit = (i: number, sx: number, sy: number, pdir: number, pts: number[], force?: [number, number]) => {
    if (pts.length < 2) return hide(T, F, i, sx, sy);
    let cx = 0;
    let cy = 0;
    for (const k of pts) {
      cx += px[k];
      cy += py[k];
    }
    cx /= pts.length;
    cy /= pts.length;
    if (!inLung(cx, cy)) {
      // non-convex region (round the heart): aim at its nearest real point
      let best = Infinity;
      for (const k of pts) {
        const d2 = (px[k] - cx) ** 2 + (py[k] - cy) ** 2;
        if (d2 < best) [best, cx, cy] = [d2, px[k], py[k]];
      }
    }
    const dist = Math.hypot(cx - sx, cy - sy);
    let dir = Math.atan2(cy - sy, cx - sx);
    dir = pdir + Math.max(-2.2, Math.min(2.2, wrap(dir - pdir)));
    const w = Math.max(0.7, 30 * Math.cbrt(pts.length / total));
    let L = Math.max(3, dist * (pts.length > 40 ? 0.5 : 0.75), Math.min(2.2 * w, dist));
    L = Math.min(L, 40 + 12 * w);
    if (force) [dir, L] = force;
    const last = pts.length < 4;
    if (last) L = Math.max(3, dist);
    put(F, i, sx, sy, dir, L);
    F.w[i] = w;
    F.a[i] = 1;
    if (last) {
      if (T.childA[i] >= 0) hide(T, F, T.childA[i], F.ex[i], F.ey[i]);
      if (T.childB[i] >= 0) hide(T, F, T.childB[i], F.ex[i], F.ey[i]);
      return;
    }
    F.a[i] = 1;
    split(i, F.ex[i], F.ey[i], dir, pts);
  };

  // A cut can leave a territory in two pieces (e.g. either side of the heart).
  // Keep only the piece touching the branch point, so no airway has to fly
  // across empty space to reach the rest.
  const reachable = (pts: number[], ex: number, ey: number) => {
    if (pts.length < 2) return pts;
    const at = new Map<number, number>();
    let seed = pts[0];
    let best = Infinity;
    for (const k of pts) {
      at.set(cell[k], k);
      const d2 = (px[k] - ex) ** 2 + (py[k] - ey) ** 2;
      if (d2 < best) [best, seed] = [d2, k];
    }
    const out: number[] = [seed];
    at.delete(cell[seed]);
    for (let q = 0; q < out.length; q++) {
      const c = cell[out[q]];
      for (const d of [-1, 1, -1000, 1000, -1001, -999, 999, 1001]) {
        const k = at.get(c + d);
        if (k !== undefined) {
          at.delete(c + d);
          out.push(k);
        }
      }
    }
    // only trim small detached pieces; a big second piece is a real lobe
    return out.length >= 0.75 * pts.length ? out : pts;
  };

  const split = (i: number, ex: number, ey: number, dir: number, pts: number[]) => {
    const A = T.childA[i];
    const B = T.childB[i];
    if (A < 0) return;
    if (B < 0) return visit(A, ex, ey, dir, pts);
    if (pts.length < 8) {
      // too little left to share: one terminal twig, no zig-zag chain
      hide(T, F, B, ex, ey);
      return visit(A, ex, ey, dir, pts);
    }
    const nx = -Math.sin(dir);
    const ny = Math.cos(dir);
    const proj = pts.map((k) => (px[k] - ex) * nx + (py[k] - ey) * ny);
    const order = pts.map((_, q) => q).sort((p, q) => proj[p] - proj[q]);
    const pos = proj.filter((v) => v > 0).length;
    const kA = Math.round((pts.length * T.size[A]) / (T.size[A] + T.size[B]));
    const sorted = order.map((q) => pts[q]);
    const aPos = pos >= pts.length - pos;
    const ptsA = aPos ? sorted.slice(pts.length - kA) : sorted.slice(0, kA);
    const ptsB = aPos ? sorted.slice(0, pts.length - kA) : sorted.slice(kA);
    // carina: right main bronchus short and steep (~25° off vertical),
    // left one about twice as long and flatter (~45°) as it clears the heart
    const top = i === 0;
    visit(A, ex, ey, dir, top ? ptsA : reachable(ptsA, ex, ey), top ? [DOWN + 0.44, 62] : undefined);
    visit(B, ex, ey, dir, top ? ptsB : reachable(ptsB, ex, ey), top ? [DOWN - 0.79, 124] : undefined);
  };
  split(0, 960, 330, DOWN, px.map((_, k) => k));
  // Past the lobar level an airway never leaves the lung: prune any small
  // branch whose midpoint lands outside the mask (i.e. over the heart).
  for (let i = 1; i < T.n; i++) {
    if (F.w[i] === 0 || F.w[i] > 12 || T.depth[i] < 3) continue;
    const p = T.parent[i];
    const mx = (F.ex[i] + F.ex[p]) / 2;
    const my = (F.ey[i] + F.ey[p]) / 2;
    if (!inLung(mx, my) && !inLung(mx - 10, my) && !inLung(mx + 10, my)) hide(T, F, i, F.ex[p], F.ey[p]);
  }
  return finalize(T, F);
}

// ─── forest at dusk ──────────────────────────────────────────────────────────
// order 0 = a runner along the front, order 1 = runners heading into the
// distance, order 2+ = trees. The runners are invisible: the forest is one
// organism, like an aspen clone. Laid out in "world" space, then stored zoomed
// in on the nearest tree so the camera can pull back.
export const HORIZON = 965;
export interface ForestForm extends Form {
  focusX: number;
  focusY: number;
  zoom: number;
  centerX: number;
  centerY: number;
}

export function forest(T: Topology): ForestForm {
  const F = blank(T, 'forest') as ForestForm;
  F.color = [8, 8, 13];
  F.sway = 0.005;
  F.glow = 0;
  F.ox = 960;
  F.oy = 1180;
  const proj = (X: number, Z: number) => [960 + (X * 880) / Z, HORIZON + 130 / Z];

  let c = 0;
  let k = 0;
  while (c >= 0) {
    const sgn = k % 2 ? 1 : -1;
    const X = k === 0 ? -0.05 : sgn * (0.12 + 0.16 * Math.ceil(k / 2)) + (rnd(T, c, 0) - 0.5) * 0.1;
    const Z = 1.0 + 0.5 * rnd(T, c, 1);
    [F.ex[c], F.ey[c]] = proj(X, Z);
    const r = T.childB[c];
    if (r >= 0) {
      // runner into the distance
      let q = r;
      let j = 0;
      while (q >= 0) {
        const Zq = Z * Math.pow(1.3, j) * (1 + 0.15 * rnd(T, q, 0));
        const Xq = X * Math.pow(Zq / Z, 0.8) + (rnd(T, q, 1) - 0.5) * 0.35 * Math.pow(Zq, 0.9);
        [F.ex[q], F.ey[q]] = proj(Xq, Zq);
        const t = T.childB[q];
        if (t >= 0) {
          const bt = T.budget[t];
          const s = (0.55 + 0.5 * Math.min(1, bt / 16)) / Zq;
          const a = Math.max(0.35, Math.min(1, 1.05 - 0.2 * Math.log2(Zq)));
          growTree(T, F, t, F.ex[q], F.ey[q], UP + (rnd(T, t, 1) - 0.5) * 0.12, s, t, s * 0.9, a);
        }
        q = T.childA[q];
        j++;
      }
    }
    c = T.childA[c];
    k++;
  }

  // open close in on the crown of the biggest tree near the centre
  let t0 = -1;
  for (let i = 0; i < T.n; i++) {
    if (T.order[i] !== 2 || T.axisRoot[i] !== i) continue;
    const bx = F.ex[T.parent[i]];
    if (Math.abs(bx - 960) < 320 && (t0 < 0 || T.size[i] > T.size[t0])) t0 = i;
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = t0; i < t0 + T.size[t0]; i++) {
    x0 = Math.min(x0, F.ex[i]);
    x1 = Math.max(x1, F.ex[i]);
    y0 = Math.min(y0, F.ey[i]);
    y1 = Math.max(y1, F.ey[i]);
  }
  F.zoom = 2.6;
  F.focusX = (x0 + x1) / 2;
  F.focusY = y0 + (y1 - y0) * 0.4;
  F.centerX = 960;
  F.centerY = 540;
  const z = F.zoom;
  for (let i = 0; i < T.n; i++) {
    F.ex[i] = (F.ex[i] - F.focusX) * z + F.centerX;
    F.ey[i] = (F.ey[i] - F.focusY) * z + F.centerY;
    F.w[i] *= z;
    if (T.order[i] < 2) {
      F.w[i] = 0;
      F.a[i] = 0;
    }
  }
  F.ox = (F.ox - F.focusX) * z + F.centerX;
  F.oy = (F.oy - F.focusY) * z + F.centerY;
  return finalize(T, F) as ForestForm;
}

export function buildForms(T: Topology) {
  return [tree(T), fern(T), lightning(T), delta(T), lungs(T), forest(T)];
}
