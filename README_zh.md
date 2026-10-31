[English](README.md) | [中文](README_zh.md)

# L3SM 到 L3NM 无损映射：一个纯浏览器原型

## 1. 说明

本仓库承载一个开源原型的第一期迭代，让 IETF 服务抽象与网络抽象之间的映射可见、可核对：
把三层 VPN 业务模型 L3SM（RFC 8299）映射到三层 VPN 网络模型 L3NM（RFC 9182）。全部计算
在浏览器内完成，页面无需后端、运行时不发起网络请求。已作为 GitHub Pages 站点的一部分发布：
<https://ctri-chenyong.github.io/net-sim/l3sm-l3nm/>。

## 2. 背景

运营商业务由分层模型管理：客户要什么（L3SM）、网络如何实现（L3NM）、设备如何配置
（OpenConfig 等设备模型）。「三层可以自上而下无损地逐层翻译」目前是假设，不是已被证明的
事实：没有工具端到端复现这个翻译过程，两个方向的映射也都没有已立项的规范；维护更新
L3SM、L3NM 属于 IETF ONSEN 工作组（Operationalizing Network & SErvice abstractioNs）章程
范围。原型一次只走一步：把每条映射规则单独做实，标注它所依据的 RFC 章节，并区分「标准
明确规定」与「工程推断」。工程推断清单就是要提交工作组讨论的产出。

## 3. 本期提供什么

* 同一视野内的画板：左侧 L3SM 实例、右侧 L3NM 实例。一次客户输入按同批传播，受影响
  字段整批高亮并挂因果编号。
* 18 条规则 —— COPY（9）、DERIVE（5）、SPLIT（2）、DROP（2）。每条标注传播类别、置信
  标签（13 条标准明确规定、5 条工程推断）及其依据的 RFC 8299 与 RFC 9182 章节。点规则行
  → 它搬运的字段聚焦；点画板上的因果编号 → 对应规则行滚动到位。
* 派生的只读字段（route distinguisher、route target、运营商编号资源）拒绝人工直改，并在
  字段旁给出生成算法。
* 三项可机器校验的指标实时重算：声明子集内的覆盖率、往返差异（L3SM → L3NM 再反演回
  L3SM）、L3NM 叶子节点可溯源的比例。

## 4. 本期不覆盖什么

范围声明是页面的一部分：画板覆盖 12 个声明字段，而 RFC 8299 模块正文共声明 159 条 leaf
与 leaf-list（145 加 14，2026-10-31 计数），因此覆盖率是「声明子集内」的比值，页面每处
展示该比值时都写明这一点，避免把小子集读成全量覆盖。设备模型层、L3NM 到设备模型的映射、
向真实设备下发配置、由 pyang 生成的表单、按 RFC 7950/7951 的实例校验（yangson）以及容器
化实验环境均不在本期范围内。

## 5. 本地打开

从文件系统直接打开 `net-sim/l3sm-l3nm/standalone/preview.html`：同一引擎、同一画板，
不带任何站点主题。

## 6. 仓库结构

```
net-sim/l3sm-l3nm/index.html   外壳页面（唯一感知主题的文件）
net-sim/l3sm-l3nm/app/         规则、引擎、画板 —— 无主题、无网络
net-sim/l3sm-l3nm/theme/       单一主题适配样式表
net-sim/l3sm-l3nm/standalone/  无主题的预览页
tools/                         开发期核对脚本（不发布）
openspec/                      变更提案与规格（不发布）
```

[`net-sim/README.md`](net-sim/README.md) 规定哪个文件可以知道关于宿主主题的什么内容，
以及把原型迁到别的模板要改哪几处。

## 7. 开发期核对

在仓库根用 Node 运行；这些脚本都不属于发布的站点，GitHub Actions 工作流只负责构建
Jekyll 站点。

* `check-decoupling.mjs` —— 强制执行第 6 节描述的边界。
* `check-rules-shape.mjs` —— 每条规则、声明子集里每个字段都带有引擎与页面所要求的属性。
* `check-rfc-citations.mjs` —— 对照 rfc-editor 的 RFC 8299/9182 文本（首次运行后缓存），
  核对被引章节号与标题、路径中每个节点名是否在对应 YANG 模块中声明、以及页面报告
  「不存在」的节点名是否确实不存在。
* `engine.test.mjs` —— 无界面运行映射、反演与指标计算。

## 8. 后续迭代

1. 第二段映射：L3NM 到设备模型，含按设备展开的分发。
2. 验证页面：配置下发到真实网络操作系统，展示下发时序耗时、running-config 差异与业务
   连通测试。
3. 用 pyang 从 YANG 模块生成表单，用 yangson 做实例校验。
4. 一键拉起的实验环境（containerlab，3×PE 加 3×CE），使整条链路可在新机器上复现。

## 9. 团队

本原型由中国电信股份有限公司研究院 IETF 团队开发。团队从事运营商网络运维与管理研究，
跟踪 IETF ONSEN 工作组。意见与讨论请在本仓库提交 issue。

## 10. 参考文献、许可与命名

* RFC 8299 — YANG Data Model for L3VPN Service Delivery（`ietf-l3vpn-svc`）；RFC 9181 — A
  Common YANG Data Model for Layer 2 and Layer 3 VPNs（`ietf-vpn-common`）；RFC 9182 — A YANG
  Network Data Model for Layer 3 VPNs（`ietf-l3vpn-ntw`）。
* RFC 7950/7951（YANG 1.1 及其 JSON 编码）、RFC 6241（NETCONF）、RFC 8040（RESTCONF）
  —— 供后续迭代引用。
* IETF ONSEN 工作组：<https://datatracker.ietf.org/wg/onsen/about/>。
* 代码按 MIT 许可发布（见 `LICENSE`，其版权行仍写着模板作者；任务书要求改为 Apache-2.0，
  该变更尚未执行）。
* `draft-ietf-onsen-l3sm-l3nm-mapping` 是给规则表起的占位名 —— 并不存在这份 IETF 文档。
  页面为其标注 PLACEHOLDER 徽标并写明同样的免责说明。
