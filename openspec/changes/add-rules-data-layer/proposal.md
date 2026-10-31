# Proposal

## Why

站内 lunr 搜索拿不到规则正文。线上实测 `https://ctri-chenyong.github.io/assets/js/search-data.json` 只有 2 条记录，其中 `IETF 3-Tier Network Model Mapping POC` 的 `content` 长度为 **2 个字符**：该页正文由 `app/poc.js` 运行时注入，Jekyll 构建期看不到，因此规则文本既搜不到、也没有可深链的锚点。规则正文恰恰是本迭代要交给 IETF 社区逐条核对 RFC 出处的核心材料，读者只能靠滚动画板右侧面板阅读。

## What Changes

- 新增开发期导出脚本 `tools/build-rules-data.mjs`：用既有的 `tools/load-classic.mjs` 无界面加载 `net-sim/l3sm-l3nm/app/rules.js`，把十组数据（`RFC`/`SECTIONS`/`CATEGORIES`/`CONFIDENCE`/`FIELDS`/`RULES`/`SCOPE`/`PROVIDER`/`PRESET_INPUT`/`DIFFERENCES`/`PLACEHOLDER_DRAFT`）连同 `cite()` 已展开的 citations 序列化为 `_data/ietf-3tier-rules.json` 并提交进仓库。
- **真源方向保持不变**：`app/rules.js` 仍是唯一人工编辑入口，`engine.js`、`poc.js` 与本仓库既有测试不改；`_data/ietf-3tier-rules.json` 是导出件，MUST NOT 手工编辑。
- 新增站点页面 `net-sim/l3sm-l3nm/rules/index.md`（带 front matter `title`，因而进入 lunr 索引）：按传播类别分 h2 组、每条规则一个 h3 小节并带 `#R01` 式锚点，正文含源/目标路径、传播类别、置信标签、RFC 出处（文档号 + 章节号 + 章节标题原文）、`pathNote` 与规则说明；页尾给出工程推断汇总清单与范围声明。
- 同一脚本提供 `--check` 模式作为一致性检查：重新导出并与仓库中的提交件逐字节比对，漂移即以非零退出码失败并指出差异位置。
- 画板与规则文档互链：链接放在**外壳页面**（`l3sm-l3nm/index.html` 与规则页）而不是内核 `app/poc.js`——内核被 `standalone/preview.html` 以另一层目录深度复用，写在内核里会让相对链接基准漂移。`net-sim/README.md` 的边界表补一行说明导出件的位置与"不得手工编辑"。
- `_config.yml` 增加 `search.heading_level: 3`，让每条规则小节成为独立的搜索结果与深链目标。
- 非目标：不改 `app/` 的加载方式（仍然三个 classic script，仍然 `file://` 可直开、运行时零网络请求）；不解决中文分词导致的 lunr 检索限制；不引入任何 Jekyll 插件或 Ruby 依赖；不在主题的 `assets/`、`_layouts/`、`_includes/`、`_sass/` 下新增或覆写文件。

## Capabilities

### New Capabilities

- `ietf-3tier-mapping-poc/rule-data-export`: 规则数据的开发期导出契约——真源位置、导出件内容与形态、可重复生成、漂移可被机器发现。
- `ietf-3tier-mapping-poc/rule-reference-page`: 规则文档页——被站内搜索索引的静态正文、每条规则的锚点与深链、与画板的双向链接、工程推断汇总与范围声明。

### Modified Capabilities

无。`openspec/specs/` 目前为空：`ietf-3tier-mapping-poc/mapping-rules`、`mapping-board`、`site-entry` 三份规格仍属于尚未归档的 change `add-ietf-3tier-network-model-poc`。本 change 不改动它们的任何 Requirement，只新增两条能力；与 `site-entry`「仿真代码目录自包含且与站点模板解耦」的关系是：导出方向为 `net-sim/` → `_data/`，内核不读取站点目录，因此该要求继续成立。

## Impact

- **新增文件**：`tools/build-rules-data.mjs`（含 `--check` 模式）、`_data/ietf-3tier-rules.json`（生成物）、`net-sim/l3sm-l3nm/rules/index.md`。
- **修改文件**：`net-sim/l3sm-l3nm/index.html`（外壳页正文加一条指向规则文档页的相对链接）、`tools/check-decoupling.mjs`（守卫原先把"只有一个站点页、外壳页 5 个引用"写死成常量；改为承认第二个站点页，并新增"内核不得读取 `_data` 导出件"的单向数据流断言，理由见 `design.md` 的 D7）、`_config.yml`（`search.heading_level: 3`）、`net-sim/README.md`（边界表补一行）、两个 README 与 `index.md` 中"规则只能在画板里看"的相关表述（如有）。`tools/build-rules-data.mjs` 另带一个仅开发期使用的 `RULES_EXPORT_PATH` 路径覆盖，用于在不改写仓库内导出件的前提下演示 `--check` 会捕获漂移。
- **不受影响**：`Gemfile`、`.github/workflows/`、`app/rules.js`、`app/engine.js`、`app/poc.js`、`app/poc.css`、`standalone/preview.html`。
- **验证约束**：本机只有系统 Ruby 2.6.10、无 Docker，跑不了 `bundle exec jekyll build`，因此规则页的实际渲染与 `search-data.json` 是否新增条目 MUST 推送后在线上核对；导出与同步检查可本地用 Node 全量验证。
- **可度量影响**：实测 `app/rules.js` 的十组数据序列化为 28,828 字节（缩进 JSON），其中 `RULES` 17,783 字节、18 条规则的 `note` + `pathNote` 合计 6,875 字符。规则页渲染出的正文（lunr 索引里的 `content`）按此量级估算约 10–12 KB，而 `search-data.json` 当前仅 1,311 字节；该文件每次页面加载都会被下载并在浏览器内建索引，因此本 change 完成后需要在线上核对索引体积与首屏可搜时刻。
