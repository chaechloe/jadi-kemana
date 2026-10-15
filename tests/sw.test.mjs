// The service worker's app shell must list every module, stylesheet and font, so screens never
// opened before still work offline. A new file has to be added to SHELL in sw.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('sw.js', root), 'utf8');
const shell = [...source.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const filesIn = (dir, ext) =>
  readdirSync(new URL(dir, root))
    .filter((name) => name.endsWith(ext))
    .map((name) => `${dir}${name}`);

test('the service worker keeps every module, stylesheet and font', () => {
  const needed = [
    ...filesIn('js/', '.js'),
    ...filesIn('js/views/', '.js'),
    ...filesIn('css/', '.css'),
    ...filesIn('assets/fonts/', '.woff2'),
    'index.html',
    'manifest.webmanifest',
  ];
  const missing = needed.filter((file) => !shell.includes(file));
  assert.deepEqual(missing, [], 'add these to SHELL in sw.js');
});

test('everything in the shell exists', () => {
  const absent = shell.filter((path) => path !== './' && !existsSync(new URL(path, root)));
  assert.deepEqual(absent, []);
});
