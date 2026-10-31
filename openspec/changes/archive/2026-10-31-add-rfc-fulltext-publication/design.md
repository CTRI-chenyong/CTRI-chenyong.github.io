# Design

## Context

站点是 GitHub Pages 上的 Jekyll(`theme: just-the-docs` 0.12.0),Pages 不允许自定义插件,所以任何
"生成件"都必须生成后入库,不能在构建期由插件产出。本 change 要落地的东西正好是 132 个静态页面,
因此整个设计围绕一条硬约束展开:**页面正文必须是源文件的连续字节区间,且从源到浏览器 textContent
的每一条路径都不改动一个字节。**

已经量化过的事实(全部来自本地对 rfc-editor 真源的处理,不是估算):

| 项 | RFC 8299 | RFC 9182 |
| --- | --- | --- |
| 纯文本副本字节数 | 344,738 | 298,030 |
| 编码 | 纯 ASCII,无 BOM | UTF-8,带 BOM,5 个非 ASCII 字节 |
| 换页符 `\f` | 188 个 | 0 个 |
| 目录形态 | 点线引导符 + 页码 | 紧凑,无引导符无页码 |
| 顶格编号标题数(= 小节页数) | 88 | 42(含 `Appendix A.` 与 `A.1.` 一类附录标题;目录交叉核对显示 8299 自身的点线目录省略了 21 个四/五级标题,9182 的目录与正文一致) |
| 首个标题之前的前言 | 8,768 B | 4,137 B |
| 最大单节 | §9:84,740 B | §8:138,183 B |
| 行宽 / `<` / `&` / ``` ` ``` / `{{` | ≤72 / 2,874 / 0 / 0 / 0 | ≤72 / 90 / 0 / 0 / 0 |

按上述切分做区间拼接,两篇都得到 **gap = 0**(拼接结果与源文件逐字节相等),这是 D1 的验收依据。

搜索侧的现状同样实测过:线上 `assets/js/search-data.json` 为 24,064 字节 / 29 条,每条除正文外还带
约 224 字节的元数据(doc/title/url/relUrl);主题脚本在 `onReady` 里无条件 `XHR` 拉索引并对
`title`(boost 200)、`content`(boost 2)、`relUrl` 三个字段建 lunr 索引,`metadataWhitelist =
['position']`。生成 132 个小节/落地页后,按同一口径本地装配索引实测:**686,474 字节(约 670 KiB)
未压缩 / 132 条**,gzip **120,916 字节(约 118 KiB)**;用线上同一份 `lunr.min.js` 与主题同款配置建索引
**114–143 ms**、单次查询 **0.16–1.15 ms**(命中 `6.3.2.2` 这类小节号能直接落到该小节页)。
另有一条决定外壳放哪儿的实测结论:主题布局产生的字符串("top of page"、"Skip to main content" 等)
在现有索引里 **0 命中**,即索引取的是 `page.content`,不含 layout 包裹。

## Goals / Non-Goals

**Goals:**

- 一条可重复执行的生成/校验链路:同一份源副本 → 同一组页面字节,任何手工改写小节页都被开发期
  检查以非零退出拦住。
- 合规外壳只维护一份,且天然不进搜索索引、不进正文区间。
- 搜索覆盖全部小节正文,并把体积与时延变成有实测值、有上限、有回退路径的预算。

**Non-Goals:**

- 不做正文的任何再加工:不翻译、不摘编、不加站内注释、不重排、不"顺手"清理页眉页脚。
- 不改 gem 的搜索脚本、不 fork `search-data.json` 模板、不引入 Pagefind 等第二套检索。
- 不把 RFC 文本接进 `net-sim/l3sm-l3nm/app/` 内核;内核继续保持零站点依赖。
- 不自动同步 rfc-editor 的勘误(取源是一次性人工动作)。

## Decisions

### D1 切分真源是正文标题,不是目录

切分只依据**顶格**出现的编号标题行(`N.M.  Title`、`Appendix L.  Title`、`L.N.  Title`),并要求编号
相对上一条严格递增,否则判为图/清单里的伪标题丢弃。目录解析只用于交叉核对并打印差异,不作真源。

为什么不解析目录:两篇是两套目录格式(8299 的点线后紧跟页码、标题还会折行;9182 根本没有引导符),
任何按目录切分的实现都要为每种格式写分支,而目录一旦解析失败就会**丢字节**;按正文标题切分的失败
模式是"漏切一节 → 内容并入上一节",文本一个字节都不少(gap 仍为 0),由交叉核对暴露出来。本期实测
9182 附录子标题只出现 `A.2`–`A.4` 而没有 `A.1`,就属于这类"合并而非丢失"的情形,实现时按日志人工确认。

### D2 页面用 `.html` + `<pre>` + 实体转义,不走 kramdown

生成的小节页是带 front matter 的 `.html` 文件:front matter 之后只有一个 `<pre>`,内容是源区间的
HTML 实体转义。转义集合固定为 `<`→`&lt;`、`>`→`&gt;`、`&`→`&amp;`、`\f`→`&#12;`、BOM→`&#65279;`,
其余字节原样。校验时把页面 textContent 按 UTF-8 重新编码,与源区间比字节。

为什么不用 Markdown(围栏代码块):正文里有 2,874 个 `<`,一旦被当作 HTML 起始就是静默截断;
上一期已经实测过 kramdown 在 `input: GFM` 下不认 IAL、`{: #R01 }` 原样留在标题里,说明 kramdown 的
行为要一项一项验;而 `.f` 换页符与 72 列前导空格能否穿过 kramdown 未知。`.html` 页面只过 Liquid,
实测正文里 `{{`/`{%`/``` ` ``` 均为 0 次,不存在被 Liquid 吞掉的输入。把易变量(换页符、BOM)写成实体
是为了让"存活"不依赖任何一层的宽容。

### D3 合规外壳放 `_layouts`,页面文件只承载正文

新增 `_layouts/rfc-landing.html` 与 `_layouts/rfc-page.html`,由它们输出版权声明、BCP 78/TLP 指引、
署名("取自 RFC <n> §<num>")、非权威版本声明、来源与校验和、目录、上一节/下一节。

依据是上面那条实测:索引只收 `page.content`,layout 包裹不进索引。于是"外壳不进索引"和"外壳不混进
正文区间"两条需求由**构造**成立,而不是靠过滤规则;132 份声明也只有一份源文件。反面方案(在正文页里
`{% include %}` 声明)会让索引多出约 132 × 1 KB 的重复文本,并且每次搜 "legend" 一类词就刷出百余条。

副作用要认:小节页源文件本身不含声明,只看文件的人需要通过渲染后页面确认外壳存在 —— 由
`check-rfc-fidelity.mjs` 同时断言"该页 front matter 指定了 rfc 布局"来补这一环。

实现落定后的两处细化(不改变上面的结论,只把"外壳里有什么"写清楚):

- 外壳除指向之外还**逐字引出该文档自身的 Copyright Notice 原文**。合规需求要的是"版权声明原文可见",
  只给链接不满足字面;原文由生成器从源副本截取(定位 `\nCopyright Notice\n` 到 `\nTable of Contents\n`
  之前)写入 `_data` 的 `notice: { start, end, html }`,布局只做输出,不在布局里键入任何 legal 文本,
  `check-rfc-fidelity.mjs` 断言它等于源副本的第 `start..end` 字节 —— 于是"引用原文"这件事仍然只有一份源。
- 上一节/下一节与落地页目录都由布局扫描 `_data` 的 `sections` 顺序得到,小节页 front matter 不写
  prev/next,避免同一个事实存在两处。为此 `_data` 每条记录补 `landingUrl`、每个小节补 `pageUrl` 与
  `infoUrl`(布局渲染绝对地址用),字段仍全部由生成器写入。

排版区分落在新建的 `_sass/custom/custom.scss`:正文 `.rfc-text pre` 用等宽、`white-space: pre` 加
`overflow-x: auto`(72 列不折行、横向滚动),外壳 `.rfc-provenance` 用比例字体与边栏底色。该文件只用字面
颜色与 `rem`,不引用任何主题 SCSS 变量 —— 主题升级改名的话,一个未定义变量会把整站 Pages 构建打断,
而字面值最坏只是不好看。

### D4 `_data/rfc-sources.json` 承载元数据与目录,正文不进 `_data`

一份开发期数据文件,记录每篇的来源 URL、抓取日期、SHA-256、文档标题,以及小节数组
`[{ num, title, path, start, end, pageUrl }]`;文档级另有 `landingUrl`、`infoUrl` 与被外壳引用的
`notice: { start, end, html }`。落地页目录、相邻页链接、外壳里的校验和、抓取日期与版权页原文全部由
布局读它渲染。`_data` 不被 Jekyll 发布(上一期已线上验证 `/data/ietf-3tier-rules.json` 404),读者只看到值,
拿不到"数据文件"这个入口。

正文为什么也放 `_data` 被否:那样每个页面要经 Liquid 输出正文,转义责任就落到 `escape` 过滤器上,
保真校验也得跑一遍 Liquid 才能知道页面上到底是什么;正文走生成文件、元数据走 `_data`,校验器只做
"读 HTML → 解实体 → 比字节"。

### D5 地址形态:文档号 + 小节号,点改横线

`/rfc/8299/` 与 `/rfc/9182/` 是落地页;小节页 `/rfc/8299/6-3-2-2/`、`/rfc/9182/8/`;附录
`/rfc/9182/appendix-a/`、`/rfc/9182/a-2/`。地址只由文档号与小节号决定,可人工读出,重生成不变
(满足导航需求的稳定性条款)。不用 `#锚点` 承载小节:那会把 130 节压进两页,与"一节一页"和
"一节一条搜索结果"两条已确认口径冲突。

### D6 整篇下载入口就是源副本本身

`rfc/source/rfc8299.txt`、`rfc/source/rfc9182.txt` 无 front matter,Jekyll 原样复制到站点,
所以"下载件与源副本逐字节相等"由构造成立,不需要第二个副本。线上用 `curl` + SHA-256 复核。
注意 `.gitignore` 的既有注释所指:根目录无 front matter 文件会被原样发布 —— `rfc/source/` 正是要发布,
这是有意为之而非疏漏。

### D7 搜索预算:全文收录,上限按实测重设并留回退路径

(本节口径由用户确认:全文收录、上调预算、一节一页不拆分。)

上限改为:未压缩 ≤700 KB、gzip 传输 ≤160 KB、建索引 ≤250 ms、查询 ≤50 ms。回退路径按优先级:
先把两节超 100 KB 的(9182 §8、8299 §9)从默认索引里去掉(页面保留,落地页目录标注"本节不入索引"),
再考虑降低 `heading_level`。回退只在实测超限时启用,不预先做。

线上实测(5.4,数据见 tasks.md):505.6 KiB / 111.1 KiB gzip / 建索引 129–150 ms / 查询 ≤1.9 ms,
四项全在上限之内,**回退路径未启用**。两条与预估不同的地方值得记下:一是实际索引比 D7 预估的 670 KiB
小 164 KiB(主题的 `strip_html` 去掉了 `<pre>` 标签、`strip_newlines` 去掉了换行,正文的 72 列空白被
压掉一部分);二是建索引耗时的测量方法很脆——在 DevTools `evaluate` 上下文里同一份代码量出 567–971 ms,
注入页面 `<script>` 后才是 129–150 ms,并与浏览器 `longtask`(139 ms)相互印证;若只信前者会误触发回退。

### D8 生成与校验分工:`build-rfc-pages.mjs` 造,`check-rfc-fidelity.mjs` 判

- `tools/build-rfc-pages.mjs`:从 `rfc/source/*.txt` 生成全部页面与 `_data/rfc-sources.json`;
  `--check` 做重生成比对(沿用上一期 `build-rules-data.mjs --check` 的形态,包括那个只在开发期用的
  输出路径覆盖,好让漂移用例打在 `/tmp` 副本上而不是仓库里的提交件)。
- `tools/check-rfc-fidelity.mjs`:六条断言 —— 区间从字节 0 起按序无缝无叠且并集等于源文件;每个页面
  front matter 之后只剩一个 `<pre>`(正文页不夹站点自撰文本);该 `<pre>` 解实体后与源区间逐字节相等;
  外壳引用的 `notice.html` 同样是源区间的字节;磁盘副本仍匹配记录的 SHA-256 与 `bytes`;每页都指定
  `rfc-page`/`rfc-landing` 布局,且未被记录的 `.html` 视为孤儿页。另有两条"转义层确实在承重"的聚合
  交叉核对:页面里 `&#12;` 总数必须等于两份副本里的换页符数,以 BOM 起始的落地页数必须等于副本数。
  失败指名小节与首个不一致字节偏移。

### D9 取源是一次性人工动作,并把已有缓存收敛到同一份字节

人工执行 `curl -o rfc/source/rfcNNNN.txt https://www.rfc-editor.org/rfc/rfcNNNN.txt`,把 SHA-256 与
日期写进 `_data/rfc-sources.json`;脚本一律不自动联网(与 `RFC_OFFLINE=1` 语义一致)。
`tools/check-rfc-citations.mjs` 目前把同两篇下载到 `os.tmpdir()` 缓存,本 change 把它的默认缓存目录
指向 `rfc/source/`,让"规则页引用的章节标题"与"发布的小节正文"用的是同一批字节 —— 否则站点里存在两份
可能漂移的 RFC 副本。

### D10 导航与既有边界检查

落地页用 front matter `nav_order` 排在 Home、POC 之后(3、4),130 个小节页一律 `nav_exclude: true`,
既有导航项顺序与标题不动。集中合规说明放独立一页 `/rfc/notices/`(站点自撰、`nav_exclude`),落地页与
小节页外壳都指向它。`tools/check-decoupling.mjs` 需要把 `rfc/` 登记为站点内容区,并继续断言
`app/` 与 `standalone/` 不出现 `_data` 或 `rfc-sources` 引用。

线上实测发现本节的假设不成立:Home 与 POC 的 front matter 过去**没有** `nav_order`,而主题把无
`nav_order` 的页面排在有编号的页面**之后**,于是落地页一上线侧栏就变成"RFC 8299、RFC 9182、Home、
POC",两个新条目跑到了既有两条之前,违反"既有导航项顺序不动"。修法是给 `index.md` 补 `nav_order: 1`、
给 POC 外壳补 `nav_order: 2`,顺序回到 Home、POC、RFC 8299、RFC 9182;数值 3、4 本身不必改。
POC 外壳加这个字段不越界:front matter 正是它唯一的主题契约,`check-decoupling` 对它的断言(标题、
`layout: page`、不得有 `permalink`、正文六条相对引用)全部不受影响。

## Risks / Trade-offs

- [线上 Jekyll 对 `.html` 页面的处理与本地假设不符(例如仍走 Markdown)] → 正文已实体转义且不含
  ``` ` ```、`{{`、`{%`,退化空间很小;验收时逐字节比对线上页面 `<pre>` 区段,必要时给 `rfc/` 页面
  显式 `permalink` 并套 `{% raw %}`。
- [670 KiB 索引在每次页面加载时 eager 拉取,弱网首屏变慢] → 已确认接受:传输实测 118 KiB(gzip),Pages
  `max-age=600`;超限走 D7 回退。
- [138 KB 单节页(约 3,000 行 `<pre>`)渲染与滚动体验差] → 一节一页是已确认口径;靠落地页目录、
  相邻页与浏览器原生查找缓解,不做前端虚拟滚动。
- [RFC 小节把站内自有页面结果挤出前列] → 验收用固定三个查询核对 POC 页与规则页仍在前若干条;
  必要时只调自有页面的标题用词(title 字段 boost 200),不改主题脚本。
- [切分漏掉真实小节] → 与目录交叉核对并打印差异 + gap=0 硬断言;失败模式是"页更粗",不是"文丢失"。
- [将来 rfc-editor 勘误替换源文件] → SHA-256 与 `--check` 会暴露漂移;本期不做自动同步。
- [复制量达到"整篇"使 TLP 的 legend 保留口径全面生效] → 全文逐字 + 每页原文声明 + `/rfc/notices/`
  集中记录范围与依据条款;这也是 D3"外壳由布局统一输出"的合规理由。
- [站点不再"轻量"(仓库 +1.3 MB,索引 +650 KB)] → 与"引用可核验"的目标权衡后由用户确认;
  回退路径写进 D7 而不是事后临时决定。

## Migration Plan

1. 人工取源两份 `.txt` 入库 `rfc/source/`,记录 SHA-256 与抓取日期到 `_data/rfc-sources.json`。
2. `node tools/build-rfc-pages.mjs` 生成落地页、小节页与元数据;`--check` 与
   `node tools/check-rfc-fidelity.mjs` 本地归零。
3. 跑既有开发期检查(`check-decoupling`、`check-rules-shape`、`check-rfc-citations`、`engine.test`)。
4. 提交并推送,线上验收:两个落地页 + 抽查小节页逐字节、`/rfc/source/*.txt` 下载 hash、
   头部搜索命中 RFC 原文短语且外壳文本不重复刷出、索引体积与时延实测、`/tools/*` 与 `/openspec/*` 仍 404。
5. 回滚:`git revert` 本次提交即回到 24 KB 索引与 29 条结果;`rfc/` 整目录删除不留悬挂引用
   (首页与 README 的入口链接在同一提交里增删)。

## Open Questions

- 已解决:`rfc/` 的 `<pre>` 是否需要站内横向滚动样式定制(`_sass/` 一处)。答:需要,新增
  `_sass/custom/custom.scss` 里 `.rfc-text pre { white-space: pre; overflow-x: auto; }` —— 正文是 72 列
  定宽加缩进的纯文本,折行会让 YANG 路径与图示错位;该文件只用字面值,不引用主题变量(见 D3)。
  浏览器侧的最终观感仍待 5.2 线上核对。
