# Refund Commitment FAQ（GA-09 / GA-13）

## 1. 目的
1. 冻结 GA 前客服、运营与财务对“退款相关问题”的对外口径。
2. 明确当前仓库能做什么、不能做什么，避免支持误把 mock / contract 能力说成已上线的正式退款能力。
3. 作为 `Support-Content-Ops-SOP` 与 `Compliance-Launch-Checklist` 的配套文档使用。

## 2. 当前事实（截至 2026-03-14）
1. 当前后台已具备：
- `GET /v1/admin/orders` 查询订单
- `POST /v1/admin/entitlements/{user_id}/adjust` 纠偏权益
- `rollback_of_adjustment_id` 回滚错误补偿
2. 当前支付域已具备：
- `mockpay` / `stripe` / `alipay` provider 枚举
- 通用 webhook 合约与订单状态 `paid / failed / refunded`
- `PAYMENT_*` runtime config、`x-ielts-signature` / `x-ielts-timestamp` 验签与 replay guard
- `GET /v1/system/payments/runtime` 只读 runtime 摘要
 - 首发正式支付渠道冻结为 `stripe + alipay`
 - 退款 handling 固定为 `manual_review`
3. 当前仍未具备：
- admin 直接发起退款 API
- 系统自动退款能力
- 正式对外退款 SLA 与固定到账承诺

## 3. 总口径
### 3.1 可以说
1. “我们已收到你的退款 / 订单问题，会先核对支付记录与权益状态。”
2. “当前退款结论以实际支付渠道记录为准，我们会在核对后给你明确结果。”
3. “如果是权益未到账或到账错误，我们可以先走人工核查与权益纠偏。”

### 3.2 不能说
1. “后台现在可以直接给你退款。”
2. “我们已经系统自动退款了。”
3. “今天一定到账。”
4. “删号后会自动退款。”

## 4. 标准处理链
| stage | owner | action |
|---|---|---|
| 受理 | `L1-OPS` | 建 `SUP-*` case，收集订单号、支付渠道、时间、金额、截图 |
| 核账 | `L2-FINANCE` | 用 `GET /v1/admin/orders` 核对 `status`、`paid_amount_cny`、`refunded_amount_cny` |
| 纠偏 | `L2-FINANCE` / `L3-SUPERADMIN` | 如支付事实成立但权益异常，走 entitlement adjust / rollback |
| 例外升级 | `L3-SUPERADMIN` + eng | 如支付记录冲突、重复扣款争议或 provider 状态异常，走人工升级 |
| 收口 | `L1-OPS` | 向用户回告“已处理 / 待支付渠道确认 / 已补偿权益” |

## 5. 常见场景 FAQ
### 5.1 用户说“我付费了，但会员没到账”
标准答复：
1. “我们先帮你核对订单状态和权益状态。”
2. “如果支付记录已成功但权益没同步，我们会先做人工纠偏。”

内部动作：
1. `L1-OPS` 收订单号与截图。
2. `L2-FINANCE` 查订单状态。
3. 如订单已 `paid` 但权益未生效，用 entitlement adjust 修复。

### 5.2 用户说“我想退款”
标准答复：
1. “我们已经受理退款诉求，会先核对支付渠道记录和订单状态。”
2. “当前退款结果与到账时间以实际支付渠道处理结果为准，我们核对后再给你明确结论。”

内部动作：
1. 不承诺后台即时退款。
2. finance 核对订单与支付事实。
3. 如需要真实退款动作，由 finance 按 `Stripe / Alipay` 实际支付渠道线下处理。

### 5.3 用户说“我重复支付了”
标准答复：
1. “我们先核对是否存在重复订单或重复扣款记录。”
2. “确认后会给你退款或权益处理方案。”

内部动作：
1. 查同用户同时间窗口内的多个 order。
2. 若一个已生效、另一个异常，优先保护用户权益，再由 finance 确认退款路径。

### 5.4 用户说“我取消订阅了，为什么没退款”
标准答复：
1. “取消续费不等于自动退款，我们先核对订单和订阅状态，再说明可处理方案。”

内部事实：
1. 当前代码有 `cancelSubscription` / `resumeSubscription`，但没有“取消即自动退款”的后台动作。
2. 因此不能把取消订阅描述成退款完成。

### 5.5 用户说“我删号了，请把钱一起退了”
标准答复：
1. “账号删除与退款是两条不同流程，删号本身不会自动触发退款。”
2. “我们会把退款诉求单独受理并核对支付记录。”

内部事实：
1. 当前删号是用户自助链路。
2. 当前删号实现不会自动发起 payment refund。

### 5.6 用户说“优惠券有问题，请把差价退给我”
标准答复：
1. “我们先核对优惠券配置与订单金额。”
2. “确认配置错误后，会给出补偿或退款处理结论。”

内部动作：
1. finance 查 coupon 规则。
2. 如为配置错误，优先走优惠券修正 + 权益补偿。
3. 是否真实退款，仍以 finance 核账与支付渠道处理为准。

## 6. 对外统一文案
推荐短版：
1. “已收到你的退款 / 支付问题，我们会先核对订单与支付记录，再给你处理结果。当前到账时间以实际支付渠道处理结果为准。”

推荐长版：
1. “我们已经受理你的退款 / 支付问题。当前系统支持我们先核对订单状态、支付金额和会员权益状态；如涉及真实退款，仍需以实际支付渠道的处理结果为准。我们会在核对完成后给你明确结论，请不要以口头承诺或删号操作视为退款已完成。”

## 7. 当前 No-Go 边界
1. 即使首发支付渠道已冻结为 `Stripe + Alipay`，任何“即时退款”“系统自动退款”“固定到账 SLA”的对外承诺仍视为越界。
2. 如出现支付大面积异常、重复扣款集中爆发或 webhook 状态冲突，直接升级到 incident / release 处理链。

## 8. 与现有文档关系
1. 客服与内容运营标准动作：`docs/engineering/Support-Content-Ops-SOP.md`
2. 值班责任链：`docs/engineering/Support-OnCall-Ownership-Matrix.md`
3. 合规上线检查：`docs/engineering/Compliance-Launch-Checklist.md`
4. 受理模板：`docs/tracking/templates/support-case-intake-template.md`

## 9. 当前结论
1. 第 3 个最先动作已经执行完成。
2. 现在退款口径已经冻结为“先核账、再确认、到账以支付渠道事实为准”。
3. 即使支付方案已冻结为 `Stripe + Alipay`，支持团队仍只能承诺受理和核对，不能承诺后台即时退款。
