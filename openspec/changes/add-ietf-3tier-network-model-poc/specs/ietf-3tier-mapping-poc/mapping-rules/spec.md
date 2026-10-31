# Spec Delta

## Purpose

定义 L3SM→L3NM 映射规则集与其可追溯性要求：每条规则既要能被机器执行，也要能被读者在 RFC 原文中逐字核对，从而把"顺序映射是否无损"变成可验证的实证材料。

## ADDED Requirements

### Requirement: 规则条目结构
每一条 L3SM→L3NM 映射规则 SHALL 由以下字段构成并在 UI 中可见：规则 ID、源路径（RFC 8299 相对路径）、目标路径（RFC 9182 相对路径）、传播类别（COPY / DERIVE / SPLIT / DROP 四者之一）、置信标签（`标准明确规定` 或 `工程推断`）、RFC 出处（文档号 + 章节号 + 该章节标题原文）。DROP 类规则 MUST 显式声明"无目标路径"，MUST NOT 用一个虚构路径占位。

#### Scenario: 查看一条 COPY 规则
- **WHEN** 访客把鼠标移到规则面板中 `customer-name → customer-name` 这一行
- **THEN** 该行显示传播类别 `COPY`、置信标签 `标准明确规定`，以及 `RFC 8299 §6.2 VPN Service Overview` 与 `RFC 9182 §7.3 VPN Services` 两个出处
- **AND** 源路径与目标路径分别以 RFC 8299、RFC 9182 的节点名书写

#### Scenario: 查看一条 DROP 规则
- **WHEN** 访客查看 `sites/site/locations/location/city` 对应的规则行
- **THEN** 该行传播类别为 `DROP`，目标路径位置显示"无（不进入网络模型）"
- **AND** 出处引用 RFC 9182 §7.5 关于客户站点信息不属于网络模型的表述

### Requirement: 首批规则集覆盖已核实的核心子集
规则表 SHALL 至少包含下列已在 RFC 原文中定位的规则；表中路径与章节号 MUST 与 RFC 8299 / RFC 9182 原文一致，MUST NOT 包含 RFC 中不存在的节点名（例如 L3SM 侧不存在 `customers`、`customer-id`、`vpn-name`、`service-type`，L3NM 侧不存在 `sites`、`site-id`、`route-distinguisher` 顶层叶子）。

| # | 源（RFC 8299） | 目标（RFC 9182） | 类别 | 出处 |
| --- | --- | --- | --- | --- |
| 1 | `vpn-services/vpn-service/vpn-id` | `vpn-services/vpn-service/vpn-id` | COPY | §6.2 → §7.3 |
| 2 | `vpn-services/vpn-service/customer-name` | `vpn-services/vpn-service/customer-name` | COPY | §6.2 → §7.3 |
| 3 | `vpn-services/vpn-service/vpn-service-topology` | `vpn-services/vpn-service/vpn-service-topology` | COPY | §6.2.1 → §7.3 |
| 4 | `sites/site/site-id` | `vpn-services/vpn-service/vpn-nodes/vpn-node/vpn-node-id` | SPLIT | §6.3 → §7.5 |
| 5 | `.../site-network-access/site-network-access-id` | `.../vpn-node/vpn-network-accesses/vpn-network-access/id` | COPY | §6.3.2 → §7.6 |
| 6 | `.../site-network-access/ip-connection/ipv4/addresses/provider-address` | `.../vpn-network-access/ip-connection/ipv4/local-address` | COPY | §6.3.2.2 → §7.6.2 |
| 7 | `.../site-network-access/ip-connection/ipv4/addresses/customer-address` | `.../ip-connection/ipv4/static-addresses/address/customer-address` | COPY | §6.3.2.2 → §7.6.2 |
| 8 | `.../site-network-access/ip-connection/ipv4/addresses/prefix-length` | `.../ip-connection/ipv4/prefix-length` | COPY | §6.3.2.2 → §7.6.2 |
| 9 | `.../site-network-access/vpn-attachment/site-role` | `.../vpn-instance-profile/role` | COPY | §6.4 → §7.4 |
| 10 | `.../site-network-access/vpn-attachment/vpn-id` | （决定该 access 归属哪个 `vpn-service`） | SPLIT | §6.5.2 → §7.5 |
| 11 | `.../routing-protocols/routing-protocol/bgp/autonomous-system` | `.../routing-protocols/routing-protocol/bgp/peer-as` | COPY | §6.11.7 → §7.6.3.2 |
| 12 | —（L3SM 无对应节点） | `vpn-services/vpn-service/vpn-type` | DERIVE | — → §7.3 |
| 13 | —（由管理系统分配） | `.../vpn-instance-profile/rd` | DERIVE | §6.6.7 → §7.4 |
| 14 | —（由 RT 实现拓扑） | `.../vpn-instance-profile/address-family/vpn-targets/vpn-target/route-targets/route-target` | DERIVE | §6.2.1 + §6.2.1.1 → §7.4 |
| 15 | —（Provider 侧 AS） | `.../routing-protocols/routing-protocol/bgp/local-as` | DERIVE | — → §7.6.3.2 |
| 16 | —（网络侧标识分配） | `.../vpn-node/vpn-network-accesses/vpn-network-access/interface-id` | DERIVE | — → §7.6 |
| 17 | `sites/site/locations/location/{address,postal-code,state,city,country-code}` | 无 | DROP | §6.3.1 → §7.5 |
| 18 | `sites/site/requested-site-start` / `requested-site-stop` | 无 | DROP | §6.3 → §7.5 |

表中目标路径省略 YANG `choice`/`case` 层名（如 #13 的原文位置是 `vpn-instance-profile/(rd-choice)/(directly-assigned)/rd`）；规则表在 UI 上以 `pathNote` 逐条给出原文位置，因此省略不构成路径失真。

#### Scenario: 客户 AS 的重命名与类型变化被如实呈现
- **WHEN** 访客查看规则 #11
- **THEN** 该行显示源为 `autonomous-system`（uint32，RFC 8299 中标记为 mandatory）
- **AND** 目标为 `peer-as`（inet:as-number，RFC 9182 §7.6.3.2 中标记为 mandatory）
- **AND** 该行注明两者节点名与类型均不同，属于重命名+类型映射而非直传

#### Scenario: 拓扑取值不越出 RFC 定义
- **WHEN** 规则 #3 在画板上把 `vpn-service-topology` 落到 L3NM
- **THEN** 取值保持 `any-to-any` / `hub-spoke` / `hub-spoke-disjoint` 原文写法
- **AND** 若画板上出现 `custom`（RFC 9182 允许、RFC 8299 未定义），该行须标注为"仅 L3NM 侧存在"

### Requirement: 置信标签与工程推断清单
每条规则 SHALL 标注置信标签。标注为 `工程推断` 的规则 MUST 在 UI 上与其引用出处区分显示，并且页面 SHALL 提供一个汇总视图列出全部工程推断规则，作为后续提交工作组评审的开放问题清单。MUST NOT 为工程推断规则编造 RFC 出处。

#### Scenario: 汇总工程推断规则
- **WHEN** 访客打开工程推断汇总视图
- **THEN** 列表包含 `vpn-type`、`local-as` 等在 L3SM 侧无对应节点的规则
- **AND** 每条给出推断依据的文字说明，且不带任何"RFC 规定"的措辞

### Requirement: 规则与画板双向反查
规则面板的每一行 SHALL 可点击，点击后画板把该规则的源字段与目标字段同时聚焦并高亮；画板上的因果编号 SHALL 可点击，点击后规则面板滚动到对应规则行并高亮。两类反查指向的字段 MUST 与实际映射结果一致，MUST NOT 出现高亮错乱。

#### Scenario: 从规则反查画板
- **WHEN** 访客点击 `interface-id` 对应的 DERIVE 规则行
- **THEN** 画板上由该规则生成的 L3NM 字段进入高亮态并滚动到可见区域
- **AND** 因该规则无 L3SM 源，源侧显示"无对应输入"而不是空白无提示

#### Scenario: 从画板反查规则
- **WHEN** 访客点击 L3NM 实体上某个字段的因果编号徽标
- **THEN** 规则面板滚动到产生该字段的那一行并将其高亮

### Requirement: 范围声明与无损指标
页面 SHALL 显式声明本次覆盖的是 RFC 8299 的**子集**而非完整模型，并同时给出：已覆盖的 L3SM 字段数、L3SM 模块总叶子数、未纳入本次映射的已覆盖分组字段数。指标看板 SHALL 在已声明子集内实时计算并显示：覆盖率（子集内每个 L3SM 输入字段至少被一条规则命中，DROP 规则计入命中）、往返一致性（L3SM→L3NM→L3SM 反演后与原始输入比较，差异字段数为 0；被 DROP 的字段 MUST 在指标旁显式列出而非静默排除）、溯源完整率（L3NM 实例中每个非空字段都能回溯到一个规则 ID 或一段 DERIVE 算法说明）。

#### Scenario: 指标不被误读为全量结论
- **WHEN** 访客查看指标看板
- **THEN** 覆盖率旁显示其分母为"已声明子集内的字段数"
- **AND** 页面同时显示该子集占 RFC 8299 全部叶子的比例

#### Scenario: 往返差异可见
- **WHEN** 当前 L3SM 输入反演出的某个字段与原始输入不一致
- **THEN** 往返一致性指标显示差异数并列出差异字段路径
- **AND** 差异字段在画板上以可区分的颜色标记

#### Scenario: 溯源缺口可见
- **WHEN** L3NM 实例中存在无法回溯到规则 ID 或 DERIVE 说明的字段
- **THEN** 溯源完整率低于 100% 且该字段在画板上以异常态显示

### Requirement: 出处可离线自动核对
规则表 SHALL 配套一个仅用于开发阶段的校验脚本：它在开发机上读取 RFC 8299 与 RFC 9182 的纯文本文档（`https://www.rfc-editor.org/rfc/rfc8299.txt`、`https://www.rfc-editor.org/rfc/rfc9182.txt`），逐条断言规则引用的章节号在文档的编号标题中存在、引用的节点名在对应 YANG 模块文本中出现。该脚本 MUST NOT 是页面运行时的一部分。

#### Scenario: 虚构引用被拦截
- **WHEN** 有人把某条规则的出处改成 RFC 8299 中不存在的章节号后运行校验脚本
- **THEN** 脚本以非零退出码失败并指出该规则 ID
- **AND** 站点构建不因该脚本失败而被阻塞的要求不适用——该脚本 MUST 在校验通过后才允许规则上线

#### Scenario: 运行时不取原文
- **WHEN** 访客在浏览器中使用 POC 页面
- **THEN** 页面不请求 rfc-editor.org 或任何外部域名

### Requirement: 占位草稿名称免责
页面凡出现尚未立项的映射 draft 名称处，SHALL 同时显示 `PLACEHOLDER` 徽标与一句免责说明，明确该文档并不存在，MUST NOT 让访客误读为已提交的 IETF 文档。

#### Scenario: 草稿名带徽标
- **WHEN** 访客看到规则面板标题处的占位 draft 名称
- **THEN** 其旁显示 `PLACEHOLDER` 徽标与"该名称为占位，尚无对应 IETF 文档"的说明
