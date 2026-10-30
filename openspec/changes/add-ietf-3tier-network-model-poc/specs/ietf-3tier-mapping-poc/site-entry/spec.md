# Spec Delta

## Purpose

定义 POC 在站点上的入口、可达性与代码独立性契约：一个具名导航入口指向一个纯静态、零远程依赖的映射交互页面，任何访客打开站点即可使用，无需后端服务或本地部署；同时全部网络仿真代码位于一个自包含目录内，与当前 GitHub Pages 模板解耦，换模板时不需要改动仿真内核。

## ADDED Requirements

### Requirement: 站点导航入口
站点 SHALL 在其主导航中提供一个入口，其显示文本恰好为 `IETF 3-Tier Network Model Mapping POC`，并且该入口指向本迭代的映射画板页面。入口由何种机制产生（当前主题的 `nav_order` 自动生成、还是站点级导航配置文件）属于站点外壳适配范围，MUST NOT 依赖 POC 目录内的仿真代码。

#### Scenario: 从首页进入 POC
- **WHEN** 访客打开站点首页并在主导航栏中查看入口列表
- **THEN** 导航栏中存在文本为 `IETF 3-Tier Network Model Mapping POC` 的入口
- **AND** 点击该入口后加载映射画板页面，页面标题与该入口文本一致

#### Scenario: 入口文本逐字一致
- **WHEN** 访客在任意视口宽度下查看该入口
- **THEN** 入口显示文本为 `IETF 3-Tier Network Model Mapping POC`，不出现翻译、缩写、大小写或空格上的改写

### Requirement: 页面完全本地运行
POC 页面 SHALL 在浏览器本地完成全部功能，加载与使用过程中 MUST NOT 发起任何指向远程服务的请求（包括但不限于自有后端 API、CDN 上的 JS/CSS 库、字体、图片分析或第三方脚本）。

#### Scenario: 离线运行
- **WHEN** 访客在浏览器中打开 POC 页面后切断网络连接（本地静态服务器上的 `http://localhost` 访问）
- **THEN** 画板、输入、映射联动与规则面板的全部功能仍然可用
- **AND** 页面不显示任何因缺失远端资源而产生的错误

#### Scenario: 无隐藏外部请求
- **WHEN** 访客在浏览器开发者网络面板中加载并使用 POC 页面
- **THEN** 除该站点自身域名下发布的静态资源外，不出现任何其它域名的请求

### Requirement: 仿真代码目录自包含且与站点模板解耦
全部网络仿真代码 SHALL 位于仓库内单一目录 `net-sim/` 下，其中仿真内核 `net-sim/l3sm-l3nm/app/` MUST NOT 包含当前主题专有的类名、主题样式变量、Liquid 语法或以 `/` 开头的绝对资源路径，也 MUST NOT 引用主题发布的任何资源。该目录 SHALL 能在不修改内核文件的前提下适配到其它 Jekyll 主题或其它静态托管方式，适配面限于页面 front matter 与单独的主题适配样式文件。

#### Scenario: 内核不含主题专有依赖
- **WHEN** 以开发期静态检查脚本扫描 `net-sim/l3sm-l3nm/app/` 下全部文件
- **THEN** 不出现主题类名、主题样式变量、Liquid 语法、以 `/` 开头的绝对路径或 `fetch`/`XMLHttpRequest` 调用
- **AND** 脚本以退出码 0 结束

#### Scenario: 无主题外壳也能完整运行
- **WHEN** 访客打开不加载任何主题 CSS/JS 的独立外壳页面 `net-sim/l3sm-l3nm/standalone/preview.html`
- **THEN** 录入、映射联动、批次高亮、双向反查与指标读数全部可用
- **AND** 该页面与主题外壳页面渲染出结构相同的画板（同一批 `app/` 资源、同一个挂载点）

#### Scenario: 资源引用不依赖固定 baseurl 或固定路径
- **WHEN** 站点以非根 baseurl（project site）发布，或 `net-sim/` 目录被整体移动到仓库内另一路径
- **THEN** 页面引用的全部 JS/CSS 仍然命中，浏览器网络面板中无 404

#### Scenario: 适配新主题的改动面受限
- **WHEN** 为适配另一个 Jekyll 主题而修改本 POC
- **THEN** 改动只落在页面 front matter 与主题适配样式文件
- **AND** `app/` 内文件保持不变（唯一允许的例外是外壳可注入的连线层策略开关）

### Requirement: 与站点构建共存
新增的 POC 资源 SHALL NOT 破坏站点既有构建：GitHub Pages 的 Jekyll 构建 MUST 继续成功，OpenSpec 与工具目录不应作为站点内容发布，且 POC MUST NOT 在主题的 `assets/`、`_layouts/`、`_includes/`、`_sass/` 等目录中新增或覆写文件。

#### Scenario: 站点构建产物不含工具目录
- **WHEN** 站点执行 Jekyll 构建
- **THEN** 构建结果中不包含 `openspec/`、`.qoder/` 与 `tools/` 目录的内容
- **AND** 站点其余既有页面的渲染与导航不受影响

#### Scenario: 主题目录零改动
- **WHEN** 检视本次迭代对仓库的改动
- **THEN** `assets/`、`_layouts/`、`_includes/`、`_sass/` 下没有新增或被覆写的文件
- **AND** 既有页面的计算样式与导航结构不变

#### Scenario: 主题版本不变
- **WHEN** 检视本次迭代对仓库的改动
- **THEN** `Gemfile` 中 `just-the-docs` 与 `jekyll` 的版本约束保持不变
- **AND** POC 未要求新增 Ruby 侧依赖
