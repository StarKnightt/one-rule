// Render individual frames straight from the page: pnpm frames 300 600 …
import { mkdirSync, writeFileSync } from 'node:fs';
import { open, grab } from './browser';

const frames = process.argv.slice(2).map(Number);
mkdirSync('build/stills', { recursive: true });
const { newPage, close } = await open();
const page = await newPage();
console.log('segments:', await page.evaluate(() => window.__segments));
for (const f of frames) {
  const t0 = performance.now();
  writeFileSync(`build/stills/f${String(f).padStart(4, '0')}.png`, await grab(page, f));
  console.log(`frame ${f} ${(performance.now() - t0).toFixed(0)}ms`);
}
await close();
