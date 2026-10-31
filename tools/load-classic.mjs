/* Loads the classic scripts under net-sim/l3sm-l3nm/app into a fake `window`
 * so that Node can test exactly the same files the browser loads. They are not
 * ES modules on purpose (the board must also work over file://), so a plain
 * import would not give us anything.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, '..');
export const appDir = join(repoRoot, 'net-sim', 'l3sm-l3nm', 'app');

/* The scripts are compiled in this realm and only `window` is faked, so the
 * objects they return are ordinary host arrays and objects that
 * assert.deepStrictEqual accepts. A vm context would make them cross-realm. */
export function loadApp(files = ['rules.js', 'engine.js']) {
  const fakeWindow = {};
  for (const file of files) {
    const code = readFileSync(join(appDir, file), 'utf8');
    new Function('window', code)(fakeWindow);
  }
  return fakeWindow.Ietf3Tier;
}
