# GA Compliance Signoff Packet（GA-08 / GA-09 / GA-15）

## 文档信息
- 版本: v0.1
- 状态: Ready for Internal Review
- 创建日期: 2026-03-14
- 适用范围: 当前 `IELTS AI App` 首发 GA 候选版本
- 说明: 本文不是最终对外政策，而是一次合规联签会议的统一入口。目标是让 product / legal / finance / security / backend / ops 在同一份材料上完成 review、补证和签署。

## 1. 本包解决什么问题
1. 把已经冻结的首发决策和仍待签署的 gap 放在一个入口，避免会前到处找文档。
2. 明确每个 blocker 的 owner、证据入口和会议内需要做出的决策。
3. 为 `GA-15` 的最终 Go / No-Go 决策提供可追溯的合规输入。

## 2. 当前已冻结的首发决策
1. 支付渠道: `Stripe + Alipay`
2. 退款 handling: `manual_review`
3. 主 AI provider: `OpenAI`
4. 首发 fallback: `disabled`
5. 用户数据导出: `GET /v1/users/me/export`（JSON 附件）

## 3. 本次联签必须产出的结论
| topic | must decide | target output | owner |
|---|---|---|---|
| 支付/退款 | 是否认可 `Stripe + Alipay + manual_review` 作为首发口径 | callback、secret、客服/财务话术、留存说明 | product + finance + legal + backend + ops |
| AI/provider | 是否认可 `OpenAI` 主 provider、fallback 关闭、数据处理边界 | endpoint/region、DPA、日志边界、incident 例外策略 | legal + security + backend + ops |
| 数据权利 | 是否认可 JSON 导出、删除例外与处理时效表述 | 对外文案、客服边界、删除例外说明 | product + legal + ops |
| 未成年人 | 首发是否默认不面向未成年人 | 提示文案与产品策略 | product + legal + design + ops |
| 版权 | 首发内容是否具备授权台账 | 版权台账与法务审批 | content + legal |

## 4. 会前必读材料
### 4.1 主清单
1. `docs/engineering/Compliance-Launch-Checklist.md`
2. `docs/engineering/Provider-Secret-Signoff-Checklist.md`
3. `docs/tracking/templates/compliance-signoff-record-template.md`

### 4.2 法务草案
1. `docs/legal/Privacy-Policy-Draft.md`
2. `docs/legal/Terms-of-Service-Draft.md`
3. `docs/legal/Data-Retention-Deletion-Policy.md`
4. `docs/legal/Deletion-Exceptions-SLA-Draft.md`
5. `docs/legal/Minor-Guardian-Notice-Draft.md`

### 4.3 配套证据
1. `docs/engineering/Refund-Commitment-FAQ.md`
2. `docs/engineering/Production-Environment-Matrix.md`
3. `docs/tracking/releases.md` 中 `REL-070`、`REL-071`
4. `docs/tracking/templates/content-copyright-ledger-template.csv`

## 5. 会前需要先填完的字段
| doc | field group | must be filled before meeting |
|---|---|---|
| `Provider-Secret-Signoff-Checklist.md` | Stripe / Alipay callback URL、secret manager path、OpenAI endpoint/region/DPA | Yes |
| `Deletion-Exceptions-SLA-Draft.md` | 删除例外保留口径、客服代办范围、备份自然出清窗口 | Yes |
| `content-copyright-ledger-template.csv` | 首发内容清单至少一版样例 | Yes |
| `compliance-signoff-record-template.md` | signoff_id、release_id、owner、当前 result 初始值 | Yes |

## 6. 建议会议顺序
1. 先确认本文第 2 节的冻结值是否仍保持不变；若变，会议先终止并回到 scope/change control。
2. 过一遍 `Compliance-Launch-Checklist.md` 的 `C-06 ~ C-12`，确认哪些 blocker 可以从 `Draft` 推到 `Approved`。
3. 过 `Provider-Secret-Signoff-Checklist.md`，确认 callback / secret / DPA / fallback 例外策略。
4. 过 `Deletion-Exceptions-SLA-Draft.md` 和三份法务草案，确认用户可见文案。
5. 过未成年人提示和版权台账，决定首发策略是“补齐上线”还是“明确不纳入首发对象”。
6. 最后在 `compliance-signoff-record-template.md` 里写最终决议、条件与未通过项。

## 7. 会后必须更新的仓库文件
1. `docs/engineering/Compliance-Launch-Checklist.md`
2. `docs/legal/Privacy-Policy-Draft.md`
3. `docs/legal/Terms-of-Service-Draft.md`
4. `docs/legal/Data-Retention-Deletion-Policy.md`
5. `docs/tracking/risk-register.csv`
6. `docs/tracking/activity-log.csv`
7. 如通过联签，补充最终签署记录到 `docs/tracking/templates/compliance-signoff-record-template.md` 的实例副本

## 8. 当前还不能跳过的真实 blocker
1. Stripe / Alipay 的真实 callback 地址和 secret manager 路径尚未填实。
2. OpenAI 的 region / DPA / 日志边界尚未填实。
3. 删除例外保留期限与备份自然出清窗口尚未定稿。
4. 首发内容版权台账尚未填实。
5. 未成年人策略尚未做产品层最终决策。

## 9. 推荐的最小联签产物
1. 一份已填写完成的 `compliance-signoff-record`
2. 一份已填写完成的 provider / secret checklist
3. 一份首发内容版权台账
4. 一组已修正到可发布状态的法务文案
5. 一条回写到 `risk-register.csv` 与 `activity-log.csv` 的联签记录
