# 决策记录（Decision Log）

## D-001 采用纯文件跟踪系统
- 日期: 2026-02-25
- 状态: Accepted
- 背景: 当前无需依赖 Jira/Linear 平台能力。
- 决策: 以 `backlog.csv` 作为单一事实源，配合日志、风险、指标和复盘文件执行全流程。
- 影响:
1. 可在任何代码仓库中立即启用。
2. 需要团队严格遵守更新纪律，避免信息漂移。

## D-002 状态流转标准化
- 日期: 2026-02-25
- 状态: Accepted
- 决策: 使用统一状态流转 `Draft -> Ready -> In Progress -> In QA -> Done -> Released`。
- 影响:
1. 便于汇总统计和门禁校验。
2. 降低“完成定义”歧义。

## D-003 backlog.csv 字段规范
- 日期: 2026-02-25
- 状态: Accepted
- 决策: `id,type,parent_id,title,priority,status,sprint,owner,estimate,dependencies,acceptance_ref,source_doc,updated_at` 作为标准字段。
- 影响:
1. 可后续平滑导入 Jira/Linear。
2. 兼容 Epic / Story / Task 多层级扩展。

## D-004 纳入后台管理系统（E11）
- 日期: 2026-02-25
- 状态: Accepted
- 背景: 需要覆盖运营、内容、订单和风控的后台能力。
- 决策: 首发纳入最小后台管理系统（Admin Web），新增 E11 与对应 P0/P1 Story。
- 影响:
1. S5/S6 迭代范围扩大，需增加后台开发与测试资源。
2. 发布门禁新增后台权限与审计校验项。

## D-005 动工前竞品基线纳入交付门禁
- 日期: 2026-02-26
- 状态: Accepted
- 背景: 在开始 S1 开发前，需要确认商业市场是否已有成熟替代方案以及可差异化空间。
- 决策: 将 `docs/market/Competitive-Analysis-IELTS-2026.md` 作为动工前必读输入，PRD 差异化策略与后续里程碑需以该调研为基线。
- 影响:
1. 研发启动前即可避免“重复造同类产品”。
2. 后续需求评审需显式回答“该能力相对竞品的必要性与优势”。
