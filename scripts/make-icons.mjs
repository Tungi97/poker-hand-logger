// Renders the PNG app icons from public/icon.svg with a locally installed Chrome.
// Usage: npm run icons   (set CHROME_PATH if Chrome isn't in the default macOS location)
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const svg = readFileSync('public/icon.svg', 'utf8');
// Android maskable icons may be cropped to a circle of 80%: pull everything but the background in a bit.
const maskable = svg
  .replace(/(<rect[^>]*\/>)/, '$1<g transform="translate(256 256) scale(0.84) translate(-256 -256)">')
  .replace('</svg>', '</g></svg>');

const targets = [
  ['public/apple-touch-icon.png', 180, svg], // iOS rounds the corners itself: keep it full-bleed
  ['public/icon-192.png', 192, svg],
  ['public/icon-512.png', 512, svg],
  ['public/icon-maskable-512.png', 512, maskable],
];

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage();
for (const [out, size, source] of targets) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.screenshot({ path: out });
  console.log('wrote', out);
}
await browser.close();
