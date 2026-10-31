/* Dev-time citation check. Not part of the site runtime.
 *
 * Reads the rfc-editor plain text of RFC 8299 and RFC 9182 (downloading and
 * caching it on first run) and asserts, for every rule and every input field
 * registered in net-sim/l3sm-l3nm/app/rules.js:
 *
 *   1. each cited section number is a real numbered heading of that RFC, and
 *      its title is the one we registered;
 *   2. each node name in each source path is declared in ietf-l3vpn-svc, and
 *      each node name in each target path is declared in ietf-l3vpn-ntw;
 *   3. each enumeration value we offer is an identity declared in RFC 8299;
 *   4. the node names the page says do NOT exist really are absent.
 *
 * Run: node tools/check-rfc-citations.mjs
 * Env: RFC_CACHE_DIR (default os.tmpdir()), RFC_OFFLINE=1 to forbid downloading.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { loadApp } from './load-classic.mjs';

const CACHE_DIR = process.env.RFC_CACHE_DIR || tmpdir();
const OFFLINE = process.env.RFC_OFFLINE === '1';

const SOURCES = {
  8299: {
    url: 'https://www.rfc-editor.org/rfc/rfc8299.txt',
    file: join(CACHE_DIR, 'rfc8299.txt'),
    module: 'ietf-l3vpn-svc'
  },
  9182: {
    url: 'https://www.rfc-editor.org/rfc/rfc9182.txt',
    file: join(CACHE_DIR, 'rfc9182.txt'),
    module: 'ietf-l3vpn-ntw'
  },
  /* RFC 9182 pulls most of its structure in through "uses vpn-common:...", so
     a node name that is absent from ietf-l3vpn-ntw may still be a real RFC
     9182 node. ietf-vpn-common is the fallback that decides which. */
  9181: {
    url: 'https://www.rfc-editor.org/rfc/rfc9181.txt',
    file: join(CACHE_DIR, 'rfc9181.txt'),
    module: 'ietf-vpn-common'
  }
};

async function loadRfc(number) {
  const source = SOURCES[number];
  if (!existsSync(source.file)) {
    if (OFFLINE) {
      throw new Error(`${source.file} is missing and RFC_OFFLINE=1 forbids downloading it`);
    }
    mkdirSync(CACHE_DIR, { recursive: true });
    const response = await fetch(source.url);
    if (!response.ok) { throw new Error(`${source.url} -> HTTP ${response.status}`); }
    writeFileSync(source.file, await response.text());
  }
  return readFileSync(source.file, 'utf8').split('\n');
}

/* Numbered headings, ignoring the table-of-contents copies (dotted leaders).
 * A wrapped title is joined with the following indented line. */
function headingsOf(lines) {
  const headings = new Map();
  const pattern = /^(\d+(?:\.\d+)*)\.\s\s+(\S.*)$/;
  lines.forEach((line, index) => {
    if (line.includes('...')) { return; }
    const match = pattern.exec(line);
    if (!match) { return; }
    let title = match[2].trim();
    const next = lines[index + 1];
    if (next && /^\s{5,}\S/.test(next) && !pattern.test(next) && !/[.:]$/.test(title)) {
      title = `${title} ${next.trim()}`;
    }
    if (!headings.has(match[1])) { headings.set(match[1], { title, line: index + 1 }); }
  });
  return headings;
}

/* Every data node declared in the YANG module body, with its first line. */
function nodesOf(lines) {
  const start = lines.findIndex((line) => /<CODE BEGINS>/.test(line));
  const end = lines.findIndex((line) => /<CODE ENDS>/.test(line));
  if (start === -1 || end === -1) { throw new Error('could not find the YANG module body'); }
  const nodes = new Map();
  const pattern = /^\s*(leaf-list|leaf|list|container|choice|case|identity|grouping|typedef)\s+([A-Za-z0-9._-]+)/;
  for (let index = start; index < end; index += 1) {
    const match = pattern.exec(lines[index]);
    if (match && !nodes.has(match[2])) {
      nodes.set(match[2], { kind: match[1], line: index + 1 });
    }
  }
  return { nodes, moduleLine: start + 1 };
}

/* Node names printed in the document's tree diagrams ("+--rw name"). These are
 * the names a reader of the RFC actually sees, including the ones the module
 * body only reaches through a "uses" of an imported grouping. */
function treeNamesOf(lines) {
  const names = new Map();
  const pattern = /\+--(?:rw|ro)?\s*(?:\(([^)]*)\)|:\(([^)]*)\)|([A-Za-z0-9._-]+))/;
  lines.forEach((line, index) => {
    if (!line.includes('+--')) { return; }
    const match = pattern.exec(line);
    if (!match) { return; }
    const name = match[1] || match[2] || match[3];
    if (name && !names.has(name)) { names.set(name, index + 1); }
  });
  return names;
}

function segmentsOf(path) {
  return path.split('/').filter(Boolean).map((segment) => segment.replace(/\[.*\]$/, ''));
}

const failures = [];
const hits = [];
function fail(id, message) { failures.push(`${id}: ${message}`); }
function hit(id, message) { hits.push(`${id}: ${message}`); }

const { rules: R } = loadApp(['rules.js']);

const texts = {};
const headings = {};
const nodes = {};
const tree = {};
for (const number of Object.keys(SOURCES)) {
  texts[number] = await loadRfc(number);
  headings[number] = headingsOf(texts[number]);
  nodes[number] = nodesOf(texts[number]);
  tree[number] = treeNamesOf(texts[number]);
}

function checkHeading(owner, number, section, title) {
  const found = headings[number].get(section);
  if (!found) {
    fail(owner, `RFC ${number} §${section} is not a numbered heading of that document`);
    return false;
  }
  if (title !== undefined && found.title !== title) {
    fail(owner, `RFC ${number} §${section} is titled "${found.title}", we registered "${title}"`);
    return false;
  }
  hit(owner, `RFC ${number} §${section} "${found.title}" at line ${found.line}`);
  return true;
}

/* A node name counts as real for a document when the module body declares it,
 * when one of that document's tree diagrams prints it, or - for RFC 9182 only
 * - when ietf-vpn-common declares it, because RFC 9182 reuses those
 * groupings through "uses vpn-common:...". */
function findNode(number, name) {
  const declared = nodes[number].nodes.get(name);
  if (declared) { return { where: `${SOURCES[number].module} declares ${declared.kind} ${name}`, line: declared.line }; }
  const printed = tree[number].get(name);
  if (printed) { return { where: `RFC ${number} prints ${name} in a tree diagram`, line: printed }; }
  if (number === '9182') {
    const common = nodes['9181'].nodes.get(name);
    if (common) {
      return {
        where: `ietf-vpn-common declares ${common.kind} ${name}, reused by ietf-l3vpn-ntw through "uses"`,
        line: common.line
      };
    }
  }
  return null;
}

function checkPath(owner, number, path) {
  for (const segment of segmentsOf(path)) {
    const found = findNode(number, segment);
    if (!found) {
      fail(owner, `"${segment}" (from ${path}) is not a node of RFC ${number}: ` +
        `neither ${SOURCES[number].module} nor its tree diagrams declare it`);
    } else {
      hit(owner, `${found.where} at line ${found.line}`);
    }
  }
}

/* 1. the section table itself */
for (const [number, table] of Object.entries(R.SECTIONS)) {
  for (const [section, title] of Object.entries(table)) {
    checkHeading(`SECTIONS ${number} §${section}`, number, section, title);
  }
}

/* 2. the input fields */
for (const field of R.FIELDS) {
  checkHeading(`field ${field.id}`, '8299', field.rfcSection);
  checkPath(`field ${field.id}`, '8299', field.path);
  for (const value of field.enumValues || []) {
    const found = nodes['8299'].nodes.get(value);
    if (!found || found.kind !== 'identity') {
      fail(`field ${field.id}`, `"${value}" is not an identity declared in ietf-l3vpn-svc`);
    } else {
      hit(`field ${field.id}`, `ietf-l3vpn-svc identity ${value} at line ${found.line}`);
    }
  }
}

/* 3. the rules */
for (const rule of R.RULES) {
  for (const citation of rule.citations) {
    checkHeading(`rule ${rule.id}`, citation.rfc, citation.section, citation.title);
  }
  for (const sourcePath of (rule.sourcePath || '').split('|').filter(Boolean)) {
    checkPath(`rule ${rule.id} source`, '8299', sourcePath);
  }
  if (rule.targetPath) { checkPath(`rule ${rule.id} target`, '9182', rule.targetPath); }
  for (const key of rule.structuralKeys || []) {
    const found = findNode('9182', key);
    if (!found) {
      fail(`rule ${rule.id}`, `structural key "${key}" is not a node of RFC 9182`);
    } else {
      hit(`rule ${rule.id}`, `${found.where} at line ${found.line}`);
    }
  }
}

/* 4. the differences block, including its negative claims */
const ABSENT = {
  8299: ['customers', 'customer-id', 'vpn-name', 'service-type'],
  9182: ['sites', 'site-id', 'customer-id']
};
for (const [number, names] of Object.entries(ABSENT)) {
  for (const name of names) {
    const found = findNode(number, name);
    if (found) {
      fail(`absent ${number}`, `"${name}" IS a node of RFC ${number} (${found.where}), ` +
        'so the page must not claim otherwise');
    } else {
      hit(`absent ${number}`, `"${name}" is neither declared in ${SOURCES[number].module} ` +
        `nor printed in the RFC ${number} tree diagrams`);
    }
  }
}
for (const number of ['8299', '9182']) {
  if (findNode(number, 'hub-and-spoke')) {
    fail(`absent ${number}`, '"hub-and-spoke" IS a node of that RFC, so the page must not call it a misspelling');
  } else {
    hit(`absent ${number}`, `"hub-and-spoke" appears nowhere in RFC ${number} as a node or identity name`);
  }
}
R.DIFFERENCES.forEach((difference, index) => {
  checkHeading(`difference ${index + 1}`, difference.rfc, difference.section);
});

/* 5. the scope denominator, recounted from the module body */
const countDeclarations = (number, kind) => {
  const pattern = new RegExp(`^\\s*${kind}\\s+[A-Za-z0-9._-]+`);
  const start = nodes[number].moduleLine - 1;
  const end = texts[number].findIndex((line) => /<CODE ENDS>/.test(line));
  let total = 0;
  for (let index = start; index < end; index += 1) {
    if (pattern.test(texts[number][index])) { total += 1; }
  }
  return total;
};
const leafCount = countDeclarations('8299', 'leaf');
const leafListCount = countDeclarations('8299', 'leaf-list');
if (leafCount !== R.SCOPE.rfc8299LeafDeclarations) {
  fail('SCOPE', `ietf-l3vpn-svc declares ${leafCount} "leaf" statements, we registered ${R.SCOPE.rfc8299LeafDeclarations}`);
} else {
  hit('SCOPE', `ietf-l3vpn-svc declares ${leafCount} "leaf" statements`);
}
if (leafListCount !== R.SCOPE.rfc8299LeafListDeclarations) {
  fail('SCOPE', `ietf-l3vpn-svc declares ${leafListCount} "leaf-list" statements, we registered ${R.SCOPE.rfc8299LeafListDeclarations}`);
} else {
  hit('SCOPE', `ietf-l3vpn-svc declares ${leafListCount} "leaf-list" statements`);
}
if (leafCount + leafListCount !== R.SCOPE.rfc8299LeafTotal) {
  fail('SCOPE', `rfc8299LeafTotal ${R.SCOPE.rfc8299LeafTotal} is not leaf ${leafCount} + leaf-list ${leafListCount}`);
}

/* ------------------------------------------------------------------ report */

const uniqueHits = [...new Set(hits)];
if (process.env.CITATION_QUIET !== '1') {
  for (const line of uniqueHits) { console.log(`  ok  ${line}`); }
}
if (failures.length) {
  console.error(`\ncheck-rfc-citations: ${failures.length} failure(s)`);
  for (const message of failures) { console.error(`  FAIL ${message}`); }
  process.exit(1);
}
console.log(`\ncheck-rfc-citations: ${uniqueHits.length} citation(s) verified against ` +
  'rfc8299.txt and rfc9182.txt, 0 failures');
