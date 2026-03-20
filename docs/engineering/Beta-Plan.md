# Beta Plan（小规模 Beta 方案）

## 1. 目的
1. 作为 `GA-11` 的首个正式产物，定义当前仓库进入小规模 beta 前的目标、样本、阶段、指标和退出条件。
2. 把“当前仓库已经具备的 beta 运营能力”和“仍然阻断真实 beta 执行的缺口”分开记录，避免把 beta 设计误写成已可执行状态。
3. 为 `GA-12` beta 执行、`GA-15` Go / No-Go 决策和后续增长/运营准备提供统一输入。

## 2. 当前判断（截至 2026-03-14）
1. 当前产品阶段仍是 `RC / pre-GA`。
2. 当前仓库已经具备以下 beta 基础能力：
- `PUT /v1/system/beta/whitelist/{user_id}` 管理 beta 白名单
- `GET /v1/system/beta/whitelist` 查询 beta 白名单
- `POST /v1/system/beta/feedback` 提交 beta 反馈
- `GET /v1/system/beta/feedback` / `GET /v1/system/beta/feedback/{feedback_id}` 查询反馈
- `POST /v1/system/beta/feedback/{feedback_id}/escalate` 一键升级优先级
- beta whitelist / feedback / escalation 审计事件已落盘
3. 当前仓库同时存在以下 beta 执行缺口：
- `apps/client` 已具备正式 `build` / `artifact` / `publish` 脚本，但正式静态宿主同步仍需平台侧执行
- 首发支付渠道、退款 handling 与 AI 主 provider 已冻结，但 live 支付接入、法务联签与生产 secret manager 仍未完成
- 当前 beta 反馈接口要求 `beta:manage` 权限，因此更适合内部/运营型 beta，而不是普通 learner 自助提报
- satisfaction 与宿主级静态分发回退仍缺标准化闭环

结论：
1. 当前最适合先设计并准备的是“受控、邀请制、分阶段 beta”。
2. 当前更适合先做 `internal / operated beta`，而不是直接做公开用户 beta。

## 3. Beta 目标
### 3.1 核心目标
1. 验证 `注册/登录 -> onboarding -> 首次训练 -> 模考/复盘` 主链路是否能在真实用户使用中稳定跑通。
2. 验证 beta 白名单、反馈提报、反馈升级、值班和回滚链路是否可运营。
3. 收集足够的体验、稳定性和转化证据，为正式 GA 决策提供输入。

### 3.2 非目标
1. 不做公开大规模拉新。
2. 不做正式商店分发或大范围市场投放。
3. 不把 beta 当成补主功能阶段；beta 期间只允许修复阻断项和高优问题。

## 4. 当前代码可支撑的 Beta 形态
| beta shape | current status | why |
|---|---|---|
| 内部受控 beta | Can start with prep | 已有 whitelist、feedback、escalation、audit 和 runbook 基线 |
| 邀请制外部 closed beta | Partially blocked | 还缺 client 正式发布路径、live 支付/法务签署收口与 learner 反馈提报路径 |
| 公开 beta | Blocked | 当前不具备公开分发、支付、客服与合规闭环 |

## 5. 分阶段方案
### 5.1 Phase A: Internal Operational Beta
| item | plan |
|---|---|
| 目标 | 先验证 beta 运营流程、反馈闭环、主链路与 incident 响应 |
| 样本量 | `10 ~ 15` 人 |
| 样本构成 | `qa` / `ops` / `admin` / 少量内部真实使用者 |
| 时长 | `5 ~ 7` 天 |
| 渠道 | 受控环境 + 邀请制账号 |
| 反馈入口 | 当前 repo beta feedback 接口 |

说明：
1. 当前直接提交 beta 反馈的账号需要具备 `beta:manage` 权限。
2. 根据当前 `AuthService.resolveSystemRoles()` 逻辑，邮箱前缀为 `ops-` 或 `admin-` 的注册用户会自动获得对应系统角色。
3. 因此 Phase A 最适合使用内部运营/测试账号，或通过系统角色管理显式赋予受控测试用户角色。

Phase A 通过条件：
1. 所有 invited users 都能完成注册、登录与首次核心任务。
2. 没有未关闭的 `critical` beta feedback。
3. `provider health` 与 `release metrics` 未出现持续 `red`。
4. beta feedback 能完成 `open -> triaged` 的最小闭环。

### 5.2 Phase B: Closed External Beta
| item | plan |
|---|---|
| 目标 | 验证真实目标用户的完成率、留存、满意度和升级意愿 |
| 样本量 | `30 ~ 50` 人，分 `3` 波次投放 |
| 波次 | 每波 `10 ~ 15` 人，间隔 `2 ~ 3` 天 |
| 时长 | `14` 天 |
| 渠道 | 邀请制 closed beta |
| 反馈入口 | 外部表单 + 内部分诊 |

Phase B 前置条件：
1. `Phase A` 通过。
2. client 已具备正式 build / artifact / publish 方案。
3. 至少已有一条真实可交付的 beta 分发路径。
4. `GA-09` 对支付/退款/权益链路已有明确处理口径；若仍未就绪，则本阶段不以“付费转化”作为硬门槛。
5. `GA-10` on-call / incident 机制已可执行。
6. 外部 beta 反馈路径沿用 `docs/engineering/Beta-Feedback-Channel-Decision.md`，不对 learner 开放当前 in-app feedback API。

### 5.3 Phase C: Expanded Closed Beta（可选）
仅在以下条件同时满足时考虑：
1. `Phase B` 指标通过。
2. 关键高优问题已收敛。
3. 支付、客服、隐私与数据删除文案已进入可签署状态。

建议规模：
1. `50 ~ 100` 人
2. 观察周期 `14 ~ 21` 天

## 6. 样本定义
### 6.1 入选条件
1. 中国大陆雅思备考用户。
2. 目标分段以 `5.5 -> 6.5` 为主。
3. 考试时间在未来 `1 ~ 6` 个月内。
4. 愿意在 beta 周期内完成 onboarding、专项训练和至少一次模考或等效重练。

### 6.2 排除条件
1. 未成年人。
说明：当前未成年人流程与文案尚未完成。
2. 依赖正式支付/退款闭环的用户。
说明：当前虽已冻结 `Stripe + Alipay + manual_review` 口径，但 live 支付集成与法务签署尚未完成。
3. 需要公开应用商店分发的用户。
说明：当前 client 正式发布路径缺失。

## 7. 运营流程（对齐当前 Repo）
### 7.1 邀请与放量
1. 为本轮 beta 固定一个 `release_id`。
2. 使用 `PUT /v1/system/beta/whitelist/{user_id}` 将测试用户加入白名单。
3. 使用 `GET /v1/system/beta/whitelist` 复核白名单状态和版本。

### 7.2 用户反馈
1. internal / operated beta 用户通过 `POST /v1/system/beta/feedback` 提报问题。
2. external closed beta 用户通过仓库外表单提交，再由 `ops` 落入内部台账。
3. internal API 反馈会自动关联到该用户最新的 active beta whitelist release。
4. internal API 反馈字段使用当前代码定义：
- `category`: `bug` / `ux` / `performance` / `other`
- `severity`: `low` / `medium` / `high` / `critical`
- `priority`: 默认随 severity 推导
- `status`: `open` / `triaged` / `resolved`
5. 外部 beta 的正式路径与禁止事项见 `docs/engineering/Beta-Feedback-Channel-Decision.md`。

### 7.3 运营分诊
1. `ops` / `admin` 使用 `GET /v1/system/beta/feedback` 查询反馈。
2. 对高优问题使用 `POST /v1/system/beta/feedback/{feedback_id}/escalate` 升级为 `high` 或 `critical`。
3. 反馈升级后默认进入 `triaged`，并保留 `escalated_by_user_id` 和 `escalation_reason`。

### 7.4 事故处理
1. 若 beta 期间出现持续 `red` 告警或用户面影响明显，直接走：
- `docs/engineering/Production-Incident-Runbook.md`
- `docs/engineering/Production-Deploy-Rollback-Runbook.md`
2. beta 不是绕过 runbook 的理由；相反，应利用 beta 验证值班与处置机制。

## 8. 指标与证据
### 8.1 建议指标（Draft）
| metric | proposed threshold | source | note |
|---|---|---|---|
| invited_to_activation_rate | `>= 80%` | analytics + beta cohort list | 激活定义为完成注册、onboarding 并完成首个核心任务 |
| D7_retention | `>= 25%` | analytics cohort extract | 低于 PRD 90 天目标时，不建议直接推进 GA |
| week1_task_completion_rate | `>= 50%` | plan/task analytics + manual sample review | 定义为 7 天内完成至少 3 个核心任务 |
| first_mock_completion_rate | `>= 25%` | mock exam/report evidence | 若用户群尚未进入模考阶段，可用专项训练完成率替代并单独说明 |
| unresolved_critical_beta_feedback | `= 0` | beta feedback list | 任意未关闭 critical 都阻断扩大 beta |
| unresolved_high_beta_feedback_older_than_48h | `= 0` | beta feedback list | 作为运营闭环底线 |
| provider_health_red_persistence | `= 0` sustained | provider health | 持续 red 直接视为 beta blocker |
| AI_feedback_satisfaction | `>= 4.0 / 5.0` | 外部问卷或访谈记录 | 当前 repo 无专门满意度 survey API，需外部表单补充 |

### 8.2 当前指标缺口
1. 当前仓库已补 `GET /v1/system/beta/cohort/metrics` 与 `GET /v1/system/beta/cohort/export`，可导出 beta cohort retention / activation / week1 / mock 指标。
2. 当前仓库无“满意度评分”专门接口，`AI_feedback_satisfaction` 需要外部问卷或客服访谈补证。
3. 若 analytics 部署仍使用 `memory` backend，则 cohort 结果不能跨重启稳定保留；正式 beta 证据应启用持久化 analytics。
4. 指标定义、数据源、接口入口和剩余部署前提已同步到 `docs/engineering/Beta-Cohort-Metrics-Extraction-Plan.md`。

## 9. 证据留存要求
每轮 beta 至少留存以下材料：
1. beta cohort 名单与 release whitelist 快照。
2. beta feedback 导出结果与 triage 结论。
3. provider health / release metrics 的关键截图或 API 结果。
4. onboarding、专项训练、模考的主链路抽检记录。
5. 用户访谈 / 问卷摘要。
6. 期末 beta retro 与 go/no-go 建议。

## 10. 当前阻断项
1. `apps/client` 已具备正式 build / artifact / publish 流程，但外部分发仍需补宿主平台同步与回退编排。
2. 当前虽已冻结 `Stripe + Alipay + manual_review` 口径，但 live 支付与退款联签尚未闭环，因此“付费转化”目前不能作为强签署指标。
3. learner-only 用户当前没有直接提交 beta feedback 的权限模型；当前已正式冻结为“外部表单 + 内部分诊”。
4. satisfaction 仍没有仓库内标准化入口；cohort export 已具备，但部署侧仍需启用持久化 analytics。
5. 未成年人、隐私和数据删除文案仍处于草案阶段。

## 11. 最先可开始做的事
1. 先按 `Phase A` 准备一份内部 beta cohort 名单，规模控制在 `10 ~ 15` 人。
2. 先固定首个 beta `release_id`，并用 whitelist API 验证邀请/撤回流程。
3. 外部 beta 的反馈路径已冻结为 `外部表单 + 内部分诊`，不再保留 A/B 摇摆。
4. 补一个最小可用的 beta cohort 指标提取方案，否则 `GA-12` 很难形成可审证据。
5. 在宿主平台静态同步与回退流程未冻结前，不要承诺公开 beta 或大范围外测。

## 12. 当前结论
1. `GA-11` 现在已经有了可执行的设计基线。
2. 当前最现实的起点是 `internal / operated beta`，不是公开 beta。
3. 真正进入 `GA-12` 前，至少还要补齐 client 分发路径，并在 beta 环境启用持久化 analytics；外部 beta 反馈入口决策已经冻结，cohort export 能力已在 `docs/engineering/Beta-Cohort-Metrics-Extraction-Plan.md` 明确化。
