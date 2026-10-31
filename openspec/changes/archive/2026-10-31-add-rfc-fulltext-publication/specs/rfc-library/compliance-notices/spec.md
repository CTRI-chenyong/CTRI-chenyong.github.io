# Spec Delta

## Purpose

约束站点作为第三方复制 IETF 文档时必须向读者呈现的授权与署名外壳,使每一页都满足 BCP 78 与
IETF Trust Legal Provisions 的可见要求,同时不污染逐字正文。

## ADDED Requirements

### Requirement: 每一页都呈现原文的法律声明

承载 RFC 文本的每个页面(落地页与每个小节页)MUST 呈现该文档自带的版权页与 License
Provision 声明原文(含指向 `https://trustee.ietf.org/license-info` 的那一段),并 MUST 把
所承载的正文清楚署名到 IETF、指明取自哪份 RFC 及其小节号。

#### Scenario: 打开任意小节页

- **WHEN** 读者打开 RFC 8299 或 RFC 9182 的任一小节页
- **THEN** 页面同时可见:该文档的版权声明原文、BCP 78/TLP 指引原文、"取自 RFC <号> §<节号> <节标题>"的署名,以及权威来源的链接

#### Scenario: 只看到片段也知道出处

- **WHEN** 读者通过搜索结果直接落地到某个小节页
- **THEN** 无需返回上一页即可判断该文本属于哪份 IETF 文档、哪个小节、由谁复制

### Requirement: 副本必须标明非权威版本

站点 MUST 明确声明本站呈现的是第三方复制副本、不等同于 IETF 发布的权威版本,并 MUST 给出
权威版本的位置;站点 MUST NOT 以 IETF 官方或工作组产物的名义发布这些页面。

#### Scenario: 版本地位说明

- **WHEN** 读者打开任何 RFC 页面
- **THEN** 页面可见一句说明本站副本非权威版本、并链接到 rfc-editor/datatracker 上的权威版本

#### Scenario: 归属清晰

- **WHEN** 读者查看 RFC 文档区的归属说明
- **THEN** 页面说明该区域由中国电信股份有限公司研究院 IETF 团队复制与维护,与 IETF 无隶属关系

### Requirement: 法律外壳不得混入正文

合规声明 MUST 作为页面外壳呈现,MUST NOT 被写入小节正文区间内;小节正文与外壳在页面的呈现
位置上 MUST 可区分(例如声明位于正文区之外)。

#### Scenario: 外壳不破坏保真

- **WHEN** 对某个小节页做逐字节保真校验
- **THEN** 校验取用的正文区间不含任何站点自撰的声明文字,拼接后仍与源文件逐字节相等

#### Scenario: 阅读时不被误认为原文

- **WHEN** 读者在页面中浏览
- **THEN** 站点自撰的说明与 RFC 原文分处不同区块,不使用与原文相同的排版样式

### Requirement: 许可边界与专利声明

站点 MUST 声明 RFC 文本与从中提取的 Code Components 按 BCP 78 与 IETF Trust Legal
Provisions 授权,不受仓库自身软件许可约束;凡引用 RFC 中的 YANG 模块等代码成分时 MUST 保留
其自带的 IETF 版权与 BSD 许可提示。站点 MUST NOT 声称复制 RFC 即获得任何专利许可。

#### Scenario: 软件许可不覆盖 RFC 文本

- **WHEN** 读者查看站点的许可说明
- **THEN** 说明区分"本站自研代码的许可"与"IETF 文档文本的许可",并指出后者由 IETF Trust 依 TLP 授予

#### Scenario:  YANG 代码提示保留

- **WHEN** 某个小节页承载 RFC 内的 YANG 模块文本
- **THEN** 该模块自带的版权与 BSD 许可提示在页面上原样可见,且页面说明它不并入仓库软件许可

### Requirement: 跨页聚合口径可解释

由于法律要求按"一份或一组相关文档"的累计再排放量判断,站点 MUST 提供一个集中的合规说明位置,
记录本站复制了哪些文档、复制范围(全文逐节)与所依据的授权条款,便于按累计口径复核。

#### Scenario: 一处看全复制范围

- **WHEN** 需要核对本站是否触发了"实质性片段须保留全部 legend"的口径
- **THEN** 集中说明页列出被复制的文档、抓取日期、覆盖范围与所依据的条款链接
