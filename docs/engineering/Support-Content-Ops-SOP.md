# Support & Content Ops SOP（GA-13）

## 1. 目的
1. 作为 `GA-13` 的首个正式产物，明确当前仓库在 `RC / pre-GA` 阶段可执行的客服与内容运营流程。
2. 把“后台已经支持的运营动作”和“仍然需要人工兜底或后续开发的缺口”分开记录，避免按不存在的能力承诺用户。
3. 为 `GA-14` 总演练和 `GA-15` Go / No-Go 决策提供运营侧基线。

## 2. 当前适用范围（截至 2026-03-13）
1. 当前实际可操作基线来自：
- `apps/server/src/routes/admin.ts`
- `apps/server/src/domain/admin-service.ts`
- `apps/server/src/domain/admin-ops-service.ts`
- `apps/server/src/routes/account.ts`
- `apps/server/src/domain/account-service.ts`
- `apps/server/src/routes/system.ts`
- `apps/server/src/domain/release-service.ts`
2. 当前阶段仍是 `RC / pre-GA`，本 SOP 适用于：
- 内部支持
- 内容审核与发布
- 邀请制 beta 运营
- 订单与权益纠偏
3. 本 SOP 不代表以下能力已经上线：
- 后台改密码
- 后台直接删号
- 后台直接退款
- learner 自助 beta 反馈闭环

## 3. 角色与职责映射
| role | current permission focus | current operational responsibility |
|---|---|---|
| `super_admin` | 全量后台权限 | 紧急兜底、跨域审批、发布与高风险处置 |
| `finance` | `orders:read` `entitlement:adjust` `entitlement:rollback` `coupon:manage` `audit:read` | 订单核查、优惠券、权益补偿、回滚与对账 |
| `ops` | `orders:read` `users:manage` `content:publish` `audit:read` `release:manage` | 当前实际承担一线支持、账号冻结解冻、内容运营、发布协同 |
| `system ops/admin` | `beta:read` `beta:manage` 等 system 权限 | beta 白名单、beta 反馈分诊与升级 |

当前结论：
1. 当前仓库没有独立的 `support` 角色。
2. 当前一线支持职责实际上落在 `ops`。
3. beta 运营权限与普通 learner 权限仍未解耦，当前更适合 `internal / operated beta`。
4. 当前角色级值班分工已冻结在 `docs/engineering/Support-OnCall-Ownership-Matrix.md`。

## 4. 当前已具备的运营动作
### 4.1 账号与用户
1. 查询用户列表与状态：`GET /v1/admin/users`
2. 冻结用户：`POST /v1/admin/users/{user_id}/freeze`
3. 解冻用户：`POST /v1/admin/users/{user_id}/unfreeze`
4. 用户自助发起删除请求：`POST /v1/users/me/deletion-request`
5. 用户自助执行彻底删除：`POST /v1/users/me/delete`

### 4.2 订单、优惠券与权益
1. 查询订单：`GET /v1/admin/orders`
2. 查询优惠券：`GET /v1/admin/coupons`
3. 创建或更新优惠券：`PUT /v1/admin/coupons/{coupon_code}`
4. 手工权益纠偏或回滚：`POST /v1/admin/entitlements/{user_id}/adjust`

### 4.3 内容运营
1. 批量导入题库：`POST /v1/admin/content/import/batches`
2. 回滚导入批次：`POST /v1/admin/content/import/batches/{batch_id}/rollback`
3. 查询内容列表：`GET /v1/admin/content/items`
4. 审核内容：`POST /v1/admin/content/items/{item_id}/review`
5. 发布内容：`POST /v1/admin/content/items/{item_id}/publish`
6. 下线内容：`POST /v1/admin/content/items/{item_id}/unpublish`

### 4.4 审计、复核与报表
1. 高风险双人复核：`POST /v1/admin/reviews` 与 approve/reject 流程
2. 查询审计日志：`GET /v1/admin/audit-logs`
3. 导出运营/业务报表：`POST /v1/admin/reports/export`
4. 下载报表：`GET /v1/admin/reports/exports/{export_id}/download`

### 4.5 Beta 运营
1. 写入 beta 白名单：`PUT /v1/system/beta/whitelist/{user_id}`
2. 查询 beta 白名单：`GET /v1/system/beta/whitelist`
3. 查询 beta 反馈：`GET /v1/system/beta/feedback`
4. 提升 beta 反馈优先级：`POST /v1/system/beta/feedback/{feedback_id}/escalate`

## 5. 受理分级与升级规则
| level | example | handler | escalation |
|---|---|---|---|
| `P0` | 大面积无法登录、发布事故、数据错乱、持续 red 告警 | `ops + super_admin` | 立即切到 `Production-Incident-Runbook` 与部署回滚 runbook |
| `P1` | 单用户权益错配、订单状态异常、错误内容已发布 | `ops` / `finance` | `2` 小时内定责，必要时走双人复核 |
| `P2` | 单个内容修正、优惠券配置错误、非阻断反馈 | `ops` / `finance` | 当日处理，纳入审计与日报 |
| `P3` | 咨询类问题、beta 使用建议、非阻断体验反馈 | `ops` | 汇总到 beta / 产品反馈池 |

升级规则：
1. 一旦判断为系统性问题，不继续按客服单处理，直接切到 `docs/engineering/Production-Incident-Runbook.md`。
2. 一旦涉及发布面处置或快速回退，直接联动 `docs/engineering/Production-Deploy-Rollback-Runbook.md`。
3. 一旦涉及高风险人工改权、冻结争议或内容上线争议，优先走双人复核，而不是单人直接操作。

## 6. 账号与访问支持 SOP
### 6.1 登录失败 / 账号不可用
1. 先确认用户标识：邮箱、手机号、发生时间、设备与版本。
2. 使用 `GET /v1/admin/users` 按 `email` 或 `phone` 查询用户状态。
3. 按状态分流：
- `active`: 当前后台无法改密码，也未见密码重置入口。支持只能确认账号存在，并把“密码错误 / 登录失败”转为产品或工程协查，不要擅自创建重复账号。
- `frozen`: 核对冻结原因与审计记录；确认应恢复后，用 `POST /v1/admin/users/{user_id}/unfreeze` 解冻，并记录 reason。
- `pending_deletion`: 明确告知用户账号已进入删除流程，先不要再做补权或改绑操作。
- `deleted`: 当前没有后台恢复或反删路径，只能按新用户重新注册处理。
4. 如同一时间出现多用户登录异常，按 `P0` 进入 incident 流程，不再作为单个工单排查。

### 6.2 冻结 / 解冻策略
1. 紧急止损可直接执行冻结。
2. 非紧急争议场景优先走 `user_freeze` 双人复核，避免一线支持单人误冻。
3. 冻结后会撤销当前会话；解冻不会自动恢复历史会话，需让用户重新登录。
4. 每次冻结与解冻都必须填写可审计 reason，禁止使用“处理一下”之类无效描述。

### 6.3 删号与删除请求
1. 当前删号是用户自助链路，不是后台操作链路。
2. 支持可以做的事只有：
- 查询用户当前状态
- 解释 `pending_deletion` / `deleted` 的含义
- 提醒用户在登录态下自行执行删除动作
3. 当前后台不能做的事：
- 代用户直接执行删除
- 恢复已删除账号
- 只删部分个人数据而保留账号
4. 因此凡是“人工代删”“误删恢复”“定向删除某类数据”的诉求，都需要先登记异常，再由产品/工程决定是否补能力，不应口头承诺。

## 7. 订单、权益与退款 SOP
### 7.1 订单核查
1. 使用 `GET /v1/admin/orders` 按 `user_id` 或 `status` 查询。
2. 核对字段：
- `provider`
- `status`
- `payable_amount_cny`
- `paid_amount_cny`
- `refunded_amount_cny`
- `provider_order_id`
3. 如用户反馈“已支付未到账”，先查订单状态，再查 entitlement 是否同步。

### 7.2 权益纠偏
1. 如订单状态已正确，但权益未生效，可由 `finance` 或 `super_admin` 使用 `POST /v1/admin/entitlements/{user_id}/adjust` 纠偏。
2. 每次纠偏都必须带 reason，并保留 adjustment 记录。
3. 如发现纠偏错误，必须通过 `rollback_of_adjustment_id` 做显式回滚，不允许口头抵消。
4. 涉及大额补偿、批量补偿或争议案例时，优先走 `entitlement_adjust` 双人复核。

### 7.3 优惠券问题
1. 先用 `GET /v1/admin/coupons` 查询券状态、折扣值、适用计划和时间窗。
2. 配置错误由 `finance` 用 `PUT /v1/admin/coupons/{coupon_code}` 修正。
3. 已发出的错误优惠券造成损失时，不要直接修改订单历史，统一走“记录原因 + 优惠券修正 + 必要时权益补偿”的组合方案。

### 7.4 退款口径
1. 当前仓库没有后台直接发起退款的 admin API。
2. 当前支付侧虽然仍保留 `mockpay / stripe / alipay` provider 枚举，但首发正式渠道已冻结为 `stripe + alipay`，且验签、回放防护与退款 `manual_review` 基线已落地。
3. 因此当前支持口径只能是：
- 先记录退款诉求和订单证据
- 由 `finance + eng` 线下确认真实退款动作
- 退款状态变更以支付侧事实为准，不在后台控制台中口头改账
4. 即使支付方案已冻结，也不要承诺“后台可即时退款”。
5. 标准对外话术与禁说列表统一使用 `docs/engineering/Refund-Commitment-FAQ.md`。

## 8. Beta 支持与反馈 SOP
1. 当前 beta 更适合 `internal / operated beta`，不是公开 learner beta。
2. 当前可执行动作：
- 用 whitelist API 管理 beta 人员
- 用 feedback query / escalate 做分诊
- 对 `high` / `critical` 反馈升级优先级并进入值班处理
3. 当前限制必须明确：
- `POST /v1/system/beta/feedback` 需要 `beta:manage`
- 默认 learner 没有 `beta:manage`
- 当前接口也不支持“ops 代 learner 以原用户身份录入反馈”
4. 当前已正式冻结决策：外部 beta 反馈先走外部表单或客服台账，再由运营单独跟踪，不应伪装成已打通 in-app learner 提报。
5. 该决策的正式记录见 `docs/engineering/Beta-Feedback-Channel-Decision.md`。
6. 若出现 `critical` beta 反馈或同类问题密集出现，直接切 incident / rollback 流程。

## 9. 内容运营 SOP
### 9.1 导入
1. 批量导入前先确认 `template_version` 与题目 payload 完整。
2. 对大批量或高风险导入，建议开启 `atomic`，避免半成功半失败留下不一致状态。
3. 导入失败时优先看：
- 空标题
- `question_count` 非正整数
- 同 `title + skill` 重复

### 9.2 审核与发布
1. 内容导入后默认进入 `draft + pending review`。
2. `POST /v1/admin/content/items/{item_id}/review` 在 `approve` 时默认会自动发布，除非显式传 `auto_publish=false`。
3. 因此日常流程建议：
- 先审核
- 对高风险内容使用 `content_publish` 双人复核
- 需要分时发布时，用 `approve + auto_publish=false`，再由值班窗口手动发布
4. 未经 `approved` 的内容不能直接发布。

### 9.3 回滚与下线
1. 已发布错误内容先用 `POST /v1/admin/content/items/{item_id}/unpublish` 下线。
2. 导入批次回滚仅适用于尚未发布的导入条目；已发布条目不能直接做 batch rollback。
3. 因此发布后发现问题的标准动作是：
- 先下线
- 再修正内容
- 再重新审核 / 发布
4. `simulate_failure` 只用于演练发布失败回滚，不用于真实生产操作。

## 10. 审计与报表 SOP
1. 所有关键人工动作都应优先使用已有后台接口，避免绕过审计。
2. 查询审计日志时至少带一个过滤条件：
- `type`
- `user_id`
- `actor_admin_user_id`
3. 运营报表与业务报表导出后需要注意：
- 导出字段已做脱敏
- 下载次数会被再次审计
- 导出文件适合复盘与对账，不适合当作“实时数据库替代品”
4. 事故复盘、补偿争议和内容误发复盘，统一引用导出的报表与 audit log，不接受仅靠口头回忆定责。

## 11. 当前缺口与 No-Go 提醒
1. 没有独立 support 角色，`ops` 目前同时承担支持、内容和发布职责，GA 后容易出现排班冲突。
2. 没有后台改密码能力，登录类支持仍存在人工缝隙。
3. 没有后台删号能力，删除请求只能走用户自助链路。
4. 没有后台退款能力，真实退款仍依赖 finance + 支付渠道人工审核。
5. learner beta feedback 权限模型未成型，外部 beta 证据链仍不完整。

## 12. 最先可开始做的事
1. 值班分工已冻结到 `docs/engineering/Support-OnCall-Ownership-Matrix.md`。
2. 先使用 `docs/tracking/templates/support-case-intake-template.md` 作为外部客服台账模板，承接当前不能直接在系统内完成的退款、删号异常和 learner beta 反馈。
3. 外部 learner beta 反馈路径已冻结为外部表单 + 内部分诊，正式记录见 `docs/engineering/Beta-Feedback-Channel-Decision.md`。
4. 退款承诺口径已冻结在 `docs/engineering/Refund-Commitment-FAQ.md`。
