// Renders the home-screen icons in public/icons, and public/favicon.svg, from the art below.
// Run after changing it: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

/** Corners of a pointy-top hex of radius `r` centered at (x, y), as an SVG points list. */
const hex = (x, y, r) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

// Everything is drawn in a 512×512 box. Three tiles meet at (256, 298).
const R = 80;
const TOP = { x: 256, y: 218 };
const LEFT = { x: 256 - (Math.sqrt(3) / 2) * R, y: 338 };
const RIGHT = { x: 256 + (Math.sqrt(3) / 2) * R, y: 338 };

const DEFS = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2a1a6e"/>
    <stop offset="0.32" stop-color="#8b2a8f"/>
    <stop offset="0.52" stop-color="#ff5a3c"/>
    <stop offset="0.62" stop-color="#ffb43a"/>
  </linearGradient>
  <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#fff6c2"/>
    <stop offset="0.55" stop-color="#ffd54a"/>
    <stop offset="1" stop-color="#ff9a2e"/>
  </radialGradient>
  <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffe17a" stop-opacity="0.75"/>
    <stop offset="1" stop-color="#ff7a3c" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#16b7d8"/>
    <stop offset="1" stop-color="#05396b"/>
  </linearGradient>
  <linearGradient id="lava" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff07a"/>
    <stop offset="1" stop-color="#ff4a12"/>
  </linearGradient>
  <linearGradient id="wheat" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffd84a"/>
    <stop offset="1" stop-color="#eaa21c"/>
  </linearGradient>
  <linearGradient id="forest" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4fbf4a"/>
    <stop offset="1" stop-color="#1d7a3a"/>
  </linearGradient>
</defs>`;

/** Sunset sky, the sun on the horizon, and the sea: fills the whole square. */
const BACKDROP = `<rect width="512" height="512" fill="url(#sky)"/>
<circle cx="256" cy="300" r="230" fill="url(#halo)"/>
<circle cx="256" cy="300" r="132" fill="url(#sun)"/>
<rect y="300" width="512" height="212" fill="url(#sea)"/>
<path d="M0 300h512" stroke="#ffe9a8" stroke-width="5" opacity="0.8"/>
<g fill="none" stroke="#bff3ff" stroke-width="7" stroke-linecap="round" opacity="0.55">
  <path d="M40 430q20-14 40 0t40 0"/><path d="M372 470q20-14 40 0t40 0"/><path d="M400 395q16-11 32 0t32 0"/>
</g>`;

/** Pine trees on the forest tile. */
const pine = (x, y, s) =>
  `<path d="M${x} ${y - 30 * s}l${22 * s} ${34 * s}h-${44 * s}Z" fill="#0f5a2c"/>` +
  `<path d="M${x} ${y - 12 * s}l${26 * s} ${36 * s}h-${52 * s}Z" fill="#11612f"/>` +
  `<path d="M${x - 5 * s} ${y + 24 * s}h${10 * s}v${12 * s}h-${10 * s}Z" fill="#6b3a1c"/>`;
/** A stalk of wheat on the wheat tile. */
const stalk = (x, y) =>
  `<path d="M${x} ${y + 34}V${y - 26}" stroke="#a5620c" stroke-width="5" stroke-linecap="round"/>` +
  [0, 1, 2, 3]
    .map(
      i =>
        `<ellipse cx="${x - 7}" cy="${y - 20 + i * 12}" rx="6" ry="10" transform="rotate(-30 ${x - 7} ${y - 20 + i * 12})" fill="#fff1a8"/>` +
        `<ellipse cx="${x + 7}" cy="${y - 20 + i * 12}" rx="6" ry="10" transform="rotate(30 ${x + 7} ${y - 20 + i * 12})" fill="#fff1a8"/>`,
    )
    .join('');

/** The island: three tiles on a sandy shore, a volcano, a forest, wheat, and a settlement. */
const ISLAND = `<g>
  <polygon points="${hex(TOP.x, TOP.y + 6, R + 14)}" fill="#04375a" opacity="0.35"/>
  <polygon points="${hex(LEFT.x, LEFT.y + 6, R + 14)}" fill="#04375a" opacity="0.35"/>
  <polygon points="${hex(RIGHT.x, RIGHT.y + 6, R + 14)}" fill="#04375a" opacity="0.35"/>
  <polygon points="${hex(TOP.x, TOP.y, R + 12)}" fill="#f6d98f"/>
  <polygon points="${hex(LEFT.x, LEFT.y, R + 12)}" fill="#f6d98f"/>
  <polygon points="${hex(RIGHT.x, RIGHT.y, R + 12)}" fill="#f6d98f"/>
  <polygon points="${hex(LEFT.x, LEFT.y, R - 3)}" fill="url(#forest)" stroke="#fff3cf" stroke-width="5"/>
  <polygon points="${hex(RIGHT.x, RIGHT.y, R - 3)}" fill="url(#wheat)" stroke="#fff3cf" stroke-width="5"/>
  <polygon points="${hex(TOP.x, TOP.y, R - 3)}" fill="#3b2f45" stroke="#fff3cf" stroke-width="5"/>
  <circle cx="${TOP.x}" cy="${TOP.y - 22}" r="44" fill="url(#halo)"/>
  <path d="M${TOP.x - 60} ${TOP.y + 46}Q${TOP.x - 34} ${TOP.y + 4} ${TOP.x - 18} ${TOP.y - 22}H${TOP.x + 18}Q${TOP.x + 34} ${TOP.y + 4} ${TOP.x + 60} ${TOP.y + 46}Z" fill="#6a5070" stroke="#2a2030" stroke-width="3" stroke-linejoin="round"/>
  <path d="M${TOP.x - 36} ${TOP.y + 46}Q${TOP.x - 20} ${TOP.y + 6} ${TOP.x - 10} ${TOP.y - 22}H${TOP.x + 2}Q${TOP.x - 8} ${TOP.y + 10} ${TOP.x - 12} ${TOP.y + 46}Z" fill="#7d6383"/>
  <ellipse cx="${TOP.x}" cy="${TOP.y - 22}" rx="19" ry="7" fill="url(#lava)"/>
  <path d="M${TOP.x - 8} ${TOP.y - 18}q-6 18-18 26t-8 26M${TOP.x + 9} ${TOP.y - 18}q4 16 14 24t6 30" fill="none" stroke="url(#lava)" stroke-width="7" stroke-linecap="round"/>
  <circle cx="${TOP.x - 6}" cy="${TOP.y - 48}" r="12" fill="#c9b8d6" opacity="0.9"/>
  <circle cx="${TOP.x + 14}" cy="${TOP.y - 62}" r="15" fill="#d9cce2" opacity="0.8"/>
  <circle cx="${TOP.x + 2}" cy="${TOP.y - 78}" r="10" fill="#ece3f2" opacity="0.7"/>
  <circle cx="${TOP.x - 22}" cy="${TOP.y - 40}" r="3.5" fill="#ffd54a"/>
  <circle cx="${TOP.x + 26}" cy="${TOP.y - 38}" r="3" fill="#ff8a2e"/>
  <circle cx="${TOP.x + 18}" cy="${TOP.y - 50}" r="2.5" fill="#ffe97a"/>
  ${pine(LEFT.x - 22, LEFT.y - 4, 0.9)}${pine(LEFT.x + 22, LEFT.y + 6, 1)}
  ${stalk(RIGHT.x - 20, RIGHT.y)}${stalk(RIGHT.x + 18, RIGHT.y + 6)}
  <g transform="translate(256 300)">
    <path d="M-24 2-2-20 2-20 24 2V30H-24Z" fill="#e3342c" stroke="#fff6dc" stroke-width="6" stroke-linejoin="round"/>
    <path d="M-6 30V12h12v18" fill="#8e1b16"/>
  </g>
</g>`;

/** A ship with white sails and a red pennant, off the island's shore. */
const SHIP = `<g transform="translate(104 420) scale(1.25)">
  <path d="M-46 0h92l-16 26h-60Z" fill="#7a3d1a" stroke="#fff6dc" stroke-width="4" stroke-linejoin="round"/>
  <path d="M0 2V-74" stroke="#4a240e" stroke-width="6" stroke-linecap="round"/>
  <path d="M5-68q40 28 2 62Z" fill="#fffaf0" stroke="#4a240e" stroke-width="3" stroke-linejoin="round"/>
  <path d="M-5-60q-32 24-2 54Z" fill="#f1e6cc" stroke="#4a240e" stroke-width="3" stroke-linejoin="round"/>
  <path d="M0-74l26 8-26 8Z" fill="#e3342c"/>
</g>`;

/**
 * A square icon. `rounded` keeps the browser-tab corners; `scale` shrinks the island and ship toward
 * the center (the sky and sea still fill the square).
 */
const svg = ({ size, rounded, scale }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${size ? ` width="${size}" height="${size}"` : ''}>` +
  DEFS +
  (rounded
    ? '<clipPath id="corners"><rect width="512" height="512" rx="128"/></clipPath><g clip-path="url(#corners)">'
    : '<g>') +
  BACKDROP +
  `<g transform="translate(256 290) scale(${scale}) translate(-256 -290)">${ISLAND}${SHIP}</g>` +
  '</g></svg>';

// iOS rounds corners itself and turns transparency black, so its icon is a full square.
// Android "maskable" icons get cropped to the launcher's shape, so the art stays inside the middle 80%.
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 1.12 },
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1.12 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1.12 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.8 },
];

await mkdir('public/icons', { recursive: true });
await writeFile('public/favicon.svg', `${svg({ rounded: true, scale: 1.12 })}\n`);
console.log('public/favicon.svg');
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
