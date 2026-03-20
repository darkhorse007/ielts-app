# GA Phase 0 启动计划（Immediate Next Steps）

## 1. 目标
1. 在不新增业务功能的前提下，先完成最小 GA 前置准备。
2. 以 1 周为窗口，把最关键的不确定性压缩到可评审状态。
3. 为后续生产部署、合规、beta 和正式 Go/No-Go 决策建立输入。

## 2. 适用阶段
1. 当前阶段: `RC / pre-GA`
2. 本计划仅覆盖可立即启动、且不依赖大规模新增代码的事项。
3. 本计划是 `docs/engineering/GA-Readiness-Checklist.md` 中 `Phase 0` 的执行版。
4. `GA-01` 的首个产物已落为 `docs/engineering/GA-Scope-Freeze.md`，后续评审以该文档为基线继续细化。
5. `GA-03` 的首个产物已落为 `docs/engineering/Production-Environment-Matrix.md`，后续生产部署、值班与安全审查以该文档为配置基线继续收口。
6. `GA-10` 的首个产物已落为 `docs/engineering/Production-Incident-Runbook.md`，后续 on-call 名录、升级路径与复盘模板以该文档为基线继续补齐。
7. `GA-13` 的首个产物已落为 `docs/engineering/Support-Content-Ops-SOP.md`，且角色级值班分工已进一步冻结为 `docs/engineering/Support-OnCall-Ownership-Matrix.md`。
8. `GA-04` 的首个产物已落为 `docs/engineering/Production-Deploy-Rollback-Runbook.md`，且联合签署模板已落为 `docs/engineering/Production-Deployment-Recovery-Drill-Record.md`；后续只需补一次真实窗口执行记录即可进入总演练前置状态。
9. `GA-05` 的首个产物已落为 `docs/engineering/Production-Database-Backup-Recovery-Runbook.md`，并复用 `docs/engineering/Production-Deployment-Recovery-Drill-Record.md` 作为正式签署入口；但 backup / restore 编排与 RTO/RPO 实测仍未签署完成。
10. `GA-08` 的首个产物已落为 `docs/engineering/Compliance-Launch-Checklist.md`，退款客服口径已进一步冻结为 `docs/engineering/Refund-Commitment-FAQ.md`，但真实支付/退款实现与正式文案仍未签署完成。
11. `GA-11` 的首个产物已落为 `docs/engineering/Beta-Plan.md`，外部 beta 反馈入口已进一步冻结为 `docs/engineering/Beta-Feedback-Channel-Decision.md`，cohort 指标定义与 blocker 已进一步冻结为 `docs/engineering/Beta-Cohort-Metrics-Extraction-Plan.md`。

## 3. 本周只做 5 件事
| order | id | item | output | why_now |
|---|---|---|---|---|
| 1 | GA-01 | 冻结 `GA scope`、延后项和已知问题接受边界 | `GA scope` 冻结文档 | 先定范围，否则后续所有准备都会反复返工 |
| 2 | GA-03 | 梳理 production environment matrix | 环境/配置/密钥/部署入口矩阵 | 这是部署、运维、安全和支付验证的共同输入 |
| 3 | GA-10 | 建立 production on-call / incident runbook | 值班、告警、升级、回滚规则文档 | 没有运营托底，系统不能算可上线 |
| 4 | GA-08 | 起草合规首版文档 | 隐私政策、用户协议、数据保留/删除策略草稿 | 合规通常前置周期长，应尽早并行 |
| 5 | GA-11 | 设计小规模 beta 方案 | beta plan + success metrics | 不先定义 beta，就无法判断何时能 GA |

## 4. 执行顺序
### 4.1 Day 1
1. 召开 `GA scope` 冻结评审。
2. 输出:
- 首发范围
- 延后范围
- 已知问题接受边界
- `Go with Known Issues` 的适用条件

### 4.2 Day 2
1. 梳理 production environment matrix。
2. 至少覆盖:
- client/server
- runtime config
- database
- AI provider
- payment provider
- secrets source
- deploy entrypoint
- rollback entrypoint

### 4.3 Day 3
1. 基于现有 `S9-Release-Runbook` 派生 production on-call / incident runbook。
2. 至少定义:
- 告警等级
- 首响 SLA
- 升级路径
- 值班角色
- 回滚触发条件
- 事故复盘要求

### 4.4 Day 4
1. 起草合规文档首版。
2. 至少核对:
- 收集哪些数据
- 数据保存多久
- 用户如何删除数据
- 第三方服务如何处理数据
- 支付与账号注销的说明是否一致

### 4.5 Day 5
1. 输出 beta 计划。
2. 至少定义:
- 招募对象
- 样本量
- 观测周期
- 指标阈值
- No-Go 条件
- beta 结束后的决策方式

## 5. 每项任务的完成标准
### 5.1 GA-01 `GA scope`
1. 能明确回答“首发到底发什么、不发什么”。
2. 能明确列出已知问题是否阻断发布。
3. 评审后不再因边界不清反复改口。

### 5.2 GA-03 production environment matrix
1. 能明确生产环境需要哪些配置项和密钥。
2. 能明确哪些项来自仓库、哪些项来自外部平台。
3. 能直接支持后续部署 runbook、安全审查和支付验证。

### 5.3 GA-10 on-call / incident runbook
1. 告警来了，能明确谁先看、谁决定、谁执行回滚。
2. 有清晰的升级与复盘机制。
3. 不依赖“口头约定”。

### 5.4 GA-08 合规文档首版
1. 文案和当前产品真实行为不冲突。
2. 账号删除、支付、第三方登录、AI 服务调用都能对上。
3. 后续只需法务/产品修订，不需从零开始。

### 5.5 GA-11 beta plan
1. 指标可量化，不使用“感觉不错”这类描述。
2. 招募范围、周期和退出标准清楚。
3. 能直接为 `GA Go/No-Go` 提供证据。

## 6. 建议 Owner
| id | lead | support |
|---|---|---|
| GA-01 | product | eng, qa |
| GA-03 | eng | ops |
| GA-10 | ops | eng, qa |
| GA-08 | product | legal, eng |
| GA-11 | growth/product | ops, eng |

## 7. 建议新增文档
1. `docs/engineering/GA-Scope-Freeze.md`
2. `docs/engineering/Production-Environment-Matrix.md`
3. `docs/engineering/Production-Incident-Runbook.md`
4. `docs/engineering/Production-Deployment-Recovery-Drill-Record.md`
5. `docs/engineering/Compliance-Launch-Checklist.md`
6. `docs/engineering/Beta-Plan.md`

## 8. 风险提醒
1. 如果不先冻结 `GA scope`，后续合规、beta、部署和客服准备都会反复返工。
2. 如果 production environment matrix 缺失，安全审查和支付验证会变成口头梳理，容易漏项。
3. 如果没有 on-call / incident runbook，即使系统功能完整，也不能认为具备 GA 条件。

## 9. 本周结束时应看到的结果
1. `GA scope` 已冻结。
2. production environment matrix 已成稿。
3. on-call / incident runbook 已有第一版。
4. 合规文档已有首稿。
5. beta 计划和成功指标已明确。

## 10. 下一阶段入口
1. 若本计划 5 项全部完成，则进入:
- 生产部署演练
- 数据恢复演练
- 安全审查
- 支付/退款/权益真实验证
2. 若未完成，则不要启动正式 GA 演练。
