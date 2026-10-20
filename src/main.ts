import { buildTopology } from './lsystem';
import { buildForms } from './forms';
import { Renderer } from './render';
import { renderAudio, wavBase64 } from './audio';
import { DURATION, FPS } from './timeline';

declare global {
  interface Window {
    __ready: boolean;
    __segments: number;
    grabFrame: (frame: number) => string;
    renderAudioWav: () => Promise<string>;
  }
}

async function main() {
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  await document.fonts.load('300 26px Inter');
  const T = buildTopology();
  const forms = buildForms(T);
  const R = new Renderer(T, forms, ctx);

  window.__segments = T.n;
  window.grabFrame = (frame) => {
    R.draw(frame);
    return canvas.toDataURL('image/png');
  };
  window.renderAudioWav = async () => wavBase64(await renderAudio());
  window.__ready = true;

  // ?frame=N shows a still; ?play previews in real time with sound.
  const q = new URLSearchParams(location.search);
  if (q.has('frame')) return R.draw(Number(q.get('frame')));
  R.draw(0);
  if (!q.has('play')) return;
  const btn = document.createElement('button');
  btn.id = 'play';
  btn.textContent = 'play';
  document.body.append(btn);
  btn.onclick = async () => {
    btn.textContent = 'rendering sound…';
    const ac = new AudioContext();
    const src = ac.createBufferSource();
    src.buffer = await renderAudio();
    src.connect(ac.destination);
    const t0 = ac.currentTime + 0.1;
    src.start(t0);
    btn.remove();
    const tick = () => {
      const t = ac.currentTime - t0;
      if (t > DURATION) return;
      R.draw(Math.max(0, Math.floor(t * FPS)));
      requestAnimationFrame(tick);
    };
    tick();
  };
}

main();
