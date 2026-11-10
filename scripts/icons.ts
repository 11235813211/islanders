// Generate install icons and favicon from the same React artwork as the game: npm run icons.
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import type { AppIcon, AppIconOptions } from '../src/art/app-icon.tsx';

// Vite handles the game's TSX imports without adding a separate compiler or duplicating the art.
const vite = await createServer({
  configFile: false,
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});
let Icon: typeof AppIcon;
try {
  ({ AppIcon: Icon } = await vite.ssrLoadModule('/src/art/app-icon.tsx'));
} finally {
  await vite.close();
}

const svg = (options: AppIconOptions) => renderToStaticMarkup(createElement(Icon, options)).replace(/></g, '>\n<');

// iOS supplies its own rounded corners; maskable Android icons also require a fully opaque square.
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192, rounded: true },
  { file: 'icon-512.png', size: 512, rounded: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

await mkdir('public/icons', { recursive: true });
await writeFile('public/favicon.svg', `${svg({ rounded: true })}\n`);
console.log('public/favicon.svg');

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
