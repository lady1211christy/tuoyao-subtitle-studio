// 逐格把 overlay 截成透明 PNG，再用 ffmpeg 疊回影片
import puppeteer from 'puppeteer';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './media.mjs';

const FPS = 24000 / 1001;

export async function renderVideo({ overlayUrl, dir, clip, duration, out, onProgress = () => {} }) {
  const frames = join(dir, 'frames');
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(overlayUrl, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.overlayReady === true);
    await page.evaluate(() => document.fonts.ready);
    const total = Math.ceil(duration * FPS);
    for (let i = 0; i < total; i++) {
      await page.evaluate(t => window.render(t), i / FPS);
      await page.screenshot({ path: join(frames, `f_${String(i).padStart(5, '0')}.png`), omitBackground: true });
      if (i % 12 === 0) onProgress({ stage: 'frames', done: i, total });
    }
  } finally {
    await browser.close();
  }

  onProgress({ stage: 'encode' });
  await run('ffmpeg', ['-hide_banner', '-y', '-i', clip, '-framerate', '24000/1001', '-i', join(frames, 'f_%05d.png'),
    '-filter_complex', '[0:v]fps=24000/1001[b];[b][1:v]overlay=0:0:eof_action=repeat,format=yuv420p[v]',
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]);
  await rm(frames, { recursive: true, force: true });
}
