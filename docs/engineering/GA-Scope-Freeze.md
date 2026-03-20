# GA Scope 冻结文档（Scope Freeze）

## 1. 目的
1. 冻结当前 GA 候选版本的首发范围，避免在正式上线前继续扩张工作面。
2. 明确哪些能力属于 `GA in scope`，哪些能力应延后到 `post-GA`。
3. 为合规、beta、生产部署、客服和 Go/No-Go 决策提供统一边界。

## 2. 当前结论（截至 2026-03-12）
1. 当前产品阶段: `RC / pre-GA`
2. 当前工程阶段: `feature complete + release hardening complete`
3. 本文冻结的是 `GA candidate scope`，不是未来所有增强项的完整范围。

## 3. GA 首发目标
1. 面向中国大陆雅思考生提供完整的“诊断 -> 计划 -> 训练 -> 反馈 -> 复盘 -> 再计划”学习闭环。
2. 支持 iOS、Android、Windows、macOS 的一致学习体验。
3. 在正式上线前具备最小可运营能力：发布、回滚、监控、审计、RC 验收、已知问题管理。

## 4. GA In Scope
### 4.1 学员核心闭环
1. 账号注册、登录、会话续期、账号删除。
2. 入门目标设置、首次诊断、8 周学习计划与滚动调整。
3. 听力训练核心闭环。
4. 口语实时对练、追问、评分与纠偏。
5. 阅读训练核心闭环。
6. 写作提交、评分、建议与改写复评。
7. 全真模考、进度恢复、复盘报告和计划回写。

### 4.2 商业化与用户权益
1. 免费试用和订阅权益。
2. 订阅升级、取消续费、恢复和跨端权益一致性。
3. 最小可用的订单与权益纠错后台能力。

### 4.3 后台与运营最小闭环
1. Admin 登录与 RBAC。
2. 用户冻结/解冻。
3. 订单查询与权益校正。
4. 内容发布、审计日志和最小运营管理能力。

### 4.4 发布与运维最小闭环
1. `release:checklist`、tracking governance、release record、RC package。
2. runbook、回滚策略、严格治理校验与脚本回归。
3. Postgres 持久化与 restart recovery 验证基线。
4. 生产前所需的最小监控、告警和 incident 机制。

## 5. Out of Scope / Post-GA
### 5.1 PRD 明确不在本期
1. 真人外教 marketplace。
2. 面向机构/学校的 B2B 管理后台。
3. 线下课程排课与交易能力。

### 5.2 本次 GA 不主动扩张的事项
1. 大规模增长实验、复杂营销自动化和新商业化玩法。
2. 非首发阻断的高级运营能力扩展。
3. 不影响 GA 主链路的视觉重构或设计语言翻新。
4. 不影响上线阻断项的技术债大规模清理。

## 6. 已知问题接受边界
### 6.1 可以接受进入 `Go with Known Issues` 的问题
1. 严重级别不高于 `Medium`。
2. 存在明确 workaround，且不会影响 P0 主链路。
3. 不涉及支付正确性、账号安全、数据丢失、权限越权、审计缺失。
4. 不影响应用审核、合规发布或生产值班判断。
5. 有明确 owner、缓解动作和计划修复窗口。

### 6.2 不可接受的问题
1. 登录、会话、进度同步、诊断、四科训练、模考报告任一核心链路不可用。
2. 支付、订阅、权益状态不一致或存在错误扣费风险。
3. RBAC、权限边界、审计链路存在高风险缺口。
4. 数据删除、数据保留、隐私说明与真实行为不一致。
5. 生产部署、回滚、备份恢复未验证。
6. 告警来了之后没有明确首响、升级或回滚责任人。

## 7. 决策规则
| decision | criteria |
|---|---|
| Go | 所有 Blocking 项通过，且无不可接受问题 |
| Go with Known Issues | Blocking 项通过，但存在被正式批准的中低风险已知问题 |
| No-Go | 任一 Blocking 项失败，或出现不可接受问题 |

## 8. 本次冻结后的变更控制
1. 新增功能默认不进入当前 GA 候选范围。
2. 只有满足以下条件之一，才允许变更 `GA scope`:
- 修复上线阻断项
- 合规要求强制调整
- 生产可用性要求强制调整
3. 任何非阻断型新增需求，默认进入 `post-GA` 池。
4. 若需临时纳入 GA，必须同步更新:
- 本文档
- 发布说明
- 风险台账
- Go/No-Go 决策包

## 9. 当前最小上线阻断项
1. `GA scope` 已冻结并评审通过。
2. production environment matrix 已完成。
3. production deploy / rollback runbook 已完成。
4. on-call / incident runbook 已完成。
5. 隐私政策、用户协议、数据保留/删除策略已有上线前可审版本。
6. 真实支付/退款/权益纠错链路完成验证。
7. 小规模 beta 已完成并有可接受结果。

## 10. 评审输入
1. 产品范围基线: `docs/PRD-IELTS-AI-App.md`
2. Epic 基线: `docs/backlog/Epic-Map.md`
3. 发布与回滚基线: `docs/engineering/S9-Release-Runbook.md`
4. RC 验收基线: `docs/engineering/RC-Acceptance-Checklist.md`
5. GA 差距清单: `docs/engineering/GA-Readiness-Checklist.md`
6. Phase 0 启动计划: `docs/engineering/GA-Phase0-Kickoff-Plan.md`

## 11. 签署区
| role | owner | decision | notes |
|---|---|---|---|
| Product |  |  |  |
| Engineering |  |  |  |
| Ops / Release |  |  |  |
| QA |  |  |  |
