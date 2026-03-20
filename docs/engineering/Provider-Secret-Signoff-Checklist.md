# Provider / Secret Signoff Checklist（GA-08 / GA-09 / GA-07）

## 文档信息
- 版本: v0.1
- 状态: Draft for Review
- 创建日期: 2026-03-14
- 适用范围: 当前 `IELTS AI App` 首发生产冻结口径
- 说明: 本文用于把“供应商名单已冻结”推进到“真实回调地址、secret manager、DPA/法务与安全联签可执行”。未签署前不得视为正式 production signoff。

## 1. 目的
1. 把首发供应商冻结值、生产回调地址、密钥来源和签署责任归并到一张清单。
2. 避免出现“文档说已冻结，但生产环境 secret / callback / region 仍无人负责”的空档。
3. 为 `GA-07`、`GA-08`、`GA-09` 和最终 `GA Go / No-Go` 提供统一签署入口。

## 2. 当前已冻结口径
1. 支付渠道: `Stripe + Alipay`
2. 退款 handling: `manual_review`
3. 主 AI provider: `OpenAI`
4. 首发 fallback: `disabled`
5. 用户数据导出: `GET /v1/users/me/export`（JSON 附件）

## 3. 供应商与密钥落地清单
| area | provider / secret | current runtime entry | production value to fill | data / purpose | owner | must-have evidence | current status |
|---|---|---|---|---|---|---|---|
| Auth signing | `AUTH_SECRET` / `AUTH_SECRET_FILE` | `apps/server` startup | `[secret manager path / mounted file]` | access token 签名与校验 | backend + security + ops | secret manager 截图 / 挂载路径 / rotation owner | Draft |
| Payment | Stripe webhook secret | `PAYMENT_STRIPE_WEBHOOK_SECRET[_FILE]` | `[待填写]` | Stripe 回调验签 | finance + backend + ops | live webhook endpoint、secret 存储位置、回放窗口配置 | Draft |
| Payment | Alipay webhook secret | `PAYMENT_ALIPAY_WEBHOOK_SECRET[_FILE]` | `[待填写]` | 支付宝回调验签 | finance + backend + ops | live callback 地址、secret 存储位置、验签材料 | Draft |
| Payment | Default provider | `PAYMENT_PROVIDER_DEFAULT` | `alipay` | 首发支付默认下单渠道 | product + finance + backend | 支付页口径、对账说明、客服 FAQ | Frozen, pending signoff |
| Payment | Stripe callback URL | webhook path=`/v1/payments/webhooks/provider` | `[待填写，例如 https://<host>/v1/payments/webhooks/provider]` | 接收 Stripe 状态回调 | finance + ops + backend | provider dashboard 配置截图 | Draft |
| Payment | Alipay callback URL | webhook path=`/v1/payments/webhooks/provider` | `[待填写，例如 https://<host>/v1/payments/webhooks/provider]` | 接收支付宝状态回调 | finance + ops + backend | provider dashboard 配置截图 | Draft |
| AI | OpenAI endpoint | `LLM_PRIMARY_ENDPOINT` | `[待填写]` | AI 评分、反馈、计划生成 | backend + security + legal + ops | endpoint、region、network egress 控制 | Draft |
| AI | OpenAI API key | `LLM_PRIMARY_API_KEY[_FILE]` | `[secret manager path / mounted file]` | OpenAI 调用鉴权 | backend + security + ops | secret manager 截图、rotation owner、break-glass owner | Draft |
| AI | OpenAI DPA / ToS | 仓库外法务材料 | `[待填写]` | 数据处理合法性 | legal + security | DPA/ToS 链接、版本、签署日期 | Draft |
| AI | Fallback policy | `LLM_FALLBACK_ENABLED=false` | `disabled on day-1` | 避免未签署 fallback 先行启用 | product + backend + legal | 发布说明、incident 例外流程 | Frozen, pending signoff |

## 4. 上线前逐项检查
1. 所有 production secret 必须来自 secret manager 或受控文件挂载，不能写入 `.env` 或镜像层。
2. `AUTH_SECRET`、`PAYMENT_*_WEBHOOK_SECRET`、`LLM_PRIMARY_API_KEY` 都必须有 rotation owner 和 last-verified date。
3. 支付回调地址必须在 Stripe / Alipay 平台实际配置，并与 `docs/engineering/Refund-Commitment-FAQ.md` 口径一致。
4. `/v1/system/payments/runtime` 中所有启用 live provider 必须满足 `webhook_secret_configured=true`。
5. `/v1/system/health/providers` 必须能反映 `OpenAI` 为主 provider，且 fallback 为 `disabled`。
6. 任何 production 变更若偏离本文冻结值，必须先更新变更单与 runbook，再执行发布。

## 5. 证据挂载建议
| evidence type | expected location |
|---|---|
| secret manager / mount screenshot | `[内部密码平台 / 工单链接]` |
| Stripe dashboard callback config | `[内部 wiki / 工单链接]` |
| Alipay callback config | `[内部 wiki / 工单链接]` |
| OpenAI DPA / ToS / region note | `[法务存档 / 合同编号]` |
| production runtime check result | `/v1/system/payments/runtime`、`/v1/system/health/providers` 响应存档 |
| release evidence | `REL-*` summary JSON + `docs/tracking/releases.md` |

## 6. 开放问题
1. Stripe 与 Alipay 首发是双活可选，还是前台只展示默认渠道 `alipay`、Stripe 作为灰度后备，仍需产品确认对外展示策略。
2. `OpenAI` 的 production region、日志最小化和 prompt retention 口径仍需 legal/security 联签。
3. break-glass 操作是否允许临时改用 fallback provider，仍需 incident 与 legal 联签。

## 7. 签署记录
| role | name | decision | signed_at | note |
|---|---|---|---|---|
| product | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| finance | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| legal | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| security | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| backend | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| ops | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
