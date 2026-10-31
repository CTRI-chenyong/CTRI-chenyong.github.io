---
title: Home
layout: home
---

This site hosts a browser-local prototype of the mapping between the IETF's Layer 3 VPN
service model (L3SM, RFC 8299) and its Layer 3 VPN network model (L3NM, RFC 9182). Every
calculation runs in the page: no backend, no runtime network requests.

* [IETF 3-Tier Network Model Mapping POC](net-sim/l3sm-l3nm/) — the interactive board.
* [L3SM to L3NM Mapping Rules](net-sim/l3sm-l3nm/rules/) — the same rule table in
  document form, one section and one anchor per rule, found through the site's search box.
* [RFC 8299](rfc/8299/) and [RFC 9182](rfc/9182/) — the two modelled RFCs in full, one page
  per numbered section, copied verbatim from the published plain text, which the search box
  also reaches. [Copying notices](rfc/notices/) state what was copied, how far, and under
  which grant.
* [README](README.md) — what the prototype provides, what it does not cover, and how to
  run it. [中文](README_zh.md).
* [`net-sim/README.md`](net-sim/README.md) — the directory contract that keeps the
  simulation independent of this site's template.

The prototype is developed by the IETF team at the Research Institute of China Telecom
Co., Ltd. It addresses a question the IETF ONSEN working group's scope covers directly:
whether the service and network abstraction layers can be translated into one another
without information loss. This iteration makes each mapping rule explicit, cites the RFC
text behind it, and labels the rules that rest on engineering inference rather than on
specified behaviour.
