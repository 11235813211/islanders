import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Width and height from a PNG's header. */
function pngSize(path: string): [number, number] {
  const header = readFileSync(path);
  expect(header.subarray(1, 4).toString()).toBe('PNG');
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

describe('add to home screen', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    display: string;
    start_url: string;
    icons: ManifestIcon[];
  };
  const html = readFileSync('index.html', 'utf8');

  it('meets Android install requirements: standalone, 192 and 512 PNGs, and a maskable icon', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    const png = manifest.icons.filter(icon => icon.type === 'image/png');
    expect(png.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(png.some(icon => icon.purpose === 'maskable')).toBe(true);
    for (const icon of png) {
      const [width, height] = pngSize(`public/${icon.src}`);
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  it('gives iOS a 180px PNG icon and a home-screen name', () => {
    const link = /<link rel="apple-touch-icon" href="\.\/([^"]+)"/.exec(html);
    expect(link).not.toBeNull();
    expect(pngSize(`public/${link![1]}`)).toEqual([180, 180]);
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Islanders" />');
    expect(html).toContain('<link rel="manifest"');
  });
});
