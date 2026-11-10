import { expect, test } from '@playwright/test';

// Chrome's own installability check: the same one that decides whether Android offers "Install app".
test('Chrome reports the site as installable, with the home-screen icons loading', async ({ page }) => {
  await page.goto('/');
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // Test browsers are private windows, which Chrome never installs from; every other check must pass.
  const problems = installabilityErrors.map(error => error.errorId).filter(id => id !== 'in-incognito');
  expect(problems).toEqual([]);
  for (const path of [
    'icons/apple-touch-icon.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()['content-type'], path).toContain('image/png');
  }
  await cdp.detach();
});

const ICON_PREVIEWS = [
  { label: 'iOS', file: 'apple-touch-icon.png', mask: 'ios' },
  { label: 'App icon', file: 'icon-192.png', mask: '' },
  { label: 'Android circle', file: 'icon-maskable-512.png', mask: 'circle' },
  { label: 'Android squircle', file: 'icon-maskable-512.png', mask: 'squircle' },
];

/** Real launcher sizes expose details that disappear when an icon is only reviewed large. */
function previewRow(size: number) {
  return `<section class="previews">
    ${ICON_PREVIEWS.map(
      ({ label, file, mask }) => `<figure>
        <div class="icon-space"><img src="/icons/${file}" width="${size}" height="${size}"
          class="${mask}" alt="${label}, ${size} pixels" /></div>
        <figcaption>${label}<span>${size} px</span></figcaption>
      </figure>`,
    ).join('')}
  </section>`;
}

// Uses the generated public assets through the local server, including the platform-specific crops.
test('render home-screen icons at launcher sizes for review', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.goto('/');
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8" />
    <title>App icon review</title><style>
      *{box-sizing:border-box}body{margin:0;padding:32px;background:#e8eceb;color:#243c43;font:14px Arial,sans-serif}
      h1{margin:0 0 24px;font-size:22px;font-weight:600}h2{margin:0 0 18px;font-size:15px;font-weight:600}
      main{display:grid;grid-template-columns:450px 1fr;gap:28px}
      .large,.small{padding:24px;border:1px solid #cdd8d7;border-radius:16px;background:#f5f7f5}
      .large img{display:block;width:400px;height:400px;max-width:100%;object-fit:contain}
      .large p{margin:18px 0 0;color:#5b6f74;font-size:12px}
      .previews{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:20px 8px;
        background:linear-gradient(160deg,#91a8af,#cccbc0);border-radius:12px;margin-bottom:20px}
      figure{margin:0;text-align:center;min-width:0}.icon-space{height:96px;display:flex;align-items:center;justify-content:center}
      img{object-fit:contain}figcaption{font-size:11px;line-height:1.4;margin-top:10px;color:#18343f}
      figcaption span{display:block;font-size:10px;color:#37515a}.ios{border-radius:22.4%}
      .circle{clip-path:circle(50%)}.squircle{clip-path:url(#squircle-mask)}
      .masks{position:absolute;width:0;height:0;overflow:hidden}
    </style></head><body>
      <svg class="masks" aria-hidden="true"><defs><clipPath id="squircle-mask" clipPathUnits="objectBoundingBox">
        <path d="M.5 0C.94 0 1 .06 1 .5S.94 1 .5 1 0 .94 0 .5 .06 0 .5 0Z" />
      </clipPath></defs></svg>
      <h1>App icon review</h1><main>
        <section class="large"><h2>Large icon</h2>
          <img src="/icons/icon-512.png" width="400" height="400" alt="Large app icon" />
          <p>512 px source shown at 400 px</p>
        </section>
        <section class="small"><h2>Home-screen sizes and launcher crops</h2>${previewRow(60)}${previewRow(90)}</section>
      </main>
    </body></html>`);
  await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
  await page.screenshot({ path: 'test-results/app-icons.png', fullPage: true });
});
