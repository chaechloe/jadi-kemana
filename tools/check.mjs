// Syntax check: `node --check` on every app module and tool, so a typo in a view (which no unit
// test imports) still fails `npm test` and CI. Usage: node tools/check.mjs
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [
  ['js', '.js'],
  ['js/views', '.js'],
  ['tools', '.mjs'],
].flatMap(([dir, ext]) =>
  readdirSync(join(root, dir))
    .filter((name) => name.endsWith(ext))
    .map((name) => join(dir, name)),
);

const failed = files.filter((file) => spawnSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' }).status !== 0);
if (failed.length) {
  console.error(`Syntax errors in: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`Syntax OK: ${files.length} files`);
