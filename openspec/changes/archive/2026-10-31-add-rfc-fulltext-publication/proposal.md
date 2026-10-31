# Proposal

## Why

读者要把 L3SM→L3NM 的映射规则当作依据,就必须能就地读到依据本身:现在站点只在规则行里
引用 `RFC 8299 §6.2` 这样的章节号与标题,正文要么去 rfc-editor、要么去 datatracker 找,
站内搜索完全覆盖不到 RFC 文本(实测 `search-data.json` 24,216 字节、29 条,全部来自站内
自有页面)。把两篇 RFC 的全文就地发布,同时把逐字保真与 IETF 授权条款做成可机器校验的约束,
是让"引用可核验"这件事第一次真正成立。

合规前提已由 IETF Trust Legal Provisions(TLP,现行版)与两份 RFC 自身的版权页确定:
§3.c.i 允许"完整且不修改"地复制发布;§3.c.iii 允许复制"未修改的部分",条件是每部分清楚
署名到 IETF 并注明取自哪份文档、且再现实质性片段时保留原文的全部 legend 与法律声明;
§3.d.i **不授予**任何在标准流程之外修改或制作派生作品的权利(RFC 8299 与 RFC 9182 均未含
§6.c 的额外限制声明,即修改一律未获授权);§3.d.ii 不授予"缺少必需 legend 的分发"许可。
因此本 change 的形态必须是"逐字子串 + 外壳承载声明",而不是"改版重排"。

## What Changes

- 新增 `rfc/` 文档区:RFC 8299 与 RFC 9182 各以一个落地页(页内目录)进入,正文按原文的
  编号小节逐节成页;每节正文 MUST 是 rfc-editor 纯文本的**逐字节连续子串**,不删行、不改
  空白、不去除页眉页脚与分页符。
- 缓存两份逐字原文副本(`rfc/source/rfc8299.txt`、`rfc/source/rfc9182.txt`)作为唯一真源,
  并提供整篇下载入口;`tools/build-rfc-pages.mjs` 从它生成全部小节页与落地页,`--check`
  模式校验生成件与源文件一致(复用 `_data/ietf-3tier-rules.json` 的"生成件入库 + 脚本校验"既有模式)。
- 新增 `tools/check-rfc-fidelity.mjs`:把所有小节正文按序拼接后必须与源文件**逐字节相等**
  (无缺口、无重叠),并核对每个 `<pre>` 文本解码后与对应字节区间相等;这是本期唯一能证明
  "未修改"的手段。
- 合规外壳:每篇文档的落地页与小节页都呈现 IETF 版权页原文声明、BCP 78 与 TLP 链接、
  来源 URL、抓取日期、RFC 号与小节号署名,以及"本站副本非权威版本"的声明;声明由布局
  (layout)呈现,不混进小节正文,也不进搜索索引(既保持正文是纯原文子串,也不把 132 份
  重复 boilerplate 灌进搜索索引)。
- 左侧导航只增加两个入口(RFC 8299 / RFC 9182 落地页),小节页不进导航、靠页内目录与
  搜索到达。
- 头部搜索覆盖两篇 RFC 全文,沿用主题现有的结果样式(文档标题 › 小节标题 + 关键词高亮 +
  片段省略号),不定制结果卡片、不改 gem 的搜索脚本。实测代价(生成 132 个页面后本地统计):
  `search-data.json` 24,064 字节 / 29 条 → 686,474 字节(约 670 KiB)/ 132 条(130 个小节页 + 2 个落地页),
  Pages 已启用 gzip,传输约 121 KB;按主题同款 lunr 配置建索引 114–143 ms、单次查询 0.16–1.15 ms。
  主题的 `initSearch()` 在 `DOMContentLoaded` 无条件拉取索引(非首次敲搜索框才拉),这约 121 KB
  是每次页面访问的成本,已确认后仍按"全文收录、上调体积预算"处理。
- 站点文案与许可说明:README/首页加上 RFC 文档区入口,并明确 RFC 文本不受仓库软件许可
  (MIT/Apache-2.0 之争)约束、按 BCP 78 与 TLP 授权。

Non-goals:不做 RFC 正文的中文翻译或摘编讲解(整篇翻译虽被 §3.c.ii 允许,但会产生"翻译版
非权威"的额外标注负担,且摘编属未授权修改);不做改版重排或自定义阅读器;不引入 Pagefind
等新的搜索基础设施;不把 RFC 文本接进 POC 画板或 `app/` 内核(内核继续保持零网络、零站点依赖)。

## Capabilities

### New Capabilities

- `rfc-library/fulltext-fidelity`: 逐字原文副本的获取、留痕与逐节切分的字节保真要求(源文件、
  抓取日期、校验和、小节正文必须是原文连续子串、拼接等于全文)。
- `rfc-library/compliance-notices`: 面向读者的 IETF 合规声明外壳(署名、出处、legend 保留、
  非权威版本声明、与仓库软件许可的边界)。
- `rfc-library/navigation`: 左侧导航的两篇文档入口、落地页页内目录、小节页 URL 与可达性。
- `rfc-library/site-search`: 头部搜索对两篇 RFC 全文的覆盖、结果条目粒度、结果样式与索引体量预算。

### Modified Capabilities

无:`openspec/specs/` 目前为空(前两个 change 尚未归档同步),本期不修改任何既有需求。POC
画板与规则文档页的行为不变;`search.heading_level: 3` 已是上一期设下的值,本期直接依赖它。

## Impact

- 新增:`rfc/source/`(两篇逐字源副本,同时就是整篇下载入口)、`rfc/<编号>/`(生成的落地页与
  小节页)、`_data/rfc-sources.json`(源 URL、抓取日期、SHA-256、小节索引;不发布)、
  `_layouts/rfc-page.html` 与 `_layouts/rfc-landing.html`(合规外壳与目录/相邻页导航)、
  `tools/build-rfc-pages.mjs`、`tools/check-rfc-fidelity.mjs`。
- 修改:`_config.yml`(只加导航相关项;`rfc/` 是普通内容区,无需 `include`/`exclude` 变更)、
  `index.md`、`README.md`、`README_zh.md`、`net-sim/README.md`(把 `rfc/` 与 `net-sim/` 的解耦
  边界区分清楚:`rfc/` 是站点内容区,不参与 `app/` 内核契约)、`tools/check-rfc-citations.mjs`
  (把它现有的 tmpdir 缓存收敛到 `rfc/source/`,让"引用的章节标题"与"发布的正文"用同一份字节)、
  许可文案的边界声明(仓库现有 `LICENSE` 是 MIT,不覆盖 RFC 文本)。
- 外部依赖:构建期新增一次对 rfc-editor 的取源(开发期一次性、由人工执行并留 sha256 记录);
  站点运行时仍**零远程调用**,发布产物是自包含静态文件。
- 风险与限制:GitHub Pages 的 Jekyll 不允许自定义插件,所以小节页只能"生成后入库",不能在
  构建期由 Liquid 生成;本机无 Ruby ≥2.7 与 Docker,Jekyll 渲染结果只能在线上验收(与上一期
  相同的限制,沿用本地 Node 复现 HTML 实体解码作为代理);仓库体积增加约 1.3 MB(源副本
  642,768 字节 + 生成页约 660 KB);`<pre>` 承载 RFC 正文意味着 72 列等宽、含点线目录与页码,
  阅读体验偏"原始"——这是合规形态的必然结果,缓解手段(按官方 HTML/PDF 提供阅读链接)列入设计。
