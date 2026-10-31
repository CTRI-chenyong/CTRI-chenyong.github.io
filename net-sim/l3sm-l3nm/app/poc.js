/* The board: renders the L3SM form and the L3NM instance, and keeps the rule
 * panel, the metrics and the connector overlay in step with them.
 *
 * Everything here is a consumer of engine.js; no mapping decision is made in
 * this file. There is no DOM outside the mount point except the connector
 * overlay, no network access, and no dependency on the site template: the
 * shell page contributes front matter and, optionally, a
 * window.IETF3TIER_MOUNT = { connectorLayer: 'inline' } escape hatch.
 *
 * Loaded as a classic script after rules.js and engine.js.
 */
(function (global) {
  'use strict';

  var ns = global.Ietf3Tier || (global.Ietf3Tier = {});
  var R = ns.rules;
  var E = ns.engine;
  var MOUNT = global.IETF3TIER_MOUNT || {};

  var HIGHLIGHT_MS = 2000;
  var TYPE_DELAY_MS = 150;
  var NONE_TARGET = 'none (not carried into the network model)';
  var NO_SOURCE = 'no corresponding input';

  var state = {
    inputs: E.cloneInput(R.PRESET_INPUT),
    legal: null,
    batch: 0,
    changedTraces: [],
    focusRule: null,
    follow: true,
    programmaticScroll: false,
    highlightTimer: null,
    typeTimer: null
  };

  var dom = {};

  /* ------------------------------------------------------------- utilities */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = text; }
    return node;
  }

  function clear(node) {
    while (node.firstChild) { node.removeChild(node.firstChild); }
  }

  function categorySuffix(category) {
    return String(category || '').toLowerCase();
  }

  function citationText(citation) {
    return 'RFC ' + citation.rfc + ' §' + citation.section + ' ' + citation.title;
  }

  function sourceElementId(fieldId, anchor) {
    var parts = ['i3t-src', fieldId];
    if (anchor) {
      parts.push(anchor.serviceIndex === undefined ? 'x' : anchor.serviceIndex);
      parts.push(anchor.siteIndex === undefined ? 'x' : anchor.siteIndex);
      parts.push(anchor.accessIndex === undefined ? 'x' : anchor.accessIndex);
    }
    return parts.join('-');
  }

  function fieldIndexes(field, anchor) {
    if (!anchor) { return {}; }
    if (field.scope === 'vpnService') { return { serviceIndex: anchor.serviceIndex }; }
    if (field.scope === 'site') { return { siteIndex: anchor.siteIndex }; }
    return { siteIndex: anchor.siteIndex, accessIndex: anchor.accessIndex };
  }

  function traceIndex(result) {
    var byPath = {};
    result.traces.forEach(function (trace) {
      if (trace.instancePath) { byPath[trace.instancePath] = trace; }
      (trace.extraPaths || []).forEach(function (path) {
        if (!byPath[path]) {
          byPath[path] = Object.assign({}, trace, { structural: true });
        }
      });
    });
    return byPath;
  }

  /* ------------------------------------------------------------------ shell */

  function render() {
    var mount = document.getElementById('ietf-3tier-poc');
    if (!mount) { return; }
    mount.classList.add('ietf-3tier-poc');
    clear(mount);
    dom.mount = mount;

    mount.appendChild(renderHeader());
    mount.appendChild(renderToolbar());

    var board = el('div', 'i3t-board');
    dom.l3sm = el('div', 'i3t-entity i3t-entity-l3sm');
    dom.l3nm = el('div', 'i3t-entity i3t-entity-l3nm');
    board.appendChild(dom.l3sm);
    board.appendChild(dom.l3nm);
    mount.appendChild(board);

    mount.appendChild(renderMetricsPanel());
    mount.appendChild(renderRulesPanel());
    mount.appendChild(renderInferencePanel());
    mount.appendChild(renderDifferencesPanel());

    /* The overlay has to exist before the first commit, because commit draws
       into it directly rather than waiting for an animation frame. */
    installOverlay();
    renderForm();
    commit({ silent: true });
  }

  function renderHeader() {
    var header = el('div', 'i3t-header');
    var title = el('h1', 'i3t-title', 'IETF 3-Tier Network Model Mapping POC');
    title.appendChild(el('span', 'i3t-badge i3t-badge-placeholder', R.PLACEHOLDER_DRAFT.badge));
    header.appendChild(title);
    header.appendChild(el('p', 'i3t-subtitle',
      'Iteration 1 maps the L3 Service Model of RFC 8299 into the L3 Network Model of RFC 9182. ' +
      'The device-model tier and the L3NM to device mapping belong to a later iteration; ' +
      'no device configuration is shown here.'));
    return header;
  }

  function renderToolbar() {
    var toolbar = el('div', 'i3t-toolbar');

    dom.followButton = el('button', 'i3t-button', 'Follow output: ON');
    dom.followButton.type = 'button';
    dom.followButton.setAttribute('aria-pressed', 'true');
    dom.followButton.addEventListener('click', function () {
      state.follow = !state.follow;
      updateFollowButton();
      if (state.follow) { scrollChangedIntoView(); }
    });
    toolbar.appendChild(dom.followButton);

    var reset = el('button', 'i3t-button', 'Reset to the preset service');
    reset.type = 'button';
    reset.addEventListener('click', function () {
      state.inputs = E.cloneInput(R.PRESET_INPUT);
      state.focusRule = null;
      renderForm();
      commit({});
    });
    toolbar.appendChild(reset);

    var legend = el('div', 'i3t-legend');
    R.CATEGORIES.forEach(function (category) {
      var item = el('span', 'i3t-legend-item');
      item.appendChild(el('span', 'i3t-swatch i3t-swatch-' + categorySuffix(category)));
      item.appendChild(el('span', null, category));
      item.appendChild(el('span', 'i3t-legend-meaning', LEGEND_MEANING[category]));
      legend.appendChild(item);
    });
    toolbar.appendChild(legend);

    return toolbar;
  }

  var LEGEND_MEANING = {
    COPY: 'carried over unchanged',
    DERIVE: 'produced on the network side',
    SPLIT: 'one input fans out to several targets',
    DROP: 'not carried into the network model'
  };

  function updateFollowButton() {
    dom.followButton.textContent = 'Follow output: ' + (state.follow ? 'ON' : 'OFF');
    dom.followButton.setAttribute('aria-pressed', state.follow ? 'true' : 'false');
  }

  /* --------------------------------------------------------------- L3SM form */

  function renderForm() {
    clear(dom.l3sm);

    var head = el('div', 'i3t-entity-head');
    head.appendChild(el('h2', 'i3t-entity-name', 'L3SM'));
    head.appendChild(el('span', 'i3t-entity-source',
      'RFC ' + R.RFC.L3SM.number + ' · ' + R.RFC.L3SM.module + ' · ' + R.RFC.L3SM.title));
    dom.l3sm.appendChild(head);

    state.inputs.vpnServices.forEach(function (service, serviceIndex) {
      dom.l3sm.appendChild(renderServiceEntry(service, serviceIndex));
    });
    dom.l3sm.appendChild(addButton('Add VPN service', function () {
      state.inputs.vpnServices.push({
        vpnId: 'vpn-svc-' + (1002 + state.inputs.vpnServices.length),
        customerName: '',
        vpnServiceTopology: 'any-to-any'
      });
      renderForm();
      commit({});
    }));

    state.inputs.sites.forEach(function (site, siteIndex) {
      dom.l3sm.appendChild(renderSiteEntry(site, siteIndex));
    });
    dom.l3sm.appendChild(addButton('Add site', function () {
      state.inputs.sites.push({ siteId: 'site-' + (state.inputs.sites.length + 1), accesses: [] });
      renderForm();
      commit({});
    }));

    dom.l3sm.appendChild(el('p', 'i3t-panel-note', R.SCOPE.statement));
  }

  function addButton(label, handler) {
    var button = el('button', 'i3t-button', label);
    button.type = 'button';
    button.addEventListener('click', handler);
    var wrap = el('div', 'i3t-group');
    wrap.appendChild(button);
    return wrap;
  }

  function entryHead(name, onRemove) {
    var head = el('div', 'i3t-entry-head');
    head.appendChild(el('p', 'i3t-entry-name', name));
    if (onRemove) {
      var button = el('button', 'i3t-button i3t-entry-remove', 'Remove');
      button.type = 'button';
      button.addEventListener('click', onRemove);
      head.appendChild(button);
    }
    return head;
  }

  function renderServiceEntry(service, serviceIndex) {
    var entry = el('div', 'i3t-entry');
    entry.appendChild(entryHead('vpn-service[' + (service.vpnId || 'new') + ']',
      state.inputs.vpnServices.length > 1 ? function () {
        state.inputs.vpnServices.splice(serviceIndex, 1);
        renderForm();
        commit({});
      } : null));

    var group = el('div', 'i3t-group');
    group.appendChild(el('p', 'i3t-group-title', 'VPN service'));
    fieldsOfScope('vpnService').forEach(function (field) {
      group.appendChild(renderField(field, service[field.id], { serviceIndex: serviceIndex }, function (value) {
        service[field.id] = value;
      }));
    });
    entry.appendChild(group);
    return entry;
  }

  function renderSiteEntry(site, siteIndex) {
    var entry = el('div', 'i3t-entry');
    entry.appendChild(entryHead('site[' + (site.siteId || 'new') + ']',
      state.inputs.sites.length > 1 ? function () {
        state.inputs.sites.splice(siteIndex, 1);
        renderForm();
        commit({});
      } : null));

    var siteGroup = el('div', 'i3t-group');
    siteGroup.appendChild(el('p', 'i3t-group-title', 'Site'));
    fieldsOfScope('site').forEach(function (field) {
      siteGroup.appendChild(renderField(field, site[field.id], { siteIndex: siteIndex }, function (value) {
        site[field.id] = value;
      }));
    });
    entry.appendChild(siteGroup);

    site.accesses = site.accesses || [];
    site.accesses.forEach(function (access, accessIndex) {
      entry.appendChild(renderAccessEntry(site, access, siteIndex, accessIndex));
    });
    entry.appendChild(addButton('Add site network access', function () {
      site.accesses.push({
        siteNetworkAccessId: 'sna-' + site.siteId + '-' + (site.accesses.length + 1),
        attachmentVpnId: (state.inputs.vpnServices[0] || {}).vpnId || ''
      });
      renderForm();
      commit({});
    }));
    return entry;
  }

  function renderAccessEntry(site, access, siteIndex, accessIndex) {
    var group = el('div', 'i3t-group');
    group.appendChild(el('p', 'i3t-group-title',
      'site-network-access[' + (access.siteNetworkAccessId || 'new') + ']'));

    fieldsOfScope('access').forEach(function (field) {
      group.appendChild(renderField(field, access[field.id],
        { siteIndex: siteIndex, accessIndex: accessIndex },
        function (value) { access[field.id] = value; }));
    });

    if (site.accesses.length > 1) {
      var remove = el('button', 'i3t-button', 'Remove this access');
      remove.type = 'button';
      remove.addEventListener('click', function () {
        site.accesses.splice(accessIndex, 1);
        renderForm();
        commit({});
      });
      group.appendChild(remove);
    }
    return group;
  }

  function fieldsOfScope(scope) {
    return R.FIELDS.filter(function (field) { return field.scope === scope; });
  }

  function renderField(field, value, anchor, onChange) {
    var row = el('div', 'i3t-field');
    row.id = sourceElementId(field.id, anchor);

    var label = el('label', 'i3t-field-label' + (field.mandatory || field.requiredFor ? ' i3t-field-required' : ''));
    label.textContent = field.label;
    label.appendChild(el('code', 'i3t-field-path', field.path));
    row.appendChild(label);

    var control;
    if (field.enumValues) {
      control = el('select', 'i3t-field-control');
      control.appendChild(new Option('— not set —', ''));
      field.enumValues.forEach(function (option) {
        control.appendChild(new Option(option, option));
      });
      control.value = E.isFilled(value) ? String(value) : '';
      control.addEventListener('change', function () {
        onChange(control.value);
        commit({});
      });
    } else {
      control = el('input', 'i3t-field-control');
      control.type = 'text';
      control.value = E.isFilled(value) ? String(value) : '';
      if (field.yangType === 'uint8' || field.yangType === 'uint32') {
        control.inputMode = 'numeric';
      }
      control.addEventListener('input', function () {
        onChange(control.value);
        clearTimeout(state.typeTimer);
        state.typeTimer = setTimeout(function () { commit({}); }, TYPE_DELAY_MS);
      });
      control.addEventListener('change', function () {
        onChange(control.value);
        clearTimeout(state.typeTimer);
        commit({});
      });
    }
    control.id = row.id + '-control';
    label.setAttribute('for', control.id);
    row.appendChild(control);

    var meta = el('div', 'i3t-field-meta');
    meta.textContent = field.yangType + ' · ' + field.typeNote +
      ' · RFC ' + R.RFC.L3SM.number + ' §' + field.rfcSection;
    if (field.pathNote) { meta.textContent += ' · ' + field.pathNote; }
    row.appendChild(meta);

    if (field.mandatory) {
      row.appendChild(el('div', 'i3t-field-meta', 'Mandatory in RFC 8299.'));
    } else if (field.requiredFor) {
      row.appendChild(el('div', 'i3t-field-meta', 'Optional in RFC 8299. ' + field.requiredFor));
    }

    var error = el('div', 'i3t-error');
    error.hidden = true;
    row.appendChild(error);

    var dropRule = dropRuleFor(field.id);
    if (dropRule) {
      row.appendChild(el('div', 'i3t-drop-note',
        'DROP · ' + dropRule.id + ' · not carried into L3NM — RFC 9182 §7.5 keeps customer site ' +
        'information out of the network model.'));
    }

    dom.fieldSlots = dom.fieldSlots || {};
    dom.fieldSlots[row.id] = { row: row, control: control, error: error };
    return row;
  }

  function dropRuleFor(fieldId) {
    var found = null;
    R.RULES.forEach(function (rule) {
      if (rule.category !== 'DROP') { return; }
      if ((rule.sourceFields || []).indexOf(fieldId) !== -1) { found = rule; }
    });
    return found;
  }

  /* ------------------------------------------------------------- L3NM output */

  function renderOutput() {
    clear(dom.l3nm);

    var head = el('div', 'i3t-entity-head');
    head.appendChild(el('h2', 'i3t-entity-name', 'L3NM'));
    head.appendChild(el('span', 'i3t-entity-source',
      'RFC ' + R.RFC.L3NM.number + ' · ' + R.RFC.L3NM.module + ' · ' + R.RFC.L3NM.title));
    dom.l3nm.appendChild(head);

    if (!state.legal) {
      dom.l3nm.appendChild(el('p', 'i3t-empty',
        'No legal mapping yet. The service model input still has errors, so the last legal ' +
        'network model instance is kept unchanged.'));
      dom.tree = null;
      return;
    }

    var tree = el('div', 'i3t-tree');
    tree.tabIndex = -1;
    tree.addEventListener('scroll', onTreeScroll);
    dom.tree = tree;
    dom.l3nm.appendChild(tree);

    var byPath = traceIndex(state.legal.result);
    var instance = state.legal.result.l3nmInstance;
    Object.keys(instance).forEach(function (name) {
      renderInstanceNode(tree, name, instance[name], name, byPath, 0);
    });

    dom.l3nm.appendChild(renderDroppedSummary());
  }

  function onTreeScroll() {
    if (state.programmaticScroll) { return; }
    if (state.follow) {
      state.follow = false;
      updateFollowButton();
    }
    scheduleLayout();
  }

  function renderInstanceNode(parent, name, value, path, byPath, depth) {
    if (value === null || value === undefined || value === '') { return; }

    if (Array.isArray(value)) {
      if (!value.length) { return; }
      var isLeafList = value.every(function (entry) { return entry === null || typeof entry !== 'object'; });
      if (isLeafList) {
        renderLeaf(parent, name, value.join(', '), path, byPath);
        return;
      }
      value.forEach(function (entry) {
        var key = firstKeyOf(entry);
        var entryPath = path + '[' + key + ']';
        var block = el('div', 'i3t-node');
        block.id = E.pathToElementId(entryPath);
        var heading = el('div', 'i3t-node-head');
        heading.appendChild(el('span', 'i3t-node-name', name));
        heading.appendChild(el('span', 'i3t-node-key', '[' + key + ']'));
        block.appendChild(heading);
        parent.appendChild(block);
        Object.keys(entry).forEach(function (childName) {
          if (childName === firstKeyName(entry)) { return; }
          renderInstanceNode(block, childName, entry[childName], entryPath + '/' + childName, byPath, depth + 1);
        });
        /* The list key is a leaf of its own and needs its own provenance. */
        renderLeaf(block, firstKeyName(entry), key, entryPath + '/' + firstKeyName(entry), byPath);
      });
      return;
    }

    if (typeof value === 'object') {
      var container = el('div', 'i3t-node');
      var containerHead = el('div', 'i3t-node-head');
      containerHead.appendChild(el('span', 'i3t-node-name', name));
      container.appendChild(containerHead);
      parent.appendChild(container);
      Object.keys(value).forEach(function (childName) {
        renderInstanceNode(container, childName, value[childName], path + '/' + childName, byPath, depth + 1);
      });
      return;
    }

    renderLeaf(parent, name, value, path, byPath);
  }

  function firstKeyName(entry) {
    return Object.keys(entry)[0];
  }

  function firstKeyOf(entry) {
    return entry[firstKeyName(entry)];
  }

  function renderLeaf(parent, name, value, path, byPath) {
    var trace = byPath[path];
    var row = el('div', 'i3t-leaf');
    row.id = E.pathToElementId(path);
    row.dataset.path = path;
    if (trace) { row.dataset.ruleId = trace.ruleId; }

    row.appendChild(el('span', 'i3t-leaf-name', name));

    var valueNode = el('span',
      'i3t-value' + (trace ? ' i3t-value-' + categorySuffix(trace.category) : ''),
      String(value));
    if (trace && trace.category === 'DERIVE') {
      valueNode.tabIndex = 0;
      valueNode.setAttribute('role', 'button');
      valueNode.setAttribute('aria-readonly', 'true');
      valueNode.title = 'Allocated on the network side. Activate to read how it is derived.';
    }
    valueNode.addEventListener('click', function () { showExplanation(row, path, trace); });
    valueNode.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showExplanation(row, path, trace);
      }
    });
    row.appendChild(valueNode);

    if (trace) {
      var badge = el('button', 'i3t-causal i3t-causal-' + categorySuffix(trace.category), '#' + trace.causalNo);
      badge.type = 'button';
      badge.dataset.ruleId = trace.ruleId;
      badge.title = trace.ruleId + ' · ' + trace.category + (trace.structural ? ' · structural key' : '');
      badge.addEventListener('click', function (event) {
        event.stopPropagation();
        focusRule(trace.ruleId, { fromBoard: true });
      });
      row.appendChild(badge);
    } else {
      row.classList.add('i3t-anomaly');
      row.title = 'This leaf cannot be traced back to any rule in the table.';
    }

    parent.appendChild(row);
    return row;
  }

  function showExplanation(row, path, trace) {
    var existing = row.nextElementSibling;
    if (existing && existing.classList.contains('i3t-explain')) {
      existing.remove();
      return;
    }
    var box = el('div', 'i3t-explain');
    if (!trace) {
      box.appendChild(el('p', null,
        'No rule in the table produced this leaf, so it cannot be traced back to either document.'));
    } else {
      var rule = ruleById(trace.ruleId);
      if (rule.category === 'DERIVE') {
        box.appendChild(el('p', null,
          'Editing refused: this value is allocated on the network side and stays as it is. ' +
          'The board keeps the derived value read-only.'));
      }
      box.appendChild(el('p', null, trace.ruleId + ' · ' + trace.category + ' · ' +
        (rule.confidence === 'standard' ? 'stated by the two documents' : 'engineering inference of this POC')));
      box.appendChild(el('p', 'i3t-mono', path));
      box.appendChild(el('p', null, rule.note));
      if (rule.pathNote) { box.appendChild(el('p', 'i3t-panel-note', rule.pathNote)); }
      if (rule.derivation) {
        box.appendChild(el('p', 'i3t-panel-note',
          'Derivation "' + rule.derivation + '" using the simulated provider profile: ' + R.PROVIDER.note));
      }
      var list = el('ul', 'i3t-rule-citations');
      rule.citations.forEach(function (citation) {
        list.appendChild(el('li', 'i3t-cite', citationText(citation) + ' (' + citation.side + ' side)'));
      });
      box.appendChild(list);
    }
    row.after(box);
  }

  function renderDroppedSummary() {
    var box = el('div', 'i3t-group');
    box.appendChild(el('p', 'i3t-group-title', 'Dropped by the mapping'));
    state.legal.result.dropped.forEach(function (entry) {
      var line = el('p', 'i3t-panel-note');
      line.textContent = entry.ruleId + ' · ' + entry.sourcePaths.join(', ') + ' → ' + NONE_TARGET;
      if (entry.carried) {
        line.textContent += ' · values supplied and lost: ' +
          entry.values.map(function (carrier) { return carrier.siteId + '/' + carrier.fieldId + '=' + carrier.value; }).join(', ');
      } else {
        line.textContent += ' · no value supplied on this board';
      }
      box.appendChild(line);
    });
    return box;
  }

  /* ----------------------------------------------------------------- commit */

  function commit(options) {
    options = options || {};
    var outcome = E.safeMap(state.inputs, {
      batchId: 'batch-' + (state.batch + 1),
      previous: state.legal ? state.legal.result.l3nmInstance : E.emptyInstance()
    });

    renderErrors(outcome.errors);

    if (!outcome.valid) {
      /* The last legal instance is deliberately left in place: an illegal
         value must not rewrite the network model, only report itself. */
      renderOutput();
      renderMetrics();
      scheduleLayout();
      return;
    }

    state.batch += 1;
    var result = outcome.result;
    result.batchId = 'batch-' + state.batch;

    var changed = result.traces.filter(function (trace) {
      return JSON.stringify(trace.before) !== JSON.stringify(trace.after);
    });
    state.changedTraces = options.silent ? [] : changed;
    state.legal = { inputs: E.cloneInput(state.inputs), result: result, metrics: E.computeMetrics(state.inputs, result) };

    renderOutput();
    renderMetrics();
    if (!options.silent) {
      applyBatchHighlight();
      if (state.follow) { scrollChangedIntoView(); }
    }
    layoutConnectors();
  }

  function renderErrors(errors) {
    Object.keys(dom.fieldSlots || {}).forEach(function (id) {
      var slot = dom.fieldSlots[id];
      slot.error.hidden = true;
      slot.error.textContent = '';
      slot.control.removeAttribute('aria-invalid');
    });

    errors.forEach(function (error) {
      var anchor = {
        serviceIndex: error.serviceIndex,
        siteIndex: error.siteIndex,
        accessIndex: error.accessIndex
      };
      var field = E.fieldById(error.fieldId);
      if (!field) { return; }
      var slot = (dom.fieldSlots || {})[sourceElementId(error.fieldId, fieldIndexes(field, anchor))];
      if (!slot) { return; }
      slot.error.hidden = false;
      slot.error.textContent = error.message + ' (' + error.path + ')';
      slot.control.setAttribute('aria-invalid', 'true');
    });
  }

  function applyBatchHighlight() {
    clearTimeout(state.highlightTimer);
    var marked = [];
    state.changedTraces.forEach(function (trace) {
      var paths = trace.instancePath ? [trace.instancePath].concat(trace.extraPaths || []) : [];
      paths.forEach(function (path) {
        var node = document.getElementById(E.pathToElementId(path));
        if (node) { node.classList.add('i3t-batch'); marked.push(node); }
      });
    });
    if (!marked.length) { return; }
    state.highlightTimer = setTimeout(function () {
      marked.forEach(function (node) { node.classList.remove('i3t-batch'); });
    }, HIGHLIGHT_MS);
  }

  function scrollChangedIntoView() {
    if (!dom.tree || !state.changedTraces.length) { return; }
    var target = null;
    state.changedTraces.forEach(function (trace) {
      if (target) { return; }
      if (trace.instancePath) { target = document.getElementById(E.pathToElementId(trace.instancePath)); }
    });
    if (!target) { return; }
    state.programmaticScroll = true;
    target.scrollIntoView({ block: 'nearest' });
    setTimeout(function () { state.programmaticScroll = false; }, 100);
  }

  /* ---------------------------------------------------------------- metrics */

  function renderMetricsPanel() {
    var panel = el('div', 'i3t-panel');
    panel.appendChild(el('h2', 'i3t-panel-title', 'Losslessness metrics'));
    panel.appendChild(el('p', 'i3t-panel-note',
      'Computed live from the same rule table that drives the mapping, inside the declared subset only.'));
    dom.metrics = el('div', 'i3t-metrics');
    panel.appendChild(dom.metrics);
    dom.metricsDetail = el('div', 'i3t-metrics-detail');
    panel.appendChild(dom.metricsDetail);
    return panel;
  }

  function renderMetrics() {
    if (!dom.metrics) { return; }
    clear(dom.metrics);
    clear(dom.metricsDetail);
    if (!state.legal) {
      dom.metrics.appendChild(el('p', 'i3t-empty', 'Metrics are computed from the last legal mapping.'));
      return;
    }
    var metrics = state.legal.metrics;

    dom.metrics.appendChild(metricCard(
      metrics.coverage.percent + '%',
      'Coverage',
      metrics.coverage.covered + ' of ' + metrics.coverage.total + ' fields · of the declared subset, not of RFC 8299 as a whole',
      metrics.coverage.percent < 100
    ));
    dom.metrics.appendChild(metricCard(
      String(metrics.roundTrip.diffCount),
      'Round-trip differences',
      'L3SM → L3NM → L3SM over the ' + metrics.roundTrip.invertibleFieldIds.length + ' invertible fields · 0 means lossless',
      metrics.roundTrip.diffCount > 0
    ));
    dom.metrics.appendChild(metricCard(
      metrics.traceability.percent + '%',
      'Traceability',
      metrics.traceability.leaves + ' non-empty leaves in the L3NM instance, each traced to a rule id or a derivation note',
      metrics.traceability.gaps.length > 0
    ));

    var detail = el('div', 'i3t-group');
    detail.appendChild(el('p', 'i3t-group-title', 'Declared subset'));
    detail.appendChild(el('p', 'i3t-panel-note',
      'This board covers ' + metrics.subsetShare.subset + ' input fields of RFC 8299, which is ' +
      metrics.subsetShare.percent + '% of the ' + metrics.subsetShare.rfc8299Leaves +
      ' leaf and leaf-list declarations in the ietf-l3vpn-svc module. ' + metrics.subsetShare.derivation));

    if (metrics.coverage.uncoveredFieldIds.length) {
      var uncovered = el('p', 'i3t-panel-note');
      uncovered.textContent = 'Fields not covered: ' + metrics.coverage.uncoveredFieldIds
        .map(function (entry) { return entry.fieldId + ' (' + entry.reason + ')'; }).join('; ');
      detail.appendChild(uncovered);
    }

    detail.appendChild(el('p', 'i3t-group-title', 'Known losses'));
    detail.appendChild(el('p', 'i3t-panel-note',
      'Dropped by a DROP rule and therefore never returned by the round trip: ' +
      metrics.roundTrip.droppedFieldIds.join(', ') + '.'));
    detail.appendChild(el('p', 'i3t-panel-note',
      'Produced only on the L3NM side and therefore not invertible: ' +
      metrics.roundTrip.nonInvertibleTargets.join(', ') + '.'));

    if (metrics.roundTrip.diffCount) {
      detail.appendChild(el('p', 'i3t-group-title', 'Round-trip differences'));
      metrics.roundTrip.diffs.forEach(function (diff) {
        detail.appendChild(el('p', 'i3t-panel-note',
          diff.key + ' · ' + diff.path + ': input "' + normaliseForDisplay(diff.before) + '" came back as "' +
          normaliseForDisplay(diff.after) + '"'));
      });
    }

    if (metrics.traceability.gaps.length) {
      detail.appendChild(el('p', 'i3t-group-title', 'Traceability gaps'));
      metrics.traceability.gaps.forEach(function (gap) {
        detail.appendChild(el('p', 'i3t-mono i3t-panel-note', gap));
      });
    }

    dom.metricsDetail.appendChild(detail);
  }

  function normaliseForDisplay(value) {
    if (value === undefined) { return '(absent)'; }
    if (value === null || value === '') { return '(empty)'; }
    return String(value);
  }

  function metricCard(value, label, denominator, anomaly) {
    var card = el('div', 'i3t-panel i3t-metric' + (anomaly ? ' i3t-anomaly' : ''));
    card.appendChild(el('p', 'i3t-metric-label', label));
    card.appendChild(el('p', 'i3t-metric-value', value));
    card.appendChild(el('p', 'i3t-metric-denominator', denominator));
    return card;
  }

  /* ------------------------------------------------------------------ rules */

  function renderRulesPanel() {
    var panel = el('div', 'i3t-panel');
    /* The placeholder draft name appears here and nowhere else on the page,
       with its badge immediately after it. */
    var title = el('h2', 'i3t-panel-title', 'Mapping rules · ');
    title.appendChild(el('span', 'i3t-draft-name', R.PLACEHOLDER_DRAFT.name));
    title.appendChild(el('span', 'i3t-badge i3t-badge-placeholder', R.PLACEHOLDER_DRAFT.badge));
    panel.appendChild(title);
    panel.appendChild(el('p', 'i3t-disclaimer', R.PLACEHOLDER_DRAFT.disclaimer));
    panel.appendChild(el('p', 'i3t-panel-note',
      'Select a row to focus its source and target on the board. Every path and section number below ' +
      'is checked against the rfc-editor text of RFC 8299 and RFC 9182 by a development-time script.'));

    dom.ruleRows = {};
    R.RULES.forEach(function (rule) {
      var row = renderRuleRow(rule);
      dom.ruleRows[rule.id] = row;
      panel.appendChild(row);
    });
    dom.rulesPanel = panel;
    return panel;
  }

  function renderRuleRow(rule) {
    var row = el('div', 'i3t-rule-row');
    row.dataset.ruleId = rule.id;
    row.dataset.category = rule.category;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    var head = el('div', 'i3t-rule-head');
    head.appendChild(el('span', 'i3t-rule-id', rule.id));
    head.appendChild(el('span', 'i3t-rule-category i3t-rule-category-' + categorySuffix(rule.category), rule.category));
    head.appendChild(el('span', 'i3t-rule-confidence',
      rule.confidence === 'standard' ? 'stated by the two documents' : 'engineering inference'));
    row.appendChild(head);

    var paths = el('div', 'i3t-rule-paths');
    paths.appendChild(pathLine('L3SM source', rule.sourcePath || NO_SOURCE));
    paths.appendChild(pathLine('L3NM target', rule.targetPath || NONE_TARGET));
    row.appendChild(paths);

    var citations = el('ul', 'i3t-rule-citations');
    rule.citations.forEach(function (citation) {
      citations.appendChild(el('li', 'i3t-cite', citationText(citation) + ' (' + citation.side + ' side)'));
    });
    row.appendChild(citations);

    if (rule.pathNote) { row.appendChild(el('p', 'i3t-panel-note', rule.pathNote)); }
    row.appendChild(el('p', 'i3t-rule-note', rule.note));

    var activate = function () { focusRule(rule.id, { fromBoard: false }); };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
    });
    return row;
  }

  function pathLine(label, text) {
    var line = el('p', 'i3t-rule-path');
    line.appendChild(el('span', 'i3t-rule-path-label', label));
    line.appendChild(document.createTextNode(text));
    return line;
  }

  function ruleById(id) {
    var found = null;
    R.RULES.forEach(function (rule) { if (rule.id === id) { found = rule; } });
    return found;
  }

  /* ------------------------------------------------------ bidirectional link */

  /* focusRule is part of the board's public API, so it has to tolerate being
   * called with no options at all. */
  function focusRule(ruleId, options) {
    options = options || {};
    state.focusRule = ruleId;
    var rule = ruleById(ruleId);

    Object.keys(dom.ruleRows).forEach(function (id) {
      dom.ruleRows[id].classList.toggle('i3t-row-focus', id === ruleId);
    });

    clearFocus();

    if (options.fromBoard) {
      var row = dom.ruleRows[ruleId];
      if (row) { row.scrollIntoView({ block: 'nearest' }); }
    }

    if (!rule) { layoutConnectors(); return; }

    var sourceIds = [];
    (rule.sourceFields || (rule.sourceField ? [rule.sourceField] : [])).forEach(function (fieldId) {
      var field = E.fieldById(fieldId);
      if (!field) { return; }
      Object.keys(dom.fieldSlots || {}).forEach(function (slotId) {
        if (slotId.indexOf('i3t-src-' + fieldId + '-') === 0) {
          dom.fieldSlots[slotId].row.classList.add('i3t-focused');
          sourceIds.push(slotId);
        }
      });
    });

    var targetIds = [];
    if (state.legal) {
      state.legal.result.traces.forEach(function (trace) {
        if (trace.ruleId !== ruleId) { return; }
        [trace.instancePath].concat(trace.extraPaths || []).forEach(function (path) {
          if (!path) { return; }
          var node = document.getElementById(E.pathToElementId(path));
          if (node) { node.classList.add('i3t-focused'); targetIds.push(node.id); }
        });
      });
    }

    state.focus = { ruleId: ruleId, sourceIds: sourceIds, targetIds: targetIds };

    if (!options.fromBoard) {
      if (targetIds.length) {
        var first = document.getElementById(targetIds[0]);
        if (first) {
          state.programmaticScroll = true;
          first.scrollIntoView({ block: 'nearest' });
          setTimeout(function () { state.programmaticScroll = false; }, 100);
        }
      } else if (sourceIds.length) {
        document.getElementById(sourceIds[0]).scrollIntoView({ block: 'nearest' });
      }
    }

    layoutConnectors();
  }

  function clearFocus() {
    dom.mount.querySelectorAll('.i3t-focused').forEach(function (node) {
      node.classList.remove('i3t-focused');
    });
    state.focus = null;
  }

  /* ------------------------------------------------- inference and context */

  function renderInferencePanel() {
    var panel = el('details', 'i3t-panel');
    var summary = el('summary', null, 'Open questions: rules that rest on an engineering inference');
    panel.appendChild(summary);
    panel.appendChild(el('p', 'i3t-panel-note',
      'The rules below have no source leaf in RFC 8299. Their values come from the allocation policy ' +
      'this POC simulates, not from either document. They are the list to take to a working group review.'));

    var inferred = R.RULES.filter(function (rule) { return rule.confidence === 'engineering-inference'; });
    var list = el('ul', 'i3t-list');
    inferred.forEach(function (rule) {
      var item = el('li');
      item.appendChild(el('strong', null, rule.id + ' · ' + (rule.targetPath || NONE_TARGET)));
      item.appendChild(el('p', 'i3t-rule-note', rule.note));
      if (rule.pathNote) { item.appendChild(el('p', 'i3t-panel-note', rule.pathNote)); }
      var citations = el('ul', 'i3t-rule-citations');
      rule.citations.forEach(function (citation) {
        citations.appendChild(el('li', 'i3t-cite', citationText(citation)));
      });
      item.appendChild(citations);
      list.appendChild(item);
    });
    panel.appendChild(list);
    panel.appendChild(el('p', 'i3t-panel-note', R.PROVIDER.note));
    return panel;
  }

  function renderDifferencesPanel() {
    var panel = el('details', 'i3t-panel');
    panel.appendChild(el('summary', null, 'Differences from the tasking document'));
    panel.appendChild(el('p', 'i3t-panel-note',
      'The wireframe in the tasking document and the published models disagree in the following places. ' +
      'The board and the rule table follow the RFC text; each item below names the section it was read from.'));
    var list = el('ul', 'i3t-list');
    R.DIFFERENCES.forEach(function (difference) {
      var item = el('li');
      item.appendChild(el('span', null, difference.claim + ' '));
      item.appendChild(el('span', 'i3t-cite', 'RFC ' + difference.rfc + ' §' + difference.section));
      list.appendChild(item);
    });
    panel.appendChild(list);
    return panel;
  }

  /* ------------------------------------------------------- connector overlay */

  function installOverlay() {
    if (dom.overlay) { dom.overlay.remove(); }
    var inline = MOUNT.connectorLayer === 'inline';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ietf-3tier-connector' + (inline ? ' i3t-inline' : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    dom.overlay = svg;
    if (inline) {
      dom.mount.appendChild(svg);
    } else {
      document.body.appendChild(svg);
    }

    global.addEventListener('scroll', scheduleLayout, true);
    global.addEventListener('resize', scheduleLayout);
    scheduleLayout();
  }

  var layoutPending = false;
  function scheduleLayout() {
    if (layoutPending) { return; }
    layoutPending = true;
    global.requestAnimationFrame(function () {
      layoutPending = false;
      layoutConnectors();
    });
  }

  function rectOf(node) {
    if (!node) { return null; }
    var rect = node.getBoundingClientRect();
    if (!rect.width && !rect.height) { return null; }
    if (MOUNT.connectorLayer === 'inline' && dom.overlay) {
      var origin = dom.overlay.getBoundingClientRect();
      return { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
    }
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }

  function activeLinks() {
    if (!state.legal) { return []; }
    var traces;
    if (state.focusRule) {
      traces = state.legal.result.traces.filter(function (trace) { return trace.ruleId === state.focusRule; });
    } else {
      traces = state.changedTraces;
    }
    var links = [];
    traces.forEach(function (trace) {
      var rule = ruleById(trace.ruleId);
      if (!rule) { return; }
      var targetIds = [];
      [trace.instancePath].concat(trace.extraPaths || []).forEach(function (path) {
        if (!path) { return; }
        var id = E.pathToElementId(path);
        if (targetIds.indexOf(id) === -1) { targetIds.push(id); }
      });
      var sourceIds = [];
      (rule.sourceFields || (rule.sourceField ? [rule.sourceField] : [])).forEach(function (fieldId) {
        var field = E.fieldById(fieldId);
        if (!field) { return; }
        var id = sourceElementId(fieldId, fieldIndexes(field, trace.anchor));
        if (sourceIds.indexOf(id) === -1) { sourceIds.push(id); }
      });
      targetIds.forEach(function (targetId) {
        links.push({
          category: trace.category,
          from: sourceIds.length ? sourceIds : null,
          to: targetId
        });
      });
    });
    return links;
  }

  function layoutConnectors() {
    if (!dom.overlay || !dom.l3sm || !dom.l3nm) { return; }
    clear(dom.overlay);

    /* The heads are rebuilt by every renderForm/renderOutput, so they have to
       be looked up again rather than cached. */
    var from = rectOf(dom.l3sm.querySelector('.i3t-entity-head'));
    var to = rectOf(dom.l3nm.querySelector('.i3t-entity-head'));
    if (from && to) {
      drawLink(from, to, 'i3t-link-direction', 'L3SM → L3NM');
    }

    activeLinks().forEach(function (link) {
      var target = rectOf(document.getElementById(link.to));
      if (!target) { return; }
      var source = null;
      if (link.from) {
        link.from.forEach(function (id) {
          if (source) { return; }
          source = rectOf(document.getElementById(id));
        });
      }
      if (!source) { source = from; }
      if (!source) { return; }
      drawLink(source, target, 'i3t-link i3t-link-' + categorySuffix(link.category), null);
    });
  }

  function drawLink(from, to, className, label) {
    var NS = 'http://www.w3.org/2000/svg';
    var x1 = from.right;
    var y1 = (from.top + from.bottom) / 2;
    var x2 = to.left;
    var y2 = (to.top + to.bottom) / 2;
    var backwards = x2 < x1;
    if (backwards) {
      x1 = from.left;
      x2 = to.right;
    }
    var bend = Math.max(24, Math.abs(x2 - x1) / 2);
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('class', className);
    path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + (backwards ? -bend : bend)) + ' ' + y1 +
      ', ' + (x2 + (backwards ? bend : -bend)) + ' ' + y2 + ', ' + x2 + ' ' + y2);
    dom.overlay.appendChild(path);

    if (label) {
      var text = document.createElementNS(NS, 'text');
      text.setAttribute('class', 'i3t-link-label');
      text.setAttribute('x', (x1 + x2) / 2);
      text.setAttribute('y', (y1 + y2) / 2 - 6);
      text.setAttribute('text-anchor', 'middle');
      text.textContent = label;
      dom.overlay.appendChild(text);
    }
  }

  /* ------------------------------------------------------------------- boot */

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render);
    } else {
      render();
    }
  }

  ns.board = {
    render: render,
    commit: commit,
    focusRule: focusRule,
    state: state
  };

  boot();
})(typeof window !== 'undefined' ? window : globalThis);
