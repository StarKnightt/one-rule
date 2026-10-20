// README diagrams, drawn from the real L-system: pnpm diagrams
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildTopology } from '../src/lsystem';

mkdirSync('docs', { recursive: true });
const FONT = `font-family="Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"`;
const BG = '#0b0c0f';
const INK = '#ecebe6';
const DIM = '#8b8d94';
const NEW = '#f2a65a'; // segments added by the latest rewrite

// ── rule.svg: the first rewrites of X(n), each drawn as a tree ──
{
  const W = 1200;
  const H = 420;
  const ns = [1, 2, 3, 4, 5, 6, 7];
  const pw = W / ns.length;
  let body = '';
  ns.forEach((n, k) => {
    const T = buildTopology(n);
    const ex = new Float64Array(T.n);
    const ey = new Float64Array(T.n);
    const dir = new Float64Array(T.n);
    const unit = 20 * Math.pow(0.82, n - 1) + 6;
    for (let i = 0; i < T.n; i++) {
      const p = T.parent[i];
      const isA = p >= 0 && T.childA[p] === i;
      const side = p >= 0 && T.axisIndex[p] % 2 ? 1 : -1;
      const d = p < 0 ? -Math.PI / 2 : dir[p] + (isA ? side * 0.32 : -side * 0.75);
      const L = unit * Math.pow(1.17, T.budget[i]);
      const sx = p < 0 ? 0 : ex[p];
      const sy = p < 0 ? 0 : ey[p];
      dir[i] = d;
      ex[i] = sx + L * Math.cos(d);
      ey[i] = sy + L * Math.sin(d);
    }
    let x0 = 0;
    let x1 = 0;
    let y0 = 0;
    for (let i = 0; i < T.n; i++) {
      x0 = Math.min(x0, ex[i]);
      x1 = Math.max(x1, ex[i]);
      y0 = Math.min(y0, ey[i]);
    }
    const s = Math.min(1, (pw - 30) / (x1 - x0 || 1), 240 / -y0);
    const ox = k * pw + pw / 2 - ((x0 + x1) / 2) * s;
    const oy = 320;
    for (let i = 0; i < T.n; i++) {
      const p = T.parent[i];
      const sx = p < 0 ? 0 : ex[p];
      const sy = p < 0 ? 0 : ey[p];
      const fresh = T.budget[i] === 1 && n > 1;
      const w = Math.max(1.2, 1 + 0.9 * Math.sqrt(T.size[i]));
      body += `<line x1="${(ox + sx * s).toFixed(1)}" y1="${(oy + sy * s).toFixed(1)}" x2="${(ox + ex[i] * s).toFixed(1)}" y2="${(oy + ey[i] * s).toFixed(1)}" stroke="${fresh ? NEW : INK}" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>`;
    }
    body += `<text x="${k * pw + pw / 2}" y="362" fill="${INK}" font-size="17" text-anchor="middle" ${FONT}>X(${n})</text>`;
    body += `<text x="${k * pw + pw / 2}" y="386" fill="${DIM}" font-size="13" text-anchor="middle" ${FONT}>${T.n} segment${T.n > 1 ? 's' : ''}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="100%" height="100%" rx="14" fill="${BG}"/>
<text x="40" y="46" fill="${INK}" font-size="22" ${FONT}>X(n) → F(n) [ X(n−1) ] [ X(n−2) ]</text>
<text x="40" y="72" fill="${DIM}" font-size="14" ${FONT}>each segment carries on and throws off one smaller side shoot · <tspan fill="${NEW}">orange</tspan> = the tips, X(1) · the film uses X(22) = 46,367 segments</text>
${body}
</svg>`;
  writeFileSync('docs/rule.svg', svg);
}

// ── pipeline.svg: how a frame and the sound are made ──
{
  const W = 1200;
  const H = 470;
  const box = (x: number, y: number, w: number, title: string, sub: string, accent = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="70" rx="10" fill="#14161b" stroke="${accent ? NEW : '#2c2f37'}" stroke-width="1.5"/>
<text x="${x + 16}" y="${y + 30}" fill="${INK}" font-size="16" ${FONT}>${title}</text>
<text x="${x + 16}" y="${y + 52}" fill="${DIM}" font-size="12.5" ${FONT}>${sub}</text>`;
  const arrow = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${DIM}" stroke-width="1.5" fill="none" marker-end="url(#a)"/>`;
  const label = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" fill="${DIM}" font-size="12" letter-spacing="1.5" ${FONT}>${t}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="${DIM}"/></marker></defs>
<rect width="100%" height="100%" rx="14" fill="${BG}"/>
${label(40, 44, 'SHAPE')}
${box(40, 60, 250, 'one rule', 'X(n) → F(n)[X(n−1)][X(n−2)]', true)}
${arrow(290, 95, 320, 95)}
${box(320, 60, 250, 'one tree', '46,367 segments, rewritten once')}
${arrow(570, 95, 600, 95)}
${box(600, 60, 270, 'six layouts', 'angle · length · width per segment')}
${arrow(870, 95, 900, 95)}
${box(900, 60, 260, 'morph', 'blend, rebuild from root to tips')}
${label(40, 194, 'PICTURE')}
${arrow(1030, 130, 1030, 210)}
${box(900, 210, 260, 'Canvas 2D', 'frame N drawn from N alone')}
${arrow(900, 245, 870, 245)}
${box(600, 210, 270, 'Playwright', 'headless Chromium, parallel pages')}
${arrow(600, 245, 570, 245)}
${box(320, 210, 250, 'lossless frames', 'PNG → RGB segments')}
${arrow(320, 245, 290, 245)}
${box(40, 210, 250, 'two-pass x264', 'sized to fit GitHub (≤ 96 MB)')}
${label(40, 344, 'SOUND')}
${box(40, 360, 250, 'shared timeline', 'every pluck lands on a split')}
${arrow(290, 395, 320, 395)}
${box(320, 360, 250, 'Web Audio', 'pad · plucks · thunder · breath')}
${arrow(570, 395, 600, 395)}
${box(600, 360, 270, 'master', '−14 LUFS, −1.5 dBFS ceiling')}
${arrow(870, 395, 900, 395)}
${box(900, 360, 260, 'one-rule.mp4', '1080p · 60 fps · 45 s', true)}
${arrow(165, 280, 165, 300)}<path d="M165 300 L1030 300 L1030 355" stroke="${DIM}" stroke-width="1.5" fill="none" marker-end="url(#a)"/>
</svg>`;
  writeFileSync('docs/pipeline.svg', svg);
}
console.log('wrote docs/rule.svg, docs/pipeline.svg');
