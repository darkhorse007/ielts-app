# Beta Cohort Metrics Extraction Plan（GA-11 / GA-12）

## 1. 目的
1. 把 `GA-11` / `GA-12` 所需的 beta cohort 指标定义、数据来源和提取限制写清楚。
2. 明确哪些指标当前已经有稳定数据源，哪些仍然因为仓库实现限制而不能被当作正式 GA 证据。
3. 避免把 `analytics summary` 的存在误写成“已经有 cohort retention 报表”。

## 2. 当前代码事实（截至 2026-03-13）
### 2.1 已有数据源
| data source | current implementation | stability | what it can prove |
|---|---|---|---|
| beta whitelist | `release-service.ts` + `release-repository.ts` 的 `betaWhitelistEntriesById` / `beta_whitelist_entries` | High | 邀请名单、`release_id`、`status`、邀请时间基线 |
| beta feedback | `release-service.ts` + `release-repository.ts` 的 `betaFeedbacksById` / `beta_feedbacks` | High | internal beta 反馈数量、优先级、triage / unresolved 情况 |
| 外部 beta 反馈台账 | `docs/tracking/templates/support-case-intake-template.md` | Medium | external beta 反馈数量、严重级别、升级路径 |
| analytics events | `analytics-service.ts` + `analytics-repository.ts` + `/v1/analytics/events/batch` | Medium | 事件覆盖率、按用户的 cohort activation / retention / task / mock 指标；启用 Postgres 持久化后可跨重启保留 |
| beta cohort export | `GET /v1/system/beta/cohort/metrics`、`GET /v1/system/beta/cohort/export` | High | `release_id` 级 invited / feedback / activation / D7 / week1 / first mock 指标与 CSV / JSON 证据导出 |

### 2.2 关键限制
1. analytics 当前已支持 `memory / postgres`；若部署仍停留在 `memory`，则 cohort 证据不能跨重启稳定保留。
2. `/v1/analytics/summary` 仍只有 `platform` / `skill` 过滤，不能替代正式 cohort export。
3. 当前 cohort 基线使用 whitelist `created_at` 作为邀请起点；若未来需要精确表达“禁用后再次激活”，仍需补显式状态变更时间线。
4. `AI_feedback_satisfaction` 仍依赖仓库外问卷 / 访谈，仓库内没有 survey API。

结论：
1. 当前仓库已经具备 beta cohort metrics / export 的正式入口。
2. 只要 beta 环境启用持久化 analytics，activation / retention / task completion 就可以作为正式证据导出。

## 3. 当前可用事件基线
来自 `analytics-service.ts`、`churn-service.ts`、`reminder-service.ts` 的核心学习事件集合：
1. `onboarding_submitted`
2. `diagnostic_completed`
3. `practice_submitted`
4. `speaking_turn_scored`
5. `writing_evaluated`
6. `mock_exam_submitted`

补充事件：
1. `subscription_upgraded`
2. `admin_adjustment`

当前判断：
1. 上述事件足够定义 beta 激活与学习活跃指标。
2. 当前真正阻断的不是“事件名不够”，而是“事件没有稳定 cohort 级导出能力”。

## 4. 指标定义（冻结版）
### 4.1 可以立即稳定提取的指标
| metric | definition | source | current extractability |
|---|---|---|---|
| invited_users | 指定 `release_id` 下 `status=active` 的 beta whitelist 唯一用户数 | beta whitelist | Ready |
| disabled_users | 指定 `release_id` 下 `status=disabled` 的 whitelist 用户数 | beta whitelist | Ready |
| internal_feedback_total | 指定 `release_id` 的 beta feedback 总数 | beta feedback | Ready |
| unresolved_critical_feedback | `priority=critical` 且 `status!=resolved` 的反馈数 | beta feedback | Ready |
| unresolved_high_feedback_older_than_48h | `priority=high` 且 `status!=resolved` 且创建时间超过 48h 的反馈数 | beta feedback | Ready |
| external_feedback_total | external beta 表单 / 台账中与该 `release_id` 关联的 case 数 | support case intake | Manual but executable |

### 4.2 定义已冻结、且当前可导出的指标
| metric | frozen definition | source needed | current blocker |
|---|---|---|---|
| invited_to_activation_rate | `release_id` 白名单用户中，在 whitelist 激活后 `72h` 内同时出现 `onboarding_submitted` 和至少 1 个核心学习事件的比例 | whitelist + analytics events | 仅在 analytics 启用持久化时可跨重启稳定签署 |
| D7_retention | 已邀请用户中，在 whitelist 激活后第 `7` 天窗口内出现至少 1 个核心学习事件的比例 | whitelist + analytics events | 仅在 analytics 启用持久化时可跨重启稳定签署 |
| week1_task_completion_rate | 已邀请用户中，在 whitelist 激活后 `7` 天内出现至少 `3` 个核心学习事件的比例 | whitelist + analytics events | 仅在 analytics 启用持久化时可跨重启稳定签署 |
| first_mock_completion_rate | 已邀请用户中，在 whitelist 激活后 `14` 天内出现 `mock_exam_submitted` 的比例 | whitelist + analytics events | 仅在 analytics 启用持久化时可跨重启稳定签署 |
| AI_feedback_satisfaction | external beta 问卷中满意度 `>= 4.0 / 5.0` | 外部表单 / 访谈 | 仓库内无 survey API |

## 5. 当前可执行的证据收集方式
### 5.1 Phase A: Internal / Operated Beta
当前最小可执行收集包：
1. whitelist 快照：
- `GET /v1/system/beta/whitelist?release_id=<release_id>`
2. feedback 快照：
- `GET /v1/system/beta/feedback?release_id=<release_id>`
3. cohort 指标 / 导出：
- `GET /v1/system/beta/cohort/metrics?release_id=<release_id>`
- `GET /v1/system/beta/cohort/export?release_id=<release_id>`
- `GET /v1/system/beta/cohort/export?release_id=<release_id>&format=csv`
4. provider / release 状态快照：
- `GET /v1/system/health/providers`
- `GET /v1/system/release/metrics`
5. 如需观察 analytics 是否有埋点进入，可补充：
- `GET /v1/analytics/summary`

注意：
1. `analytics summary` 仍只适合做埋点健康检查。
2. 正式 beta KPI 应优先以 cohort metrics / export 接口为准。

### 5.2 Phase B: External Closed Beta
当前最小可执行收集包：
1. 继续保留 whitelist 快照。
2. external beta 全量反馈统一落外部表单与 `SUP-*` case。
3. internal API feedback 只统计 internal / operated beta，不与外部 learner 反馈混算。
4. 若要在 Phase B 给出正式 activation / retention 结论，必须先补齐第 6 节中的至少一条能力。

## 6. 在 GA-12 前必须补的最小能力
以下能力当前已完成前两条；若要正式签署 activation / retention，部署侧仍应启用持久化 analytics：

### 6.1 推荐方案：持久化 analytics events
状态：Completed in code，待环境启用

目标：
1. 把 `analyticsEvents` 从 `InMemoryStore` 升级为 SQLite / Postgres 持久化。
2. 保留至少：
- `user_id`
- `event_type`
- `platform`
- `skill`
- `created_at`
- `metadata`

优点：
1. 与当前 release whitelist / feedback 的持久化层保持一致。
2. 能直接支持 cohort / retention / activation 查询。

### 6.2 备选方案：增加 admin 级 cohort export 接口
状态：Completed in code

目标：
1. 新增按 `release_id` 导出的 beta cohort metrics / raw evidence 管理接口。

优点：
1. 对 beta 运营最直接。

限制：
1. 若 analytics 仍然只在内存中，跨重启证据链仍不稳定。

### 6.3 临时方案：每日离线落盘
目标：
1. 在 beta 期间定时把 analytics 原始事件以 append-only JSON / CSV 导出到受控目录。

限制：
1. 这只能作为临时证据链，不能代替正式产品化报表。
2. 仍需保证导出与 whitelist / release_id 的映射规则。

## 7. 建议提取顺序
1. 先固定 beta `release_id`。
2. 启用 `ANALYTICS_STORAGE_BACKEND=postgres` 并完成一次写入验证。
3. 每日导出 whitelist、feedback 与 cohort CSV 快照。
4. `/v1/analytics/summary` 仅作为埋点健康检查补充，不替代 cohort KPI。

## 8. 对 Beta Plan 的影响
1. `Beta-Plan.md` 中的 KPI 定义继续保留。
2. activation / retention / week1 completion / first mock completion 现在已经有仓库内导出入口。
3. 但若 analytics 未启用持久化，仍不能把跨重启结果当作正式签署证据。
4. 当前能正式签署的 beta evidence 主要包括：
- 邀请人数
- feedback 数量与严重级别
- activation / D7 / week1 / first mock 导出结果
- unresolved critical / high SLA
- provider / release 稳定性状态

## 9. 当前结论
1. beta cohort 指标定义现在已经冻结。
2. `analytics persistence + cohort export` 已经在代码层落成。
3. 当前剩余 blocker 更偏向部署侧是否启用持久化 analytics，以及 beta client 分发与外部满意度证据。
