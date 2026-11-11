// Bundles the TypeScript training tools with esbuild and runs one command.
//   node training/run.mjs <command> [--flag value ...]
// See training/README.md for the commands. With --ref <git ref>, that ref's bots are bundled too
// (seats named ref:advanced etc. play them).
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, '..', '.training-build');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { cli: join(root, 'cli.ts'), worker: join(root, 'worker.ts') },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: 'inline',
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});
const refAt = process.argv.indexOf('--ref');
rmSync(join(out, 'ref.mjs'), { force: true });
if (refAt > 0) {
  const tree = join(out, 'ref');
  rmSync(tree, { recursive: true, force: true });
  mkdirSync(tree, { recursive: true });
  execSync(`git archive ${process.argv[refAt + 1]} shared | tar -x -C "${tree}"`, { cwd: join(root, '..') });
  writeFileSync(join(tree, 'entry.ts'), "export { BOTS } from './shared/bots';\n");
  await build({
    entryPoints: { ref: join(tree, 'entry.ts') },
    outdir: out,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outExtension: { '.js': '.mjs' },
    logLevel: 'warning',
  });
}
const result = spawnSync(
  process.execPath,
  ['--enable-source-maps', '--max-old-space-size=8192', join(out, 'cli.mjs'), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  },
);
process.exit(result.status ?? 1);
