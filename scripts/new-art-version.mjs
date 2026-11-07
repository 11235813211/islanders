// Copy the active art version (src/art/index.ts) into the next vN folder and switch to it.
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const artDir = join(import.meta.dirname, '..', 'src', 'art');
const indexPath = join(artDir, 'index.ts');
const index = readFileSync(indexPath, 'utf8');
const active = /from '\.\/(v\d+)'/.exec(index)?.[1];
if (!active) throw new Error('Could not find the active version import in src/art/index.ts.');

const latest = Math.max(
  ...readdirSync(artDir)
    .map(name => /^v(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number),
);
const next = `v${latest + 1}`;
cpSync(join(artDir, active), join(artDir, next), { recursive: true });

const entry = join(artDir, next, 'index.tsx');
writeFileSync(
  entry,
  readFileSync(entry, 'utf8')
    .replace(/^\/\/ Art v\d+:.*$/m, `// Art ${next}: copied from ${active}. Describe what changed here.`)
    .replace(`version: '${active}'`, `version: '${next}'`),
);
writeFileSync(indexPath, index.replace(`from './${active}'`, `from './${next}'`));
console.log(`Created src/art/${next} from ${active} and made it active.`);
