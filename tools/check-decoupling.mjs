/* Dev-time decoupling guard for net-sim/. Not part of the site runtime.
 *
 * The board has to survive a site-template change, so the only files allowed
 * to know anything about just-the-docs are net-sim/l3sm-l3nm/index.html (its
 * front matter) and net-sim/l3sm-l3nm/theme/*.css. Everything under app/ and
 * standalone/ must be template-agnostic, offline-capable and path-relative.
 *
 * Run: node tools/check-decoupling.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const netSim = join(repoRoot, 'net-sim');

const failures = [];
function fail(file, line, message) {
  failures.push(`${relative(repoRoot, file)}:${line}: ${message}`);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path, out); } else { out.push(path); }
  }
  return out;
}

/* Selectors and variables that belong to just-the-docs 0.12.0. Anything from
 * this list appearing under app/ or standalone/ means the board has grown a
 * dependency on the site template.
 *
 * The class-name patterns are selector shaped, so they only apply where a
 * selector can appear (.css and .html). In a .js file ".label" is a property
 * read, not a class, so the script checks class usage there separately, by
 * looking at the string literals handed to the class and selector APIs. */
const THEME_SELECTOR_TOKENS = [
  /\.main-content\b/, /\.main-content-wrap\b/, /\.side-bar\b/, /\.site-header\b/,
  /\.site-footer\b/, /\.site-nav\b/, /\.site-title\b/, /\.site-button\b/,
  /\.nav-list\b/, /\.nav-category\b/, /\.aux-nav\b/, /\.breadcrumb\b/,
  /\.page-header\b/, /\.search-?\w*\b/, /\.site-wrap\b/, /\.main-header\b/,
  /\.label\b/, /\.btn\b/, /\.code-example\b/, /\.anchor-heading\b/,
  /\.text-(?:grey|delta|green|red)\b/, /\.[fd]s-\d\b/, /\.d-(?:block|flex|none)\b/,
  /\.lh-(?:default|tight)\b/, /\.no-?list\b/
];

const THEME_CLASS_NAMES = THEME_SELECTOR_TOKENS
  .map((pattern) => pattern.source.replace(/^\\\./, '').replace(/\\\b$/, ''));

const THEME_CLASS_RE = new RegExp('^(?:' + THEME_CLASS_NAMES.join('|') + ')$');

const THEME_STRUCTURAL_TOKENS = [
  /\$(?:media-queries|content-width|nav-width|body-width)\b/,
  /\$bp-\w+/, /\bmap-get\(\s*\$media-queries/, /@include\s+(?:mq|container)\b/,
  /\{\{[^}]*\}\}/, /\{%-?[\s\S]*?-?%\}/
];

const JS_CLASS_USAGE = /className|classList|setAttribute\(\s*['"]class|querySelector|closest\(/;

/* Anything that would put the board on the network, or make it a module the
 * browser has to fetch with CORS rules that file:// does not satisfy. The
 * import patterns are anchored to statement position: "import" also occurs in
 * this codebase as a route-target-type value and as a property name. */
const NETWORK_TOKENS = [
  [/\bfetch\s*\(/, 'fetch() would break the offline requirement'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest would break the offline requirement'],
  [/\bWebSocket\b/, 'WebSocket would break the offline requirement'],
  [/\bEventSource\b/, 'EventSource would break the offline requirement'],
  [/navigator\.sendBeacon/, 'sendBeacon would break the offline requirement'],
  [/^\s*import\s*\(/, 'dynamic import() is a network request'],
  [/^\s*import\s+[\w{*\s,]+\s+from\s*['"]/, 'an ES module import cannot run from file://'],
  [/^\s*import\s*['"]/, 'an ES module import cannot run from file://'],
  [/^\s*export\s+(?:default\b|const\b|let\b|var\b|function\b|class\b|\{)/, 'an ES module export cannot run from file://'],
  [/https?:\/\/(?!www\.w3\.org)/, 'an absolute http(s) URL is a remote dependency']
];

/* A path that starts at the site root only works while baseurl is "/". */
const ROOT_RELATIVE = [/(?:href|src|action)\s*=\s*["']\/(?!\/)/, /url\(\s*["']?\/(?!\/)/];

/* The extensions the browser actually executes or applies. A markdown file
 * under net-sim/ is documentation, and is checked for Liquid only. */
const CODE_FILE = /\.(?:js|css|html?)$/;

function splitFrontMatter(text) {
  if (!text.startsWith('---')) { return { frontMatter: '', body: text }; }
  const end = text.indexOf('\n---', 3);
  if (end === -1) { return { frontMatter: '', body: text }; }
  const boundary = text.indexOf('\n', end + 1);
  return {
    frontMatter: text.slice(0, boundary),
    body: text.slice(boundary + 1)
  };
}

function scanTokens(file, text, tokens, label) {
  text.split('\n').forEach((line, index) => {
    tokens.forEach((token) => {
      const pattern = token instanceof RegExp ? token : token[0];
      if (pattern.test(line)) {
        const reason = token instanceof RegExp ? `${label} ${pattern}` : token[1];
        fail(file, index + 1, reason);
      }
    });
  });
}

/* In a script the dependency would show up as a theme class name inside a
 * string handed to a class or selector API, so that is what gets checked. The
 * string may be a whole class list or a selector, so it is split into tokens
 * and each token is compared in full: "i3t-link-label" is this board's own
 * class and must not be mistaken for the theme's "label". */
function scanJsClassUsage(file, text) {
  text.split('\n').forEach((line, index) => {
    if (!JS_CLASS_USAGE.test(line)) { return; }
    for (const match of line.matchAll(/(['"])([^'"]*)\1/g)) {
      for (const token of match[2].split(/\s+/)) {
        const name = token.replace(/^[.#]/, '');
        if (THEME_CLASS_RE.test(name)) {
          fail(file, index + 1, `theme class name "${name}" reached from a script`);
        }
      }
    }
  });
}

const files = walk(netSim);
const appFiles = files.filter((file) => relative(netSim, file).split('/')[1] === 'app');
const themeFiles = files.filter((file) => relative(netSim, file).startsWith('l3sm-l3nm/theme/'));
const standaloneFiles = files.filter((file) => relative(netSim, file).startsWith('l3sm-l3nm/standalone/'));
const shellFile = join(netSim, 'l3sm-l3nm', 'index.html');

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(netSim, file);
  const isThemeAware = themeFiles.includes(file) || file === shellFile;

  /* Liquid only ever runs on a file with front matter, so a stray {{ }} under
     app/ would be published verbatim and is a sign of a misplaced template. */
  if (!isThemeAware) {
    const parts = splitFrontMatter(text);
    if (parts.frontMatter && file !== shellFile) {
      fail(file, 1, 'only the shell page may carry front matter');
    }
    scanTokens(file, parts.body, THEME_STRUCTURAL_TOKENS, 'theme token');
    if (rel.endsWith('.js')) {
      scanJsClassUsage(file, parts.body);
    } else {
      scanTokens(file, parts.body, THEME_SELECTOR_TOKENS, 'theme token');
    }
  }

  /* Network and path rules bind the code, not the prose that documents them:
     README.md names the forbidden APIs precisely so that nobody adds one. */
  if (CODE_FILE.test(rel)) {
    scanTokens(file, text, NETWORK_TOKENS, 'network');
    scanTokens(file, text, ROOT_RELATIVE, 'root-relative path');
  }

  if (rel.endsWith('.css') && !isThemeAware) {
    text.split('\n').forEach((line, index) => {
      const match = /^([^@/\s}{][^{}]*?)\s*\{\s*$/.exec(line);
      if (!match) { return; }
      const selectors = match[1].split(',').map((s) => s.trim()).filter(Boolean);
      for (const selector of selectors) {
        if (selector.startsWith('@')) { continue; }
        if (!/^\.ietf-3tier-(?:poc|connector)\b/.test(selector)) {
          fail(file, index + 1,
            `selector "${selector}" must start with .ietf-3tier-poc or .ietf-3tier-connector`);
        }
      }
    });
  }
}

/* The shell page: front matter is the whole theme contract, the body carries
 * nothing but the mount point and its own relative references. */
const shell = splitFrontMatter(readFileSync(shellFile, 'utf8'));
if (/permalink\s*:/.test(shell.frontMatter)) {
  fail(shellFile, 1, 'permalink pins the URL to this template; the directory path is the contract');
}
if (!/^title:\s*IETF 3-Tier Network Model Mapping POC\s*$/m.test(shell.frontMatter)) {
  fail(shellFile, 1, 'front matter title must be exactly "IETF 3-Tier Network Model Mapping POC"');
}
if (!/^layout:\s*page\s*$/m.test(shell.frontMatter)) {
  fail(shellFile, 1, 'front matter must keep layout: page');
}
if (/\{\{|\{%/.test(shell.body)) {
  fail(shellFile, 1, 'the shell body must carry no Liquid; the front matter is the whole theme contract');
}
const shellRefs = [...shell.body.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
if (shellRefs.length !== 5) {
  fail(shellFile, 1, `expected 5 relative references, found ${shellRefs.length}: ${shellRefs.join(', ')}`);
}
for (const ref of shellRefs) {
  if (!existsSync(join(netSim, 'l3sm-l3nm', ref))) {
    fail(shellFile, 1, `reference ${ref} does not resolve to a file in the repo`);
  }
}
if (/<(?!\/?(?:div|link|script|p|br)\b)/.test(shell.body.replace(/<!--[\s\S]*?-->/g, ''))) {
  fail(shellFile, 1, 'the shell body must stay empty of business markup; the board renders itself');
}

/* The standalone page proves the theme is optional. */
for (const file of standaloneFiles) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('theme/')) {
    fail(file, 1, 'the standalone build must not reference theme/');
  }
  for (const ref of [...text.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])) {
    if (!existsSync(join(dirname(file), ref))) {
      fail(file, 1, `reference ${ref} does not resolve next to the standalone page`);
    }
  }
}

/* Nothing in net-sim may reach outside its own directory. */
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const ref of [...text.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1])) {
    if (ref.startsWith('../') && !existsSync(join(dirname(file), ref))) {
      fail(file, 1, `reference ${ref} escapes the directory and does not resolve`);
    }
  }
}

if (appFiles.length < 3) {
  fail(netSim, 0, `expected the three classic scripts under app/, found ${appFiles.length} file(s)`);
}
if (themeFiles.length === 0) {
  fail(netSim, 0, 'expected at least one theme/*.css adapter file');
}

if (failures.length) {
  console.error(`check-decoupling: ${failures.length} violation(s)`);
  for (const message of failures) { console.error(`  FAIL ${message}`); }
  process.exit(1);
}
console.log(`check-decoupling: ${files.length} file(s) under net-sim/, ` +
  `${appFiles.length} template-agnostic, ${themeFiles.length} theme-aware, 0 violations`);
