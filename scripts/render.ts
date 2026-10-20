// Deterministic offline render: every frame is drawn from its index alone,
// captured as PNG and piped to ffmpeg; the soundtrack is rendered offline in
// the same page, loudness-normalised to −14 LUFS and muxed in.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { cpus } from 'node:os';
import { open, grab } from './browser';
import { FPS, FRAMES } from '../src/timeline';

const OUT = 'output/one-rule.mp4';
const WORKERS = Number(process.env.WORKERS ?? Math.max(1, Math.min(4, cpus().length - 1)));
const LIMIT = Number(process.env.FRAMES ?? FRAMES);
mkdirSync('build', { recursive: true });
mkdirSync('output', { recursive: true });

const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

const { newPage, close } = await open();

// ── sound ──
console.log('rendering audio…');
const page0 = await newPage();
const wav = await page0.evaluate(() => window.renderAudioWav());
writeFileSync('build/audio-raw.wav', Buffer.from(wav, 'base64'));
await page0.close();

// Mastering to −14 LUFS integrated: measure, apply make-up gain into a
// look-ahead limiter (ceiling −1.5 dBFS), re-measure, then trim the residual
// with a plain linear gain. No dynamic loudnorm, so the mix stays as written.
const lufs = (file: string) => {
  const err = spawnSyncStderr(['-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const sum = err.slice(err.lastIndexOf('Summary:'));
  return { I: Number(sum.match(/I:\s+(-?[\d.]+) LUFS/)![1]), TP: Number(sum.match(/Peak:\s+(-?[\d.]+) dBFS/)![1]) };
};
const raw = lufs('build/audio-raw.wav');
console.log(`raw mix: ${raw.I} LUFS, true peak ${raw.TP} dBFS`);
let gain = -14 - raw.I;
for (let pass = 0; pass < 3; pass++) {
  ff(['-i', 'build/audio-raw.wav', '-af', `volume=${gain.toFixed(3)}dB,alimiter=limit=0.84:attack=5:release=80:level=false,aresample=48000`, '-c:a', 'pcm_s24le', 'build/audio.wav']);
  const got = lufs('build/audio.wav');
  console.log(`  pass ${pass + 1}: ${got.I} LUFS, true peak ${got.TP} dBFS`);
  if (Math.abs(got.I + 14) < 0.15) break;
  gain += -14 - got.I;
}

function spawnSyncStderr(args: string[]): string {
  return spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8' }).stderr;
}

// ── picture: contiguous chunks, one page + one encoder per worker ──
const chunk = Math.ceil(LIMIT / WORKERS);
const t0 = performance.now();
let done = 0;
const segs = await Promise.all(
  [...Array(WORKERS)].map(async (_, w) => {
    const from = w * chunk;
    const to = Math.min(LIMIT, from + chunk);
    const file = `build/seg-${w}.mkv`;
    const page = await newPage();
    const enc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      // lossless RGB intermediate; the single delivery encode happens below
      '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'rgb24', '-threads', '2', file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const exited = new Promise<void>((res, rej) => enc.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)))));
    for (let f = from; f < to; f++) {
      const png = await grab(page, f);
      if (!enc.stdin.write(png)) await new Promise((r) => enc.stdin.once('drain', r));
      if (++done % 120 === 0) {
        const el = (performance.now() - t0) / 1000;
        console.log(`${done}/${LIMIT} frames · ${(done / el).toFixed(1)} fps · eta ${((LIMIT - done) / (done / el)).toFixed(0)}s`);
      }
    }
    enc.stdin.end();
    await exited;
    await page.close();
    return file;
  }),
);
await close();

writeFileSync('build/segments.txt', segs.map((s) => `file '${s.replace('build/', '')}'`).join('\n'));

// Delivery encode: two-pass x264 sized to fill TARGET_MB (default 96 MB, under
// GitHub's 100 MiB per-file cap) with as much picture as it will hold.
const TARGET_MB = Number(process.env.TARGET_MB ?? 96);
const AUDIO_BPS = 320_000;
const secs = LIMIT / FPS;
const videoBps = Math.floor(((TARGET_MB * 1e6 * 8) / secs - AUDIO_BPS) * 0.985);
console.log(`encoding at ${(videoBps / 1e6).toFixed(2)} Mbps video for a ${TARGET_MB} MB file`);
const input = ['-f', 'concat', '-safe', '0', '-i', 'build/segments.txt'];
const x264 = [
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'veryslow', '-tune', 'film', '-profile:v', 'high', '-level', '4.2',
  '-b:v', String(videoBps), '-maxrate', String(Math.round(videoBps * 2)), '-bufsize', String(Math.round(videoBps * 4)),
  '-g', '120', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-passlogfile', 'build/x264pass',
];
ff([...input, ...x264, '-pass', '1', '-an', '-f', 'null', '-']);
ff([...input, '-i', 'build/audio.wav', ...x264, '-pass', '2', '-map', '0:v', '-map', '1:a',
  '-c:a', 'aac', '-b:a', String(AUDIO_BPS), '-ar', '48000', '-t', String(secs), '-movflags', '+faststart', OUT]);
for (const s of segs) rmSync(s);
const fin = lufs(OUT);
console.log(`wrote ${OUT} in ${((performance.now() - t0) / 1000).toFixed(0)}s · final ${fin.I} LUFS · true peak ${fin.TP} dBFS`);
