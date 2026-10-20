// Critic metrics: measure each layout against published morphology.
import { buildTopology } from '../src/lsystem';
import { fern, lightning, delta, lungs, wrap } from '../src/forms';

const T = buildTopology();
const deg = (r: number) => (r * 180) / Math.PI;
const absDir = (F: ReturnType<typeof fern>, i: number) => {
  const p = T.parent[i];
  const sx = p < 0 ? F.ox : F.ex[p];
  const sy = p < 0 ? F.oy : F.ey[p];
  return Math.atan2(F.ey[i] - sy, F.ex[i] - sx);
};
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

// fern: pinnae on the blade
{
  const F = fern(T);
  let pinnae = 0;
  for (let i = 0; i < T.n; i++) if (T.order[i] >= 1 && T.order[i] <= 2 && T.axisRoot[i] === i && F.len[i] + (T.childA[i] >= 0 ? F.len[T.childA[i]] : 0) > 20) {
    const pr = T.parent[i];
    if (T.order[pr] === 0 || (T.order[pr] === 1 && T.axisIndex[pr] === 0)) pinnae++;
  }
  console.log(`fern: ${pinnae} pinnae (${pinnae / 2} pairs) — reference: Diellia erecta 15–50 pinnae; Asplenium pellucidum 20–36 pairs`);
}

// lightning: mean |direction change| along the main channel (segment scale)
{
  const F = lightning(T);
  const turns: number[] = [];
  for (let i = T.childA[0]; i >= 0; i = T.childA[i]) turns.push(Math.abs(deg(wrap(absDir(F, i) - absDir(F, T.parent[i])))));
  console.log(`lightning: main-channel mean |turn| ${mean(turns).toFixed(1)}° over ${turns.length} segments — reference: ~26° natural ground flashes, σ≈15° lab sparks`);
}

// delta: angle between the two children at every visible bifurcation
{
  const F = delta(T);
  const angs: number[] = [];
  for (let i = 0; i < T.n; i++) {
    const a = T.childA[i];
    const b = T.childB[i];
    if (a < 0 || b < 0 || F.len[a] < 1 || F.len[b] < 1 || F.w[a] === 0 || F.w[b] === 0) continue;
    angs.push(Math.abs(deg(wrap(absDir(F, a) - absDir(F, b)))));
  }
  let mouths = 0;
  for (let i = 0; i < T.n; i++) if (F.len[i] > 1 && (T.childA[i] < 0 || F.len[T.childA[i]] < 1) && (T.childB[i] < 0 || F.len[T.childB[i]] < 1)) mouths++;
  console.log(`delta: ${angs.length} bifurcations, mean angle ${mean(angs).toFixed(1)}° — reference: ~70° (experimental delta, 64 bifurcations); ${mouths} channel ends`);
}

// lungs: main bronchi
{
  const F = lungs(T);
  const r = T.childA[0];
  const l = T.childB[0];
  const off = (i: number) => Math.abs(deg(wrap(absDir(F, i) - Math.PI / 2)));
  console.log(`lungs: right main bronchus ${off(r).toFixed(0)}° off vertical, left ${off(l).toFixed(0)}°; length ratio L/R ${(F.len[l] / F.len[r]).toFixed(2)} — reference: ~25° / ~45°, ~2.5 cm vs ~5 cm`);
  let long = 0;
  for (let i = 0; i < T.n; i++) if (F.w[i] > 0 && F.w[i] < 3 && F.len[i] > 60) long++;
  console.log(`lungs: ${long} thin (<3px) branches longer than 60px (strays across the heart)`);
}
