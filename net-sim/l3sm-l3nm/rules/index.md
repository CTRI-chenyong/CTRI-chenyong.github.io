---
title: L3SM to L3NM Mapping Rules
layout: page
nav_exclude: true
---

{%- assign d = site.data['ietf-3tier-rules'] -%}
{%- assign rules = d.RULES -%}
{%- assign draft = d.PLACEHOLDER_DRAFT -%}
{%- assign inferred = rules | where: "confidence", "engineering-inference" -%}

## What this page is

This page is the document form of the rule table that drives the
[IETF 3-Tier Network Model Mapping POC](../). Every rule is its own section, so a single
rule can be linked directly and found with the search box in the site header.

The text is not written here: it is rendered at site build time from
`_data/ietf-3tier-rules.json`, which is itself exported from the rule table in
`net-sim/l3sm-l3nm/app/rules.js` — the same data the board reads at run time. A rule
cannot say one thing on the board and another thing here.

The two models are RFC {{ d.RFC.L3SM.number }} — *{{ d.RFC.L3SM.title }}*
(`{{ d.RFC.L3SM.module }}`) and RFC {{ d.RFC.L3NM.number }} —
*{{ d.RFC.L3NM.title }}* (`{{ d.RFC.L3NM.module }}`), with the shared VPN identities from
RFC {{ d.RFC.COMMON.number }} (`{{ d.RFC.COMMON.module }}`).

The rule table is labelled with a working-group draft name,
`{{ draft.name }}`, badged <span class="label label-red">{{ draft.badge }}</span> —
{{ draft.disclaimer | escape }}

## Scope of the declared subset

{{ d.SCOPE.statement | escape }}

The board declares {{ d.SCOPE.subsetFieldCount }} input fields, while the
`{{ d.RFC.L3SM.module }}` module of RFC {{ d.RFC.L3SM.number }} declares
{{ d.SCOPE.rfc8299LeafDeclarations }} `leaf` and
{{ d.SCOPE.rfc8299LeafListDeclarations }} `leaf-list` statements, which is
{{ d.SCOPE.rfc8299LeafTotal }} declarations. Coverage on the board is therefore a ratio
inside the declared subset, never a share of the full model.

{{ d.SCOPE.derivation | escape }}

## Rule set

{{ rules | size }} rules, grouped below by propagation category:
{%- for category in d.CATEGORIES %}
{%- assign group = rules | where: "category", category %}
* {{ category }} — {{ group | size }}
{%- endfor %}

Each section states the L3SM source path, the L3NM target path, the propagation category,
the confidence label and, for each, the RFC section it rests on together with that
section's title as it appears in the RFC. Every section number and title is checked
against the rfc-editor plain text of both RFCs by a development-time script
(`tools/check-rfc-citations.mjs`).

{% for category in d.CATEGORIES -%}
{% assign group = rules | where: "category", category -%}

## {{ category }} rules ({{ group | size }})

{% for rule in group -%}
{% if rule.confidence == "standard" -%}
{% assign confidence = "stated by the two documents" -%}
{% else -%}
{% assign confidence = "engineering inference" -%}
{% endif -%}

<h3 id="{{ rule.id }}">{{ rule.id }} · {{ rule.category }} · {{ confidence }}</h3>

* L3SM source: `{{ rule.sourcePath | default: "no corresponding input" }}`
* L3NM target: `{{ rule.targetPath | default: "none (not carried into the network model)" }}`
{% for citation in rule.citations %}
* RFC {{ citation.rfc }} §{{ citation.section }} {{ citation.title }} ({{ citation.side }} side)
{% endfor %}
{% if rule.pathNote %}
Path note — {{ rule.pathNote | escape }}
{% endif %}
{{ rule.note | escape }}
{% endfor %}
{% endfor %}

## Engineering inferences ({{ inferred | size }})

Neither RFC states the values these rules produce. Each one is a choice this POC makes so
that the mapping produces a complete network model, and each is listed here as an open
question for working-group review rather than as specified behaviour.

{% for rule in inferred %}
* [{{ rule.id }} · {{ rule.category }}](#{{ rule.id }}) —
  `{{ rule.targetPath | default: "none (not carried into the network model)" }}`.
  {{ rule.note | escape }}
{% endfor %}

Back to the board: [IETF 3-Tier Network Model Mapping POC](../).
