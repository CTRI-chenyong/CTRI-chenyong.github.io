# Design

## Context

`net-sim/l3sm-l3nm/app/rules.js` 现有 414 行，其中约 395 行是数据（十组常量）与一个 4 行的 `cite()` 辅助函数；对外只通过 `window.Ietf3Tier.rules` 暴露，消费方是 `app/engine.js`、`app/poc.js` 与 `tools/load-classic.mjs` 驱动的三个开发期脚本。

约束来自既有规格与实测：

- `site-entry` 要求内核 `app/` 不含主题类名、Liquid、以 `/` 开头的绝对路径与任何网络 API，且 `standalone/preview.html` 必须能 `file://` 直开。因此规则**不能**在运行时从 `_data/` 取。
- 主题 v0.12.0 的搜索由 `_includes/components/…` + `assets/js/just-the-docs.js` 实现：构建期由 `lib/tasks/search.rake` 生成的模板把 `site.html_pages` 中**有 `title` 且未 `search_exclude`** 的页面按标题切段写入 `/assets/js/search-data.json`；运行时 XHR 取该 JSON，用 lunr 建索引（`title` boost 200、`content` boost 2），查询做前缀通配、无结果时按编辑距离回退。切段深度由 `search.heading_level` 控制，默认 2。
- 线上实测：`search-data.json` 当前 1,311 字节、2 条记录，POC 页 `content` 长度为 2 字符。
- 本机只有系统 Ruby 2.6.10、无 Docker，跑不了 `bundle exec jekyll build`（`add-ietf-3tier-network-model-poc` 已记录该约束），凡是"页面渲染结果"与"索引内容"的核对只能推送后在线上完成。

## Goals / Non-Goals

**Goals:**

- 让 18 条规则的正文出现在构建期 HTML 里，从而进入 lunr 语料，并且每条规则可被锚点深链。
- 规则数据仍然只有一个人工编辑入口；导出件与真源之间的漂移可被一条命令发现。
- 内核的解耦契约不倒退：`app/` 不读取站点目录，`check-decoupling.mjs` 保持 0 违规。

**Non-Goals:**

- 不做运行时数据加载，不做增量构建缓存，不把规则迁出 `net-sim/`。
- 不解决中文正文的 lunr 分词问题（默认分隔符 `/[\s\-/]+/` 会把整句中文切成一个 token）。
- 不引入 Jekyll 插件、Ruby 依赖或 Pagefind；不改主题目录。
- 不追求规则页与画板的视觉一致，只追求内容同源同值。

## Decisions

### D1 导出方向：`app/rules.js` → `_data/ietf-3tier-rules.json`

真源留在内核，站点侧数据文件是导出件。备选方案是让 `_data/` 当真源、把 `app/rules.js` 降级为生成物——它让规则变成纯数据，但代价是 `net-sim/` 不再是权威来源，改规则必须先改仓库根再跑生成，与 `site-entry` 的"内核自包含、可整体搬走"往回退一步；用户已确认选择前者。

导出用 JSON 而非 YAML：YAML 会把 `64500`、`100:1`、`any-to-any` 一类值在字符串与标量之间重新解释，而 `JSON.stringify` 的输出与 JS 对象语义一一对应，Liquid 侧 `| jsonify` 之前不需要任何类型修正。

### D2 单脚本两模式，不写两份实现

`tools/build-rules-data.mjs` 默认写出文件，`--check` 模式只比对不写。drift 检查若另起一个脚本，就会复制一遍导出逻辑，两份实现迟早分叉。`--check` 的失败信息打印差异所在的数据组名与（规则类）ID 列表，便于定位。

导出件逐字节稳定的手段：固定数据组的写出顺序（按 D3 的清单逐组构造，不依赖枚举顺序）、`JSON.stringify(payload, null, 2)` 加结尾换行、不含时间戳与绝对路径。文件内嵌一个 `_generated` 说明字段（内容固定），提示"由脚本生成、请勿手工编辑"——JSON 没有注释，这是唯一能自带提示的位置。

### D3 导出载荷清单

`RFC`、`SECTIONS`、`CATEGORIES`、`CONFIDENCE`、`FIELDS`、`RULES`、`SCOPE`、`PROVIDER`、`PRESET_INPUT`、`DIFFERENCES`、`PLACEHOLDER_DRAFT`——即 `ns.rules` 当前暴露的全部键。`cite()` 在导出时已经展开成 `{rfc, section, title, side}`，因此页面不必重实现标题查表，`check-rfc-citations.mjs` 的断言对象也不变。

### D4 规则页：Markdown + Liquid，不新增 `_layouts/`

`net-sim/l3sm-l3nm/rules/index.md` 用 front matter（`title`、`layout: page`）成为站点 page，正文用 Liquid 遍历 `site.data['ietf-3tier-rules'].RULES`：

- h2 按传播类别分组，组标题后的条数由 `where: "category", "COPY"` 之类的过滤计算，不写常量。
- 每条规则一个 h3，标题带以规则 ID 为 `id` 的显式锚点。原计划用 kramdown 的 inline attribute list（`### R01 · COPY {: #R01 }`），实施时在本地复现（kramdown 2.5.2 + Jekyll 默认的 `input: GFM`）证明 GFM 解析器不认标题上的 IAL：ID 退化成 slug，且 `{: #R01 }` 原样留在标题文本里。改用这里记录的备选：内联 `<h3 id="R01">…</h3>`。
- 小节正文：源路径、目标路径（DROP 显示 `none (not carried into the network model)`，与画板 `app/poc.js` 的字面量逐字相同；无 L3SM 源显示 `no corresponding input`）、传播类别、置信标签、逐条出处（`RFC 8299 §6.2 VPN Service Overview (source side)`）、`pathNote`、`note`。来自导出件的散文一律经 Liquid 的 `escape`：R13 与 R14 的说明含 `<provider AS>:<pool index>`，不经转义会被 kramdown 当作 HTML 标签吞掉，破坏"说明文本完整呈现"。
- 页尾两节：工程推断汇总（`where: "confidence", "engineering-inference"`，以列表 + 指向 `#Rxx` 的链接呈现，避免同一规则 ID 出现第二个锚点）与范围声明（读 `SCOPE`，含 12/159 与分母口径）。
- 站点正文一律英文（项目约束）；页面不出现中文。
- 页面 front matter 另加 `nav_exclude: true`：本 change 不改既有侧栏导航，规则页由画板链接与站内搜索到达。

不建 `_layouts/`：只有一页需要这种排版，抽布局属于提前抽象。

### D5 `search.heading_level: 3`

rake 会把 `<h2`…`<h{heading_level}` 全部提升为 `<h1` 再切段，因此设为 3 才能让每条规则成为独立搜索结果，并从标题上的 `id="R01"` 生成 `#R01` 深链；默认值 2 只能做到"按类别成组"。代价是全站结果粒度变细（Home 与新页都没有 h4 以下标题，当前无副作用）。若线上发现结果过碎，回退方式是删掉这一行配置，锚点深链仍然可用。

### D6 链接放在外壳层，不放在 `app/poc.js`

`app/poc.js` 同时被 `l3sm-l3nm/index.html`（深度 `/net-sim/l3sm-l3nm/`）与 `standalone/preview.html`（深度 `/net-sim/l3sm-l3nm/standalone/`）加载，写死 `rules/` 会让后者解析到不存在的 `standalone/rules/`。因此"阅读为文档"的链接放进外壳页正文，规则页的返回链接写 `../`；两处都是相对路径，不依赖 baseurl。

### D7 解耦守卫承认第二个站点页（实施期补充）

`tools/check-decoupling.mjs` 把 iteration 1 的形状写成了常量：只有一个站点页、外壳页正文恰好 5 个引用、正文只允许 `div/link/script/p/br`、任何 `app/` 文件不得带 front matter。新增规则页同时撞上这四条，而规格要求的是"落地后仍 0 违规"，所以守卫本身必须承认新形状：

- `rules/index.md` 登记为主题感知文件（与外壳页、`theme/*.css` 同列），允许它的 front matter 与 Liquid；
- 外壳页引用数 5→6，正文白名单放行 `<a>`；
- 给规则页配一组与外壳页对称的断言：`title`/`layout: page` 必须在、`permalink` 必须不在、链接必须相对且能解析、正文必须引用 `site.data['ietf-3tier-rules']`（这条直接实现"页面 MUST NOT 内嵌第二份规则文本"）；
- 新增单向数据流断言：`app/` 与 `standalone/` 任一文件出现 `_data` 或 `ietf-3tier-rules` 即违规——这是"数据只能从内核流向外壳"的机器版本。

四条新断言在 `/tmp` 的仓库副本上做过反向验证（逐条破坏后守卫报错、还原后归零），仓库内文件未被手工改写。

## Risks / Trade-offs

- [导出件与真源漂移（改完规则忘了重导出）] → 规则改动后的本地验收清单固定包含 `node tools/build-rules-data.mjs --check`；`--check` 失败信息指名数据组与规则 ID；线上不做兜底。
- ~~[kramdown 未把 `{: #R01 }` 渲染成 `id="R01"`，导致深链与逐条搜索结果失效]~~ 已应验并已规避：本地用 Liquid 5.3 + kramdown 2.5.2（`input: GFM`）复现，18 个标题的 ID 全部退化成 slug 并残留 IAL 文本，页面改内联 `<h3 id="R01">`；线上仍要核对 `search-data.json` 是否出现 18 条带 `#Rxx` 的 `relUrl`。
- [同一台机器上 Liquid/kramdown 的本地复现不是 Jekyll 本体（Ruby 2.6 装不上 Jekyll 4.4），转义细节可能有差] → 复现脚本只做一次性核对、不入库；结论以线上构建为准，`_data` 里的原文与页面渲染文本逐字段比对（含 smart quotes 与 `&lt;` 还原）。
- [索引体积从 1,311 字节涨到约 10–12 KB，每次页面加载都要下载并在浏览器建索引] → 量级可接受；线上用网络面板确认一次；若成为瓶颈，先考虑给规则页设 `search_exclude` 的部分小节或回退 heading_level，再评估 Pagefind。
- [规则页与画板出现措辞分叉] → 页面文本全部来自导出件字段，不手写规则内容；`DIFFERENCES` 与 `SCOPE` 同样取自导出件。
- [本 change 的规格与尚未归档的 `add-ietf-3tier-network-model-poc` 三份规格并存，归档顺序可能造成主规格缺前置] → 先归档 iteration 1 的 change，再归档本 change。
- [中文检索仍不可用，双语读者搜中文规则术语无结果] → 明确记为后续：要么给 lunr 配 bigram 分词（`search.tokenizer_separator` 是注入 JS 正则的口子），要么在语料量上来后换 Pagefind（构建期静态索引、自带中日韩分词、仍零云端）。

## Migration Plan

1. 本地：写导出脚本 → 生成 `_data/ietf-3tier-rules.json` → `--check` 通过 → 既有四个检查与引擎测试全绿。
2. 本地：写规则页；无法本地构建，因此用 `node` 直接校验导出件字段齐全、条数与锚点集合（18 条、ID 唯一），把 Liquid 渲染正确性留给线上。
3. 推送后线上核对：`/net-sim/l3sm-l3nm/rules/` 渲染、`search-data.json` 条目数与 `#Rxx` 深链、`/net-sim/l3sm-l3nm/` 与 `standalone/preview.html` 行为不变、`tools/` 与 `openspec/` 仍未发布。
4. 回滚：删除 `_data/ietf-3tier-rules.json`、规则页与脚本，还原 `_config.yml` 的一行配置即可；内核文件从未被改动，回滚不影响画板。

## Open Questions

- 规则页是否也要把 `FIELDS`（12 个输入字段的 RFC 声明与页面必填原因）与 `DIFFERENCES`（5 条与任务书线框的结构差异）各成一节？当前只渲染 `RULES` + 工程推断汇总 + 范围声明，`DIFFERENCES` 已随导出件可用，加不加不影响本次规格与任务拆分。
