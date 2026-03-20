# Compliance Launch Checklist（合规上线检查清单）

## 1. 目的
1. 作为 `GA-08` 的首个正式产物，基于当前代码与文档，梳理上线前必须补齐的隐私、协议、数据保留/删除、第三方处理方与版权事项。
2. 把“代码里已经支持的能力”和“上线文案、法务签署、真实外部供应商信息仍缺失的事项”分开记录，避免把工程能力误当成合规完成。
3. 为后续隐私政策、用户协议、数据保留/删除策略和 `GA Go / No-Go` 提供输入基线。

## 2. 适用范围（截至 2026-03-14）
1. 适用于当前仓库已实现的学员端、后台端、分析与运营能力。
2. 默认联合以下文档一起使用：
- `docs/PRD-IELTS-AI-App.md`
- `docs/PRD-Appendix-IA-Data-API.md`
- `docs/architecture/Technical-Architecture.md`
- `docs/engineering/GA-Scope-Freeze.md`
- `docs/engineering/Production-Environment-Matrix.md`
3. 本文是“上线前合规检查清单”，不是可直接对外发布的隐私政策或用户协议正文。

## 3. 当前判断
1. 当前产品阶段仍是 `RC / pre-GA`。
2. 当前商业与合规成熟度仍应判断为 `中低`。
3. 当前仓库已具备的合规基础能力：
- 账号注销申请与确认删除链路已实现。
- 删除后会话撤销已实现。
- 后台高风险操作审计已实现。
- 后台报表导出脱敏已实现。
- 提醒订阅/退订与点击追踪已实现。
4. 当前仍未完成的合规阻断项：
- 虽已新增隐私政策、用户协议、数据保留/删除策略草案，但仍未形成正式签署版。
- 虽已冻结首发支付渠道为 `Stripe + Alipay`，并补支付 runtime config、webhook 验签/时间窗和只读 runtime summary，但 finance/legal signoff、真实回调地址、secret manager 与正式对外文案仍待联合签署。
- 虽已冻结首发主 AI provider 为 `OpenAI`、首发 fallback 默认关闭，并补 AI provider registry/runtime config 与只读 runtime summary，但数据处理边界、region/DPA、故障切换与密钥托管方案仍待签署。
- 统一用户数据导出接口已实现为 `GET /v1/users/me/export`（JSON 附件），但导出格式边界、客服代办 SOP 与对外文案仍需校对。
- 数据删除 SLA、保留期限例外和审计/分析留存边界已补成 `docs/legal/Deletion-Exceptions-SLA-Draft.md`，但尚未签署。
- 未成年人提示、版权授权台账与合规签署记录已补草案/模板，但尚未填入正式内容并联签。

## 4. 代码对齐的数据面清单
| data area | current repo evidence | current user-facing capability | current gap |
|---|---|---|---|
| 账号身份数据 | `auth.ts` 支持 `email/phone/password/display_name` 注册登录；`types.ts` 定义 `email/phone/displayName/passwordHash` | 用户可注册、登录、登出、查看基本 profile | 未见对外隐私说明文案，未见第三方登录真实接入 |
| 会话与设备数据 | `types.ts` 定义 `refreshTokenHash/deviceId/ipAddress/userAgent/expiresAt` | 用户可刷新会话、登出、删除账号后会话撤销 | 未见会话保留时长对外披露文案 |
| 学习目标与计划 | `GoalProfile`、`AssessmentJob`、`StudyPlan`、PRD 附录中的目标/诊断/计划实体 | 用户可完成 onboarding、诊断和计划生成 | 未见对外说明这些学习画像如何用于个性化推荐 |
| 训练与反馈数据 | `practice_sessions.raw_input`、写作评估、口语会话、模考报告、重练档案 | 用户可获得反馈、复评、模考报告 | 未见对外说明训练内容、转写文本、AI 反馈的使用边界 |
| 订阅与支付数据 | `subscription-service.ts` 已定义 order / entitlement / webhook，并新增 `PAYMENT_*` runtime config、`x-ielts-signature/x-ielts-timestamp` 验签与 `/v1/system/payments/runtime` | 用户可升级、取消、恢复订阅；后台可做权益校正；ops 可查看当前 provider runtime 摘要 | 首发渠道已冻结为 `Stripe + Alipay`，但真实回调地址、正式退款政策、财务/法务签署仍待完成 |
| 提醒与分析数据 | `analytics/events/batch`、`reminder`、`churn` 路由与服务 | 用户可订阅/退订提醒，系统可记录行为事件与提醒点击 | 未见单独的用户事件导出/关闭策略说明 |
| 审计与后台报表 | `admin/audit-logs`、`admin/reports/export`、测试覆盖脱敏下载 | 后台可追踪高风险操作与下载记录 | 需要在合规文案中明确审计日志的留存目的与期限 |
| AI provider 观测数据 | `provider-health-service.ts` 已支持 `LLM_PRIMARY_* / LLM_FALLBACK_*` runtime registry，并在 `/v1/system/health/providers` 返回 `runtime_config` | 当前可同时观测真实 provider 名称映射、fallback 是否启用、endpoint/api key 是否已配置 | 首发主 provider 已冻结为 `OpenAI`、首发 fallback 默认关闭；数据出境/处理边界、密钥托管和正式文案仍待签署 |

## 5. 用户权利与当前实现状态
### 5.1 已实现
| right | repo evidence | current status |
|---|---|---|
| 登录后查看账户基础状态 | `GET /v1/users/me/profile` | Ready |
| 下载个人数据副本 | `GET /v1/users/me/export` | Ready（JSON 附件） |
| 登出并废弃令牌 | `POST /v1/auth/logout` | Ready |
| 发起注销申请 | `POST /v1/users/me/deletion-request` | Ready |
| 确认删除账号 | `POST /v1/users/me/delete` + `confirm_text=DELETE` | Ready |
| 删除后撤销既有会话 | `account.deletion.test.ts` 覆盖 | Ready |
| 退订学习提醒 | `PUT /v1/reminders/preferences` | Ready |

### 5.2 部分实现或仍缺失
| right | current state | judgement |
|---|---|---|
| 用户数据导出格式与代办流程 | 当前已提供 `GET /v1/users/me/export` 返回 JSON 附件；尚未提供 CSV/ZIP 与客服代导出 SOP | Partial |
| 用户资料更正 | 当前未见完整的用户资料编辑/更正策略文案；只有部分学习设置与提醒偏好可改 | Partial |
| 删除时限承诺 | 删除动作已实现，但未见对外 SLA 小时数或法务口径 | Partial |
| 删除例外说明 | 未见“支付/审计/风控日志可依法保留”的正式说明文档 | Missing |

关键结论：
1. 当前代码已经支持“删除动作发生”和“用户数据导出”。
2. 当前还不能宣称“用户权利说明已完整上线”，因为保留期限、删除例外、客服流程和法务文案仍缺最终签署。

## 6. 数据删除与保留基线
### 6.1 已知实现
1. `account-service.ts` 会在删除账号时清理目标、计划、练习、口语、写作、模考、权益、订单、事件、提醒与流失分析等用户域数据。
2. 删除动作会追加 `deletion_requested` 与 `user_deleted` 审计事件。
3. 删除后用户邮箱、手机号、显示名会被清空，密码哈希会被替换，既有会话会被撤销。

### 6.2 已知保留/归档目标
来自 `Technical-Architecture.md` 与 `Database-Schema-Draft.md` 的现有基线：
1. `analytics_events` 明细保留 `12 个月`。
2. 训练会话热数据保留 `180 天` 后归档。
3. 支付与审计日志长期保留。
4. 默认采用 `soft delete`，高敏表按需物理删除。

### 6.3 当前缺口
1. `Database-Schema-Draft.md` 已明确写出“数据删除合规 SLA 当前仅定义机制，未写具体小时数”。
2. 当前账号删除实现中，未见对 `analytics events` 和 `audit logs` 的显式清理逻辑，因此需要在策略文档中明确：
- 哪些日志依法保留
- 保留多久
- 是否做不可逆脱敏或去标识化
3. 未见正式的 backup 中删除传播策略，即“用户删除后，历史备份何时自然过期或如何处置”。

## 7. 第三方处理方与外部依赖
### 7.1 支付
1. 当前代码允许的 provider 枚举为 `mockpay`、`stripe`、`alipay`。
2. 当前仓库已补 `PAYMENT_PROVIDER_DEFAULT`、`PAYMENT_*_WEBHOOK_SECRET[_FILE]`、`PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS` 等 runtime 入口，并在 `POST /v1/payments/webhooks/provider` 中启用签名与 replay window 校验。
3. 当前仓库已补 `GET /v1/system/payments/runtime` 作为非密钥 runtime 摘要接口，但仍不能认定“真实支付合规材料已完成”。

### 7.2 AI / LLM
1. 当前仓库已补 `LLM_PRIMARY_*`、`LLM_FALLBACK_*`、`LLM_ALLOW_USER_CONTENT_LOGGING` runtime 入口，并将 provider health 的抽象别名映射为真实 provider 名称。
2. `GET /v1/system/health/providers` 现可返回 runtime registry：provider 名称、是否启用 fallback、endpoint/api key 是否已配置、data region、timeout。
3. 因此当前可以认定“AI provider runtime 冻结入口已存在”，但隐私政策中关于 AI 处理方、数据用途、模型回退和日志保留的描述仍无最终签署版。

### 7.3 身份登录
1. PRD 目标包含手机号、邮箱、第三方登录（Apple / Google / 微信其一按地区策略接入）。
2. 当前代码实际已实现的是邮箱/手机号 + 密码注册登录。
3. 合规文案必须以“当前真实实现”为准，不应提前写入尚未接入的第三方身份供应商。

## 8. 上线前检查项
| id | item | current status | repo evidence | launch judgement |
|---|---|---|---|---|
| C-01 | 隐私政策首版 | Draft | `docs/legal/Privacy-Policy-Draft.md` | Blocking until signed off |
| C-02 | 用户协议首版 | Draft | `docs/legal/Terms-of-Service-Draft.md` | Blocking until signed off |
| C-03 | 数据保留/删除策略首版 | Draft | `docs/legal/Data-Retention-Deletion-Policy.md` | Blocking until signed off |
| C-04 | 账号注销与删除链路 | Ready | `account.ts`、`account-service.ts`、`account.deletion.test.ts` | Pass with policy gap |
| C-05 | 用户数据导出能力 | Ready | `GET /v1/users/me/export`（JSON 附件） | Pass with format/SOP gap |
| C-06 | 删除 SLA 与删除例外说明 | Draft | `docs/legal/Deletion-Exceptions-SLA-Draft.md` | Blocking until signed off |
| C-07 | 审计日志与报表脱敏 | Partial | `admin/reports/export` 与测试已覆盖脱敏下载 | 仍需文案与 retention 规则 |
| C-08 | 支付渠道、退款与验签说明 | Partial | 已有 `docs/engineering/Refund-Commitment-FAQ.md`，并补 `PAYMENT_*` runtime config、webhook HMAC 校验、时间窗 replay guard、`GET /v1/system/payments/runtime`；首发渠道冻结为 `Stripe + Alipay`，退款 handling 为 `manual_review` | Blocking until finance/legal signoff |
| C-09 | AI provider 与数据处理说明 | Partial | 已补 `LLM_PRIMARY_* / LLM_FALLBACK_*` runtime config，`/v1/system/health/providers` 可返回 runtime registry；首发主 provider 冻结为 `OpenAI`，fallback 默认关闭 | Blocking until legal/security signoff |
| C-10 | 未成年人/监护提示 | Draft | `docs/legal/Minor-Guardian-Notice-Draft.md` | Blocking until policy/product decision |
| C-11 | 题库版权来源留档 | Draft | `docs/tracking/templates/content-copyright-ledger-template.csv` | Blocking until filled and approved |
| C-12 | 合规签署记录 | Draft | `docs/tracking/templates/compliance-signoff-record-template.md` + `docs/engineering/Provider-Secret-Signoff-Checklist.md` | Blocking until signed off |

## 9. 最先可开始做的事
1. `docs/legal/Privacy-Policy-Draft.md`、`docs/legal/Terms-of-Service-Draft.md`、`docs/legal/Data-Retention-Deletion-Policy.md` 已落为内部评审草案。
2. 已补最小可用统一导出入口；下一步是把 `GET /v1/users/me/export` 的 JSON 格式边界、客服代办话术与法务文案对齐。
3. 支付 runtime config、webhook 验签和 replay guard 已落到代码；首发真实支付渠道已冻结为 `Stripe + Alipay`，下一步是补齐回调地址、客服/财务口径和法务签署。
4. AI provider registry/runtime config 已落到代码；首发主 provider 已冻结为 `OpenAI` 且 fallback 默认关闭，下一步是补齐数据处理边界、日志保留边界和密钥托管签署材料。
5. 明确删除例外与保留时长：
- 审计日志保留多久
- 支付记录保留多久
- 分析事件保留多久
- 备份中删除数据如何自然出清
6. 用 `docs/engineering/Provider-Secret-Signoff-Checklist.md` 补齐 Stripe / Alipay / OpenAI 的 callback、secret manager、region/DPA 和 owner。
7. 用 `docs/engineering/GA-Compliance-Signoff-Packet.md` 作为联签会议统一入口，再在 `docs/tracking/templates/compliance-signoff-record-template.md` 中记录最终结论。

## 10. 当前结论
1. 当前仓库已经具备“部分合规能力基础”，尤其是删除、审计、脱敏和提醒退订。
2. 当前还不具备“可正式上线的合规签署状态”，因为正式文案、保留策略、删除例外和联签记录仍未完成。
3. `GA-08` 现在已经从“只有检查清单”推进到“有代码级 runtime 冻结入口 + 已冻结首发供应商 + 用户导出入口 + 文档草案”，下一步必须完成联签与删除/保留策略签署。
