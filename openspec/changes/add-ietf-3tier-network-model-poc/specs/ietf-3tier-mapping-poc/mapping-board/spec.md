# Spec Delta

## Purpose

定义映射画板这一交互表面的行为契约：访客在同一个本地页面里看到 L3SM 与 L3NM 两个实体，人工录入业务模型的核心属性，并即时观察这些属性如何按 RFC 8299 / RFC 9182 变成网络模型实例。

## ADDED Requirements

### Requirement: 画板呈现两个模型实体
POC 页面 SHALL 在一块可交互画板上同时呈现 **L3SM** 与 **L3NM** 两个实体，二者视觉上可区分，各自标注其规范来源（L3SM 标注 `RFC 8299`，L3NM 标注 `RFC 9182`），并由表示映射方向的连线相连。

#### Scenario: 首次打开画板
- **WHEN** 访客首次进入 POC 页面
- **THEN** 画板上出现 L3SM 实体与 L3NM 实体两个图形对象，且二者在同一视野内可见
- **AND** L3SM 实体上标注 `RFC 8299`，L3NM 实体上标注 `RFC 9182`
- **AND** 有一条从 L3SM 指向 L3NM 的连线，标注本迭代的方向为 `L3SM → L3NM`

#### Scenario: 设备模型段不在本迭代
- **WHEN** 访客查看画板
- **THEN** 画板上不出现设备模型/OpenConfig 实体
- **AND** 页面以一句话说明设备模型段属于后续迭代，不显示任何伪造的设备配置内容

### Requirement: L3SM 核心业务属性人工输入
画板 SHALL 在 L3SM 实体上提供可人工录入的表单字段，字段集合限定为下表的 RFC 8299 核心子集；每个字段在 UI 上同时显示其 YANG 相对路径与 RFC 章节号。控件类型 SHALL 由字段的 YANG 类型决定：enumeration/identityref 提供下拉选择，mandatory 字段标为必填，list 提供条目增删。

| 分组 | 字段（RFC 8299 路径末段） | 必填 |
| --- | --- | --- |
| VPN 服务 | `vpn-services/vpn-service/vpn-id` | 是 |
| VPN 服务 | `vpn-services/vpn-service/customer-name` | 是 |
| VPN 服务 | `vpn-services/vpn-service/vpn-service-topology` | 否 |
| 站点 | `sites/site/site-id` | 是 |
| 站点接入 | `sites/site/site-network-accesses/site-network-access/site-network-access-id` | 是 |
| 站点接入 | `.../site-network-access/ip-connection/ipv4/addresses/customer-address` | 是 |
| 站点接入 | `.../site-network-access/ip-connection/ipv4/addresses/prefix-length` | 是 |
| 站点归属 | `.../site-network-access/vpn-attachment/vpn-id` | 是 |
| 站点角色 | `.../site-network-access/vpn-attachment/site-role` | 否 |
| 路由协议 | `.../site-network-access/routing-protocols/routing-protocol/bgp/autonomous-system` | 是 |
| 客户私有（DROP 演示） | `sites/site/locations/location/city` | 否 |
| 客户私有（DROP 演示） | `sites/site/locations/location/country-code` | 否 |

#### Scenario: 录入一个站点
- **WHEN** 访客在 L3SM 实体上填写站点标识、接入标识、客户侧 IPv4 地址与前缀长度并提交
- **THEN** 该组值以结构化形式显示在 L3SM 实体内
- **AND** 每个已填字段旁显示其 RFC 8299 路径末段与章节号

#### Scenario: 增删 list 条目
- **WHEN** 访客点击"新增站点"并提交一个新站点标识
- **THEN** L3SM 实体上出现第二个站点条目，且可对其单独填写接入参数
- **AND** 访客可删除该条目，删除后 L3NM 实体上由该条目派生的所有内容同步消失

### Requirement: 枚举取值逐字遵循 RFC
凡来自 RFC 的枚举/identity 取值，画板下拉选项的文本 SHALL 与 RFC 中定义的 identity 名称逐字一致，MUST NOT 自行改写、翻译或补充 RFC 中不存在的取值。

#### Scenario: 拓扑类型下拉
- **WHEN** 访客展开 `vpn-service-topology` 的下拉选项
- **THEN** 选项为 `any-to-any`、`hub-spoke`、`hub-spoke-disjoint`（RFC 8299 §6.2.1 定义）
- **AND** 不出现 `hub-and-spoke` 等 RFC 中不存在的写法

#### Scenario: 站点角色下拉
- **WHEN** 访客展开 `site-role` 的下拉选项
- **THEN** 选项取自 RFC 8299 定义的 role identity，且默认值与 RFC 声明的默认值一致

### Requirement: 输入即时驱动 L3NM 实例与批次高亮
任一 L3SM 字段提交后，系统 SHALL 在 300 毫秒内完成映射，并在 L3NM 实体上以同一批次整批高亮本次产生或变更的字段；高亮须在批次结束后约 2 秒内自动消退为常态显示。

#### Scenario: 改一个参数
- **WHEN** 访客把某站点的 `customer-address` 从 `192.0.2.10` 改为 `192.0.2.20`
- **THEN** L3NM 实体中由该值映射得到的字段在 300 毫秒内进入"本批变更"高亮态
- **AND** 同一次输入引发的所有下游变更（含派生字段）在同一次高亮批次中出现，而不是逐个闪烁

#### Scenario: 站点接入展开为网络侧节点
- **WHEN** 访客新增一个站点接入
- **THEN** L3NM 实体上以 SPLIT 类别高亮出现对应的网络接入内容
- **AND** 高亮字段旁显示本批因果编号

### Requirement: 因果编号与传播类别可视
每个由映射产生的 L3NM 字段 SHALL 显示一个因果编号，并按其传播类别以可区分的颜色呈现：COPY / DERIVE / SPLIT / DROP 四类各一种颜色，画板上常驻图例说明颜色与类别的对应关系。DROP 类字段的去向 SHALL 在 L3SM 侧以"不进入网络模型"的形式呈现，而不是静默消失。

#### Scenario: 查看派生字段的类别
- **WHEN** 访客观察 L3NM 实体上的 route-distinguisher 字段
- **THEN** 该字段以 DERIVE 类别的颜色显示，并带有可点击的因果编号

#### Scenario: 查看客户私有字段被丢弃
- **WHEN** 访客填写了站点的 `city` 与 `country-code` 并触发映射
- **THEN** 画板以 DROP 类别标注这两个字段"未下传到 L3NM"
- **AND** L3NM 实体上不存在与之对应的字段

### Requirement: 派生只读字段禁止直接编辑
L3NM 实体上属于 DERIVE 类别的字段（route-distinguisher、route-target、网络侧地址与接入点标识）SHALL 以只读态呈现。访客尝试编辑时，系统 MUST 拒绝写入、保持原值不变，并显示该值的生成算法说明与 RFC 出处。

#### Scenario: 尝试修改 RD
- **WHEN** 访客点击 L3NM 实体上的 route-distinguisher 试图输入新值
- **THEN** 该字段保持原值且输入被拒绝
- **AND** 页面显示"该字段由网络侧分配"的说明，并引用 RFC 8299 §6.6.7（RD/VRF 由管理系统分配）与 RFC 9182 §7.4 的对应取值方式

### Requirement: 输入校验按 RFC 约束执行
当访客输入违反字段的 YANG 类型、取值范围、枚举集合或必填约束时，系统 SHALL 就地给出可读错误提示，MUST NOT 用该非法值参与映射，且 L3NM 实体保持上一次合法映射的结果不变。

#### Scenario: 非法 IPv4 地址
- **WHEN** 访客在 `customer-address` 输入 `192.0.2`
- **THEN** 字段旁出现类型不合法的错误提示
- **AND** L3NM 实体上对应字段未被改写

#### Scenario: 缺失必填项
- **WHEN** 访客新增站点但未填 `site-id` 即提交
- **THEN** 系统提示该字段必填并指出其 RFC 8299 路径
- **AND** 不生成半条 L3NM 数据

### Requirement: 自动定位与跟随开关
当一次映射产生的 L3NM 字段不在当前可见区域内时，画板 SHALL 默认自动滚动定位到该字段（跟随模式 ON）。访客手动滚动 L3NM 侧内容后，系统 SHALL 自动切换为 OFF 并给出可见状态提示；访客可手动恢复 ON。

#### Scenario: 长内容自动跳转
- **WHEN** 跟随模式为 ON 且一次输入改变了当前不可见的 L3NM 字段
- **THEN** 画板把该批次字段滚动进入可见区域并高亮

#### Scenario: 手动滚动即退出跟随
- **WHEN** 访客在跟随模式为 ON 时手动滚动 L3NM 实体内容
- **THEN** 跟随模式变为 OFF 且开关状态在页面上可见
- **AND** 之后的输入不再自动滚动画板

### Requirement: 预置演示业务与本地会话状态
页面加载时 SHALL 预置一份符合 RFC 8299 的示例业务（一个 VPN 服务与至少两个站点接入），使访客无需从零录入即可看到映射结果。画板的全部状态保存在浏览器本地会话内：MUST NOT 把录入数据发送到任何远端，刷新页面后回到预置状态。

#### Scenario: 载入预置业务
- **WHEN** 访客首次进入页面
- **THEN** L3SM 实体已带有预置的 VPN 服务与站点接入数据
- **AND** L3NM 实体已带有对应的映射结果

#### Scenario: 数据不出浏览器
- **WHEN** 访客在画板上录入并提交多个字段，同时观察浏览器网络面板
- **THEN** 不出现任何携带录入数据的请求
- **AND** 刷新页面后录入内容回到预置状态
