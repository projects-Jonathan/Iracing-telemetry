// Render the Unison logo to the PNG icons in public/ (tab icon + iPhone home-screen icon).
// Usage: npx -p puppeteer-core node scripts/make-icons.mjs [path-to-chrome]
// Edit LOGO below to change the icon, then re-run.
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#d0202b"/><path d="M6 22c4-10 8-12 11-6s6 4 9-6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
const OUT = new URL('../public/', import.meta.url);
const chrome = process.argv[2] ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const b = await puppeteer.launch({ executablePath: chrome, headless: true });
const p = await b.newPage();
for (const [name, size] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['apple-touch-icon.png', 180]]) {
  await p.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${LOGO.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(new URL(name, OUT), await p.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('wrote public/' + name);
}
await b.close();
