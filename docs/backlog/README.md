# Backlog 使用说明

## 1. 目标
本目录将 PRD 拆解为可执行的研发交付物，用于直接进入需求评审、排期和开发。

## 2. 文档清单
1. `docs/backlog/Epic-Map.md`: Epic 全景、目标结果、依赖和里程碑。
2. `docs/backlog/Story-Catalog-P0.md`: 首发版本必须交付的故事与验收标准。
3. `docs/backlog/Story-Catalog-P1.md`: 上线后增强项故事与验收标准。
4. `docs/backlog/Sprint-Plan-12-Weeks.md`: 12 周迭代计划与发布门禁。
5. `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md`: 基于 `self-hosted` 当前代码快照的补洞 backlog，仅用于承接 2026-04-10 完成度审计后的剩余闭环项。

## 3. 命名规范
1. Epic 编号: `E01` - `E11`。
2. Story 编号: `US-xxxx`，前缀数字与 Epic 保持分组对应。
3. `self-hosted` 审计补洞项使用预留区间 `US-11301+`，避免与历史 tracking / release Story 冲突。
4. 优先级:
- `P0`: 首发阻断项，必须上线。
- `P1`: 增强项，可在不影响首发的前提下延后。

## 4. 估算规则
1. 点数采用 Fibonacci: `3/5/8/13`。
2. 估算口径:
- `3`: 1-2 天可完成，依赖少。
- `5`: 2-4 天，涉及 1 个跨端或跨服务协作。
- `8`: 4-7 天，涉及复杂状态或质量要求高。
- `13`: 7 天以上，跨多团队并有较高风险。

## 5. Story 状态流转
1. `Draft`
2. `Ready`
3. `In Progress`
4. `In QA`
5. `Done`

## 6. Ready / Done 定义
### 6.1 Definition of Ready
1. 业务目标明确且与 PRD 对齐。
2. 接口和数据结构已定义。
3. 验收标准可测试且可量化。
4. 依赖项已识别并有 owner。

### 6.2 Definition of Done
1. 代码完成并通过 Code Review。
2. 测试用例通过，回归无阻断缺陷。
3. 监控和埋点按 Story 要求落地。
4. 文档和发布说明已更新。

## 7. 变更控制
1. 涉及范围、接口或验收标准变更时，必须更新 Story 文档。
2. 任何 P0 降级为 P1 的变更需产品与研发负责人共同确认。
