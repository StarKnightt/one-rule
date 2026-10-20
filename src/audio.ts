// All sound is synthesized: oscillators, Karplus–Strong plucks and noise,
// mixed in an OfflineAudioContext so it renders identically every time.
import { ROOT } from './lsystem';
import { DURATION, HOLDS, LIGHTNING_STRIKES, plucks } from './timeline';

export const SR = 48000;

// Just-intonation chords, as ratios of A2 (110 Hz). One per form.
const CHORDS = [
  [1, 3 / 2, 2, 5 / 2, 3], // tree — A
  [5 / 6, 5 / 4, 5 / 3, 2, 5 / 2], // fern — F♯m
  [2 / 3, 1, 4 / 3, 5 / 3, 5 / 2], // lightning — Dmaj7
  [3 / 4, 9 / 8, 3 / 2, 2, 9 / 4], // river delta — Esus
  [5 / 8, 15 / 16, 5 / 4, 3 / 2, 15 / 8], // lungs — C♯m
  [1 / 2, 3 / 4, 1, 3 / 2, 9 / 4, 5 / 2], // forest — A add9
].map((c) => c.map((r) => r * 110));

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Karplus–Strong: a burst of filtered noise circulating in an averaging delay line.
function pluckBuffer(ctx: BaseAudioContext, f: number, seed: number) {
  const dur = 3.2;
  const buf = ctx.createBuffer(1, Math.floor(SR * dur), SR);
  const out = buf.getChannelData(0);
  const N = Math.max(2, Math.floor(SR / f - 0.5));
  const line = new Float32Array(N);
  const rand = mulberry(seed);
  for (let k = 0; k < N; k++) line[k] = rand() * 2 - 1;
  for (let pass = 0; pass < 3; pass++)
    for (let k = 1; k < N; k++) line[k] = 0.5 * (line[k] + line[k - 1]); // soften the attack
  const damp = Math.min(0.9985, 1 - f / 150000);
  let p = 0;
  let lp = 0;
  for (let k = 0; k < out.length; k++) {
    const v = line[p];
    const nx = line[(p + 1) % N];
    line[p] = 0.5 * (v + nx) * damp;
    p = (p + 1) % N;
    lp += 0.35 * (v - lp);
    out[k] = lp * Math.min(1, k / (SR * 0.004));
  }
  return { buf, rate: (f * (N + 0.5)) / SR };
}

function noiseBuffer(ctx: BaseAudioContext, dur: number, seed: number, brown: boolean) {
  const buf = ctx.createBuffer(1, Math.floor(SR * dur), SR);
  const d = buf.getChannelData(0);
  const rand = mulberry(seed);
  let b = 0;
  for (let k = 0; k < d.length; k++) {
    const w = rand() * 2 - 1;
    if (brown) {
      b = (b + 0.02 * w) * 0.998;
      d[k] = b * 3.5;
    } else d[k] = w;
  }
  return buf;
}

// Synthetic hall: decorrelated noise with an exponential tail that darkens over time.
function impulse(ctx: BaseAudioContext) {
  const dur = 4.5;
  const buf = ctx.createBuffer(2, Math.floor(SR * dur), SR);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const rand = mulberry(77 + c * 1000);
    let y = 0;
    for (let k = 0; k < d.length; k++) {
      const t = k / SR;
      const coef = 0.55 * Math.exp(-t * 1.4) + 0.04;
      y += coef * (rand() * 2 - 1 - y);
      d[k] = t < 0.02 ? 0 : y * Math.exp(-t / 0.85);
    }
  }
  return buf;
}

const morphMid = (i: number) => (HOLDS[i][1] + HOLDS[i + 1][0]) / 2;

export async function renderAudio(): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, SR * DURATION, SR);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.02;
  comp.release.value = 0.3;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.3);
  master.gain.setValueAtTime(0.9, 42.6);
  master.gain.linearRampToValueAtTime(0, DURATION - 0.05);
  master.connect(comp);

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  verb.connect(wet).connect(master);

  // ── pad ──
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.6;
  const steps = 900;
  const curve = new Float32Array(steps);
  for (let k = 0; k < steps; k++) {
    const t = (k / (steps - 1)) * DURATION;
    const lift = 450 * Math.exp(-(((t - 17.5) / 3) ** 2)); // lightning opens the filter
    curve[k] = 420 + 520 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 13)) + lift;
  }
  lp.frequency.setValueCurveAtTime(curve, 0, DURATION);
  const pad = ctx.createGain();
  pad.gain.value = 0.16;
  lp.connect(pad);
  pad.connect(master);
  const padSend = ctx.createGain();
  padSend.gain.value = 0.5;
  pad.connect(padSend).connect(verb);

  CHORDS.forEach((notes, c) => {
    const g = ctx.createGain();
    const t0 = c === 0 ? 0.2 : morphMid(c - 1) - 1.3;
    const t1 = c === CHORDS.length - 1 ? DURATION : morphMid(c) + 1.3;
    const fadeIn = c === 0 ? 4 : 2.6;
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + fadeIn);
    if (t1 < DURATION) {
      g.gain.setValueAtTime(1, t1 - 2.6);
      g.gain.linearRampToValueAtTime(0, t1);
    }
    g.connect(lp);
    notes.forEach((f, k) => {
      const voice = ctx.createGain();
      voice.gain.value = (0.8 / notes.length) * (f < 100 ? 1.2 : f > 300 ? 0.6 : 1);
      // slow breathing of each voice at its own rate
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + 0.031 * k + 0.017 * c;
      const depth = ctx.createGain();
      depth.gain.value = voice.gain.value * 0.35;
      lfo.connect(depth).connect(voice.gain);
      lfo.start(t0);
      lfo.stop(t1);
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det + (k % 2 ? 1.5 : -1.5);
        o.connect(voice);
        o.start(t0);
        o.stop(t1);
      }
      const s = ctx.createOscillator();
      s.type = 'sine';
      s.frequency.value = f / 2;
      const sg = ctx.createGain();
      sg.gain.value = k === 0 ? 0.6 : 0;
      s.connect(sg).connect(voice);
      s.start(t0);
      s.stop(t1);
      voice.connect(g);
    });
  });

  // ── plucks: one per split ──
  const cache = new Map<number, { buf: AudioBuffer; rate: number }>();
  const pSend = ctx.createGain();
  pSend.gain.value = 0.7;
  pSend.connect(verb);
  for (const p of plucks()) {
    const scale = [...CHORDS[p.chord]].sort((a, b) => a - b);
    const ladder = [2, 4, 8].flatMap((m) => scale.map((f) => f * m));
    const f = ladder[Math.min(ladder.length - 1, Math.round((p.gen * (ladder.length - 1)) / (ROOT - 1)))];
    let pb = cache.get(f);
    if (!pb) cache.set(f, (pb = pluckBuffer(ctx, f, Math.round(f * 10))));
    const src = ctx.createBufferSource();
    src.buffer = pb.buf;
    src.playbackRate.value = pb.rate;
    const g = ctx.createGain();
    g.gain.value = 0.42 * p.gain * (f > 900 ? 0.7 : 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0.55 * Math.sin(p.gen * 2.1 + p.chord);
    src.connect(g).connect(pan);
    pan.connect(master);
    pan.connect(pSend);
    src.start(p.t);
  }

  // ── thunder after each strike ──
  LIGHTNING_STRIKES.forEach((s, k) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 5, 900 + k, true);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = ctx.createGain();
    const t = s + 0.35 + 0.2 * k;
    const peak = k === 0 ? 0.2 : 0.1;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.25);
    g.gain.setTargetAtTime(0, t + 0.4, 1.1);
    src.connect(f).connect(g).connect(master);
    g.connect(verb);
    src.start(t);
  });

  // ── breath under the lungs ──
  {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 9, 4242, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    const [s, e] = HOLDS[4];
    const n = 300;
    const env = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const t = s - 1 + (k / (n - 1)) * (e - s + 2);
      const fade = Math.min(1, Math.max(0, (t - (s - 1)) / 1.5), Math.max(0, (e + 1 - t) / 1.5));
      const cyc = 0.5 + 0.5 * Math.sin((2 * Math.PI * (t - s)) / 4.2);
      env[k] = 0.05 * fade * cyc * cyc;
    }
    g.gain.setValueAtTime(0, 0);
    g.gain.setValueCurveAtTime(env, s - 1, e - s + 2);
    src.connect(bp).connect(g).connect(master);
    src.start(s - 1);
  }

  return ctx.startRendering();
}

// 32-bit float WAV, base64 so it can cross the Playwright bridge.
export function wavBase64(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const bytes = new ArrayBuffer(44 + len * ch * 4);
  const v = new DataView(bytes);
  const str = (o: number, s: string) => [...s].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + len * ch * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 3, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 4, true);
  v.setUint16(32, ch * 4, true);
  v.setUint16(34, 32, true);
  str(36, 'data');
  v.setUint32(40, len * ch * 4, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let k = 0; k < len; k++)
    for (let c = 0; c < ch; c++) {
      v.setFloat32(o, data[c][k], true);
      o += 4;
    }
  const u8 = new Uint8Array(bytes);
  let s = '';
  for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode(...u8.subarray(k, k + 0x8000));
  return btoa(s);
}
