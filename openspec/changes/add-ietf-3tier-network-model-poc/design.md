# Design

## Context

动机与范围见 `proposal.md`；行为契约见 `specs/ietf-3tier-mapping-poc/*/spec.md`。这里只记录影响技术选择的现状事实，全部为本仓库与 RFC 原文实测核实：

- **站点现状**：Jekyll 4.4.1 + `just-the-docs` 0.12.0（Gemfile 里 pin 死），GitHub Pages 由 `.github/workflows/pages.yml` 构建发布。线上站点是根级 user site，baseurl 为 `/`；主导航当前只有 `Home` 一项（实测 `<a href="/" class="nav-list-link">Home</a>`）。主题内容列宽 `$content-width: 62rem`（`_sass/custom/setup.scss:3`）。
- **本地工具链限制（决定验证方式）**：本机只有系统 Ruby 2.6.10，Jekyll 4.4 需要 Ruby ≥ 2.7，且无 Docker；可用的是 Node 与 Python 3.11。**因此无法本地跑 `bundle exec jekyll build`**，任何依赖 Liquid 渲染的验证只能在推送后由 GitHub Pages 完成。
- **说明书与 RFC 原文存在结构性出入（已逐条核实，非推测）**：任务书图 4-1 线框里的 L3SM/L3NM 节点名与 RFC 原文不符。
  - RFC 8299（`ietf-l3vpn-svc`）**没有** `customers`、`vpn-providers` 容器，也没有 `customer-id`、`vpn-name`、`service-type`；客户只有 `l3vpn-svc/vpn-services/vpn-service/customer-name`（§6.2）。
  - RFC 9182（`ietf-l3vpn-ntw`）**没有** `sites` 列表、没有 `customer-id`、没有顶层 `route-distinguisher` 叶子；§7.5 原文写明"客户站点信息在本模型中不需要，它属于 L3SM"。RD 位于 `vpn-instance-profile` 的 `rd-choice` 之内，RT 位于 `address-family`（**列表**，非 `ipv4-family` 容器）下的 `vpn-targets`。
  - 客户 AS：8299 用 `bgp/autonomous-system`（uint32，mandatory），9182 用 `bgp/peer-as`（inet:as-number，mandatory）与 `bgp/local-as`。
  - 拓扑叶子两边同名 `vpn-service-topology`，identity 取值均为 `any-to-any` / `hub-spoke` / `hub-spoke-disjoint`（**不是** `hub-and-spoke`）；9182 另允许 `custom`。
  - 两篇 RFC 的准确标题：8299 = `YANG Data Model for L3VPN Service Delivery`（2018-01，obsoletes RFC 8049）；9182 = `A YANG Network Data Model for Layer 3 VPNs`（2022-02）。
  - 结论：画板与规则表**以 RFC 原文为准**，任务书线框只作为交互意图参考；页面需说明这一出入，避免评审时被指为臆造模型。
- **说明书的硬约束在本迭代无法照搬**：`协议必须真实（三进程 RESTCONF/NETCONF）`、`表单必须由 pyang 生成`、`校验必须走 yangson`。用户已明确本迭代为纯浏览器本地实现，这三条按"后续迭代再满足"处理，本设计不假装满足。

## Goals / Non-Goals

**Goals:**

- 页面文案一律使用规范英文（站点面向 IETF 国际读者），含导航入口名 `IETF 3-Tier Network Model Mapping POC`（用户给定，逐字使用）。
- POC 的 HTML/CSS/JS/数据全部自包含在仓库根的单一目录 `net-sim/` 内，**不依赖主题外壳的任何 JS/CSS/断点变量**，可整目录搬到别的模板或任意静态托管，也可在本地用静态服务器（甚至 `file://`）独立打开验证。
- 映射逻辑写成无框架依赖的纯函数模块，使规则表、trace、指标三者只有一份实现，页面只是它的一个消费者。
- 每条规则的 RFC 出处可被一个开发期脚本自动核对，防止"看起来像出处"的编造。

**Non-Goals:**

- 不做 YANG schema 解析（不引入 JS YANG 库、不编译 `.yang` 文件），也不做 RFC 7950/7951 实例校验。本迭代的字段表按 RFC 原文手工誊录，正确性由 D7 的开发期出处核对脚本兜底；schema 编译与实例校验是后续迭代的事，路线对比与暂定选型见下文 `Future Direction` 议题二。
- 不做设备模型段、页面二真机下发、containerlab、NETCONF/RESTCONF 调用。
- 不做设备层路由协议解释引擎与数据面流量仿真。这两块的四档模式定义、暂定选型与实测依据见下文 `Future Direction`，本迭代不实现、不验收。
- 不做实例持久化、分享链接、URL 状态编码。
- 不改动主题版本、Gemfile、CI workflow。

## Decisions

### D1 画板形态：HTML 实体卡片 + 覆盖式 SVG 连线层
两个实体（L3SM / L3NM）用原生 HTML 表单与结构化 DOM 呈现；两者之间的映射关系用一张 `position: fixed`、`pointer-events: none` 的 `<svg>` 覆盖层，按 `getBoundingClientRect()`（视口坐标）绘制连线与箭头，并在 scroll/resize 时用 `requestAnimationFrame` 重算。

- *为什么不用 `<canvas>` 2D*：输入框、光标、文本换行、命中检测、键盘可达性全部要自己实现；本迭代的核心价值是"字段级输入 + 字段级高亮"，原生表单直接就有这些能力。
- *为什么不用 D3/Mermaid/Graphviz*：都需要 CDN 或新增打包依赖，违反"零远程依赖 + 无构建步骤"。
- *为什么 fixed 而非 absolute*：`absolute` 覆盖层会被任意祖先的 `overflow: hidden` 裁掉、被 `transform`/`filter` 改变包含块、被主题的层叠上下文压住——这三件事在换主题时不可预测。`fixed` + 视口坐标只依赖视口，对宿主主题的容器实现零假设，这是 D3"可换模板"要求的技术前提。代价是要监听滚动重算，连线数量在数十条量级，成本可忽略。
- *可调参数走 CSS 自定义属性*：`--i3t-z-overlay`、`--i3t-content-max-width`、四类传播色等以 custom property 暴露，主题适配层只需覆盖这几个变量，不必改 `app/` 里的任何规则。
- *无障碍*：连线层 `aria-hidden="true"` 且 `pointer-events: none`；所有可操作内容都在 DOM 里，读屏与键盘 Tab 顺序自然成立。

### D2 布局：不改主题宽度，单列纵向 + 宽视口并排
不覆写主题的 `$content-width`（仓库既有的 `_sass/custom/setup.scss` 已把内容列定为 62rem，本 change 沿用不动）、不新增 `_layouts/`。画板在内容列内：默认 L3SM 在上、L3NM 在下、规则面板折叠在下方；视口够宽时两块实体左右并排，规则面板转为右侧列。

- *断点自带，不借主题的*：`app/poc.css` 用自己的 `@media (min-width: …)`（rem 值）判断并排，不引用 just-the-docs 的 `$media-queries`/`xl` 之类主题变量——否则换主题即失效。
- *备选*：复制主题 `default.html` 到 `_layouts/` 加 body class 以获得全宽。*否决原因*：与 pin 住的 0.12.0 模板强耦合，主题升级或换主题即失效，且本迭代不需要三栏（只有两个实体）。
- *若将来确实需要更宽*：在 `net-sim/l3sm-l3nm/theme/just-the-docs.css` 里针对本页容器放宽，而不是改全站 `$content-width`；这是适配层存在的意义。

### D3 资源组织：`net-sim/` 单一自包含目录 + 外壳/适配层三段式
全部网络仿真代码放在仓库根的 **一个独立目录 `net-sim/`** 下，与 GitHub Pages 模板（当前是 just-the-docs）**结构上零耦合**；换模板时该目录整体不动，只改其中的外壳 front matter 与主题适配 CSS。

```
net-sim/                              # 自成一体；可整目录复制到别的 Jekyll 站点或任意静态托管
  README.md                           # 目录说明 + 换模板迁移清单（无 front matter → Jekyll 原样拷贝为静态文件，不进导航）
  l3sm-l3nm/                          # 迭代 1：L3SM → L3NM
    index.html                        # 【唯一知道主题的文件】front matter(title/layout/nav_order) + 挂载点 + 相对路径引用
    app/                              # 仿真内核：零主题类名、零主题变量、零 Liquid、零绝对路径、零 fetch
      poc.css                         #   画板样式，全部选择器带 .ietf-3tier-poc 前缀
      rules.js                        #   规则表 + 字段定义（JS 常量）
      engine.js                       #   纯函数：规则执行、trace、指标、校验
      poc.js                          #   入口：装配 DOM、事件、渲染
    theme/
      just-the-docs.css               # 主题适配层：唯一允许出现主题选择器/主题变量的地方
    standalone/
      preview.html                    # 无 front matter 的独立外壳，不引 theme/；file:// 或静态服务器直接打开
```

- *为什么不放 `assets/`*：`assets/` 是 gem 主题的发布路径（`/assets/css/just-the-docs.css` 等来自 gem），仓库根再建同名目录会与主题产物挤在同一 URL 命名空间下，换主题时冲突面不可控；`net-sim/` 是仓库自有命名空间，主题不会往这里发布任何东西。
- *为什么用相对路径而不是 `/assets/...` 绝对路径*：绝对路径把 baseurl 写死成 `/`，一旦站点从 user site 变成 project site（baseurl `/<repo>/`）就全断。相对路径由浏览器按当前文档 URL 解析，user site / project site / `file://` / 其它静态托管四种情况都成立，`index.html` 因此**不需要任何 Liquid**。
- *为什么不设 `permalink`*：`net-sim/l3sm-l3nm/index.html` 的自然 URL 就是 `/net-sim/l3sm-l3nm/`，与目录结构一致，相对路径必然对得上；显式 permalink 会让 URL 与目录脱钩，是相对路径方案唯一的破坏点，故禁用。
- *为什么 classic `<script>` 而非 ES modules*：ES module 在 `file://` 下被 CORS 拦截，classic script 连本地静态服务器都不需要；规则表随 JS 常量加载，同样避开 `fetch` 在 `file://` 下的失败。引用顺序 `rules.js → engine.js → poc.js`。
- *为什么不用 `_includes/head_custom.html` 注入*：该钩子对**每个页面**生效，会把 POC 资源塞进全站页面；更关键的是它是 just-the-docs 专有的覆写点，用它等于把仿真代码绑死在当前主题上，与目录独立的目标相反。
- *样式隔离*：`app/poc.css` 只写 `.ietf-3tier-poc` 前缀选择器，不覆盖任何主题选择器，因此它反过来也不被主题升级影响。

#### D3.1 解耦边界（机器可核对）
`app/` 是内核，`index.html` + `theme/` 是外壳。边界用禁止项定义，而不是靠约定：

| 位置 | 允许 | 禁止 |
| --- | --- | --- |
| `app/**` | 自有的 `.ietf-3tier-poc` 类名、自有 CSS 变量、`net-sim/` 内部的相对引用 | 主题类名（`.nav-list-link`、`.main-content` 等）、主题 SCSS 变量、Liquid 语法、以 `/` 开头的绝对路径、`fetch`/`XMLHttpRequest`/CDN |
| `theme/*.css` | 主题选择器、主题变量、覆盖 D1 暴露的 `--i3t-*` 变量 | 业务逻辑与字段级样式（那些属于 `app/poc.css`） |
| `index.html` | front matter、挂载点 `<div id="ietf-3tier-poc"></div>`、4 个相对路径引用 | 业务标记、内联样式/脚本、Liquid |
| `standalone/preview.html` | 同 `index.html` 的挂载点与 `app/` 引用 | front matter、`theme/` 引用——它必须证明内核不依赖主题 |

由 `tools/check-decoupling.mjs`（开发期脚本，与 D7 同风格）静态扫描 `net-sim/` 断言上表，违反则非零退出并打印文件与行号。

#### D3.2 换模板时的适配动作（"适度修改仿真代码"的具体含义）
内核不改，适配集中在三处，按代价从小到大：

1. **front matter 字段名**：just-the-docs 用 `title` + `nav_order` 自动生成左侧导航；minima 用 `_config.yml` 的 `header_pages`；al-folio 用 `_data/navigation.yml`。改的是 `index.html` 的 3–4 行 front matter 加一处站点级导航配置，`app/` 不动。
2. **`theme/*.css` 重写**：新主题若没有可覆写的容器宽度或字体变量，这个文件可以清空——内核自带完整默认样式，`app/poc.css` 不假设任何主题变量存在；若新主题内容列过窄或有冲突的 `z-index`/字体，在此文件覆盖 `--i3t-*` 变量即可。
3. **唯一预设的内核可变点**：若新主题的容器让 `position: fixed` 覆盖层仍不可用（极少数情况，如整站被包在 `transform` 里），`poc.js` 接受外壳注入的 `window.IETF3TIER_MOUNT = { connectorLayer: 'fixed' | 'inline' }` 来切换连线层策略。除此之外，任何"为了适配模板而改 `app/`"的需求都视为设计缺陷，应回到本节讨论而不是就地打补丁。

`net-sim/README.md` 以英文写明这份迁移清单，使换模板这件事不需要读 OpenSpec 归档就能执行。


### D4 状态与数据流：trace 是唯一真值
```
L3SM 输入态 (plain object)
      ↓ engine.mapL3SM(inputs)
{ l3nmInstance, traces[], metrics }
      ↓ render
画板（实体/批次高亮/因果编号） + 规则面板 + 指标看板
```
`trace` 对象字段：`batchId`、`causalNo`、`ruleId`、`sourcePath`、`targetPath`、`category`(COPY|DERIVE|SPLIT|DROP)、`before`、`after`、`fanout`。画板的四类可观察行为（因果编号、字段定位、颜色、规则行亮起）全部由 traces 驱动，页面不得自行推断对应关系——这是说明书 §4.3.1 里本迭代可以照搬的那一条。

- 一次提交 = 一个 batch；渲染按 batch 整体加/去高亮类，而非逐字段动画，直接满足"整批脉冲高亮"和 300ms 预算。
- 单向数据流，无框架：输入变更 → 全量重算映射（子集规模 ≤ 数十条规则，成本可忽略）→ 只重绘受影响批次。

### D5 无损指标的实现口径
- *覆盖率*：`已命中规则的子集输入字段数 / 子集输入字段总数`，DROP 命中算覆盖；分母必须与"该子集占 RFC 8299 全部叶子的比例"并列显示（后者由 `rules.js` 里手工登记的子集边界常量给出，不假装自动统计全模型）。
- *往返 diff*：用同一张规则表**反向执行** COPY/SPLIT 规则得到 L3SM' ‖ 原输入；DERIVE 字段不参与反演，DROP 字段在 UI 上显式列为"已知有损项"而非静默剔除。
- *溯源完整率*：遍历生成的 L3NM 实例每个非空叶子，检查是否存在 trace 携带对应 `targetPath`。
- 三者都在浏览器本地计算，无后端。

### D6 校验：手写最小类型校验器，不假装 YANG 校验
按字段实现 `ipv4-address` / `prefix-length(0..32)` / `as-number` / 枚举集合 / mandatory 五类检查，错误就地提示且不参与映射。页面上明确一句：本迭代未做 RFC 7950/7951 实例校验（那是 yangson / 后续迭代的事），避免对外口径出错。

### D7 规则出处的开发期核对脚本
`tools/check-rfc-citations.mjs`（Node，仅开发机运行，不进站点运行时）：抓取 rfc-editor 的两篇 `.txt`，对每条规则断言 (a) 引用的章节号出现在该 RFC 的编号标题中，(b) 引用的叶子名出现在模块文本中，失败则非零退出并打印规则 ID。它满足 spec 中"出处可离线自动核对"，也顺带把"不许臆造出处"变成机器约束而不是约定。

## Future Direction

本节是后续迭代的决策依据，**不是本 change 的实现要求**，不进入 specs，apply 阶段不实现、不验收。进入迭代 2 时，被选中的档位由那个 change 自己的 spec 承载。

### 议题一：设备层解释引擎的四档模式（A / B / C / D）

| 档 | 定义 | 技术形态 | 启动开销 | 宿主开销 |
| --- | --- | --- | --- | --- |
| **A** 控制面静态推演 | 读设备配置 → 算 OSPF SPF、BGP best-path、RT 导入/导出过滤 → 输出 RIB/FIB 与逐包转发结果 | 纯 JS，无时间维、无状态机 | 首屏不受影响（懒加载 schema JSON，量级 1–5MB，待实测） | 内存 <50MB，单核毫秒级，手机也能跑 |
| **B** 协议行为仿真 | 真实状态机 + 定时器 + 邻居建立/撤销 + 报文交换 + 收敛过程 + 故障注入 | 离散事件仿真，每节点一个 Web Worker | 点击到可用 2–10s | 每 Worker 独立堆 → 内存 ×N；演示拓扑（3 PE + 3 CE）可行，几十节点开始吃紧 |
| **C** 数据面流量仿真 | 逐包或按流的转发与统计 | JS 事件循环或 WASM | 同上 | 见下方吞吐实测；浏览器做不到实时线速 |
| **D** 真实现移植 | 把 FRR / libyang 编成 WASM 跑真守护进程 | Emscripten 自建构建线 | 体积 15–25MB（Pyodide 路线）或自建 WASM | CPython/WASM 基线 100–200MB，iOS Safari 易被系统杀 |

#### 暂定选型

- **暂定走 A 档**：只验证"按路由协议算出的路由，能否让 IP 数据包按预取路由正确转发"。
- **C 档口径收窄**：本方向**不验证 IP 数据包的吞吐效率**（不测吞吐、时延、丢包、队列），只验证转发路径与出口是否正确。因此 C 档若实现，只做"逐包路径正确性"，不做性能面；对外措辞不得出现线速、吞吐类指标。
- B、D 档保留定义，暂不启动。

#### 支撑该选型的实测与平台事实（2026-10-31 核实）

- **平台硬约束**：GitHub 官方文档中"为 Pages 添加/覆盖响应头"仅存在于 GitHub Enterprise Server 管理控制台，github.com 托管的 Pages 无此入口，也不支持 `_headers` 文件；COOP/COEP 无法用 meta 标签设置。实测本站线上响应头中确无 COOP/COEP → 无跨源隔离 → **`SharedArrayBuffer` 不可用 → 多线程 WASM 在 GitHub Pages 上跑不了**。B/D 档只能用"每节点一个 Worker + postMessage"替代，报文交换有结构化克隆开销。附带影响：非跨源隔离下 `performance.now()` 精度为 100μs，任务书 t0–t7 的亚秒级打点够用，但不得对外声称微秒级。
- **CPU 实测**（V8 / Node 24 / Apple arm64 笔记本；浏览器同引擎，叠加 DOM 与 GC 压力后按 5–10 折估）：SPF 朴素 Dijkstra 10 节点 0.25ms、100 节点 2.38ms、1000 节点 9.93ms、5000 节点 36.57ms；BGP 20 万条 best-path 扫描 3.3ms、全排序 27.9ms；逐包转发循环 234.56M hops/s（58.64M pkt/s，每包 4 跳）——但该数字用的是数组下标查表而非真实 LPM，换 trie 后预计掉 1–2 个数量级，仍在 1–10M pkt/s 量级，低于 1Gbps 64B 的 14.88Mpps 线速。这是"不验证吞吐"口径的技术依据。
- **内存实测**：RIB 20 万条 ≈ 46.1MB 堆增量（约 230B/条）；演示规模 <1000 条 → <1MB。
- **WASM/依赖体积实测**：`pyodide-core-314.0.7.tar.bz2` = 6.4MB，完整 dist = 321.9MB（含全部科学计算包，不需要）；`mime-db@1.54.0` 中 `application/wasm → ['wasm']`，而 Pages 的 MIME 表由 mime-db 生成，故 `.wasm` 的 Content-Type 正确、`instantiateStreaming` 可用。
- **现成浏览器 YANG 引擎不可依赖**：`CESNET/libyang` 活跃（BSD-3，2026-10-29 有推送）但仓库无 bindings 目录、无官方 JS/WASM 目标；社区仅 `astatochek/libyang-online`（MIT，★0，2025-05 停更）；纯 JS 的 `yang-js`（Apache-2.0，0.68MB）2024-05 后停更，`yang-parser` 停在 2022 年。故 D 档若要做，等于自己维护构建线。
- **升级路径**：迭代 1 手工誊录的 `rules.js` 字段表，将来可由构建期 pyang 生成的 schema 替换（CI 在 `jekyll build` 前跑一步，产物写进 `net-sim/l3sm-l3nm/generated/`，由 `app/` 以相对路径引用，运行时依然零远程依赖），规则表结构不变。生成物同样受 D3.1 的解耦边界约束（`tools/check-decoupling.mjs` 的扫描范围包含 `generated/`）。

#### 定数前需要 spike 的三项

1. pyang 编译 RFC 8299 / 9182（+ 9181 依赖）产出的 schema/tree JSON 的实际体积。
2. 真实最长前缀匹配（trie）下的逐包转发吞吐，用于确认 A 档"路径正确性验证"的规模上限。
3. Worker-per-node 模式下 3 PE 报文交换的结构化克隆开销，用于判断 B 档是否值得启动。

### 议题二：YANG 编译与校验引擎的三条路线（Y-A / Y-B / Y-C）

命名前缀 `Y-` 用于与议题一的 A/B/C/D 区分：议题一是"设备层做什么"，本议题是"YANG 模型怎么进浏览器"。任务书有两条硬性要求——"表单由 pyang 生成的 schema 驱动"与"实例经真实 YANG 校验"——三者能力差异正落在这两条上。

| 路线 | 定义 | 编译能力 | 运行时实例校验 | 用户体验 | 体积 / 许可 |
| --- | --- | --- | --- | --- | --- |
| **Y-A** 构建期 pyang → 静态 schema | CI 在 `jekyll build` 前用 pyang 编译 RFC 8299 / 9182（+ 9181 依赖），产出字段表 / tree JSON 随站点发布 | 完整。pyang 是 RFC 模型的参考实现级工具，`--format` 有 26 种（含 `tree`、`jstree`、`flatten`、`check_update`、`lint`、`jtox`、`sample-xml-skeleton`），能做导入解析、augment、deviation、grouping 展开 | **无**。pyang 只编译 schema，不校验实例数据；仍靠 D6 的手写最小校验器 | 首屏零额外下载（懒加载 schema JSON），毫秒级响应，移动端可用 | schema JSON 量级 1–5MB（待实测）；pyang 为 ISC 许可，且只在构建机运行、不随站点分发 |
| **Y-B** 浏览器内 JS/WASM YANG 引擎 | 前端直接解析 `.yang` 文本 | 名义上完整，实际上**没有可用实现**：`CESNET/libyang` 无官方 JS/WASM 目标（见议题一实测）；`yang-js` 2024-05 后停更；`yang-parser` 停在 2022 年 | 取决于库，多数只做部分 RFC 7950 检查 | 不可预期：解析全模型可能秒级并阻塞主线程 | 0.68MB 起，但需自维护构建线 → **本议题不考虑** |
| **Y-C** Pyodide 跑真 pyang + yangson | 浏览器内加载 CPython/WASM，`micropip` 装 pyang 与 yangson | 与 Y-A 同源同能力（跑的就是 pyang 本体），且可在页面上即时重编译用户改过的模型 | **有**。yangson 实现 RFC 7950/7951 实例校验（类型、mandatory、when/must、identityref），是任务书第二条要求的唯一现实解 | 冷启动秒级到十秒级（core 6.4MB + 包），运行时慢于原生 3–10 倍，内存基线 100–200MB，iOS Safari 易被系统杀；只能做成显式点击后才加载的"专家模式" | Pyodide MPL-2.0；**yangson LGPL-3.0**（有替换义务，不得内联进 bundle，需单独 NOTICE 条目）；站点为 Apache-2.0 |

#### 暂定选型：Y-A

- **默认走 Y-A**：表单 schema 由构建期 pyang 生成，满足任务书第一条硬性要求；运行时依然零远程依赖、零 WASM、零 Python。第二条硬性要求（真实 YANG 实例校验）**明确不在 Y-A 覆盖范围内**，页面上按 D6 的口径如实声明。
- **Y-C 保留为可选的懒加载"专家模式"**：任务书的两条硬性要求由两条路线分别承担，而不是让 Y-A 假装能校验。是否启动 Y-C，取决于 yangson 的 LGPL-3.0 替换义务能否接受，以及冷启动实测是否落在可演示区间——这两项未定前不启动。
- **一致性要求**：Y-A 与 Y-C 若共存，必须锁定同一 pyang 版本与同一模块 revision，并在页面上显示这两个版本号；Y-C 加载时先核对版本，不一致就拒绝校验并提示重新构建，避免"构建期 schema 与运行时校验器各说一套"。
- **升级路径不变**：迭代 1 手工誊录的 `rules.js` 字段表结构不变，将来直接由 Y-A 的构建产物替换（见议题一"升级路径"）。

#### 待 spike

1. pyang 无 form/schema-json 插件 → 需要写一个小自定义插件，或把 `jstree` 输出转成表单 schema；两条路的工作量待评估。
2. Y-C 冷启动实测秒数，以及 pyang 在 WASM/CPython 下编译 RFC 8299 + 9182 的耗时（相对原生的 slowdown）。
3. schema JSON 的实际体积不在此重复，见议题一 spike 第 1 项。

## Risks / Trade-offs

- **[高] 画板结构与实际 RFC 不符会毁掉对外可信度** → 一切以 RFC 原文为准（本设计 Context 已列出实测差异）；页面加一段 "Differences from the tasking document" 说明，并在规则面板引用具体章节。
- **[高] 本机无法构建 Jekyll，主题外壳内的渲染问题只在推送后暴露** → 用 `net-sim/l3sm-l3nm/standalone/preview.html` + 本地静态服务器验证画板与样式主体；外壳层只保留 front matter 与四个相对路径引用这类最小不确定面；推送后由用户以线上 URL 在真实浏览器核对（不做 sleep 等待构建）。
- **[中] 解耦约束会随迭代自然腐化**（新写一段样式顺手用了主题类名，或加了一条 `/assets/...` 绝对路径）→ 由 `tools/check-decoupling.mjs` 在开发期机器核对 D3.1 的禁止项，并在任务清单里作为一条独立验收项，而不是靠 review 记性。
- **[中] 无 YANG 校验，用户可构造出 RFC 语义上不合法但通过手写校验的实例** → D6 明示范围；指标分母只覆盖已声明子集。
- **[中] DERIVE 的 RD/RT 分配算法是本 POC 自定的** → 一律打 `工程推断` 标签、显示算法说明、汇总进工程推断清单（说明书 R1 的缓解方式）。
- **[中] `standalone/preview.html` 与 `index.html` 可能漂移** → 两者页面体都只含挂载点与同一批相对引用，业务标记为零；任务里含一条"两边渲染同一画板"的核对。
- **[低] `position: fixed` 连线层在滚动时需持续重算** → 连线数在数十条量级，rAF 内重算成本可忽略；若某主题把整站包在 `transform` 里导致 fixed 失效，走 D3.2 第 3 条的 `connectorLayer: 'inline'` 开关。
- **[低] 中文说明书文件当前未被 git 跟踪**（已核实：`git ls-files` 失败、线上 404）→ 若将来提交，需同时加 `exclude`；本迭代在 `_config.yml` 里预置 `exclude: [openspec, .qoder, tools]` 并留注释（`tools/` 的 `.mjs` 无 front matter 会被 Jekyll 原样发布，必须排除）。
- **[低] 刷新即丢数据可能被演示者误认为 bug** → 页面顶部一句话说明本迭代不做持久化，预置数据即演示起点。

## Migration Plan

1. 本地：`python3 -m http.server` 于仓库根 → 打开 `/net-sim/l3sm-l3nm/standalone/preview.html` 验证画板、映射、反查、指标（此路径不含主题外壳，证明内核独立可用）。
2. 运行 `node tools/check-rfc-citations.mjs` 核对全部规则出处，`node tools/check-decoupling.mjs` 核对解耦边界。
3. 推送 `main` → 现有 `pages.yml` 自动构建发布 → 用户以 `https://ctri-chenyong.github.io/net-sim/l3sm-l3nm/` 在真实浏览器核对主题外壳与导航入口。
4. 回滚：本迭代为纯新增 `net-sim/` 与 `tools/` 目录 + `_config.yml` 一行 `exclude`，`git revert` 即可完全撤销，不影响既有页面。
5. 将来换模板：按 D3.2 只改 `index.html` 的 front matter 与 `theme/*.css`，`app/` 与 `standalone/` 原样保留；`net-sim/README.md` 内有同一份清单。

## Open Questions

（无待决项。以下几条已按任务书既定口径与本次解耦要求取定默认值，如需改动请提出）

- 页面 URL 不再使用 `permalink`，取目录自然路径 `/net-sim/l3sm-l3nm/`（原暂定值 `/poc/l3sm-l3nm-mapping/` 已废弃）。理由见 D3：URL 与目录一致是相对路径引用成立的前提，也让换模板/换 baseurl 不需要改任何资源引用。
- 目录名取 `net-sim/`，迭代 1 的子目录取 `l3sm-l3nm/`，为后续设备层仿真（议题一 A 档）留出同级位置。名称可在实现前改，改了只影响 D3 与 tasks 里的路径字面量。
- 规则面板标题沿用任务书给的占位名 `draft-ietf-onsen-l3sm-l3nm-mapping`，并强制带 `PLACEHOLDER` 徽标与英文免责说明（任务书 R6「占位 draft 名必须带 PLACEHOLDER 徽标与免责脚注」）。
- 页面 UI 文案为英文，不做中文版本。
