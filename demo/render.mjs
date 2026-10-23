// 逐格把 overlay.html 截成透明 PNG
// 用法：node render.mjs <輸出資料夾> [--at 2.4,4.4]   （--at 只渲染指定秒數，做樣張用）
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/Users/tingting/node_modules/');
const puppeteer = require('puppeteer');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || 'frames');
const atIdx = process.argv.indexOf('--at');
const only = atIdx > 0 ? process.argv[atIdx + 1].split(',').map(Number) : null;
const FPS = 24000 / 1001;
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto(pathToFileURL(resolve(here, 'overlay.html')).href, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DEMO.duration);

const times = only ?? Array.from({ length: Math.ceil(duration * FPS) }, (_, i) => i / FPS);
for (const [i, t] of times.entries()) {
  await page.evaluate(t => window.render(t), t);
  const name = only ? `still_${t}.png` : `f_${String(i).padStart(4, '0')}.png`;
  await page.screenshot({ path: resolve(out, name), omitBackground: true });
  if (!only && i % 48 === 0) console.log(`frame ${i}/${times.length}`);
}
await browser.close();
console.log(`done: ${times.length} frames → ${out}`);
