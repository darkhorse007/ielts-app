# 数据保留与删除策略草案（Draft for Review）

## 文档信息
- 版本: v0.2
- 状态: Draft for Review
- 创建日期: 2026-03-14
- 适用范围: 当前 `IELTS AI App` GA 候选版本
- 说明: 本文用于内部评审，基于当前架构文档、数据草案和已实现删除能力整理；在法务、产品、工程和运维完成联合签署前，不得直接作为外部正式政策发布。

## 1. 目的
1. 明确当前系统中各类数据的保留目的、当前工程基线、删除路径和例外情况。
2. 区分“仓库中已有的工程实现”与“正式对外承诺的保留期限”，避免误把架构目标当作已签署政策。
3. 为隐私政策、用户协议、账号删除能力、备份管理和 `GA Go / No-Go` 提供统一口径。

## 2. 当前原则
1. 只保留提供服务、履行法定义务、保障安全和审计追溯所必要的数据。
2. 用户域数据在删除后应尽量从在线主存储中清理。
3. 审计、安全、支付与备份数据可能因合法目的保留更久，但必须有明确边界。
4. 正式对外承诺前，所有保留时长都必须先经过法务、产品、工程和运维联合确认。

## 3. 当前工程基线与数据分类
| data category | examples | current repo evidence | current engineering baseline | current deletion state |
|---|---|---|---|---|
| 账号基础数据 | 邮箱、手机号、显示名、密码哈希 | `auth.ts`、`types.ts`、`account-service.ts` | 在线主存储保留，账号删除时清空或替换敏感字段 | Ready |
| 会话与设备数据 | refresh token hash、device_id、ip、user-agent | `types.ts`、`auth.ts` | 按会话生命周期保留 | 删除账号时撤销会话 |
| 学习目标与计划 | goal profile、assessment、study plan | `account-service.ts` 清理对应集合 | 随服务运行保留 | 删除账号时清理 |
| 训练与反馈数据 | practice、speaking、writing、retry、mock report | `account-service.ts` 中有显式删除逻辑 | 当前无独立归档策略文档 | 删除账号时大部分清理 |
| 订阅与订单数据 | entitlement、order、subscription events | `subscription-service.ts`、`account-service.ts`、`PAYMENT_*` runtime config、webhook 验签与 replay guard | 首发渠道冻结为 `Stripe + Alipay`，退款 handling 为 `manual_review`；业务运行与财务合规需要保留 | 当前删除账号时会清理在线数据，但正式政策未签署 |
| 行为分析数据 | analytics events、reminder/churn 输入 | `Technical-Architecture.md`、`analytics-service.ts` | 架构草案写明 `analytics_events` 明细保留 `12 个月` | 当前账号删除未见显式逐条清理逻辑 |
| 审计数据 | admin audit、system audit、report download audit | `admin/audit-logs`、导出测试、`types.ts` audit event | 架构草案写明支付与审计日志长期保留 | 当前账号删除不清理审计日志 |
| 支付与退款数据 | paid/refunded order state、provider order id | `subscription-service.ts`、`/v1/system/payments/runtime` | 当前已具备 runtime 入口、验签和 replay guard 骨架，渠道已冻结为 `Stripe + Alipay`，但正式留存要求仍待签署 | 仍需正式规则 |
| 备份与恢复数据 | DB backup、snapshot、PITR 记录 | 已有 runbook，并新增 `scripts/backup-evidence-manifest.mjs` 生成恢复证据 manifest | 证据沉淀已标准化，但备份编排仍依赖平台侧 | Partial |

## 4. 当前可引用的保留目标
以下内容来自现有架构/数据文档，可作为“当前工程基线”，但不能直接视为最终法务承诺：

1. `analytics_events` 明细保留 `12 个月`。
2. 训练会话热数据保留 `180 天` 后归档。
3. 支付与审计日志长期保留。
4. 默认采用 `soft delete`，高敏表按需物理删除。

## 5. 账号删除的当前实现
### 5.1 已实现的删除路径
当前用户可以：

1. 调用 `POST /v1/users/me/deletion-request` 发起注销申请。
2. 调用 `POST /v1/users/me/delete` 并提交 `confirm_text=DELETE` 完成删除。

### 5.2 删除时当前会发生的动作
根据 `account-service.ts`，当前删除动作会：

1. 撤销该用户的既有会话。
2. 清空邮箱、手机号、显示名，并替换密码哈希。
3. 清理目标、计划、诊断、练习、口语、写作、模考、权益、订单、订阅事件、提醒偏好、提醒建议、流失分析等用户域数据。
4. 记录 `deletion_requested` 与 `user_deleted` 审计事件。

### 5.3 当前尚未覆盖或需单独说明的部分
1. `analytics events` 未见与用户删除同步逐条清理的实现。
2. `audit logs` 未见与用户删除同步清理的实现。
3. 备份中的历史数据出清机制尚未形成正式策略。

## 6. 建议保留矩阵（待签署）
下表为当前最适合进入评审的保留矩阵，正式上线前必须将 `proposed policy` 列签署为最终口径。

| data category | purpose | current engineering baseline | proposed policy | open issue |
|---|---|---|---|---|
| 账号基础数据 | 登录、识别、账号管理 | 删除账号时清空/替换 | 删除完成后在线主存储不再保留可直接识别信息 | 需确认是否保留最小化审计映射 |
| 会话与设备数据 | 安全、登录控制 | 随会话生命周期存在 | 过期或撤销后按安全窗口清理 | 需明确安全窗口时长 |
| 学习与训练数据 | 提供学习服务 | 在线保存；删除账号时清理 | 删除后从在线主存储移除，备份按周期自然过期 | 需明确备份过期窗口 |
| 订单与支付数据 | 对账、退款、财务合规 | 首发渠道冻结为 `Stripe + Alipay`，退款 handling=`manual_review` | 依法律和财务要求保留，不随普通删除立即清空 | 需完成正式法务口径与保留期限签署 |
| 行为分析数据 | 统计、运营分析、提醒优化 | `12 个月` 工程基线 | 保留期限待签署，可考虑保留聚合数据、删除直接标识 | 需决定是否做去标识化 |
| 审计日志 | 安全、追责、风控、合规 | 长期保留工程基线 | 按合法目的保留，不向普通用户直接删除 | 需明确外部披露用语 |
| 提醒推荐数据 | 个性化提醒 | 在线保存 | 用户退订后不再下发；删除账号时清理在线数据 | 需明确历史点击保留窗口 |
| 备份数据 | 容灾恢复 | 缺正式编排 | 不支持逐份即时删除，按备份生命周期自然出清 | 需正式写入 runbook/policy |

## 7. 删除例外（待正式确认）
以下数据类型很可能不能与普通用户域数据同步“即时彻底删除”，正式发布前必须明确写入对外文案：

1. 支付订单、退款、财务对账相关记录。
2. 审计日志、安全日志和风控追踪记录。
3. 为履行法定义务、争议处理或监管要求而必须保留的记录。
4. 已写入备份或灾备副本、但将在备份生命周期结束后自然出清的数据。

## 8. 用户权利边界
### 8.1 当前已支持
1. 发起注销申请。
2. 获取当前账户范围内的 JSON 数据副本：`GET /v1/users/me/export`。
3. 确认删除账号。
4. 登出并撤销当前会话。
5. 退订学习提醒。

### 8.2 当前仍缺失或待定
1. 对外明确的删除完成时限。
2. 分析数据与审计数据在用户删除后的处理说明。
3. 非 JSON 格式导出、副本代办流程与客服/法务文案。

关键结论：
1. 当前可以证明“删除能力存在”。
2. 当前还不能证明“完整的数据主体权利与保留规则已正式对外可发布”。

## 9. 备份与恢复口径
1. 当前仓库已有数据库备份/恢复 runbook，并新增 `backup_recovery_evidence` manifest 脚本，但尚未见正式 backup / restore / PITR 编排脚本。
2. 正式上线前必须明确：
- 备份频率
- 备份 retention
- 备份加密
- 删除数据在备份中的自然出清方式
- 恢复演练后的数据访问限制
3. 在正式策略成稿前，不应承诺“备份内数据可即时逐份删除”。

## 10. 当前发布阻断项
在以下事项完成前，本文不能转为正式发布版：

1. 需冻结删除 SLA 并与产品实际能力保持一致。
2. 需完成用户数据导出 JSON 能力、格式边界与客服话术的最终校对。
3. 需完成分析日志、审计日志、支付记录和备份的保留期限与删除例外签署。
4. 真实支付渠道、退款规则和法定留存要求已冻结。
5. 需将备份策略与自然出清窗口写入正式 runbook 与运维基线，并以 evidence manifest 留痕。
