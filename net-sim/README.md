# net-sim — browser-local network model simulations

Self-contained interactive prototypes that ship as static files inside this
Jekyll site but do not depend on its theme, its directory layout or any remote
service. Every calculation runs in the browser; nothing is fetched at runtime.

This file has no YAML front matter, so Jekyll copies it to the built site
verbatim. That is intentional: it is published as `/net-sim/README.md` and
documents the directory for anyone reading the deployed site.

## Directory structure

```
net-sim/
├── README.md                     this file
└── l3sm-l3nm/                    iteration 1: L3SM (RFC 8299) → L3NM (RFC 9182)
    ├── index.html                shell page of the board — theme-aware
    ├── app/                      the prototype itself, template-agnostic
    │   ├── rules.js              field definitions, the 18-rule table, RFC citations
    │   ├── engine.js             mapping, inversion, validation, metrics (no DOM)
    │   ├── poc.js                board rendering and interaction (DOM, no theme)
    │   └── poc.css               every selector prefixed with .ietf-3tier-*
    ├── rules/
    │   └── index.md              rule reference page — theme-aware, rendered at build time
    ├── theme/
    │   └── just-the-docs.css     the only place host-theme selectors may appear
    └── standalone/
        └── preview.html          the same app/ assets with no theme at all
```

Outside this directory sits `_data/ietf-3tier-rules.json`, an export of
`app/rules.js` for the site build to read. It is a generated file, not part of
the kernel, and nothing under `app/` or `standalone/` reads it. The same holds
for `rfc/`: it is a site content area of its own — the verbatim text of the two
RFCs the rules cite and the pages built from it — and it neither reads nor is
read by the kernel.

`app/` is loaded as three classic scripts in the order
`rules.js → engine.js → poc.js`. They are deliberately not ES modules, so the
pages work when opened straight from the file system (`file://`), where module
fetches are blocked by CORS.

`standalone/preview.html` is the proof that the theme is optional: open it
directly, or serve the repository root with `python3 -m http.server` and load
`/net-sim/l3sm-l3nm/standalone/preview.html`. It renders the same board from
the same `app/` assets and references nothing under `theme/`.

## Decoupling boundary

| Concern | Lives in | May mention the host theme? |
| --- | --- | --- |
| Navigation entry, page title, layout selection | `l3sm-l3nm/index.html` front matter | Yes — front matter only |
| Rule reference page: its title, layout, and the Liquid that renders each rule | `l3sm-l3nm/rules/index.md` | Yes — front matter and Liquid only |
| Content width, font inheritance, `z-index` against the theme's header and sidebar | `l3sm-l3nm/theme/*.css` | Yes — this is the only such file |
| Field definitions, rule table, RFC citations | `l3sm-l3nm/app/rules.js` | No |
| Mapping, inversion, validation, metrics | `l3sm-l3nm/app/engine.js` | No |
| Board DOM, connector overlay, panels | `l3sm-l3nm/app/poc.js` | No |
| Board styling | `l3sm-l3nm/app/poc.css` | No |
| Theme-less proof page | `l3sm-l3nm/standalone/preview.html` | No |
| Export of the rule table for the site build | `_data/ietf-3tier-rules.json`, at the repository root | Not applicable — generated, never hand-edited, never read by `app/` |
| Verbatim text of the two cited RFCs and the pages built from it | `rfc/source/*.txt` and `rfc/*/**`, at the repository root | Not applicable — a site content area; the `.txt` files are byte-for-byte copies of the rfc-editor originals, never hand-edited, never read by `app/` |

Files in the "No" rows must not contain theme class names, theme SCSS
variables, Liquid, root-relative references (an `href`, `src` or `action`
value, or a CSS `url()`, that begins with a single slash), network APIs
(`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`), absolute
`http(s)` URLs, or ES module syntax. All references between them are relative,
so the directory keeps working under any `baseurl`.

Rule data flows one way. `l3sm-l3nm/app/rules.js` is the only place a rule is
edited; what the site build renders from is its export:

```
node tools/build-rules-data.mjs          # rewrite _data/ietf-3tier-rules.json
node tools/build-rules-data.mjs --check  # fail if that file no longer matches
```

Run `--check` after any rule change and before committing. The export is
byte-stable, so re-running it over unchanged rules produces no diff, and it
belongs to the development phase: the board never reads it, `file://` included.

`node tools/check-decoupling.mjs` enforces this table. It is a development-time
script and is excluded from the built site.

One escape hatch crosses the boundary, in the shell → app direction only: the
shell page may set

```html
<script>
window.IETF3TIER_MOUNT = { connectorLayer: 'inline' };
</script>
```

before loading `app/poc.js`. `'fixed'` (the default) appends the connector SVG
to `document.body` with `position: fixed`; `'inline'` appends it inside the
mount point instead, for templates whose stacking context or scroll container
breaks fixed positioning.

## Moving to a different site template

1. **Rewrite the front matter** in `l3sm-l3nm/index.html` to the new theme's
   field names — page title, layout, navigation order, parent page. Keep the
   body exactly as it is: one `<div id="ietf-3tier-poc"></div>`, the one link to
   `rules/`, and the five relative `link`/`script` references. Do not add a
   `permalink`; the URL is the directory path, which is what keeps the page
   independent of routing configuration.
2. **Replace `theme/*.css`.** Delete `just-the-docs.css` and write an adapter
   for the new theme, or delete the directory and the `<link>` to it entirely —
   the board is fully functional without it. The adapter may only set the
   `--i3t-*` custom properties that `app/poc.css` already defines defaults for
   (`--i3t-z-overlay`, `--i3t-content-max-width`, `--i3t-font-family`,
   `--i3t-code-font-family`, the four propagation colours) plus, if the new
   theme needs it, selectors that scope those values to the theme's content
   container. One further kind of rule belongs here and nowhere else: releasing
   a host theme's centred reading column on the page that hosts the board (the
   current adapter does this with a `:has()` rule keyed to the board, applied to
   the theme's sidebar and main wrappers), because a two-column drawing surface
   needs the viewport width that a prose column deliberately gives up. Such
   rules must be keyed to the board with `:has()` so every other page keeps the
   theme's own layout, and they must degrade to the theme default where
   `:has()` is unsupported.
3. **Flip `connectorLayer` if the connectors drift.** If the new template puts
   the page content inside a transformed or separately scrolling container, set
   `window.IETF3TIER_MOUNT = { connectorLayer: 'inline' }` in the shell page
   before `app/poc.js` loads. Nothing under `app/` changes.

4. **Re-point or drop the rule page.** `l3sm-l3nm/rules/index.md` is a Jekyll
   page: its front matter names the new theme's layout, and its body renders
   `site.data['ietf-3tier-rules']` with Liquid. Under a different Jekyll theme
   only the front matter changes. Under a host that is not Jekyll there is no
   `_data` to read and no Liquid to run, so the page and the export go away
   together — the board keeps working, because it reads its rules from
   `app/rules.js`, not from the export.

5. **Move or drop the RFC document area with the layouts.** `rfc/` is a site content area
   and not part of the kernel: each section page is a generated file whose front matter names
   a layout, `_layouts/rfc-page.html` and `_layouts/rfc-landing.html` provide the compliance
   shell and the contents list, and both read `_data/rfc-sources.json`. Regenerate with
   `node tools/build-rfc-pages.mjs`, prove the result with `node tools/check-rfc-fidelity.mjs`.
   Under a host that is not Jekyll there is no `_data` to read, no Liquid to run and no layout
   to attach the notices to, so the pages, the two layouts and the export move or go away
   together. The board is unaffected either way: it reads nothing from any of them, and the
   rule citations keep resolving because `app/rules.js` carries the section numbers itself.

After those five steps, run `node tools/check-decoupling.mjs` and open
`standalone/preview.html` — if the standalone page still renders, `app/` never
learned anything about the new template.
