---
title: RFC Copying Notices
layout: page
nav_exclude: true
---

## What this page is

This site is a third party. It copies two IETF documents so that the mapping rules in the
[L3SM to L3NM POC](../../net-sim/l3sm-l3nm/) and its
[rule reference](../../net-sim/l3sm-l3nm/rules/) can quote the text they rest on. This page
records what was copied, how far, and under which grant, so that anyone can re-check the
position without reading the site's source.

## 1. Documents copied

| Document | Title | Retrieved | SHA-256 of the copy held here |
| --- | --- | --- | --- |
{% for d in site.data['rfc-sources'].docs %}| [RFC {{ d.rfc }}]({{ d.url }}) | {{ d.title }} | {{ d.retrieved }} | `{{ d.sha256 }}` |
{% endfor %}

## 2. Extent of copying

For each document named above the site reproduces:

* the complete plain text, served verbatim as one file:
  [{{ site.data['rfc-sources'].docs[0].sourceFile }}](../../{{ site.data['rfc-sources'].docs[0].sourceFile }})
  and [{{ site.data['rfc-sources'].docs[1].sourceFile }}](../../{{ site.data['rfc-sources'].docs[1].sourceFile }});
* the same text, split at its own numbered headings into one page per section, each page
  carrying exactly one contiguous byte range of the file above and nothing else;
* the front matter of each document — title page, Abstract, Status of This Memo, copyright
  notice, and the document's own table of contents — on the landing page of that document.

Nothing is translated, abridged, reflowed, or re-ordered. Line breaks, the 72-column layout,
the page separators and the dot leaders of the contents list are those of the published plain
text. The only changes are HTML character references — `&lt;` for `<`, `&gt;` for `>`, `&amp;`
for `&`, `&#12;` for the page separator, `&#65279;` for the byte-order mark — which a browser
resolves back to the original bytes before you read them.

## 3. Grant relied on

* **BCP 78**, *Long-term Legal Provisions for Internet-Drafts and RFCs*:
  <https://www.rfc-editor.org/info/bcp78>.
* **IETF Trust Legal Provisions**, section 3.c in particular:
  <https://trustee.ietf.org/license-info>.

For the complete copy the site relies on the grant that allows an unmodified, complete copy of
an IETF Document to be published or distributed in any medium. Each section page is a partial
copy, so the site relies on the grant that allows portions to be published or distributed
provided the text is clearly attributed to the IETF and the legal notice of the original is
included or linked: every section page therefore shows the attribution "Text of RFC *n*,
Section *num*", quotes that document's own Copyright Notice verbatim, and links both BCP 78 and
the Trust Legal Provisions.

Section 3.d does not grant the right to modify IETF Documents, or to distribute them with their
legal notices missing. The notices are therefore not optional decoration in this document area:
a section page without its notice would be a distribution the grant does not cover, and
`tools/check-rfc-fidelity.mjs` fails the build if a byte of the reproduced text ever stops
matching the copy in `rfc/source/`.

## 4. Licence boundary

* The text of an IETF Document, and the Code Components (such as its YANG modules) contained in
  it, are licensed by the IETF Trust under BCP 78 and the Trust Legal Provisions. Copying them
  here does **not** place them under this repository's software licence. Code Components keep the
  Simplified BSD License text and the warranty disclaimer named in section 4.e of the Trust Legal
  Provisions; those terms appear in the section pages that carry the modules.
* This site's own software — the POC under `net-sim/` and the development tooling under `tools/` —
  is covered by the licence in the repository's `LICENSE` file. That licence says nothing about
  the RFC text.
* Reproducing an RFC grants no patent licence. The patent provisions of BCP 78 and of the Trust
  Legal Provisions apply on their own terms; nothing here widens or narrows them.

## 5. Status of these copies

The authoritative versions are published by the RFC Editor:
[RFC 8299](https://www.rfc-editor.org/info/rfc8299) and
[RFC 9182](https://www.rfc-editor.org/info/rfc9182). The pages under `/rfc/` are copies held by
this site, are not the authoritative versions, and carry no errata, status change or supersession
information. If a document is updated or superseded upstream, the copy here is out of date and
will be labelled as such or withdrawn.

## 6. Who maintains this

The RFC document area is copied and maintained by the IETF team at the Research Institute of
China Telecom Co., Ltd. It is not an IETF publication, not an RFC Editor publication, and not a
working group document, and it implies no endorsement by the IETF, the IETF Trust or the RFC
Editor. To report an error, open an issue in
[this repository](https://github.com/CTRI-chenyong/CTRI-chenyong.github.io) naming the document
number and the section number.
