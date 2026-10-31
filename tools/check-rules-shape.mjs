/* Dev-time shape check for the rule table and the field subset.
 *
 * Not part of the site runtime. Run: node tools/check-rules-shape.mjs
 * Exits non-zero and prints every failure it finds.
 */
import process from 'node:process';
import { loadApp } from './load-classic.mjs';

const failures = [];
function fail(message) { failures.push(message); }

const { rules: R } = loadApp(['rules.js']);

/* ------------------------------------------------------------- field subset */

const EXPECTED_FIELDS = [
  'vpnId', 'customerName', 'vpnServiceTopology',
  'siteId', 'city', 'countryCode',
  'siteNetworkAccessId', 'customerAddress', 'prefixLength',
  'attachmentVpnId', 'siteRole', 'bgpAutonomousSystem'
];

if (R.FIELDS.length !== 12) {
  fail(`expected 12 input fields, found ${R.FIELDS.length}`);
}
const fieldIds = R.FIELDS.map((f) => f.id);
for (const id of EXPECTED_FIELDS) {
  if (!fieldIds.includes(id)) { fail(`missing input field ${id}`); }
}
for (const id of fieldIds) {
  if (!EXPECTED_FIELDS.includes(id)) { fail(`unexpected input field ${id}`); }
}

const FIELD_KEYS = ['id', 'scope', 'group', 'label', 'path', 'rfcSection', 'yangType', 'typeNote'];
const YANG_TYPES = ['string', 'identityref', 'ipv4', 'uint8', 'uint32', 'leafref', 'date'];
const SCOPES = ['vpnService', 'site', 'access'];

for (const field of R.FIELDS) {
  for (const key of FIELD_KEYS) {
    if (!field[key]) { fail(`field ${field.id}: missing ${key}`); }
  }
  if (!('mandatory' in field)) { fail(`field ${field.id}: missing mandatory`); }
  if (!('requiredFor' in field)) { fail(`field ${field.id}: missing requiredFor`); }
  if (!YANG_TYPES.includes(field.yangType)) { fail(`field ${field.id}: bad yangType ${field.yangType}`); }
  if (!SCOPES.includes(field.scope)) { fail(`field ${field.id}: bad scope ${field.scope}`); }
  if (!R.SECTIONS['8299'][field.rfcSection]) {
    fail(`field ${field.id}: rfcSection ${field.rfcSection} is not a registered RFC 8299 heading`);
  }
  if (field.enumValues && field.defaultValue && !field.enumValues.includes(field.defaultValue)) {
    fail(`field ${field.id}: defaultValue ${field.defaultValue} is not one of its enumValues`);
  }
}

const topology = R.FIELDS.find((f) => f.id === 'vpnServiceTopology');
const topologyValues = 'any-to-any|hub-spoke|hub-spoke-disjoint';
if (topology.enumValues.join('|') !== topologyValues) {
  fail(`vpn-service-topology enum is ${topology.enumValues.join('|')}, expected ${topologyValues}`);
}

const role = R.FIELDS.find((f) => f.id === 'siteRole');
const roleValues = 'any-to-any-role|spoke-role|hub-role';
if (role.enumValues.join('|') !== roleValues) {
  fail(`site-role enum is ${role.enumValues.join('|')}, expected ${roleValues}`);
}
if (role.defaultValue !== 'any-to-any-role') {
  fail(`site-role default is ${role.defaultValue}, RFC 8299 declares any-to-any-role`);
}

/* ------------------------------------------------------------------ rules */

if (R.RULES.length !== 18) { fail(`expected 18 rules, found ${R.RULES.length}`); }

const seen = new Set();
for (const rule of R.RULES) {
  if (seen.has(rule.id)) { fail(`duplicate rule id ${rule.id}`); }
  seen.add(rule.id);

  for (const key of ['category', 'confidence', 'note']) {
    if (!rule[key]) { fail(`rule ${rule.id}: missing ${key}`); }
  }
  if (!R.CATEGORIES.includes(rule.category)) { fail(`rule ${rule.id}: bad category ${rule.category}`); }
  if (!R.CONFIDENCE.includes(rule.confidence)) { fail(`rule ${rule.id}: bad confidence ${rule.confidence}`); }
  if (!Array.isArray(rule.citations) || rule.citations.length === 0) {
    fail(`rule ${rule.id}: citations must be a non-empty array`);
  }
  for (const citation of rule.citations || []) {
    if (!R.SECTIONS[citation.rfc]) { fail(`rule ${rule.id}: unknown RFC ${citation.rfc}`); continue; }
    if (!R.SECTIONS[citation.rfc][citation.section]) {
      fail(`rule ${rule.id}: RFC ${citation.rfc} §${citation.section} is not a registered heading`);
    } else if (R.SECTIONS[citation.rfc][citation.section] !== citation.title) {
      fail(`rule ${rule.id}: title for RFC ${citation.rfc} §${citation.section} is ` +
        `"${citation.title}", registered as "${R.SECTIONS[citation.rfc][citation.section]}"`);
    }
    if (!['source', 'target'].includes(citation.side)) {
      fail(`rule ${rule.id}: citation side must be source or target`);
    }
  }

  if (rule.category === 'DROP') {
    if (rule.targetPath !== null) {
      fail(`rule ${rule.id}: a DROP rule must have targetPath null, found ${JSON.stringify(rule.targetPath)}`);
    }
  } else if (!rule.targetPath) {
    fail(`rule ${rule.id}: non-DROP rule needs a targetPath`);
  }

  if (rule.category === 'DERIVE' && rule.confidence !== 'engineering-inference') {
    fail(`rule ${rule.id}: DERIVE without an L3SM source must be labelled engineering-inference`);
  }
  if (rule.category === 'DERIVE' && !rule.derivation) {
    fail(`rule ${rule.id}: DERIVE rule needs a derivation name`);
  }
  if (rule.category !== 'DERIVE' && !rule.sourcePath) {
    fail(`rule ${rule.id}: ${rule.category} rule needs a sourcePath`);
  }
}

/* Node names that exist in the tasking document wireframe but not in the RFCs.
 * They must not show up anywhere in a source or target path. */
const FORBIDDEN_ON_L3SM = ['customers', 'customer-id', 'vpn-name', 'service-type'];
const FORBIDDEN_ON_L3NM = ['sites/site', 'site-id', 'customer-id'];

for (const rule of R.RULES) {
  const sourcePath = rule.sourcePath || '';
  for (const name of FORBIDDEN_ON_L3SM) {
    if (sourcePath.split('/').includes(name)) {
      fail(`rule ${rule.id}: source path contains ${name}, which RFC 8299 does not define`);
    }
  }
  const targetPath = rule.targetPath || '';
  for (const name of FORBIDDEN_ON_L3NM) {
    if (targetPath.includes(name)) {
      fail(`rule ${rule.id}: target path contains ${name}, which RFC 9182 does not define`);
    }
  }
  if (/^vpn-services\/vpn-service\/route-distinguisher/.test(targetPath)) {
    fail(`rule ${rule.id}: RFC 9182 has no top-level route-distinguisher leaf`);
  }
}

/* Every non-DERIVE rule that reads a subset field must name it. A rule whose
 * source leaf is outside the declared subset has to say so explicitly. */
for (const rule of R.RULES) {
  if (rule.category === 'DROP' || rule.category === 'DERIVE') { continue; }
  const ids = rule.sourceFields || (rule.sourceField ? [rule.sourceField] : []);
  if (!ids.length) {
    if (!rule.outsideSubset) {
      fail(`rule ${rule.id}: no source field bound and no outsideSubset flag, so it can never fire`);
    }
    continue;
  }
  for (const id of ids) {
    if (id !== null && !fieldIds.includes(id)) { fail(`rule ${rule.id}: unknown source field ${id}`); }
  }
}

/* The DROP rules must between them cover the two location leaves the board exposes. */
const dropped = new Set();
for (const rule of R.RULES.filter((r) => r.category === 'DROP')) {
  for (const id of rule.sourceFields || []) { dropped.add(id); }
}
for (const id of ['city', 'countryCode']) {
  if (!dropped.has(id)) { fail(`no DROP rule covers ${id}`); }
}

/* ------------------------------------------------------------------ report */

if (failures.length) {
  console.error(`check-rules-shape: ${failures.length} failure(s)`);
  for (const message of failures) { console.error(`  - ${message}`); }
  process.exit(1);
}
console.log(`check-rules-shape: ${R.FIELDS.length} fields, ${R.RULES.length} rules, all shape assertions passed`);
