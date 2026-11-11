import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA } from './checkpoints';
import type { Dataset } from './mlp';

/**
 * Collected training rows on disk (training/data/, gitignored): `<kind>-<name>.bin` holds rows of
 * [features..., label, game seed] as float64, and `.json` beside it names the features, so a file
 * collected with different features is refused instead of silently misread.
 */

export type Kind = 'setup' | 'value';

export function saveRows(kind: Kind, name: string, features: readonly string[], rows: number[], meta: object): string {
  mkdirSync(DATA, { recursive: true });
  const path = join(DATA, `${kind}-${name}.bin`);
  writeFileSync(path, Buffer.from(Float64Array.from(rows).buffer));
  writeFileSync(`${path}.json`, JSON.stringify({ features, ...meta }));
  return path;
}

export function loadRows(kind: Kind, names: string[], features: readonly string[]): Dataset {
  const width = features.length;
  const parts = names.map(name => {
    const path = join(DATA, `${kind}-${name}.bin`);
    if (!existsSync(path)) throw new Error(`No data file ${path}`);
    const meta = JSON.parse(readFileSync(`${path}.json`, 'utf8'));
    if (meta.features.join() !== features.join())
      throw new Error(`${path} was collected with different features; collect it again.`);
    const buffer = readFileSync(path);
    return new Float64Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 8);
  });
  const rows = parts.reduce((n, p) => n + p.length / (width + 2), 0);
  const data: Dataset = {
    x: new Float32Array(rows * width),
    y: new Float32Array(rows),
    group: new Float64Array(rows),
    width,
    rows,
  };
  let row = 0;
  parts.forEach((p, file) => {
    for (let i = 0; i < p.length; i += width + 2, row++) {
      data.x.set(p.subarray(i, i + width), row * width);
      data.y[row] = p[i + width]!;
      data.group[row] = p[i + width + 1]! + file * 1e7;
    }
  });
  return data;
}
