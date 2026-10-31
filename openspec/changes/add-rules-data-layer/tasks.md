# Tasks

## 1. 导出脚本与导出件

- [x] 1.1 新建 `tools/build-rules-data.mjs`：用 `tools/load-classic.mjs` 的 `loadApp(['rules.js'])` 取内核数据，按 design D3 的十一组键固定顺序构造载荷，序列化为缩进 2 空格 + 结尾换行的 JSON，写入 `_data/ietf-3tier-rules.json`；验证：运行后该文件可被 `node -e "JSON.parse(...)"` 解析，且 `RULES.length === 18`、`FIELDS.length === 12`、每条规则的每条 citation 都带非空 `title`
- [x] 1.2 给导出件加固定的 `_generated` 说明字段（内容不含时间戳与绝对路径），提示该文件由脚本生成、不得手工编辑；验证：导出件首个键为 `_generated`，其值在两次导出间逐字相同
- [x] 1.3 实现 `--check` 模式：重新导出并与磁盘文件比对，一致则退出码 0，不一致则非零退出并打印差异所在的数据组名与（规则类）规则 ID；验证：干净状态下 `--check` 退出 0；手工把导出件里某条规则的 `note` 改一个词后 `--check` 非零并指名该规则 ID；还原后再次退出 0（实现：漂移用例在 `RULES_EXPORT_PATH` 指向的临时副本上做，仓库内的提交件不被手工改写；脚本为此提供一个仅开发期用的路径覆盖）
- [x] 1.4 验证导出可重复且逐字节稳定；验证：连续运行两次导出脚本后 `git diff --exit-code _data/ietf-3tier-rules.json` 无变化（该文件尚未入库，等价验证用 `git diff --exit-code --no-index` 比对两次导出的副本，结果无差异）

## 2. 规则文档页与互链

- [x] 2.1 新建 `net-sim/l3sm-l3nm/rules/index.md`，front matter 含 `title`（页面标题为站点英文文案）与 `layout: page`，使其成为被 lunr 索引的站点 page；验证：文件存在且 front matter 可被 YAML 解析出 `title`（另加 `nav_exclude: true`：本 change 不动既有侧栏导航，页面靠画板链接与搜索到达）
- [x] 2.2 页首渲染范围声明与占位草稿免责：字段数、RFC 8299 叶子声明总数、覆盖率分母口径、`PLACEHOLDER` 徽标与免责句，全部取自 `site.data['ietf-3tier-rules']` 的 `SCOPE` 与 `PLACEHOLDER_DRAFT`，不写常量；验证：页面文本中的数字与导出件 `SCOPE` 值一致（12 / 159 / 145+14），免责句与 `PLACEHOLDER_DRAFT.disclaimer` 逐字相同
- [x] 2.3 按传播类别建 h2 分组，组标题后的条数用 Liquid 过滤从数据算出；验证：把 `RULES` 按类别过滤得到的 9/5/2/2 与总条数 18，与页面渲染出的分组计数一一对应（本地用 Node 从导出件算出期望值，线上核对归 4.2）
- [x] 2.4 每条规则一个 h3 小节，标题用 kramdown 的 inline attribute list 写 `{: #R01 }` 形式的显式 ID；验证：期望锚点集合为 `R01`…`R18` 且互不重复（由导出件算出）；若线上发现 ID 退化成自动生成的 `r01--copy`，按 design 的备选改为内联 `<h3 id="R01">`（实现结论：本地用 kramdown 2.5.2 + `input: GFM` 复现，IAL 在 GFM 解析器下不生效——18 个标题的 ID 退化成 slug 且 `{: #R01 }` 原样残留在标题文本里，因此直接采用备选的内联 `<h3 id="R01">`，本地复现得到 18 个 `id="R0x"` 且互不重复）
- [x] 2.5 小节正文渲染：源路径、目标路径（DROP 显示"无目标路径"的英文说明而非虚构路径）、传播类别、置信标签、每条 RFC 出处（文档号 + 章节号 + 章节标题原文 + 源/目标侧标注）、`pathNote`、`note`；验证：抽一条 COPY、一条 DROP、一条工程推断 DERIVE，比对导出件中该规则的每个非空字段都在小节内逐字出现（两处落地细节：无源/无目标的英文字面量与画板 `app/poc.js` 逐字相同——`no corresponding input`、`none (not carried into the network model)`；来自导出件的散文一律经 Liquid `escape`，否则 R13/R14 说明里的 `<provider AS>:<pool index>` 会被 kramdown 当作 HTML 标签吞掉，破坏"说明文本完整呈现"）
- [x] 2.6 页尾增加工程推断汇总小节，只列 `confidence` 为工程推断的规则；验证：该小节条目数等于 `RULES.filter(r => r.confidence === 'engineering-inference').length`（当前为 5），且小节文本不出现"RFC 规定"一类措辞（汇总用列表 + 指向 `#Rxx` 的链接，不再为同一规则 ID 生成第二个锚点，保证 2.4 的"每个规则 ID 恰好出现一次"）
- [x] 2.7 在 `net-sim/l3sm-l3nm/index.html` 正文加一条指向 `rules/` 的相对链接，并在规则页加返回画板的相对链接 `../`；链接 MUST NOT 写进 `app/poc.js`；验证：`node tools/check-decoupling.mjs` 仍报 0 违规，`app/` 与 `standalone/preview.html` 无 diff，本地 `python3 -m http.server` 下从 POC 外壳页点链接命中 `/net-sim/l3sm-l3nm/rules/`（规则页返回链接的 Liquid 渲染结果线上核）（连带改动：`tools/check-decoupling.mjs` 原先硬编码"只有一个站点页"——外壳页正文引用数 5→6、白名单放行 `<a>`；把 `rules/index.md` 登记为第二个主题感知页并断言它的 front matter、无 permalink、相对链接可解析、必须引用 `site.data['ietf-3tier-rules']`；新增单向数据流断言：`app/` 与 `standalone/` 一旦出现 `_data` 或 `ietf-3tier-rules` 即判违规。四条新断言均在 `/tmp` 副本上做反向验证，确认会失败且还原后归零）

## 3. 搜索粒度、边界契约与站点文案

- [x] 3.1 `_config.yml` 增加 `search.heading_level: 3` 并附一行注释说明理由（让每条规则小节成为独立搜索结果与 `#Rxx` 深链目标，默认 2 只能按类别成组）；验证：YAML 可解析、`git diff` 只含这一处新增，`url`/`theme`/`aux_links`/`exclude` 不变
- [x] 3.2 更新 `net-sim/README.md`：目录结构补 `rules/index.md`，边界表补一行说明 `_data/ietf-3tier-rules.json` 是内核导出件（不属于内核、不得手工编辑、内核 MUST NOT 读取），并写明导出与 `--check` 两条命令；验证：表中路径与仓库实际文件一致，`check-decoupling.mjs` 仍 0 违规（落地补充：`index.html` 的"唯一主题感知文件"表述、迁移清单第 1 步的引用数与新增第 4 步"换非 Jekyll 宿主时规则页与导出件一并去掉"都随之改正）
- [x] 3.3 更新根 `README.md` 与 `README_zh.md` 的第 3、6、7 节：加入规则文档页（URL 与锚点深链）、导出件与 `--check` 命令，并说明站内搜索现在能命中规则正文；验证：两份文件行数仍少于 `net-sim/README.md`，中英小节编号仍一一对应，相对链接在 GitHub 与站点下都成立（实测：README.md 114 行、README_zh.md 104 行，均少于 net-sim/README.md 的 133 行；中英小节编号 1–10 一一对应；相对链接在仓库内全部解析成功）
- [x] 3.4 更新 `index.md` 首页要点列表，补一条规则文档页链接；验证：链接为相对路径且指向 `net-sim/l3sm-l3nm/rules/`

## 4. 集成核对与线上验收

- [x] 4.1 本地全量跑一遍开发期检查：`node tools/build-rules-data.mjs --check`、`check-decoupling.mjs`、`check-rules-shape.mjs`、`check-rfc-citations.mjs`、`engine.test.mjs`；验证：五条命令全部退出码 0，且 `check-rfc-citations.mjs` 报出的规则条数仍为 18（实测五条命令全部退出码 0：`build-rules-data.mjs --check` 报导出件与内核一致；`check-decoupling.mjs` 9 个文件、4 个模板无关、1 个主题感知、0 违规；`check-rules-shape.mjs` 报 12 fields, 18 rules；`check-rfc-citations.mjs` 报 329 处引用核对通过、并复核 SCOPE 的 145 leaf + 14 leaf-list；`engine.test.mjs` 31 项全通过）
- [x] 4.2 推送后线上核对（本机无 Ruby ≥2.7 与 Docker，构建结果只能在线上验）：`https://ctri-chenyong.github.io/net-sim/l3sm-l3nm/rules/` 渲染出 18 个规则小节与分组计数；`/assets/js/search-data.json` 条目数从 2 增至 ≥20 且规则的 `relUrl` 带 `#Rxx`；在头部搜索框输入一个只出现在某条 `note` 里的英文短语能命中该小节并深链；`/data/ietf-3tier-rules.json`、`/tools/*`、`/openspec/*` 均 404；`/net-sim/l3sm-l3nm/` 画板与 `standalone/preview.html` 行为不变（实测：规则页线上渲染出 `id="R01"…id="R18"` 共 18 个不重复锚点，分组标题 COPY (9)/DERIVE (5)/SPLIT (2)/DROP (2) 与工程推断汇总 (5) 均由数据算出；`<provider AS>:<pool index>` 以转义文本呈现，HTML 里 `<provider` 出现 0 次；`search-data.json` 29 条、其中 18 条 `relUrl` 以 `#Rxx` 结尾，规则页贡献 27 条；在浏览器头部搜索框输入只出现在 R18 `note` 里的 `deactivation`，结果恰为 1 条且指向 `/net-sim/l3sm-l3nm/rules/#R18`；`/data/…`、`/_data/…`、`/tools/build-rules-data.mjs`、`/tools/check-decoupling.mjs`、`/openspec/…/tasks.md` 全部 404，`/net-sim/README.md` 仍 200（有意发布）；画板 18 条规则行与返回链接正常，`app/` 四个文件与 `standalone/preview.html`、`theme/just-the-docs.css` 线上内容与仓库文件 `cmp` 逐字节相同，且本 change 对 `app/`、`standalone/`、`theme/` 的 diff 为空）
- [x] 4.3 记录索引体积与首屏可搜时刻的实测值（导出前 `search-data.json` 为 1,311 字节、2 条），写入本 change 的验收说明；若体积或耗时不可接受，按 design 的回退路径改 `search.heading_level` 或对部分小节设 `search_exclude`，并重跑 4.2（实测：`search-data.json` 1,311 → 24,216 字节（+22.9 KB，18.5 倍），2 → 29 条；线上资源计时里该请求在 DOMContentLoaded（332 ms）之后发起、本次命中缓存故 3 ms 完成，`lunr.min.js` 解码 31,211 字节、`just-the-docs.js` 20,172 字节均为主题自带。24 KB 量级与规则正文本身相当，属可接受，无需回退到 `heading_level: 2` 或 `search_exclude`。附带发现：五条规则（R12/R13/R14/R15/R16）的 `note` 在页尾"工程推断"汇总里重复一次，索引因此含重复文本，是搜索出现同规则两条结果的来源，不影响正确性）
