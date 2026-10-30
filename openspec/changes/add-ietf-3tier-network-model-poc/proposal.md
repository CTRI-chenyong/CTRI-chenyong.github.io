# Proposal

## Why

《L3SM到L3NM到设备模型无损映射原型系统开发任务说明书》规划的完整系统需要三个后端进程、pyang/yangson 校验和 containerlab 真机环境，短期内无法对外展示，也无法回答"顺序映射是否丝滑无损"这个尚未被验证的命题。第一步应该把最靠前的一段——L3SM（RFC 8299）到 L3NM（RFC 9182）的映射——做成任何人打开浏览器就能操作、能逐条核对 RFC 出处的实证界面，并且直接落在已经上线的这个 GitHub Pages 站点上，零部署成本、零远程依赖。

## What Changes

- 站点主导航（当前由 just-the-docs 左侧栏自动生成）新增一个入口，名称为 `IETF 3-Tier Network Model Mapping POC`（用户原文给定，逐字使用），点开后是本次迭代的交互页面。
- **全部网络仿真代码独立在仓库根的单一目录 `net-sim/` 下，与 GitHub Pages 模板结构解耦**：仿真内核（`app/`）不含主题类名、主题样式变量、Liquid 与绝对路径，只用相对路径互相引用；主题相关知识被压缩到页面 front matter 与一个单独的主题适配 CSS 文件。将来更换 Jekyll 主题或换到别的静态托管时，内核原样保留，只改这两处适配面。目录内另附无主题外壳的 `standalone/preview.html`，可 `file://` 直接打开，用于证明内核独立可用。
- 页面内提供一块 SVG/DOM 交互画板，在同一视野内绘制 **L3SM** 与 **L3NM** 两个实体（并列卡片 + 映射连线），不依赖图形库、不发任何网络请求。
- 在画板的 L3SM 实体上**人工输入**核心业务配置属性：客户标识、VPN 服务属性（VPN 标识、拓扑类型、业务类型）、站点与接入（站点标识、站点角色、IPv4 地址/前缀、 provisioning 方式）、路由协议（BGP AS 号）。
- 任一次输入即时触发 L3SM→L3NM 映射，在 L3NM 实体上整批高亮本批变更字段并挂因果编号；字段按传播类别着色区分 COPY / DERIVE / SPLIT / DROP。
- 页面内提供映射规则面板：每条规则一行，标注传播类别、置信标签（标准明确规定 / 工程推断）、RFC 章节出处。规则行点击 ↔ 画板源/目标字段双向聚焦反查。
- L3NM 侧的派生只读字段（route-distinguisher、route-target 等）禁止人工直接编辑，并在 UI 上说明其生成算法。
- 页面显式声明本次覆盖的 schema 子集范围，并给出该子集内的覆盖率/溯源指标读数（未覆盖字段单独计数，不谎称全量）。
- 非目标（本迭代明确不做，留给后续迭代）：设备模型/OpenConfig 段与第二段映射、页面二真机下发（时间轴/Web SSH/ping/iperf3）、pyang 编译生成表单、yangson 实例校验、containerlab 环境、三进程 RESTCONF/NETCONF 链路。
- 后续迭代的档位已暂定（本迭代不实现、不验收）：设备层路由协议解释引擎暂定 **A 档（控制面静态推演）**；数据面**只验证 IP 数据包能否按预取路由正确转发，不验证吞吐效率**。A/B/C/D 四档定义、平台约束与实测依据见 `design.md` 的 `Future Direction` 一节，供后续迭代决策时直接引用。
- YANG 编译与校验引擎的路线亦已暂定（同上，本迭代不实现、不验收）：**Y-A（构建期 pyang 生成静态 schema）** 为默认，Y-C（Pyodide 跑真 pyang + yangson）保留为可选的懒加载"专家模式"，用于承担 Y-A 覆盖不到的 RFC 7950/7951 实例校验。三条路线的能力/体验/体积/许可对比见 `design.md` 的 `Future Direction` 议题二。

## Capabilities

### New Capabilities

- `ietf-3tier-mapping-poc/site-entry`: 站点导航入口、页面可达性与代码独立性——入口名称与位置、页面在无后端服务的前提下可独立加载、仿真代码目录自包含且与站点模板解耦。
- `ietf-3tier-mapping-poc/mapping-board`: 画板本身——L3SM/L3NM 双实体绘制、人工输入交互、映射结果联动高亮、因果编号、只读派生字段拦截、跟随/自动定位行为。
- `ietf-3tier-mapping-poc/mapping-rules`: 映射规则与可追溯性——规则表结构与传播类别、RFC 出处与置信标签、双向反查、覆盖子集声明与无损指标读数。

### Modified Capabilities

（无。本仓库 `openspec/specs/` 目前为空，不存在已归档能力。）

## Impact

- **新增文件**：仓库根新增独立目录 `net-sim/`——含 Jekyll 外壳页面（`l3sm-l3nm/index.html`）、仿真内核（`l3sm-l3nm/app/` 下的 CSS 与三个 JS，其中映射规则数据以 JS 常量内置，随站点静态发布、运行时不请求远端）、主题适配样式（`l3sm-l3nm/theme/just-the-docs.css`）、无主题外壳的独立预览页（`l3sm-l3nm/standalone/preview.html`）与 `README.md`（含换模板迁移清单）；另新增 `tools/` 下的开发期核对脚本（不进站点运行时）。**不向主题的 `assets/`、`_layouts/`、`_includes/`、`_sass/` 写入任何文件。**
- **修改文件**：`_config.yml`——新增 `exclude` 项把 `openspec/`、`.qoder/` 与 `tools/` 排除出站点构建（`tools/` 下的 `.mjs` 若无 front matter 会被 Jekyll 原样发布到 `/tools/...`）。导航顺序由 POC 页面自己的 front matter 提供，不修改站点级导航配置。
- **不影响**：`Gemfile` 里 pin 的 `just-the-docs 0.12.0` 与 `jekyll 4.4.1` 版本；现有 `.github/workflows/ci.yml` 与 `pages.yml` 两个 workflow 无需改动。
- **验证约束（影响任务拆分）**：本机只有系统 Ruby 2.6.10，Jekyll 4.4 需要 Ruby ≥2.7，且无 Docker，因此**无法本地跑 `bundle exec jekyll build`**。结论：POC 的画板/规则/映射逻辑必须做成不依赖主题外壳资源的自包含静态页面，可在本地用静态服务器直接打开验证；主题外壳内的渲染效果只能在推送后由 GitHub Pages 构建结果核对。
- **需要用户确认的既有风险**：仓库根目录的中文说明书 `.html` 目前**未被 git 跟踪**（已在本地核实：`git ls-files --error-unmatch` 失败，线上站点访问该文件返回 404）。因此它现在不会发布。本 change 不提交该文件、也不把它写进 `exclude`（未跟踪的文件写进 `exclude` 只是噪音）；若将来决定提交，需同时把它加入 `exclude`，否则它会以中文 URL 出现在站点根路径。
- **已核实的现状**：线上站点当前主导航只有 `Home` 一项（`<a href="/" class="nav-list-link">Home</a>`），本入口将是第二项；站点是 user site，baseurl 为 `/`；主题 v0.12.0 提供 `_includes/head_custom.html` 等覆写点。仓库根**没有** `assets/` 目录（已核实），该 URL 命名空间由 gem 主题占用，故本 change 不在其下新增文件，而是使用仓库自有的 `net-sim/`。
- **对 baseurl 的处置**：POC 内部一律使用相对路径引用资源，不写 `/assets/...` 这类绝对路径，因此站点从 user site 变成 project site（baseurl 非 `/`）、或 `net-sim/` 被整体移动，都不需要修改任何资源引用。
