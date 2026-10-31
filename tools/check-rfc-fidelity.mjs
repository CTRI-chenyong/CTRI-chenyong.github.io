/* Dev-time fidelity guard for the RFC document area. Not part of the site runtime.
 *
 * The site publishes RFC text, and the one claim that makes it worth reading is
 * that the published pages are the source and nothing else. This script proves
 * that from three things that are all in the repository: the verbatim copies
 * under rfc/source/, the section index in _data/rfc-sources.json, and the
 * generated pages under rfc/. Nothing here regenerates anything; it reads what
 * would be published and compares bytes.
 *
 * The assertions:
 *   1. the recorded ranges cover each copy with no gap and no overlap;
 *   2. every page, front matter removed, is one <pre> and nothing else, and its
 *      text decodes back to its recorded byte range byte for byte;
 *   3. the copyright block the shell quotes is also those bytes of the source;
 *   4. the copy on disk still matches the checksum recorded with it;
 *   5. the layout that carries the compliance shell is named by every page, so
 *      the shell cannot be lost by a page that forgot to ask for it.
 *
 * Run: node tools/check-rfc-fidelity.mjs
 * Env: RFC_EXPORT_DIR points the checks at a copy of rfc/ and _data/ elsewhere,
 *      so a deliberate break can be tested without touching the committed files.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import process from 'node:process';

const REPO = dirname(import.meta.dirname);
const ROOT = process.env.RFC_EXPORT_DIR || REPO;
const DATA_FILE = join(ROOT, '_data', 'rfc-sources.json');

const failures = [];
function fail(message) { failures.push(message); }

/* The five entities the generator uses. Anything else is left alone, so a page
 * that grew an entity of its own decodes to something the source never was. */
function decode(text) {
  return text
    .replace(/&#12;/g, '\u000C')
    .replace(/&#65279;/g, '\uFEFF')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path, out); } else { out.push(path); }
  }
  return out;
}

function splitFrontMatter(text) {
  if (!text.startsWith('---')) { return { frontMatter: '', body: text }; }
  const end = text.indexOf('\n---', 3);
  if (end === -1) { return { frontMatter: '', body: text }; }
  const boundary = text.indexOf('\n', end + 1);
  return { frontMatter: text.slice(0, boundary), body: text.slice(boundary + 1) };
}

/* First byte at which two buffers differ, or null when identical. */
function firstDifference(actual, expected) {
  const length = Math.min(actual.length, expected.length);
  for (let index = 0; index < length; index++) {
    if (actual[index] !== expected[index]) { return index; }
  }
  return actual.length === expected.length ? null : length;
}

if (!existsSync(DATA_FILE)) {
  console.error(`FAIL ${relative(REPO, DATA_FILE)} is missing; run node tools/build-rfc-pages.mjs`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const pageFiles = new Set(walk(join(ROOT, 'rfc')).filter((file) => file.endsWith('.html')));
let sectionCount = 0;
let formFeeds = 0;
let bomLandings = 0;

for (const doc of data.docs) {
  const sourcePath = join(ROOT, doc.sourceFile);
  if (!existsSync(sourcePath)) {
    fail(`RFC ${doc.rfc}: ${doc.sourceFile} is missing, so nothing can be checked against it`);
    continue;
  }
  const buffer = readFileSync(sourcePath);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hash !== doc.sha256) {
    fail(`RFC ${doc.rfc}: the copy at ${doc.sourceFile} is ${buffer.length} bytes with SHA-256 ${hash}, recorded as ${doc.sha256}`);
  } else if (buffer.length !== doc.bytes) {
    fail(`RFC ${doc.rfc}: the copy at ${doc.sourceFile} is ${buffer.length} bytes, recorded as ${doc.bytes}`);
  }

  /* 1. coverage: one contiguous chain from the first heading to end of file,
     with the landing page owning everything before it. */
  let expected = 0;
  const chain = [{ num: 'front matter', path: doc.landingPath }].concat(
    doc.sections.map((section) => ({ num: `§${section.num}`, path: section.pagePath })),
  );
  const ranges = [{ start: 0, end: doc.sections[0].start }].concat(doc.sections);
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    if (range.start !== expected) {
      fail(`RFC ${doc.rfc} ${chain[index].num}: starts at byte ${range.start}, expected ${expected} (gap or overlap)`);
    }
    expected = range.end;
  }
  if (expected !== buffer.length) {
    fail(`RFC ${doc.rfc}: the recorded ranges end at ${expected}, the copy is ${buffer.length} bytes`);
  }

  /* 3. the quoted legal block is source bytes too. */
  const quoted = decode(doc.notice.html);
  const quotedBuffer = Buffer.from(quoted, 'utf8');
  const wantQuoted = buffer.subarray(doc.notice.start, doc.notice.end);
  const quoteDiff = firstDifference(quotedBuffer, wantQuoted);
  if (quoteDiff !== null) {
    fail(`RFC ${doc.rfc}: the copyright block in the shell stops matching the source at byte ${doc.notice.start + quoteDiff} of ${doc.sourceFile}`);
  }

  /* 2 and 5. every page this document publishes. */
  const pages = [[doc.landingPath, 0, doc.sections[0].start, 'front matter', 'rfc-landing']]
    .concat(doc.sections.map((section) => [
      section.pagePath, section.start, section.end, `§${section.num}`, 'rfc-page',
    ]));
  for (const [path, start, end, name, layout] of pages) {
    const file = join(ROOT, path);
    if (!existsSync(file)) {
      fail(`RFC ${doc.rfc} ${name}: ${path} is not on disk`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const parts = splitFrontMatter(text);
    if (!parts.frontMatter) {
      fail(`RFC ${doc.rfc} ${name}: ${path} has no front matter, so the site would publish it as raw HTML`);
    }
    if (!new RegExp(`^layout: ${layout}\\s*$`, 'm').test(parts.frontMatter)) {
      fail(`RFC ${doc.rfc} ${name}: ${path} must use layout ${layout}, which is where the compliance shell comes from`);
    }
    const body = /^<pre>([\s\S]*)<\/pre>\n$/.exec(parts.body);
    if (!body) {
      fail(`RFC ${doc.rfc} ${name}: ${path} is not exactly one <pre> block, so the page carries text the source does not have`);
      continue;
    }
    const actual = Buffer.from(decode(body[1]), 'utf8');
    const want = buffer.subarray(start, end);
    const diff = firstDifference(actual, want);
    if (diff !== null) {
      const where = actual.length === want.length
        ? `at byte ${start + diff} of ${doc.sourceFile}`
        : `at byte ${start + Math.min(diff, actual.length, want.length)} of ${doc.sourceFile} (page has ${actual.length} bytes, source has ${want.length})`;
      fail(`RFC ${doc.rfc} ${name}: ${path} does not reproduce its source range ${where}`);
    }
    formFeeds += (body[1].match(/&#12;/g) || []).length;
    if (name === 'front matter' && actual[0] === 0xef && actual[1] === 0xbb && actual[2] === 0xbf) { bomLandings++; }
    pageFiles.delete(file);
  }
  sectionCount += doc.sections.length;
}

/* 6. a page on disk that no document records is a page nobody regenerates. */
for (const orphan of pageFiles) {
  fail(`${relative(ROOT, orphan)} is not produced by the recorded section index`);
}

/* The escape layer must be load bearing, not decorative: if these characters
 * ever stopped being checked the pages would still compare equal by accident. */
const feedsInSource = data.docs.reduce((sum, doc) => {
  const buffer = existsSync(join(ROOT, doc.sourceFile)) ? readFileSync(join(ROOT, doc.sourceFile)) : Buffer.alloc(0);
  return sum + (buffer.toString('latin1').match(/\f/g) || []).length;
}, 0);
if (formFeeds !== feedsInSource) {
  fail(`the pages carry ${formFeeds} page separators, the copies hold ${feedsInSource}: a form feed was dropped or double counted`);
}
const bomSources = data.docs.filter((doc) => {
  const buffer = existsSync(join(ROOT, doc.sourceFile)) ? readFileSync(join(ROOT, doc.sourceFile)) : Buffer.alloc(0);
  return buffer[0] === 0xef;
}).length;
if (bomLandings !== bomSources) {
  fail(`${bomLandings} landing page(s) start with a byte-order mark, ${bomSources} copy/copies begin with one: the BOM did not survive`);
}

if (failures.length) {
  console.error(`check-rfc-fidelity: ${failures.length} violation(s)`);
  for (const message of failures) { console.error(`  FAIL ${message}`); }
  process.exit(1);
}
console.log(`check-rfc-fidelity: ${data.docs.map((doc) => `${doc.rfc}:${doc.sections.length}`).join(' ')} ` +
  `(${sectionCount} sections + ${data.docs.length} landing pages), coverage gap 0, ` +
  `${formFeeds} page separators and ${bomLandings} byte-order mark(s) intact, 0 violations`);
