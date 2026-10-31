/* Mapping engine: pure functions, no DOM, no network, no framework.
 *
 * One input object goes in, one RFC 9182 shaped instance plus a trace list
 * comes out. The board in poc.js is only a consumer of this; the rule table,
 * the traces and the metrics all come from the single implementation here so
 * that they cannot drift apart.
 *
 * Loaded as a classic script after rules.js. Under Node the same file is
 * evaluated inside a vm context by tools/engine.test.mjs.
 */
(function (global) {
  'use strict';

  var ns = global.Ietf3Tier || (global.Ietf3Tier = {});
  var R = ns.rules;

  var IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

  function isFilled(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function fieldById(id) {
    for (var i = 0; i < R.FIELDS.length; i += 1) {
      if (R.FIELDS[i].id === id) { return R.FIELDS[i]; }
    }
    return null;
  }

  function rulesBySourceField(fieldId) {
    var out = [];
    R.RULES.forEach(function (rule) {
      var ids = rule.sourceFields || (rule.sourceField ? [rule.sourceField] : []);
      if (ids.indexOf(fieldId) !== -1) { out.push(rule); }
    });
    return out;
  }

  /* ---------------------------------------------------------------- paths */

  function instancePath(parts) {
    return parts.join('/');
  }

  function segment(name, key) {
    return isFilled(key) ? name + '[' + key + ']' : name;
  }

  function pathToElementId(path) {
    return 'i3t-' + path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function readAtPath(instance, path) {
    var node = instance;
    var parts = path.split('/');
    for (var i = 0; i < parts.length; i += 1) {
      if (node === undefined || node === null) { return undefined; }
      var m = parts[i].match(/^([^\[]+)(?:\[(.*)\])?$/);
      var name = m[1];
      var key = m[2];
      node = node[name];
      if (isFilled(key)) {
        if (!Array.isArray(node)) { return undefined; }
        var found = null;
        node.forEach(function (entry) {
          /* List keys are printed into a path as strings, but a numeric key
             such as vpn-target/id stays a number in the instance. */
          if (found === null && entry && String(firstValue(entry)) === key) { found = entry; }
        });
        node = found;
      }
    }
    return node;
  }

  function firstValue(entry) {
    if (entry === null || typeof entry !== 'object') { return entry; }
    var keys = Object.keys(entry);
    return keys.length ? entry[keys[0]] : undefined;
  }

  /* Walk every non-empty leaf of an instance and report its concrete path.
     A list entry appends its key to the path it already sits on, because the
     container that holds the list is a node of its own; a leaf-list is
     reported once, under its own path, with the array as its value. */
  function walkLeaves(node, prefix, out) {
    if (node === null || node === undefined || node === '') { return out; }
    if (Array.isArray(node)) {
      if (!node.length) { return out; }
      if (node.every(function (entry) { return entry === null || typeof entry !== 'object'; })) {
        out.push({ path: prefix, value: node });
        return out;
      }
      node.forEach(function (entry) {
        walkLeaves(entry, prefix + '[' + firstValue(entry) + ']', out);
      });
      return out;
    }
    if (typeof node === 'object') {
      Object.keys(node).forEach(function (name) {
        walkLeaves(node[name], prefix ? prefix + '/' + name : name, out);
      });
      return out;
    }
    out.push({ path: prefix, value: node });
    return out;
  }

  /* ------------------------------------------------------------ validator */

  function validateIpv4(value) {
    var m = IPV4_RE.exec(String(value).trim());
    if (!m) { return false; }
    for (var i = 1; i <= 4; i += 1) {
      if (Number(m[i]) > 255) { return false; }
    }
    return true;
  }

  function validateField(field, value, context) {
    var errors = [];
    var where = {
      fieldId: field.id,
      path: field.path,
      siteIndex: context.siteIndex,
      accessIndex: context.accessIndex,
      serviceIndex: context.serviceIndex
    };

    if (!isFilled(value)) {
      if (field.mandatory) {
        errors.push(Object.assign({}, where, {
          message: 'Required by RFC 8299: this leaf is ' +
            (field.typeNote.indexOf('list key') !== -1 ? 'the list key' : 'declared mandatory') +
            ' and cannot be left empty.',
          kind: 'mandatory'
        }));
      } else if (field.requiredFor) {
        errors.push(Object.assign({}, where, {
          message: 'Required by this board. ' + field.requiredFor,
          kind: 'board-required'
        }));
      }
      return errors;
    }

    if (field.yangType === 'ipv4' && !validateIpv4(value)) {
      errors.push(Object.assign({}, where, {
        message: 'Not a valid inet:ipv4-address. Four decimal octets separated by dots, each 0-255.',
        kind: 'type'
      }));
    }

    if (field.yangType === 'uint8' || field.yangType === 'uint32') {
      var n = Number(value);
      if (!/^\d+$/.test(String(value).trim()) || Number.isNaN(n)) {
        errors.push(Object.assign({}, where, {
          message: 'Not a valid ' + field.yangType + ': digits only.',
          kind: 'type'
        }));
      } else if (field.range && (n < field.range[0] || n > field.range[1])) {
        errors.push(Object.assign({}, where, {
          message: 'Out of range for ' + field.yangType + ' ' + field.range[0] + '..' + field.range[1] + '.',
          kind: 'range'
        }));
      }
    }

    if (field.enumValues && field.enumValues.indexOf(String(value)) === -1) {
      errors.push(Object.assign({}, where, {
        message: 'Not one of the identity values defined by RFC 8299: ' + field.enumValues.join(', ') + '.',
        kind: 'enum'
      }));
    }

    if (field.pattern && !new RegExp(field.pattern).test(String(value))) {
      errors.push(Object.assign({}, where, {
        message: 'Does not match the RFC 8299 pattern ' + field.pattern + '.',
        kind: 'pattern'
      }));
    }

    return errors;
  }

  function validateL3SM(inputs) {
    var errors = [];
    var vpnIds = (inputs.vpnServices || []).map(function (svc) { return svc.vpnId; });

    (inputs.vpnServices || []).forEach(function (svc, serviceIndex) {
      R.FIELDS.filter(function (f) { return f.scope === 'vpnService'; }).forEach(function (field) {
        errors = errors.concat(validateField(field, svc[field.id], { serviceIndex: serviceIndex }));
      });
    });

    (inputs.sites || []).forEach(function (site, siteIndex) {
      R.FIELDS.filter(function (f) { return f.scope === 'site'; }).forEach(function (field) {
        errors = errors.concat(validateField(field, site[field.id], { siteIndex: siteIndex }));
      });

      var accesses = site.accesses || [];
      if (!accesses.length) {
        errors.push({
          fieldId: 'siteNetworkAccessId', path: fieldById('siteNetworkAccessId').path,
          siteIndex: siteIndex, accessIndex: null,
          message: 'A site needs at least one site-network-access to map into a vpn-network-access.',
          kind: 'structure'
        });
      }

      accesses.forEach(function (access, accessIndex) {
        var ctx = { siteIndex: siteIndex, accessIndex: accessIndex };
        R.FIELDS.filter(function (f) { return f.scope === 'access'; }).forEach(function (field) {
          errors = errors.concat(validateField(field, access[field.id], ctx));
        });
        if (isFilled(access.attachmentVpnId) && vpnIds.indexOf(access.attachmentVpnId) === -1) {
          errors.push({
            fieldId: 'attachmentVpnId', path: fieldById('attachmentVpnId').path,
            siteIndex: siteIndex, accessIndex: accessIndex,
            message: 'This leafref points at vpn-services/vpn-service/vpn-id, and no vpn-service with id "' +
              access.attachmentVpnId + '" exists in the input.',
            kind: 'leafref'
          });
        }
      });
    });

    return { valid: errors.length === 0, errors: errors };
  }

  /* ------------------------------------------------------------- mapping */

  /* The instance follows the RFC 9182 tree shape: every container that holds
     a list keeps that list under its own name, so a path read off the
     instance is the same path the RFC tree diagram prints. */
  function emptyInstance() {
    return { 'vpn-services': { 'vpn-service': [] } };
  }

  function sanitize(text) {
    return String(text).replace(/[^A-Za-z0-9._-]+/g, '-');
  }

  /* Route target allocation, by service topology. Values are formed from the
     simulated provider profile in rules.js; see rule R14 for why this is an
     engineering inference rather than a mapping taken from either document. */
  function allocateRouteTargets(topology, profileIndexes, roleOfProfile) {
    var serviceRt = R.PROVIDER.asNumber + ':' + (R.PROVIDER.rtPoolBase + 0);
    var own = {};
    Object.keys(profileIndexes).forEach(function (key) {
      own[key] = R.PROVIDER.asNumber + ':' + (R.PROVIDER.rtPoolBase + profileIndexes[key]);
    });

    var out = {};
    Object.keys(profileIndexes).forEach(function (key) {
      var role = roleOfProfile[key];
      if (topology === 'any-to-any') {
        out[key] = { import: [serviceRt], export: [serviceRt] };
        return;
      }
      if (role === 'hub-role') {
        var hubImport = [serviceRt];
        Object.keys(profileIndexes).forEach(function (other) {
          if (roleOfProfile[other] === 'spoke-role' && hubImport.indexOf(own[other]) === -1) {
            hubImport.push(own[other]);
          }
        });
        out[key] = { import: hubImport, export: [serviceRt] };
        return;
      }
      out[key] = { import: [serviceRt], export: [own[key]] };
    });
    return out;
  }

  /* RFC 9182 makes route-targets a list keyed by its own route-target leaf,
     not a leaf-list, so every value gets its own entry. route-target-type is
     the ietf-routing-types enumeration: import, export or both. */
  function routeTargetEntries(values) {
    return values.map(function (value) { return { 'route-target': value }; });
  }

  function vpnTargetEntries(targets) {
    var entries = [];
    if (targets.import && targets.import.length) {
      entries.push({
        id: 1,
        'route-targets': routeTargetEntries(targets.import),
        'route-target-type': 'import'
      });
    }
    if (targets.export && targets.export.length) {
      entries.push({
        id: 2,
        'route-targets': routeTargetEntries(targets.export),
        'route-target-type': 'export'
      });
    }
    return entries;
  }

  function mapL3SM(inputs, options) {
    options = options || {};
    var batchId = isFilled(options.batchId) ? options.batchId : 'batch-0';
    var previous = options.previous || emptyInstance();
    var traces = [];
    var dropped = [];
    var provenance = {};
    var causal = 0;
    var instance = emptyInstance();
    var firedFieldIds = {};

    function trace(rule, fields) {
      causal += 1;
      var path = fields.instancePath;
      var before = readAtPath(previous, path);
      /* A rule whose target is a container rather than a leaf — R10 places a
         vpn-node under a vpn-service — has no leaf value to diff against, and
         its subtree changes whenever anything below it changes. Presence is
         what such a rule actually decides, so that is what gets compared. */
      if (before !== null && before !== undefined && typeof before === 'object') {
        before = fields.value === undefined ? null : fields.value;
      }
      var entry = {
        batchId: batchId,
        causalNo: causal,
        ruleId: rule.id,
        category: rule.category,
        confidence: rule.confidence,
        sourcePath: fields.sourcePath || rule.sourcePath || null,
        targetPath: rule.targetPath,
        instancePath: path,
        elementId: path ? pathToElementId(path) : null,
        anchor: fields.anchor || null,
        before: before === undefined ? null : before,
        after: fields.value === undefined ? null : fields.value,
        value: fields.value === undefined ? null : fields.value,
        fanout: fields.fanout || 1,
        structuralKeys: rule.structuralKeys || [],
        extraPaths: (fields.extraPaths || []).slice(),
        citations: rule.citations,
        note: rule.note,
        derivation: rule.derivation || null
      };
      if (path) {
        provenance[path] = { ruleId: rule.id, note: rule.note };
        (fields.extraPaths || []).forEach(function (extra) {
          provenance[extra] = { ruleId: rule.id, note: 'Structural key emitted together with ' + path + '.' };
        });
      }
      return entry;
    }

    function ruleById(id) {
      for (var i = 0; i < R.RULES.length; i += 1) {
        if (R.RULES[i].id === id) { return R.RULES[i]; }
      }
      return null;
    }

    var services = inputs.vpnServices || [];
    var sites = inputs.sites || [];

    services.forEach(function (svc, serviceIndex) {
      var svcPath = ['vpn-services', segment('vpn-service', svc.vpnId)];
      var out = {};
      var svcTraces = [];

      function copyRule(ruleId, value, leafName, sourcePath) {
        if (!isFilled(value)) { return; }
        var rule = ruleById(ruleId);
        var path = instancePath(svcPath.concat([leafName]));
        out[leafName] = value;
        if (rule.sourceField) { firedFieldIds[rule.sourceField] = true; }
        svcTraces.push(trace(rule, {
          value: value, instancePath: path, sourcePath: sourcePath || rule.sourcePath,
          fanout: 1, extraPaths: [], anchor: { serviceIndex: serviceIndex }
        }));
      }

      copyRule('R01', svc.vpnId, 'vpn-id');
      copyRule('R02', svc.customerName, 'customer-name');
      copyRule('R03', svc.vpnServiceTopology, 'vpn-service-topology');

      /* R12: vpn-type has no L3SM source at all. */
      var vpnType = 'bgp-based-l3vpn';
      out['vpn-type'] = vpnType;
      svcTraces.push(trace(ruleById('R12'), {
        value: vpnType, instancePath: instancePath(svcPath.concat(['vpn-type'])), fanout: 1,
        anchor: { serviceIndex: serviceIndex }
      }));

      /* Group the accesses of every site by the role they carry, because the
         RFC 9182 role lives on the vpn-instance-profile, not on the access. */
      var profiles = [];
      var nodes = [];
      var bindings = [];

      sites.forEach(function (site, siteIndex) {
        var attached = (site.accesses || []).filter(function (access) {
          return access.attachmentVpnId === svc.vpnId;
        });
        if (!attached.length) { return; }

        var nodePath = svcPath.concat(['vpn-nodes', segment('vpn-node', site.siteId)]);
        var node = { 'vpn-node-id': site.siteId, 'vpn-network-accesses': { 'vpn-network-access': [] } };
        var nodeTraceDone = false;

        attached.forEach(function (access) {
          var role = isFilled(access.siteRole) ? access.siteRole : fieldById('siteRole').defaultValue;
          var profileKey = svc.vpnId + '::' + role;
          /* The board indexes an access by its position in site.accesses, not
             by its position in the attached subset, so the anchor has to be
             the same index the form row was rendered under. */
          var anchor = {
            serviceIndex: serviceIndex,
            siteIndex: siteIndex,
            accessIndex: (site.accesses || []).indexOf(access)
          };

          if (!profiles.some(function (p) { return p.key === profileKey; })) {
            profiles.push({ key: profileKey, role: role, anchor: anchor });
          }

          /* R04: site-id -> vpn-node-id, and R10: the attachment that decides
             which vpn-service owns this node. Both fire once per site per
             service, however many accesses that site contributes. */
          if (!nodeTraceDone) {
            nodeTraceDone = true;
            firedFieldIds.siteId = true;
            firedFieldIds.attachmentVpnId = true;
            svcTraces.push(trace(ruleById('R04'), {
              value: site.siteId,
              instancePath: instancePath(nodePath.concat(['vpn-node-id'])),
              fanout: services.length,
              anchor: { serviceIndex: serviceIndex, siteIndex: siteIndex }
            }));
            svcTraces.push(trace(ruleById('R10'), {
              value: svc.vpnId,
              instancePath: instancePath(nodePath),
              sourcePath: ruleById('R10').sourcePath,
              fanout: attached.length,
              anchor: { serviceIndex: serviceIndex, siteIndex: siteIndex, accessIndex: anchor.accessIndex }
            }));
          }

          var accessPath = nodePath.concat([
            'vpn-network-accesses', segment('vpn-network-access', access.siteNetworkAccessId)
          ]);
          var outAccess = {};

          if (isFilled(access.siteNetworkAccessId)) {
            outAccess.id = access.siteNetworkAccessId;
            firedFieldIds.siteNetworkAccessId = true;
            svcTraces.push(trace(ruleById('R05'), {
              value: access.siteNetworkAccessId,
              instancePath: instancePath(accessPath.concat(['id'])),
              fanout: 1,
              anchor: anchor
            }));
          }

          /* R16: synthesised network-side interface identifier. */
          var interfaceId = 'acc-' + sanitize(access.siteNetworkAccessId || site.siteId);
          outAccess['interface-id'] = interfaceId;
          svcTraces.push(trace(ruleById('R16'), {
            value: interfaceId,
            instancePath: instancePath(accessPath.concat(['interface-id'])),
            fanout: 1,
            anchor: anchor
          }));

          var ipv4 = {};
          var ipPath = accessPath.concat(['ip-connection', 'ipv4']);

          if (isFilled(access.prefixLength)) {
            ipv4['prefix-length'] = Number(access.prefixLength);
            firedFieldIds.prefixLength = true;
            svcTraces.push(trace(ruleById('R08'), {
              value: Number(access.prefixLength),
              instancePath: instancePath(ipPath.concat(['prefix-length'])),
              fanout: 1,
              anchor: anchor
            }));
          }

          if (isFilled(access.providerAddress)) {
            ipv4['local-address'] = access.providerAddress;
            svcTraces.push(trace(ruleById('R06'), {
              value: access.providerAddress,
              instancePath: instancePath(ipPath.concat(['local-address'])),
              fanout: 1,
              anchor: anchor
            }));
          }

          if (isFilled(access.customerAddress)) {
            var addressId = 'addr-' + sanitize(access.siteNetworkAccessId || site.siteId);
            var staticPath = ipPath.concat(['static-addresses']);
            var addressPath = staticPath.concat([segment('address', addressId)]);
            ipv4['static-addresses'] = {
              'primary-address': addressId,
              address: [{ 'address-id': addressId, 'customer-address': access.customerAddress }]
            };
            firedFieldIds.customerAddress = true;
            svcTraces.push(trace(ruleById('R07'), {
              value: access.customerAddress,
              instancePath: instancePath(addressPath.concat(['customer-address'])),
              fanout: 1,
              anchor: anchor,
              extraPaths: [
                instancePath(staticPath.concat(['primary-address'])),
                instancePath(addressPath.concat(['address-id']))
              ]
            }));
          }

          if (Object.keys(ipv4).length) {
            outAccess['ip-connection'] = { ipv4: ipv4 };
          }

          /* R11: customer AS becomes the provider-side peer AS. */
          if (isFilled(access.bgpAutonomousSystem)) {
            var rpId = 'bgp-' + sanitize(access.siteNetworkAccessId || site.siteId);
            var bgpPath = accessPath.concat(['routing-protocols', segment('routing-protocol', rpId), 'bgp']);
            var localAs = R.PROVIDER.asNumber;
            outAccess['routing-protocols'] = {
              'routing-protocol': [{
                id: rpId,
                type: 'bgp-routing',
                bgp: { 'local-as': localAs, 'peer-as': Number(access.bgpAutonomousSystem) }
              }]
            };
            firedFieldIds.bgpAutonomousSystem = true;
            svcTraces.push(trace(ruleById('R11'), {
              value: Number(access.bgpAutonomousSystem),
              instancePath: instancePath(bgpPath.concat(['peer-as'])),
              fanout: 1,
              anchor: anchor,
              extraPaths: [
                instancePath(accessPath.concat(['routing-protocols', segment('routing-protocol', rpId), 'id'])),
                instancePath(accessPath.concat(['routing-protocols', segment('routing-protocol', rpId), 'type']))
              ]
            }));
            /* R15: provider AS, no L3SM source. */
            svcTraces.push(trace(ruleById('R15'), {
              value: localAs,
              instancePath: instancePath(bgpPath.concat(['local-as'])),
              fanout: 1,
              anchor: anchor
            }));
          }

          node['vpn-network-accesses']['vpn-network-access'].push(outAccess);
          bindings.push({
            siteId: site.siteId,
            accessId: access.siteNetworkAccessId,
            profileKey: profileKey,
            accessPath: accessPath,
            anchor: anchor
          });
        });

        nodes.push({ siteId: site.siteId, node: node, path: nodePath });
      });

      /* Build the profiles now that every role is known, then bind accesses. */
      var indexes = {};
      var roles = {};
      profiles.forEach(function (profile, i) {
        indexes[profile.key] = i + 1;
        roles[profile.key] = profile.role;
      });
      var targets = allocateRouteTargets(svc.vpnServiceTopology || 'any-to-any', indexes, roles);

      profiles.forEach(function (profile, i) {
        var profileId = 'profile-' + sanitize(svc.vpnId) + '-' + sanitize(profile.role);
        var profilePath = svcPath.concat([
          'vpn-instance-profiles', segment('vpn-instance-profile', profileId)
        ]);
        var rd = R.PROVIDER.asNumber + ':' + (R.PROVIDER.rdPoolBase + i);
        var afPath = profilePath.concat([segment('address-family', 'ipv4')]);
        var targetsOfProfile = targets[profile.key] || { import: [], export: [] };
        var rtEntries = vpnTargetEntries(targetsOfProfile);
        var outProfile = {
          'profile-id': profileId,
          role: profile.role,
          rd: rd,
          'address-family': [{
            'address-family': 'ipv4',
            'vpn-targets': { 'vpn-target': rtEntries }
          }]
        };

        firedFieldIds.siteRole = true;
        svcTraces.push(trace(ruleById('R09'), {
          value: profile.role,
          instancePath: instancePath(profilePath.concat(['role'])),
          fanout: 1,
          anchor: profile.anchor,
          extraPaths: [instancePath(profilePath.concat(['profile-id']))]
        }));
        svcTraces.push(trace(ruleById('R13'), {
          value: rd,
          instancePath: instancePath(profilePath.concat(['rd'])),
          fanout: 1,
          anchor: profile.anchor
        }));

        /* One R14 trace per vpn-target entry: the main path is its first
           route-target leaf, the rest of that entry rides along as
           structural paths emitted by the same rule. */
        rtEntries.forEach(function (entry, entryIndex) {
          var entryPath = afPath.concat(['vpn-targets', segment('vpn-target', entry.id)]);
          var extras = [
            instancePath(entryPath.concat(['id'])),
            instancePath(entryPath.concat(['route-target-type']))
          ];
          entry['route-targets'].slice(1).forEach(function (rt) {
            extras.push(instancePath(entryPath.concat([
              segment('route-targets', rt['route-target']), 'route-target'
            ])));
          });
          if (entryIndex === 0) {
            extras.push(instancePath(afPath.concat(['address-family'])));
          }
          svcTraces.push(trace(ruleById('R14'), {
            value: entry['route-targets'][0]['route-target'],
            instancePath: instancePath(entryPath.concat([
              segment('route-targets', entry['route-targets'][0]['route-target']),
              'route-target'
            ])),
            fanout: entry['route-targets'].length,
            anchor: { serviceIndex: serviceIndex },
            extraPaths: extras
          }));
        });

        out['vpn-instance-profiles'] = out['vpn-instance-profiles'] || { 'vpn-instance-profile': [] };
        out['vpn-instance-profiles']['vpn-instance-profile'].push(outProfile);
        profile.id = profileId;
        profile.path = profilePath;
      });

      /* Bind every access to the profile that carries its role. */
      bindings.forEach(function (binding) {
        var profile = null;
        profiles.forEach(function (candidate) {
          if (candidate.key === binding.profileKey) { profile = candidate; }
        });
        if (!profile || !profile.id) { return; }
        var nodeEntry = null;
        nodes.forEach(function (candidate) {
          if (candidate.siteId === binding.siteId) { nodeEntry = candidate; }
        });
        if (!nodeEntry) { return; }
        var match = null;
        nodeEntry.node['vpn-network-accesses']['vpn-network-access'].forEach(function (outAccess) {
          if (outAccess.id === binding.accessId) { match = outAccess; }
        });
        if (!match) { return; }
        match['vpn-instance-profile'] = profile.id;
        svcTraces.push(trace(ruleById('R09'), {
          value: profile.id,
          instancePath: instancePath(binding.accessPath.concat(['vpn-instance-profile'])),
          fanout: 1,
          anchor: binding.anchor
        }));
      });

      out['vpn-nodes'] = { 'vpn-node': nodes.map(function (entry) { return entry.node; }) };
      instance['vpn-services']['vpn-service'].push(out);
      traces = traces.concat(svcTraces);
    });

    /* DROP rules: report what was lost, whether or not a value was supplied. */
    R.RULES.filter(function (rule) { return rule.category === 'DROP'; }).forEach(function (rule) {
      var fieldIds = rule.sourceFields || (rule.sourceField ? [rule.sourceField] : []);
      var carriers = [];
      sites.forEach(function (site, siteIndex) {
        fieldIds.forEach(function (fieldId) {
          if (isFilled(site[fieldId])) {
            carriers.push({ siteId: site.siteId, siteIndex: siteIndex, fieldId: fieldId, value: site[fieldId] });
            firedFieldIds[fieldId] = true;
          }
        });
      });
      dropped.push({
        ruleId: rule.id,
        sourcePath: rule.sourcePath,
        sourcePaths: (rule.sourcePath || '').split('|'),
        targetPath: rule.targetPath,
        fieldIds: fieldIds,
        citations: rule.citations,
        note: rule.note,
        values: carriers,
        carried: carriers.length > 0
      });
    });

    return {
      l3nmInstance: instance,
      traces: traces,
      dropped: dropped,
      provenance: provenance,
      firedFieldIds: firedFieldIds,
      batchId: batchId
    };
  }

  /* The single entry point the board uses. An input that fails validation
     never reaches mapL3SM, so the last legal L3NM instance stays untouched
     rather than being half rewritten by an illegal value. */
  function safeMap(inputs, options) {
    var verdict = validateL3SM(inputs);
    if (!verdict.valid) {
      return { valid: false, errors: verdict.errors, result: null };
    }
    return { valid: true, errors: [], result: mapL3SM(inputs, options) };
  }

  function cloneInput(inputs) {
    return JSON.parse(JSON.stringify(inputs));
  }

  /* ------------------------------------------------------------ round trip */

  function invertL3NM(instance) {
    var services = [];
    var covered = [];
    var nonInvertible = [];

    function entries(container, listName) {
      return ((container || {})[listName]) || [];
    }

    entries(instance['vpn-services'], 'vpn-service').forEach(function (svc) {
      var out = {
        vpnId: svc['vpn-id'],
        customerName: svc['customer-name'],
        vpnServiceTopology: svc['vpn-service-topology'],
        sites: []
      };
      covered.push('vpnId', 'customerName', 'vpnServiceTopology');
      nonInvertible.push('vpn-type');

      var profiles = {};
      entries(svc['vpn-instance-profiles'], 'vpn-instance-profile').forEach(function (profile) {
        profiles[profile['profile-id']] = profile;
        nonInvertible.push('rd', 'route-target');
      });

      entries(svc['vpn-nodes'], 'vpn-node').forEach(function (node) {
        var site = { siteId: node['vpn-node-id'], accesses: [] };
        covered.push('siteId');
        entries(node['vpn-network-accesses'], 'vpn-network-access').forEach(function (access) {
          var ipv4 = (access['ip-connection'] || {}).ipv4 || {};
          var addresses = entries(ipv4['static-addresses'], 'address');
          var customerAddress = addresses.length ? addresses[0]['customer-address'] : undefined;
          var profile = profiles[access['vpn-instance-profile']];
          var protocols = entries(access['routing-protocols'], 'routing-protocol');
          var bgp = (protocols[0] || {}).bgp || {};
          site.accesses.push({
            siteNetworkAccessId: access.id,
            customerAddress: customerAddress,
            prefixLength: ipv4['prefix-length'],
            attachmentVpnId: svc['vpn-id'],
            siteRole: profile ? profile.role : undefined,
            bgpAutonomousSystem: bgp['peer-as']
          });
          covered.push('siteNetworkAccessId', 'customerAddress', 'prefixLength',
            'attachmentVpnId', 'siteRole', 'bgpAutonomousSystem');
          nonInvertible.push('interface-id', 'local-as');
        });
        out.sites.push(site);
      });
      services.push(out);
    });

    return {
      l3sm: { vpnServices: services, sites: [] },
      coveredFieldIds: covered.filter(function (v, i, a) { return a.indexOf(v) === i; }),
      nonInvertibleTargets: nonInvertible.filter(function (v, i, a) { return a.indexOf(v) === i; }),
      droppedFieldIds: ['city', 'countryCode']
    };
  }

  /* Both sides are keyed by the YANG list key of the entry they came from,
     not by position: a site attached to two VPN services is inverted once per
     service, so its accesses are renumbered, and an index comparison would
     report that renumbering as data loss. */
  function flattenInput(inputs) {
    var flat = [];
    (inputs.vpnServices || []).forEach(function (svc, serviceIndex) {
      R.FIELDS.filter(function (f) { return f.scope === 'vpnService'; }).forEach(function (field) {
        flat.push({ fieldId: field.id, key: 'service:' + serviceIndex, value: svc[field.id] });
      });
    });
    (inputs.sites || []).forEach(function (site) {
      R.FIELDS.filter(function (f) { return f.scope === 'site'; }).forEach(function (field) {
        flat.push({ fieldId: field.id, key: 'site:' + site.siteId, value: site[field.id] });
      });
      (site.accesses || []).forEach(function (access) {
        R.FIELDS.filter(function (f) { return f.scope === 'access'; }).forEach(function (field) {
          flat.push({
            fieldId: field.id, key: 'access:' + access.siteNetworkAccessId, value: access[field.id]
          });
        });
      });
    });
    return flat;
  }

  function flattenInverted(inverted) {
    var flat = [];
    (inverted.l3sm.vpnServices || []).forEach(function (svc, serviceIndex) {
      R.FIELDS.filter(function (f) { return f.scope === 'vpnService'; }).forEach(function (field) {
        flat.push({ fieldId: field.id, key: 'service:' + serviceIndex, value: svc[field.id] });
      });
      (svc.sites || []).forEach(function (site) {
        R.FIELDS.filter(function (f) { return f.scope === 'site'; }).forEach(function (field) {
          flat.push({ fieldId: field.id, key: 'site:' + site.siteId, value: site[field.id] });
        });
        (site.accesses || []).forEach(function (access) {
          R.FIELDS.filter(function (f) { return f.scope === 'access'; }).forEach(function (field) {
            flat.push({
              fieldId: field.id, key: 'access:' + access.siteNetworkAccessId, value: access[field.id]
            });
          });
        });
      });
    });
    return flat;
  }

  function normalise(value) {
    if (value === undefined || value === null || value === '') { return ''; }
    return String(value);
  }

  /* -------------------------------------------------------------- metrics */

  function computeMetrics(inputs, result) {
    var inverted = invertL3NM(result.l3nmInstance);
    var original = flattenInput(inputs);
    var roundTripped = flattenInverted(inverted);
    var invertible = inverted.coveredFieldIds;

    var diffs = [];
    original.forEach(function (entry) {
      if (invertible.indexOf(entry.fieldId) === -1) { return; }
      var twin = null;
      roundTripped.forEach(function (candidate) {
        if (twin) { return; }
        if (candidate.fieldId === entry.fieldId && candidate.key === entry.key) { twin = candidate; }
      });
      if (!twin) {
        diffs.push({ fieldId: entry.fieldId, key: entry.key, path: fieldById(entry.fieldId).path, before: entry.value, after: undefined });
        return;
      }
      /* An input left empty and a round trip that returns the RFC-declared
         default denote the same configuration: RFC 8299 gives site-role the
         default any-to-any-role, so the mapping is allowed to materialise it. */
      var field = fieldById(entry.fieldId);
      var sameValue = normalise(entry.value) === normalise(twin.value) ||
        (!isFilled(entry.value) && field.defaultValue !== undefined &&
          normalise(twin.value) === normalise(field.defaultValue));
      if (!sameValue) {
        diffs.push({ fieldId: entry.fieldId, key: entry.key, path: field.path, before: entry.value, after: twin.value });
      }
    });

    /* A subset field counts as covered when a rule is bound to it and, if the
       visitor actually supplied a value, that rule fired. A DROP rule counts
       as a hit, because the field is accounted for either way. */
    var filled = {};
    original.forEach(function (entry) {
      if (isFilled(entry.value)) { filled[entry.fieldId] = true; }
    });

    var coveredCount = 0;
    var uncovered = [];
    R.FIELDS.forEach(function (field) {
      var bound = rulesBySourceField(field.id).length > 0;
      if (!bound) {
        uncovered.push({ fieldId: field.id, reason: 'no rule in the table reads this field' });
        return;
      }
      if (filled[field.id] && !result.firedFieldIds[field.id]) {
        uncovered.push({ fieldId: field.id, reason: 'a value was supplied but no rule fired on it' });
        return;
      }
      coveredCount += 1;
    });

    var leaves = walkLeaves(result.l3nmInstance, '', []);
    var gaps = [];
    leaves.forEach(function (leaf) {
      if (!result.provenance[leaf.path]) { gaps.push(leaf.path); }
    });

    return {
      coverage: {
        covered: coveredCount,
        total: R.SCOPE.subsetFieldCount,
        percent: R.SCOPE.subsetFieldCount ? Math.round((coveredCount / R.SCOPE.subsetFieldCount) * 1000) / 10 : 0,
        uncoveredFieldIds: uncovered,
        denominatorNote: 'of the declared subset, not of RFC 8299 as a whole'
      },
      subsetShare: {
        subset: R.SCOPE.subsetFieldCount,
        rfc8299Leaves: R.SCOPE.rfc8299LeafTotal,
        percent: Math.round((R.SCOPE.subsetFieldCount / R.SCOPE.rfc8299LeafTotal) * 1000) / 10,
        derivation: R.SCOPE.derivation
      },
      roundTrip: {
        diffCount: diffs.length,
        diffs: diffs,
        invertibleFieldIds: invertible,
        nonInvertibleTargets: inverted.nonInvertibleTargets,
        droppedFieldIds: inverted.droppedFieldIds
      },
      traceability: {
        leaves: leaves.length,
        gaps: gaps,
        percent: leaves.length ? Math.round(((leaves.length - gaps.length) / leaves.length) * 1000) / 10 : 100
      }
    };
  }

  ns.engine = {
    emptyInstance: emptyInstance,
    validateL3SM: validateL3SM,
    mapL3SM: mapL3SM,
    safeMap: safeMap,
    cloneInput: cloneInput,
    invertL3NM: invertL3NM,
    computeMetrics: computeMetrics,
    walkLeaves: walkLeaves,
    readAtPath: readAtPath,
    pathToElementId: pathToElementId,
    fieldById: fieldById,
    rulesBySourceField: rulesBySourceField,
    isFilled: isFilled
  };
})(typeof window !== 'undefined' ? window : globalThis);
