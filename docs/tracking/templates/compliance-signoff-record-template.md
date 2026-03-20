# Compliance Signoff Record Template（GA-08 / GA-09 / GA-15）

## 1. 元信息
| field | value |
|---|---|
| signoff_id | `COMPLIANCE-YYYYMMDD-001` |
| release_id | `REL-XXX` |
| scope | `privacy / terms / retention / billing / provider / minor / copyright` |
| owner | `product / legal / finance / security / ops` |
| created_at | `YYYY-MM-DD HH:mm` |
| status | `draft / in_review / conditional / approved / rejected` |

## 2. 本次待确认事项
| item | current state | decision needed | evidence link | result |
|---|---|---|---|---|
| 支付渠道与退款口径 | `Stripe + Alipay + manual_review` 已冻结 | 是否可对外发布 |  | `pending` |
| AI provider 与数据处理边界 | `OpenAI` 主 provider 已冻结 | 是否完成 legal/security signoff |  | `pending` |
| 用户数据导出 | `GET /v1/users/me/export` 已上线 | 是否认可 JSON 首发范围 |  | `pending` |
| 删除例外与保留期限 | 仅有草案 | 是否形成正式对外口径 |  | `pending` |
| 未成年人提示 | 仅有草案 | 是否纳入首发版本 |  | `pending` |
| 版权授权台账 | 模板已创建 | 是否已补齐首发内容清单 |  | `pending` |

## 3. 附件与证据
1. `docs/engineering/Compliance-Launch-Checklist.md`
2. `docs/legal/Privacy-Policy-Draft.md`
3. `docs/legal/Terms-of-Service-Draft.md`
4. `docs/legal/Data-Retention-Deletion-Policy.md`
5. `docs/legal/Deletion-Exceptions-SLA-Draft.md`
6. `docs/legal/Minor-Guardian-Notice-Draft.md`
7. `docs/engineering/Provider-Secret-Signoff-Checklist.md`
8. `docs/tracking/templates/content-copyright-ledger-template.csv`
9. `docs/tracking/releases.md`

## 4. 决议
### 4.1 Final Decision
- 决议:
- 生效范围:
- 条件:
- 未通过项:

### 4.2 Follow-up
1. 必须在发布前完成的动作:
2. 可延后到 GA 后的动作:
3. 需要同步更新的文档:
4. 需要同步更新的风险台账:

## 5. 签署
| role | name | decision | signed_at | note |
|---|---|---|---|---|
| product | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| legal | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| finance | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| security | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| backend | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
| ops | `[待填写]` | `[Agree / Conditional / Reject]` | `[待填写]` |  |
