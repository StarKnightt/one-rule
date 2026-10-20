// Serve the built page and drive it with headless Chromium.
import { preview } from 'vite';
import { chromium, type Browser, type Page } from 'playwright';

export async function open(): Promise<{ browser: Browser; newPage: () => Promise<Page>; close: () => Promise<void> }> {
  const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
  const browser = await chromium.launch({
    args: ['--disable-gpu', '--force-color-profile=srgb', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'],
  });
  const newPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('page error:', e));
    await page.goto('http://localhost:4173/');
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60_000 });
    return page;
  };
  const close = async () => {
    await browser.close();
    await new Promise<void>((r) => server.httpServer.close(() => r()));
  };
  return { browser, newPage, close };
}

export async function grab(page: Page, frame: number): Promise<Buffer> {
  const url = await page.evaluate((f) => window.grabFrame(f), frame);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}
