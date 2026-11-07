// Renders the home-screen icons in public/icons from the logo below (same art as public/favicon.svg).
// Run after changing the logo: npm run icons
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const BACKGROUND = '#244b4b';
// The island mark, drawn in a 64×64 box centered on (32, 32).
const MARK =
  '<path d="m32 10 20 12v23L32 56 12 45V22Z" fill="#eccb8f"/>' +
  '<path d="m20 39 12-17 12 17H20Z" fill="#4f8067"/>' +
  '<path d="m32 22 7 10-7-3-5 3Z" fill="#f7f5ee"/>' +
  '<path d="M29 39h6v9h-6Z" fill="#ca7655"/>';

/** A square icon. `rounded` keeps the favicon's corners; `scale` shrinks the mark toward the center. */
const svg = ({ size, rounded, scale }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">` +
  `<rect width="64" height="64" ${rounded ? 'rx="18"' : ''} fill="${BACKGROUND}"/>` +
  `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${MARK}</g></svg>`;

// iOS rounds corners itself and turns transparency black, so its icon is a full square.
// Android "maskable" icons get cropped to the launcher's shape, so the mark stays inside the middle 80%.
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 1 },
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.82 },
];

await mkdir('public/icons', { recursive: true });
// Same browser choice as playwright.config.ts: installed Chrome on a Mac, bundled Chromium elsewhere.
const browser = await chromium.launch(process.platform === 'darwin' ? { channel: 'chrome' } : {});
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } });
    await page.setContent(
      `<style>html,body{margin:0;overflow:hidden;background:transparent}svg{display:block}</style>${svg(icon)}`,
    );
    await page.locator('svg').screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
    await page.close();
    console.log(`public/icons/${icon.file} (${icon.size}×${icon.size})`);
  }
} finally {
  await browser.close();
}
