import { Topology } from './lsystem';
import { Form, ForestForm, HORIZON, W, H } from './forms';
import {
  FPS,
  FADE_OUT,
  GROW_DUR,
  HOLDS,
  LABELS,
  LIGHTNING_STRIKES,
  PULLBACK,
  ROOT_GROW_DUR,
  growStart,
  morphLocal,
  phaseAt,
} from './timeline';

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const FOREST = 5;
const LIGHTNING = 2;
const LUNGS = 4;

export class Renderer {
  private th: Float32Array;
  private len: Float32Array;
  private wd: Float32Array;
  private al: Float32Array;
  private wig: Float32Array;
  private dir: Float32Array;
  private x: Float32Array;
  private y: Float32Array;
  private lines: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private small: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private stars: number[];

  constructor(
    private T: Topology,
    private forms: Form[],
    private ctx: CanvasRenderingContext2D,
  ) {
    const n = T.n;
    this.th = new Float32Array(n);
    this.len = new Float32Array(n);
    this.wd = new Float32Array(n);
    this.al = new Float32Array(n);
    this.wig = new Float32Array(n);
    this.dir = new Float32Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.lines = document.createElement('canvas');
    this.lines.width = W;
    this.lines.height = H;
    this.lctx = this.lines.getContext('2d')!;
    this.small = document.createElement('canvas');
    this.small.width = W / 4;
    this.small.height = H / 4;
    this.sctx = this.small.getContext('2d')!;
    this.stars = [];
    for (let k = 0; k < 140; k++) {
      const h = (s: number) => {
        const v = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
        return v - Math.floor(v);
      };
      this.stars.push(h(1) * W, h(2) * 620, 0.3 + 0.9 * h(3), h(4) * 6.28);
    }
  }

  draw(frame: number) {
    const t = frame / FPS;
    const { T, forms, ctx } = this;
    const ph = phaseAt(t);
    const A = forms[ph.a];
    const B = forms[ph.b];
    const n = T.n;

    // weight of each form right now (for global look: colour, glow, sway…)
    const wt = new Float32Array(forms.length);
    const ug = ease(ph.u);
    wt[ph.a] += 1 - ug;
    wt[ph.b] += ug;

    // ── per-segment parameters ──
    const growing = ph.a === 0 && ph.b === 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      if (ph.a !== ph.b) s = ease(morphLocal(ph.u, T.gen[i]));
      this.th[i] = lerp(A.th[i], B.th[i], s);
      this.len[i] = lerp(A.len[i], B.len[i], s);
      this.wd[i] = lerp(A.w[i], B.w[i], s);
      // segments on their way out fade early, so long collapsing ones don't streak
      this.al[i] = lerp(A.a[i], B.a[i], B.a[i] < A.a[i] ? Math.min(1, Math.max(s, ph.u) * 3) : s);
      this.wig[i] = lerp(A.wig[i], B.wig[i], s);
      if (growing) {
        const g = T.gen[i];
        const g0 = growStart(g);
        const d = g === 0 ? ROOT_GROW_DUR : GROW_DUR;
        const p = clamp01((t - g0) / d);
        this.len[i] *= easeOut(p);
        this.wd[i] *= Math.min(1, p * 3);
      }
    }

    // wind
    let sway = 0;
    for (let f = 0; f < forms.length; f++) sway += wt[f] * forms[f].sway;
    if (sway > 0) {
      for (let i = 1; i < n; i++) {
        const k = 1 - T.budget[i] / 22;
        this.th[i] += sway * k * Math.sin(1.3 * t + 0.35 * T.depth[i] + 6.28 * T.rand[i * 4]);
      }
    }

    // ── forward kinematics ──
    const ox = lerp(A.ox, B.ox, ease(morphLocal(ph.u, 0)));
    const oy = lerp(A.oy, B.oy, ease(morphLocal(ph.u, 0)));
    for (let i = 0; i < n; i++) {
      const p = T.parent[i];
      const d = (p < 0 ? 0 : this.dir[p]) + this.th[i];
      this.dir[i] = d;
      const sx = p < 0 ? ox : this.x[p];
      const sy = p < 0 ? oy : this.y[p];
      this.x[i] = sx + this.len[i] * Math.cos(d);
      this.y[i] = sy + this.len[i] * Math.sin(d);
    }

    // ── camera ──
    // gentle push-in during every hold; the forest pulls all the way back.
    const holdZoom = (f: number, h: number) => (f === FOREST ? 1 : 1 + 0.035 * ease(clamp01(h)));
    let zoom: number;
    if (ph.a === ph.b) zoom = holdZoom(ph.a, ph.hold);
    else zoom = lerp(holdZoom(ph.a, 1), 1, ug);
    const breathe = wt[LUNGS] * 0.022 * Math.sin((2 * Math.PI * (t - HOLDS[LUNGS][0])) / 4.2);
    const Fo = forms[FOREST] as ForestForm;
    const e = ease(clamp01((t - PULLBACK[0]) / (PULLBACK[1] - PULLBACK[0])));
    const zc = Math.pow(Fo.zoom, 1 - e); // current forest scale
    const camK = zc / Fo.zoom;
    const camX = lerp(Fo.centerX, Fo.focusX, e);
    const camY = lerp(Fo.centerY, Fo.focusY, e);
    const applyCam = (c: CanvasRenderingContext2D) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.translate(camX, camY);
      c.scale(camK, camK);
      c.translate(-Fo.centerX, -Fo.centerY);
      c.translate(W / 2, H / 2 + 20);
      c.scale(zoom * (1 + breathe), zoom * (1 + breathe));
      c.translate(-W / 2, -H / 2 - 20);
    };

    // ── colour & light ──
    const col = [0, 0, 0];
    let glow = 0;
    let jag = 0;
    let meander = 0;
    for (let f = 0; f < forms.length; f++) {
      for (let c = 0; c < 3; c++) col[c] += wt[f] * forms[f].color[c];
      glow += wt[f] * forms[f].glow;
      jag += wt[f] * forms[f].jag;
      meander += wt[f] * forms[f].meander;
    }
    let flash = 0;
    for (const s of LIGHTNING_STRIKES) {
      if (t >= s) flash = Math.max(flash, Math.exp(-(t - s) * 7) * (s === LIGHTNING_STRIKES[0] ? 1 : 0.6));
    }
    flash *= wt[LIGHTNING];
    const flick = 1 + 0.6 * flash;

    // ── background ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, W, H);
    const dusk = wt[FOREST];
    if (dusk > 0) this.sky(dusk, camK, camX, camY, Fo, t);
    if (flash > 0.002) {
      ctx.fillStyle = `rgba(150,160,235,${0.22 * flash})`;
      ctx.fillRect(0, 0, W, H);
    }

    // ── segments, batched by quantised width & alpha ──
    const lc = this.lctx;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, W, H);
    applyCam(lc);
    const paths = new Map<number, Path2D>();
    const subdiv = jag > 0.02 || meander > 0.02;
    for (let i = 0; i < n; i++) {
      const L = this.len[i];
      // a short segment can't be fatter than it is long (no blobs mid-morph)
      const w = Math.min(this.wd[i], 0.6 * L + 0.6);
      const a = this.al[i];
      if (L < 0.25 || w < 0.05 || a < 0.02) continue;
      const wq = Math.min(240, Math.max(1, Math.round(w * 4)));
      const aq = Math.max(1, Math.round(a * 15));
      const key = wq * 16 + aq;
      let path = paths.get(key);
      if (!path) paths.set(key, (path = new Path2D()));
      const p = T.parent[i];
      const sx = p < 0 ? ox : this.x[p];
      const sy = p < 0 ? oy : this.y[p];
      path.moveTo(sx, sy);
      if (subdiv && L > 5) {
        const ex = this.x[i];
        const ey = this.y[i];
        const nx = -(ey - sy) / L;
        const ny = (ex - sx) / L;
        const sgn = T.rand[i * 4 + 1] < 0.5 ? -1 : 1;
        const K = 5;
        for (let m = 1; m < K; m++) {
          const f = m / K;
          const r = Math.sin((i * 5 + m) * 12.9898) * 43758.5453;
          const rj = (r - Math.floor(r)) * 2 - 1;
          const off = L * this.wig[i] * (jag * rj * 0.2 + meander * sgn * Math.sin(Math.PI * f) * 0.16);
          path.lineTo(sx + (ex - sx) * f + nx * off, sy + (ey - sy) * f + ny * off);
        }
        path.lineTo(ex, ey);
      } else path.lineTo(this.x[i], this.y[i]);
    }
    lc.lineCap = 'round';
    lc.lineJoin = 'round';
    const rgb = `rgb(${col.map((c) => Math.round(Math.min(255, c * flick))).join(',')})`;
    lc.strokeStyle = rgb;
    for (const [key, path] of paths) {
      lc.lineWidth = Math.max(0.5, (key >> 4) / 4);
      lc.globalAlpha = (key & 15) / 15;
      lc.stroke(path);
    }
    lc.globalAlpha = 1;

    // ── bloom ──
    glow *= 1 + 1.5 * flash;
    if (glow > 0.01) {
      const sc = this.sctx;
      sc.clearRect(0, 0, W / 4, H / 4);
      sc.filter = 'blur(3px)';
      sc.drawImage(this.lines, 0, 0, W / 4, H / 4);
      sc.filter = 'none';
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, glow);
      ctx.drawImage(this.small, 0, 0, W, H);
      if (glow > 1) {
        ctx.globalAlpha = glow - 1;
        ctx.drawImage(this.small, 0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(this.lines, 0, 0);

    // ── label ──
    for (const l of LABELS) {
      const k = Math.min(clamp01((t - l.t0) / 0.6), clamp01((l.t1 - t) / 0.6));
      if (k <= 0) continue;
      ctx.font = '300 26px Inter, sans-serif';
      ctx.letterSpacing = '3px';
      ctx.fillStyle = `rgba(236,236,240,${0.66 * ease(k)})`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(l.text, 76, H - 68);
      ctx.letterSpacing = '0px';
    }

    // ── fade out ──
    const fo = clamp01((t - FADE_OUT[0]) / (FADE_OUT[1] - FADE_OUT[0]));
    if (fo > 0) {
      ctx.fillStyle = `rgba(0,0,0,${ease(fo)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private sky(k: number, camK: number, camX: number, camY: number, Fo: ForestForm, t: number) {
    const ctx = this.ctx;
    // where the world horizon sits on screen right now
    const hz = (HORIZON - Fo.focusY) * Fo.zoom + Fo.centerY;
    const hy = (hz - Fo.centerY) * camK + camY;
    const hx = (960 - Fo.focusX) * Fo.zoom + Fo.centerX;
    const sx = (hx - Fo.centerX) * camK + camX;
    ctx.globalAlpha = k;
    const g = ctx.createLinearGradient(0, hy - 1100, 0, hy);
    g.addColorStop(0, '#141831');
    g.addColorStop(0.45, '#262444');
    g.addColorStop(0.75, '#5a3348');
    g.addColorStop(0.92, '#b8603f');
    g.addColorStop(1, '#e79a58');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, Math.max(0, hy));
    const r = ctx.createRadialGradient(sx + 120, hy, 0, sx + 120, hy, 900);
    r.addColorStop(0, 'rgba(255,190,120,0.45)');
    r.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, Math.max(0, hy));
    ctx.fillStyle = '#06060a';
    ctx.fillRect(0, Math.max(0, hy), W, H);
    // stars above the glow
    const s = this.stars;
    for (let i = 0; i < s.length; i += 4) {
      const y = s[i + 1];
      if (y > hy - 380) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 1.7 + s[i + 3]);
      ctx.globalAlpha = k * tw * 0.5 * clamp01((hy - 380 - y) / 200);
      ctx.fillStyle = '#e8e6f4';
      ctx.fillRect(s[i], y, s[i + 2] + 0.6, s[i + 2] + 0.6);
    }
    ctx.globalAlpha = 1;
  }
}
