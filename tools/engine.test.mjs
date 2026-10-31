import assert from 'node:assert/strict';
import test from 'node:test';
import { loadApp } from './load-classic.mjs';

const { rules: R, engine } = loadApp(['rules.js', 'engine.js']);

function preset() { return engine.cloneInput(R.PRESET_INPUT); }

function single() {
  return {
    vpnServices: [{ vpnId: 'vpn-1', customerName: 'Acme', vpnServiceTopology: 'any-to-any' }],
    sites: [{
      siteId: 'site-1',
      accesses: [{
        siteNetworkAccessId: 'sna-1', customerAddress: '192.0.2.10', prefixLength: 24,
        attachmentVpnId: 'vpn-1', siteRole: 'any-to-any-role', bgpAutonomousSystem: 65011
      }]
    }]
  };
}

function svc(result, index = 0) { return result.l3nmInstance['vpn-services']['vpn-service'][index]; }
function nodes(result, serviceIndex = 0) { return svc(result, serviceIndex)['vpn-nodes']['vpn-node']; }
function accesses(result, serviceIndex = 0, nodeIndex = 0) {
  return nodes(result, serviceIndex)[nodeIndex]['vpn-network-accesses']['vpn-network-access'];
}
function access(result, serviceIndex = 0, nodeIndex = 0, accessIndex = 0) {
  return accesses(result, serviceIndex, nodeIndex)[accessIndex];
}
function profilesOf(result, serviceIndex = 0) {
  return svc(result, serviceIndex)['vpn-instance-profiles']['vpn-instance-profile'];
}

/* ------------------------------------------------------------------ 3.1 */

test('a single site with a single access maps into the RFC 9182 shape', () => {
  const outcome = engine.safeMap(single());
  assert.equal(outcome.valid, true);
  const result = outcome.result;

  assert.equal(result.l3nmInstance['vpn-services']['vpn-service'].length, 1);
  const service = svc(result);
  assert.equal(service['vpn-id'], 'vpn-1');
  assert.equal(service['customer-name'], 'Acme');
  assert.equal(service['vpn-service-topology'], 'any-to-any');
  assert.equal(service['vpn-type'], 'bgp-based-l3vpn');

  assert.equal(service['vpn-nodes']['vpn-node'].length, 1);
  assert.equal(service['vpn-nodes']['vpn-node'][0]['vpn-node-id'], 'site-1');

  const out = access(result);
  assert.equal(out.id, 'sna-1');
  assert.equal(out['interface-id'], 'acc-sna-1');
  assert.equal(out['ip-connection'].ipv4['prefix-length'], 24);
  assert.equal(
    out['ip-connection'].ipv4['static-addresses'].address[0]['customer-address'],
    '192.0.2.10'
  );
  assert.equal(out['routing-protocols']['routing-protocol'][0].bgp['peer-as'], 65011);
  assert.equal(out['routing-protocols']['routing-protocol'][0].bgp['local-as'], R.PROVIDER.asNumber);

  assert.ok(result.traces.length > 0, 'traces must not be empty');
});

test('no L3SM leaf is mapped into a site-node under RFC 9182 naming', () => {
  const result = engine.safeMap(single()).result;
  const paths = engine.walkLeaves(result.l3nmInstance, '', []).map((leaf) => leaf.path);
  assert.ok(paths.every((path) => !path.includes('/sites/')));
  assert.ok(paths.every((path) => !path.includes('site-network-access')));
});

test('traces are emitted once each and numbered in order', () => {
  const result = engine.safeMap(preset()).result;
  const numbers = result.traces.map((t) => t.causalNo);
  assert.equal(new Set(numbers).size, numbers.length, 'causal numbers must be unique');
  assert.deepEqual(numbers, numbers.slice().sort((a, b) => a - b));
  assert.equal(numbers[0], 1);
  assert.equal(numbers[numbers.length - 1], numbers.length);

  const keys = result.traces.map((t) => `${t.ruleId}|${t.instancePath}|${t.value}`);
  const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
  assert.deepEqual(duplicates, [], 'no trace may be emitted twice');
});

test('every trace carries the fields the board renders', () => {
  const result = engine.safeMap(preset()).result;
  for (const trace of result.traces) {
    assert.equal(trace.batchId, result.batchId);
    assert.ok(R.RULES.some((rule) => rule.id === trace.ruleId), `unknown ruleId ${trace.ruleId}`);
    assert.ok(R.CATEGORIES.includes(trace.category));
    assert.ok(trace.citations.length > 0);
    assert.ok(typeof trace.note === 'string' && trace.note.length > 0);
    assert.ok(trace.fanout >= 1);
    assert.notEqual(trace.value, undefined);
    if (trace.category !== 'SPLIT' || trace.instancePath) {
      assert.ok(trace.elementId, `trace ${trace.causalNo} has a path but no elementId`);
    }
  }
});

/* ------------------------------------------------------------------ 3.2 */

test('derived values are stable for the same input', () => {
  const first = engine.safeMap(preset()).result;
  const second = engine.safeMap(preset()).result;
  assert.deepEqual(first.l3nmInstance, second.l3nmInstance);

  const rds = profilesOf(first).map((p) => p.rd);
  assert.equal(new Set(rds).size, rds.length, 'each profile gets its own RD');
  assert.equal(rds[0], `${R.PROVIDER.asNumber}:${R.PROVIDER.rdPoolBase}`);
  assert.equal(rds[1], `${R.PROVIDER.asNumber}:${R.PROVIDER.rdPoolBase + 1}`);
});

test('every DERIVE trace names its algorithm and is labelled an inference', () => {
  const result = engine.safeMap(preset()).result;
  const derived = result.traces.filter((t) => t.category === 'DERIVE');
  assert.ok(derived.length >= 4, 'expected vpn-type, rd, route-targets, local-as and interface-id traces');
  for (const trace of derived) {
    assert.equal(trace.confidence, 'engineering-inference');
    assert.ok(trace.derivation, `DERIVE trace ${trace.ruleId} has no derivation name`);
    assert.ok(trace.note.length > 0);
    assert.equal(trace.sourcePath, null, 'a DERIVE rule has no L3SM source path');
  }
});

test('hub-spoke gives the hub the spoke route targets and each spoke its own export', () => {
  const result = engine.safeMap(preset()).result;
  const byRole = {};
  profilesOf(result).forEach((p) => { byRole[p.role] = p; });
  assert.deepEqual(Object.keys(byRole).sort(), ['hub-role', 'spoke-role']);

  const targetsOf = (profile) => profile['address-family'][0]['vpn-targets']['vpn-target']
    .map((entry) => `${entry['route-target-type']}:${entry['route-targets'].map((rt) => rt['route-target']).join(',')}`);

  const hub = targetsOf(byRole['hub-role']);
  const spoke = targetsOf(byRole['spoke-role']);
  assert.equal(hub.length, 2);
  assert.equal(spoke.length, 2);
  const hubImport = hub.find((t) => t.startsWith('import:')).slice('import:'.length).split(',');
  const spokeExport = spoke.find((t) => t.startsWith('export:')).slice('export:'.length).split(',');
  assert.ok(hubImport.includes(spokeExport[0]), 'the hub must import what the spoke exports');
  assert.ok(hubImport.length > spokeExport.length, 'the hub imports more than one target');
});

test('any-to-any gives every profile the same import and export target', () => {
  const input = single();
  input.sites.push({
    siteId: 'site-2',
    accesses: [{
      siteNetworkAccessId: 'sna-2', customerAddress: '192.0.2.20', prefixLength: 24,
      attachmentVpnId: 'vpn-1', bgpAutonomousSystem: 65022
    }]
  });
  const result = engine.safeMap(input).result;
  const found = profilesOf(result);
  assert.equal(found.length, 1, 'both sites share the default any-to-any-role');
  const entries = found[0]['address-family'][0]['vpn-targets']['vpn-target'];
  assert.deepEqual(entries[0]['route-targets'], entries[1]['route-targets']);
});

/* ------------------------------------------------------------------ 3.3 */

test('the round trip restores every invertible field of the preset', () => {
  const inputs = preset();
  const result = engine.safeMap(inputs).result;
  const inverted = engine.invertL3NM(result.l3nmInstance);

  assert.equal(inverted.l3sm.vpnServices.length, 1);
  const service = inverted.l3sm.vpnServices[0];
  assert.equal(service.vpnId, 'vpn-svc-1001');
  assert.equal(service.customerName, 'Example Bank Ltd');
  assert.equal(service.vpnServiceTopology, 'hub-spoke');
  assert.equal(service.sites.length, 2);
  assert.equal(service.sites[0].siteId, 'site-hq');
  assert.equal(service.sites[0].accesses[0].customerAddress, '192.0.2.10');
  assert.equal(service.sites[0].accesses[0].siteRole, 'hub-role');
  assert.equal(service.sites[1].accesses[0].bgpAutonomousSystem, 65022);

  assert.ok(inverted.droppedFieldIds.includes('city'));
  assert.ok(inverted.droppedFieldIds.includes('countryCode'));
  assert.ok(inverted.nonInvertibleTargets.includes('rd'));
  assert.ok(inverted.nonInvertibleTargets.includes('vpn-type'));
});

test('derived L3NM leaves are never inverted back into the service model', () => {
  const result = engine.safeMap(preset()).result;
  const inverted = engine.invertL3NM(result.l3nmInstance);
  const flat = JSON.stringify(inverted.l3sm);
  assert.ok(!flat.includes(String(R.PROVIDER.asNumber)));
  assert.ok(!flat.includes('bgp-based-l3vpn'));
  assert.ok(!flat.includes('acc-'));
});

/* ------------------------------------------------------------------ 3.4 */

test('the preset scores 100 / 0 / 100 on the three metrics', () => {
  const inputs = preset();
  const metrics = engine.computeMetrics(inputs, engine.safeMap(inputs).result);

  assert.equal(metrics.coverage.percent, 100);
  assert.equal(metrics.coverage.total, R.SCOPE.subsetFieldCount);
  assert.deepEqual(metrics.coverage.uncoveredFieldIds, []);
  assert.equal(metrics.roundTrip.diffCount, 0);
  assert.deepEqual(metrics.roundTrip.diffs, []);
  assert.equal(metrics.traceability.percent, 100);
  assert.deepEqual(metrics.traceability.gaps, []);
  assert.ok(metrics.traceability.leaves > 20);
  assert.equal(metrics.subsetShare.rfc8299Leaves, R.SCOPE.rfc8299LeafTotal);
});

test('coverage counts a DROP rule as a hit on the field it drops', () => {
  const inputs = preset();
  const result = engine.safeMap(inputs).result;
  assert.ok(result.firedFieldIds.city, 'city is filled in the preset, so its DROP rule fires');

  const cleared = preset();
  cleared.sites.forEach((site) => { site.city = ''; site.countryCode = ''; });
  const metrics = engine.computeMetrics(cleared, engine.safeMap(cleared).result);
  assert.equal(metrics.coverage.percent, 100, 'an empty DROP source is still covered by its rule');
  assert.ok(result.dropped.some((d) => d.ruleId === 'R17' && d.carried));
});

test('a leaf with no rule behind it shows up as a traceability gap', () => {
  const inputs = preset();
  const result = engine.safeMap(inputs).result;
  nodes(result)[0]['vpn-node-name'] = 'injected-by-test';
  const metrics = engine.computeMetrics(inputs, result);

  assert.ok(metrics.traceability.percent < 100);
  assert.equal(metrics.traceability.gaps.length, 1);
  assert.ok(metrics.traceability.gaps[0].endsWith('/vpn-node-name'));
});

test('a round-trip difference is reported with its path', () => {
  const inputs = preset();
  const result = engine.safeMap(inputs).result;
  access(result, 0, 0, 0)['ip-connection'].ipv4['static-addresses'].address[0]['customer-address'] = '198.51.100.9';
  const metrics = engine.computeMetrics(inputs, result);

  assert.equal(metrics.roundTrip.diffCount, 1);
  assert.equal(metrics.roundTrip.diffs[0].fieldId, 'customerAddress');
  assert.equal(metrics.roundTrip.diffs[0].before, '192.0.2.10');
  assert.equal(metrics.roundTrip.diffs[0].after, '198.51.100.9');
});

/* ------------------------------------------------------------------ 3.5 */

test('the validator rejects values the RFC types forbid', () => {
  const badAddress = preset();
  badAddress.sites[0].accesses[0].customerAddress = '192.0.2';
  let verdict = engine.validateL3SM(badAddress);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.errors[0].kind, 'type');
  assert.equal(verdict.errors[0].fieldId, 'customerAddress');

  const badPrefix = preset();
  badPrefix.sites[0].accesses[0].prefixLength = 33;
  verdict = engine.validateL3SM(badPrefix);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.errors[0].kind, 'range');

  const octetTooBig = preset();
  octetTooBig.sites[0].accesses[0].customerAddress = '192.0.2.300';
  assert.equal(engine.validateL3SM(octetTooBig).valid, false);

  const badAs = preset();
  badAs.sites[0].accesses[0].bgpAutonomousSystem = 4294967296;
  assert.equal(engine.validateL3SM(badAs).valid, false);
});

test('the validator rejects values outside the RFC identity sets', () => {
  const input = preset();
  input.vpnServices[0].vpnServiceTopology = 'hub-and-spoke';
  const verdict = engine.validateL3SM(input);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.errors[0].kind, 'enum');
  assert.match(verdict.errors[0].message, /hub-spoke-disjoint/);
});

test('the validator reports a missing mandatory leaf with its RFC path', () => {
  const input = preset();
  input.sites[0].siteId = '';
  const verdict = engine.validateL3SM(input);
  assert.equal(verdict.valid, false);
  const error = verdict.errors.find((e) => e.fieldId === 'siteId');
  assert.equal(error.kind, 'mandatory');
  assert.equal(error.path, 'sites/site/site-id');
});

test('a board-required leaf that the RFC leaves optional says so', () => {
  const input = preset();
  input.vpnServices[0].customerName = '';
  const verdict = engine.validateL3SM(input);
  const error = verdict.errors.find((e) => e.fieldId === 'customerName');
  assert.equal(error.kind, 'board-required');
  assert.match(error.message, /Required by this board/);
});

test('an illegal input never reaches the mapped instance', () => {
  const previous = engine.safeMap(preset()).result;

  const bad = preset();
  bad.sites[0].accesses[0].customerAddress = '192.0.2';
  const outcome = engine.safeMap(bad, { batchId: 'batch-2', previous: previous.l3nmInstance });

  assert.equal(outcome.valid, false);
  assert.equal(outcome.result, null);
  assert.ok(outcome.errors.length > 0);
});

test('a dangling vpn-attachment leafref is rejected', () => {
  const input = preset();
  input.sites[0].accesses[0].attachmentVpnId = 'vpn-svc-9999';
  const verdict = engine.validateL3SM(input);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.errors[0].kind, 'leafref');
});

/* ------------------------------------------------------------- SPLIT fan-out */

test('one site attached to two VPN services produces two vpn-nodes', () => {
  const input = single();
  input.vpnServices.push({ vpnId: 'vpn-2', customerName: 'Acme', vpnServiceTopology: 'any-to-any' });
  input.sites[0].accesses.push({
    siteNetworkAccessId: 'sna-1b', customerAddress: '192.0.2.11', prefixLength: 24,
    attachmentVpnId: 'vpn-2', bgpAutonomousSystem: 65011
  });
  const result = engine.safeMap(input).result;

  assert.equal(result.l3nmInstance['vpn-services']['vpn-service'].length, 2);
  assert.equal(nodes(result, 0)[0]['vpn-node-id'], 'site-1');
  assert.equal(nodes(result, 1)[0]['vpn-node-id'], 'site-1');

  const split = result.traces.filter((t) => t.ruleId === 'R04');
  assert.equal(split.length, 2);
  assert.equal(split[0].fanout, 2);
});

test('two accesses on one site become two vpn-network-accesses on one vpn-node', () => {
  const input = single();
  input.sites[0].accesses.push({
    siteNetworkAccessId: 'sna-1b', customerAddress: '192.0.2.11', prefixLength: 24,
    attachmentVpnId: 'vpn-1', bgpAutonomousSystem: 65012
  });
  const result = engine.safeMap(input).result;
  const list = accesses(result);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((a) => a.id), ['sna-1', 'sna-1b']);
  assert.equal(nodes(result).length, 1, 'both accesses stay on one vpn-node');
});

test('a site with no access for a given VPN is absent from that VPN service', () => {
  const input = single();
  input.vpnServices.push({ vpnId: 'vpn-2', customerName: 'Acme' });
  const result = engine.safeMap(input).result;
  assert.deepEqual(nodes(result, 1), []);
});

/* ------------------------------------------------------------------- DROP */

test('dropped leaves are reported with their values and their citation', () => {
  const result = engine.safeMap(preset()).result;
  const drop = result.dropped.find((d) => d.ruleId === 'R17');
  assert.equal(drop.targetPath, null);
  assert.equal(drop.carried, true);
  assert.equal(drop.values.length, 4);
  assert.ok(drop.citations.some((c) => c.rfc === '9182' && c.section === '7.5'));

  const instance = JSON.stringify(result.l3nmInstance);
  assert.ok(!instance.includes('Geneva'));
  assert.ok(!instance.includes('"CH"'));

  const scheduling = result.dropped.find((d) => d.ruleId === 'R18');
  assert.equal(scheduling.carried, false, 'requested-site-start is not exposed on this board');
});

/* ------------------------------------------------------- element id lookup */

test('pathToElementId is stable and unique per leaf path', () => {
  const result = engine.safeMap(preset()).result;
  const ids = result.traces.map((t) => t.elementId).filter(Boolean);
  assert.equal(new Set(ids).size, new Set(result.traces.filter((t) => t.elementId).map((t) => t.instancePath)).size);
  assert.ok(ids.every((id) => /^i3t-[a-z0-9-]+$/.test(id)));
});

test('readAtPath resolves a keyed path produced by the mapper', () => {
  const result = engine.safeMap(preset()).result;
  const trace = result.traces.find((t) => t.ruleId === 'R13');
  assert.equal(engine.readAtPath(result.l3nmInstance, trace.instancePath), trace.value);
});

test('readAtPath resolves every trace path, including numeric list keys', () => {
  const result = engine.safeMap(preset()).result;
  const unresolved = result.traces
    .filter((t) => t.instancePath && engine.readAtPath(result.l3nmInstance, t.instancePath) === undefined)
    .map((t) => `${t.ruleId} ${t.instancePath}`);
  assert.deepEqual(unresolved, []);
});

test('only the traces an edited leaf actually affects report a change', () => {
  const first = engine.safeMap(preset()).result;
  const edited = preset();
  edited.sites[0].accesses[0].customerAddress = '203.0.113.9';
  const second = engine.safeMap(edited, { previous: first.l3nmInstance }).result;

  const changed = second.traces.filter((t) => JSON.stringify(t.before) !== JSON.stringify(t.after));
  assert.deepEqual(changed.map((t) => t.ruleId), ['R07']);

  const untouched = second.traces.filter((t) => t.ruleId !== 'R07');
  assert.ok(untouched.length > 20, 'the preset produces more traces than just R07');
  for (const trace of untouched) {
    assert.deepEqual(trace.before, trace.after, `${trace.ruleId} reported a change at ${trace.instancePath}`);
  }
});

test('a container-targeted trace reports presence, not its whole subtree', () => {
  const first = engine.safeMap(preset()).result;
  const second = engine.safeMap(preset(), { previous: first.l3nmInstance }).result;
  const placements = second.traces.filter((t) => t.ruleId === 'R10');
  assert.ok(placements.length >= 2, 'the preset places a node per site');
  for (const trace of placements) {
    assert.equal(typeof trace.before, 'string');
    assert.equal(trace.before, trace.after);
  }
});

test('a site attached to two VPN services still round-trips without differences', () => {
  const inputs = {
    vpnServices: [
      { vpnId: 'vpn-a', customerName: 'Acme', vpnServiceTopology: 'any-to-any' },
      { vpnId: 'vpn-b', customerName: 'Acme', vpnServiceTopology: 'any-to-any' }
    ],
    sites: [{
      siteId: 'site-1',
      accesses: [
        {
          siteNetworkAccessId: 'sna-1', customerAddress: '192.0.2.10', prefixLength: 30,
          attachmentVpnId: 'vpn-a', siteRole: 'any-to-any-role', bgpAutonomousSystem: 65011
        },
        {
          siteNetworkAccessId: 'sna-2', customerAddress: '192.0.2.14', prefixLength: 30,
          attachmentVpnId: 'vpn-b', siteRole: 'any-to-any-role', bgpAutonomousSystem: 65022
        }
      ]
    }]
  };
  const result = engine.safeMap(inputs).result;
  assert.deepEqual(
    result.l3nmInstance['vpn-services']['vpn-service'].map((s) => s['vpn-nodes']['vpn-node'].map((n) => n['vpn-node-id'])),
    [['site-1'], ['site-1']],
    'the same site becomes a vpn-node under each service it is attached to'
  );
  const metrics = engine.computeMetrics(inputs, result);
  assert.deepEqual(metrics.roundTrip.diffs, []);
  assert.equal(metrics.roundTrip.diffCount, 0);
  assert.equal(metrics.coverage.percent, 100);
  assert.equal(metrics.traceability.percent, 100);
});

test('an unset site-role round-trips as the RFC default without counting as a difference', () => {
  const inputs = single();
  delete inputs.sites[0].accesses[0].siteRole;
  const result = engine.safeMap(inputs).result;
  const metrics = engine.computeMetrics(inputs, result);

  assert.deepEqual(metrics.roundTrip.diffs, []);
  assert.equal(
    profilesOf(result)[0].role,
    R.FIELDS.find((f) => f.id === 'siteRole').defaultValue,
    'the mapping materialises the default RFC 8299 declares for site-role'
  );
});
