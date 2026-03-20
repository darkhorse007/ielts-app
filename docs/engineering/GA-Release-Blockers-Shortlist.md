# GA Release Blockers Shortlist（最短阻断清单）

## 1. 这张清单回答什么问题
1. 回答“把当前待填信息补完后，是否就进入可发布阶段”。
2. 只列最短阻断项，不重复大而全的 GA 工作面。
3. 明确区分 `review-ready`、`controlled-release candidate`、`formal GA-ready` 三个状态。

## 2. 当前状态边界
### 2.1 只把待填字段补完
结论：`review-ready`

说明：
1. 代表材料已经齐，能开联签会。
2. 不代表已经完成联签。
3. 不代表生产环境已落地。
4. 不代表可以正式发布。

### 2.2 完成联签 + 生产落地 + 演练 + 真实支付验证
结论：`controlled-release candidate`

说明：
1. 代表已经接近“可受控发布 / 可灰度 / 可小流量上线”。
2. 若还没有 beta 结果与最终 Go / No-Go 决策包，不应宣称 `formal GA-ready`。

### 2.3 完成 beta / 总演练 / Go-NoGo 决策
结论：`formal GA-ready`

说明：
1. 这是当前仓库中最严格的“正式可发布”定义。
2. 对应 `GA-12`、`GA-14`、`GA-15` 都闭环。

## 3. 最短阻断清单
### B-01 合规联签完成
必须完成：
1. 填完并签署 `docs/tracking/signoffs/COMPLIANCE-20260314-001.md`
2. 填完并签署 `docs/engineering/Provider-Secret-Signoff-Checklist.md`
3. 定稿以下文档并消除 `Draft` blocker：
- `docs/legal/Privacy-Policy-Draft.md`
- `docs/legal/Terms-of-Service-Draft.md`
- `docs/legal/Data-Retention-Deletion-Policy.md`
- `docs/legal/Deletion-Exceptions-SLA-Draft.md`
- `docs/legal/Minor-Guardian-Notice-Draft.md`
4. 填实首发版权台账：
- `docs/tracking/templates/content-copyright-ledger-template.csv`

通过标准：
1. product / legal / finance / security / backend / ops 均有明确 `Agree` 或 `Conditional` 结论。
2. 条件项必须可执行且有 owner。

### B-02 真实生产配置落地
必须完成：
1. Stripe / Alipay callback URL 已在真实平台配置。
2. `AUTH_SECRET`、`PAYMENT_*_WEBHOOK_SECRET`、`LLM_PRIMARY_API_KEY` 已进入 secret manager 或受控挂载。
3. `OpenAI` endpoint / region / DPA / log retention 已填实。
4. `/v1/system/payments/runtime` 与 `/v1/system/health/providers` 的 runtime 输出与冻结值一致。

通过标准：
1. 能拿出真实配置证据，而不是只填草案。
2. 运行时能证明 `stripe + alipay + openai + fallback disabled` 已生效。

### B-03 生产式部署/回滚/恢复演练完成
必须完成：
1. 按 `docs/engineering/Production-Deployment-Recovery-Drill-Record.md` 执行一次 production-like drill。
2. 记录真实 `RTO / RPO`。
3. 有 backup evidence manifest、回滚记录和主链路验收记录。

通过标准：
1. 不是本地 smoke 替代。
2. 签署结果至少达到 `PASS-WITH-GAPS`，且 gap 不阻断发布。

### B-04 真实支付与人工退款闭环验证完成
必须完成：
1. 至少完成一次 Stripe / Alipay 的低风险真实或等效沙箱链路验证。
2. 验证 order -> webhook -> entitlement 生效。
3. 验证 `manual_review` 退款受理与 finance 处理路径。
4. 客服 FAQ、support intake、finance 核账口径一致。

通过标准：
1. 能证明“真实链路可执行”。
2. 不是只靠代码枚举和 mock provider。

### B-05 正式发布定义收口
严格 GA 路径还必须完成：
1. `GA-12` beta 结果
2. `GA-14` 真实发布前总演练
3. `GA-15` 最终 Go / No-Go 决策包

说明：
1. 如果这三项未完成，但前四项已完成，状态最多只能叫 `controlled-release candidate`。
2. 若业务选择跳过 beta，必须显式写成“受控发布例外”，而不是把状态写成 `GA-ready`。

## 4. 你现在最关心的直接答案
### 4.1 只把待填信息补完，够不够
不够。

### 4.2 填完并签完，再把生产 callback / secret / DPA 落地，够不够
还不完全够。

说明：
1. 这时通常可以进入 `controlled-release candidate`。
2. 但如果按当前仓库的严格口径，要成为 `formal GA-ready`，还差 beta / 总演练 / Go-NoGo。

## 5. 当前最短顺序
1. 先填 `Provider-Secret-Signoff-Checklist.md`
2. 再填 `content-copyright-ledger-template.csv`
3. 开会签 `COMPLIANCE-20260314-001.md`
4. 然后做 production-like drill
5. 然后做真实支付/退款验证
6. 最后决定走 `controlled release` 还是继续补齐到 `formal GA`
