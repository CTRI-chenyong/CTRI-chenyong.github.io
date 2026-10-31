# Tasks

## 1. `net-sim/` 目录骨架、外壳与解耦约束

- [x] 1.1 建目录骨架 `net-sim/l3sm-l3nm/{app,theme,standalone}`；验证：`git status --short` 中全部新增路径都在 `net-sim/` 与 `tools/` 下，且 `assets/`、`_layouts/`、`_includes/`、`_sass/`、`Gemfile`、`.github/` 无任何改动。
- [x] 1.2 新建外壳页面 `net-sim/l3sm-l3nm/index.html`：front matter 只含 `title: IETF 3-Tier Network Model Mapping POC` 与 `layout: page`，**不设 `nav_order`**（just-the-docs 的 `_includes/components/nav/sorted.html` 把所有带 `nav_order` 的页面排在所有不带的页面之前，而 Home 没有 `nav_order`，因此写 `nav_order: 2` 反而会把本页顶到 Home 前面；两页都不带时按 title 字母序得到 Home → 本页），**不设 `permalink`**（URL 取目录自然路径 `/net-sim/l3sm-l3nm/`）；body 只有 `<div id="ietf-3tier-poc"></div>` 与 5 个相对路径引用（`theme/just-the-docs.css`、`app/poc.css`、`app/rules.js`、`app/engine.js`、`app/poc.js`）；验证：`grep -c '{{'` 为 0、`grep -nE '(href|src)="/'` 无命中、导航标题逐字等于 `IETF 3-Tier Network Model Mapping POC`。
- [x] 1.3 新建 `net-sim/l3sm-l3nm/standalone/preview.html`：无 front matter、不引 `theme/`、引同一批 `app/` 资源，页首一行英文标签 `Standalone build — no site theme`；验证：以 `file://` 直接打开画板可用且控制台无报错，`python3 -m http.server` 于仓库根启动后打开 `http://localhost:8000/net-sim/l3sm-l3nm/standalone/preview.html` 无 404。
- [x] 1.4 新建 `net-sim/l3sm-l3nm/app/poc.css`：全部选择器以 `.ietf-3tier-poc` 为前缀，不覆盖主题选择器；断点用自有 rem 值（不引用主题 `$media-queries`/`xl`）；把 `--i3t-z-overlay`、`--i3t-content-max-width` 与四类传播色暴露为 CSS 自定义属性；验证：`node tools/check-decoupling.mjs` 通过，且把 `theme/just-the-docs.css` 内容清空后 preview 页面布局仍然成立。
- [x] 1.5 新建 `net-sim/l3sm-l3nm/app/{poc.js,engine.js,rules.js}` 三个 classic script（非 ES module），按 `rules.js → engine.js → poc.js` 顺序引用；连线层用 `position: fixed` + `pointer-events: none` + 视口坐标，scroll/resize 时 rAF 重算，并支持外壳注入 `window.IETF3TIER_MOUNT = { connectorLayer: 'fixed' | 'inline' }`；验证：`file://` 打开 preview 时控制台可见 `window.Ietf3Tier` 命名空间，滚动页面时连线端点仍贴合字段。
- [x] 1.6 新建 `net-sim/l3sm-l3nm/theme/just-the-docs.css`：只放主题适配（容器宽度、字体、与主题冲突的 `z-index`），只允许在此文件出现主题选择器/主题变量；验证：`node tools/check-decoupling.mjs` 断言全仓库只有该文件与 `index.html` 的 front matter 含主题 token。
- [x] 1.7 新建 `net-sim/README.md`（英文、无 front matter）：目录结构、解耦边界表、换模板三步迁移清单（front matter 字段名 → `theme/*.css` → `connectorLayer` 开关）；验证：文件内无 Liquid；无 front matter 的 `.md` 会被 Jekyll 原样拷贝为静态文件，因此它会以 `/net-sim/README.md` 发布——这是有意的（对外说明目录结构与迁移方式），不写进 `exclude`。
- [x] 1.8 新建 `tools/check-decoupling.mjs`（开发期脚本，不进站点运行时）：按 design D3.1 的表格扫描 `net-sim/`，断言 `app/**` 无主题类名、无主题变量、无 Liquid、无以 `/` 开头的绝对路径、无 `fetch`/`XMLHttpRequest`，`index.html` 无 Liquid 与业务标记，`standalone/preview.html` 不引 `theme/`；验证：故意在 `app/poc.js` 加一行 `fetch('/x')` 后脚本以非零退出并打印文件名与行号，撤销后退出码回到 0。
- [x] 1.9 修改 `_config.yml` 增加 `exclude: [openspec, .qoder, tools]`（`tools/` 下的 `.mjs` 若无 front matter 会被 Jekyll 当静态文件原样发布到 `/tools/...`，必须排除）；验证：`git diff _config.yml` 只有 exclude 一项改动，`url`/`theme`/`aux_links` 保持不变，推送后 `https://ctri-chenyong.github.io/tools/check-decoupling.mjs` 返回 404（这一条要等推送后才能核对，并入 6.2 一起做）。

## 2. 规则表与 RFC 出处（spec: mapping-rules）

- [x] 2.1 在 `net-sim/l3sm-l3nm/app/rules.js` 中登记 L3SM 核心子集的字段定义（spec `mapping-board` 表格里的 12 个输入字段），每项含 `path`、`rfcSection`、`yangType`（identityref/ipv4/uint8/uint32/string/date）、`mandatory`、`enumValues`（仅 RFC 定义值）、`requiredFor`；验证：`node tools/check-rules-shape.mjs` 通过（该脚本以 classic script 方式读入 `rules.js` 后取 `window.Ietf3Tier.rules`），且枚举值恰为 `any-to-any|hub-spoke|hub-spoke-disjoint`、`any-to-any-role|spoke-role|hub-role`。
- [x] 2.2 在同一文件登记 spec `mapping-rules` 表格的 18 条规则，每条含 `id`、`sourcePath`、`targetPath`、`category`(COPY|DERIVE|SPLIT|DROP)、`confidence`(standard|engineering-inference)、`citations:[{rfc,section,title,side}]`（数组而非单条：一条规则同时引用源侧与目标侧，R14 还引用两个源章节）、`note`；无 L3SM 源的 DERIVE 规则 `sourcePath` 为 `null`，且只登记确实存在的出处（spec 禁止为工程推断编造出处）；DROP 规则的 `targetPath` 必须为 `null` 而不是空字符串；验证：新增 `tools/check-rules-shape.mjs` 断言上述字段齐全、category/confidence 取值合法、规则 ID 唯一，`node tools/check-rules-shape.mjs` 退出码为 0。
- [x] 2.3 新建 `tools/check-rfc-citations.mjs`：读取 `https://www.rfc-editor.org/rfc/rfc8299.txt` 与 `rfc9182.txt`（可缓存到 `/tmp`），对每条规则断言引用的章节号出现在该 RFC 的编号标题中、引用的叶子名出现在模块文本中；验证：脚本对当前 18 条规则全部通过并打印每条命中的原文行号；把某条章节号改成 `§99.99` 后脚本以非零退出码失败并打印该规则 ID。
- [x] 2.4 在页面上以英文写清"本次覆盖 RFC 8299 的声明子集，非完整模型"，并登记子集边界常量（子集字段数、RFC 8299 叶子总数的手工核对值）；验证：standalone/preview.html 页面显示子集字段数与占全模型叶子的比例两个数字，且比例分母与常量一致。
- [x] 2.5 在规则面板标题处写占位 draft 名 `draft-ietf-onsen-l3sm-l3nm-mapping` 并紧跟 `PLACEHOLDER` 徽标与一句英文免责说明（"Placeholder name — no such IETF document exists"）；验证：页面 DOM 中该字符串出现一次且徽标紧邻，文案逐字为任务书给定名称。
- [x] 2.6 增加"Differences from the tasking document"英文说明块，列出 spec `mapping-rules` 中核实出的 RFC 原文差异（8299 无 `customers`/`customer-id`/`service-type`；9182 无 `sites`/顶层 RD；AS 叶子名不同；拓扑取值为 `hub-spoke`）；验证：该说明块在 standalone/preview.html 可见，且四条差异各附 RFC 章节号，逐条能在 `tools/check-rfc-citations.mjs` 的输出里找到对应命中。

## 3. 映射引擎与无损指标（spec: mapping-rules / mapping-board）

- [x] 3.1 在 `net-sim/l3sm-l3nm/app/engine.js` 实现 `mapL3SM(inputs)`：按规则表执行 COPY/DERIVE/SPLIT/DROP，返回 `{ l3nmInstance, traces, dropped }`，trace 含 `batchId|causalNo|ruleId|sourcePath|targetPath|category|before|after|fanout`；验证：新增 `tools/engine.test.mjs`（`node --test`），断言单站点单接入输入产生预期 L3NM 结构与非空 traces。
- [x] 3.2 实现 DERIVE 生成算法并给出可读说明文本（RD 池分配、RT 由拓扑推导、`vpn-type` 默认 `bgp-based-l3vpn`、`local-as` 取 Provider AS），全部标记 `confidence: engineering-inference`；验证：测试断言同一输入两次映射产生相同 RD/RT（幂等），且每条 DERIVE trace 的 `note` 非空。
- [x] 3.3 实现 `invertL3NM(l3nmInstance)` 做往返反演，仅反向执行 COPY/SPLIT，DERIVE 不参与、DROP 字段在结果中显式列为已知有损；验证：测试断言往返后与原输入在受反演覆盖的字段上差异为 0，且返回列表显式包含被 DROP 的字段路径。
- [x] 3.4 实现 `computeMetrics()` 返回覆盖率（分母为子集字段数，DROP 计入命中）、往返一致性差异数、溯源完整率（L3NM 非空叶子可回溯到 ruleId 或 DERIVE note）；验证：测试断言预置数据下三项指标为 100% / 0 / 100%；构造一个无法溯源的字段时溯源率下降且返回该字段路径。
- [x] 3.5 实现最小校验器 `validateL3SM(inputs)`：ipv4-address 格式、prefix-length 0..32、as-number 范围、枚举取值集合、mandatory 缺失；返回字段级错误对象；验证：测试断言 `192.0.2` 被判非法、`prefix-length: 33` 被判越界、空 `site-id` 返回必填错误，且非法输入不会进入 `mapL3SM` 的输出。

## 4. 画板与联动交互（spec: mapping-board）

- [x] 4.1 渲染两个实体卡片（L3SM 标注 `RFC 8299`、L3NM 标注 `RFC 9182`）与方向连线 `L3SM → L3NM`；验证：standalone/preview.html 中两个实体在同一视野内可见，连线由覆盖式 SVG 层绘制，窗口缩放后连线端点仍对齐字段。
- [x] 4.2 在 L3SM 卡片渲染 12 个输入字段，控件类型由 `yangType` 决定（枚举→`<select>`、list→可增删条目、mandatory→`required` 与必填标记），每个字段旁显示 YANG 相对路径与 RFC 章节号；验证：浏览器中 Tab 键能依次聚焦全部字段，下拉选项文本与 RFC identity 逐字一致（不出现 `hub-and-spoke`）。
- [x] 4.3 接入批次渲染：一次提交 = 一个 batch，**本批真正发生变化的** trace 对应的目标叶子整批加高亮类（本批变更色 / DERIVE 生成色两种），挂因果编号徽标，约 2 秒后自动消退；高亮按"值是否变化"筛选而非按规则类别，因此改 `customer-address` 只高亮它影响的 `static-addresses` 叶子，不会顺带高亮未变化的 RD/RT；验证：改一个 `customer-address` 后同批受影响的下游字段同时进入高亮、其余字段不进入，高亮在约 2 秒后自行消退，从提交到高亮完成的耗时 < 300ms（实测 3.3ms）。
- [x] 4.4 图例常驻显示 COPY/DERIVE/SPLIT/DROP 四类颜色含义，DROP 字段在 L3SM 侧标注"not carried into L3NM"；验证：填 `city` 与 `country-code` 后画板出现 DROP 标注，且 L3NM 实例中不存在对应字段。
- [x] 4.5 SPLIT 展开可视化：一个站点多接入 → 一个 `vpn-node` 下多个 `vpn-network-access`；一个站点经 `vpn-attachment` 挂到多个 vpn-id → 在多个 `vpn-service` 下各生成节点；验证：新增第二个站点接入后 L3NM 侧出现第二个 network-access 条目，连线从单一 L3SM 字段扇出到多个目标。
- [x] 4.6 DERIVE 字段只读拦截：点击尝试编辑时拒绝写入、保持原值、显示生成算法说明与出处（RD 引 RFC 8299 §6.6.7 与 RFC 9182 §7.4）；验证：浏览器中点击 RD 字段后 DOM 中值未变化且说明浮层出现，引用文本可被 `tools/check-rfc-citations.mjs` 命中。
- [x] 4.7 错误提示就地渲染：校验失败时字段旁显示英文错误与其 RFC 路径，L3NM 侧保持上一次合法结果不变；验证：输入非法 IPv4 后 L3NM 卡片内容与其 trace 数量未变化，错误提示可见。
- [x] 4.8 跟随模式开关（默认 ON）：手动滚动 L3NM 内容即自动切 OFF 并显示状态提示，可手动恢复；验证：滚动后开关显示 OFF 且后续提交不再自动滚动；点回 ON 后再次提交可滚动到目标字段。
- [x] 4.9 预置演示数据（一个 VPN 服务 + 两个站点接入，符合 RFC 8299 示例写法）与刷新即重置；验证：首次加载画板即有映射结果；录入若干字段后刷新页面回到预置状态；浏览器网络面板中无任何携带录入数据的请求。

## 5. 规则面板与双向反查（spec: mapping-rules）

- [x] 5.1 渲染规则面板：每行显示源路径、目标路径、类别徽标、置信标签、出处；DROP 行目标位置显示"none (not carried into the network model)"；验证：面板行数等于 `rules.js` 规则数（18 行），**有 L3SM 源的 13 行**每行可见 `RFC 8299 §x.y` 与 `RFC 9182 §x.y` 两段出处；无 L3SM 源的 5 条 DERIVE 行（R12–R16）源侧显示"no corresponding input"，只登记确实存在的出处（R13 引 §6.6.7 + §7.4，R14 引 §6.2.1 + §6.2.1.1 + §7.4，R12/R15/R16 只引目标侧），因为 spec 明确禁止为工程推断编造 RFC 出处。
- [x] 5.2 规则行 → 画板反查：点击行使源字段与目标字段同时聚焦并高亮；无 L3SM 源的 DERIVE 行在源侧显示"no corresponding input"；验证：点击 `interface-id` 规则行后画板出现对应高亮，且源侧提示文本可见。
- [x] 5.3 因果编号 → 规则行反查：点击 L3NM 字段编号徽标，面板滚动到对应行并高亮；验证：任选三个编号点击，面板滚动定位到的行 `ruleId` 与该字段 trace 的 `ruleId` 一致（在控制台断言）。
- [x] 5.4 工程推断汇总视图：一个可展开区块列出全部 `engineering-inference` 规则及推断依据，措辞不得出现 "RFC mandates/specifies"；验证：展开后列出 `vpn-type`、`local-as` 等规则，`grep -n "mandates\|specifies" net-sim/l3sm-l3nm/app/*.js` 无命中。
- [x] 5.5 指标看板渲染三项指标并标注分母口径，往返差异与溯源缺口以异常态显示；验证：预置数据下显示 coverage 100% / round-trip diff 0 / traceability 100%，且覆盖率旁有 "of declared subset" 字样。

## 6. 集成验收

- [x] 6.1 本地静态验证：`python3 -m http.server` + `node --test tools/engine.test.mjs`（Node 24 下 `node --test tools/` 会把目录当测试文件而报错，必须指名文件）+ `node tools/check-decoupling.mjs` + `node tools/check-rules-shape.mjs` + `node tools/check-rfc-citations.mjs` 全绿，standalone/preview.html 页面手工走通"录入 → 批次高亮 → 双向反查 → 只读拦截 → 指标读数"一条完整路径；验证：在 Chrome 与 Edge 两个真实浏览器中行为一致（高亮对得上规则、无编号错乱），并在 LAN URL 下复核一次。实测：Chrome 156 与 Edge 156 各自跑同一份 47 项断言探针（覆盖上述完整路径），在 `127.0.0.1` 与 LAN IP 两种来源下均为 47/47 通过，两个引擎结果逐字一致。
- [x] 6.2 线上核对：推送 `main` 后由用户在真实浏览器打开 `https://ctri-chenyong.github.io/net-sim/l3sm-l3nm/` 核对左侧导航出现 `IETF 3-Tier Network Model Mapping POC`、主题外壳样式无冲突、断网后页面功能仍可用；验证：导航栏第二项文本逐字一致，浏览器网络面板中除本站外无其它域名请求，且线上 `/net-sim/l3sm-l3nm/standalone/preview.html` 也能打开并渲染出同一画板。实测（deploy `7c672d0` completed success 之后）：导航为 `Home` → `IETF 3-Tier Network Model Mapping POC`，第二项逐字一致且带 `active`，mount 位于 `.main-content` 内；线上主页板 49 个叶子 / 18 条规则 / 100%-0-100%，线上 preview.html 同一批 `app/` 资源渲染出完全相同的 49/18/100%-0-100% 且无主题导航；Chrome 156 与 Edge 156 以 `--headless=new` 各自 dump 线上页面，两份 DOM 逐字节等长（96536 bytes）、读数一致。跨域请求：Resource Timing 中本站以外的 host 为空数组（无任何第三方资源），页面里仅剩的两个外部字符串是主题自带 `aux_links`/页脚的 GitHub 锚点 `href`（来自 `_config.yml`，不产生请求、也不属于 `net-sim/`）。断网可用性的依据即"零第三方资源"，并与 6.4 的搬迁演练、`file://` 直开互证。
- [x] 6.3 站点构建不受影响：确认 `Gemfile`、`.github/workflows/*.yml` 未改动，`_config.yml` 只新增 `exclude`，且线上首页与既有页面渲染正常；验证：`git diff --stat` 只列出 `net-sim/`、`tools/` 下的新增文件与 `_config.yml`；线上首页可正常访问。实测：`git diff --name-only 69543a5 HEAD -- Gemfile Gemfile.lock .github _layouts _includes _sass assets` 输出为空（构建链与主题目录零改动）；`_config.yml` 的 diff 只有 `exclude: [openspec, .qoder, tools]` 一项新增，`url`/`theme`/`aux_links` 原样；36 个文件全部落在 `net-sim/`、`tools/`、`openspec/` 与 `_config.yml`。线上状态码：`/` 200、`/net-sim/l3sm-l3nm/` 200、`/net-sim/l3sm-l3nm/standalone/preview.html` 200、`/net-sim/README.md` 200，而 `/tools/check-decoupling.mjs`、`/openspec/.../tasks.md`、`/.qoder/x` 均 404（exclude 生效）。首页渲染正常：`title` 为 `Home | IETF ONSEN workgroup POC`，`.side-bar` 存在，`.main-content` 有 1508 字符正文，导航仍是 Home → POC 两项。
- [x] 6.4 目录搬迁演练（证明与模板/路径解耦）：把 `net-sim/` 整体复制到 `/tmp/relocated/site/net-sim/`，在 `/tmp/relocated/site` 下起 `python3 -m http.server`，打开 `http://localhost:8000/net-sim/l3sm-l3nm/standalone/preview.html`；验证：无任何 404、画板走通与仓库内一致的完整路径、`node tools/check-decoupling.mjs` 退出码为 0；演练后删除临时目录。
