# Launch Fast Track Plan（快速上线冲刺计划）

## 1. 目的
1. 将当前仓库从“工程上接近可发布”推进到“可受控上线”的最后一公里工作收敛成一份执行计划。
2. 只讨论最后阻断项，不重复主功能开发盘点。
3. 明确区分 `controlled-release candidate` 与 `formal GA-ready`，避免错误承诺上线状态。

## 2. 当前判断（截至 2026-03-20）
1. 当前整体状态仍应判断为 `RC / pre-GA`，而不是 `formal GA-ready`。
2. 功能成熟度与工程成熟度已经较高，剩余工作主要不是补主功能，而是生产化、联签、真实环境验证与上线演练。
3. 最快可达目标应定义为：
- `Web 同域受控上线 / 小流量灰度`
- 不是应用商店公开发版
- 不是多平台同步正式发布
4. 若 owner、生产平台权限、法务/财务/运维资源当天就位，最快约 `5 ~ 7` 个工作日可推进到 `controlled-release candidate`。
5. 若要达到 `formal GA-ready`，仍需补齐 beta 结果、真实发布前总演练与最终 Go / No-Go 决策包，通常不应承诺在同一快车道窗口内完成。

## 3. 上线目标分级
| level | 含义 | 当前可达性 | 备注 |
|---|---|---|---|
| `review-ready` | 材料基本齐，可开联签会 | 已接近 | 仍不代表可上线 |
| `controlled-release candidate` | 可受控上线、可灰度、可小流量放量 | 最快目标 | 需要联签、真实生产配置、部署/恢复演练、真实支付闭环 |
| `formal GA-ready` | 满足仓库中的最严格正式发布定义 | 非最快路径 | 还需要 beta、总演练、Go / No-Go 决策包 |

## 4. 最后阻断点总表
| id | blocker | 为什么现在仍阻断上线 | owner | 需要的证据 | 退出标准 | 依赖 | 最快周期 |
|---|---|---|---|---|---|---|---|
| B-01 | 合规与商业联签未完成 | 隐私、协议、删除/保留、版权、供应商材料仍有 `Draft`，不能直接对外发布 | product + legal + finance + security | 已定稿政策、版权台账、联签记录、供应商签署清单 | 各角色给出 `Agree` 或可执行的 `Conditional`，且有 owner | 无 | `1 ~ 2` 天 |
| B-02 | 真实生产配置未落地 | callback URL、secret manager、OpenAI region / DPA、运行时冻结值仍未在真实目标环境验证 | ops + backend + security | provider dashboard 截图、secret manager 路径、运行时校验结果 | `/v1/system/payments/runtime` 与 `/v1/system/health/providers` 与冻结值一致 | B-01 可并行 | `1 ~ 2` 天 |
| B-03 | 生产式部署 / 回滚 / 恢复演练未完成 | 现有 runbook 偏手册式，尚未在 production-like 环境形成真实 drill 证据 | ops + backend + release manager | drill record、回滚记录、backup evidence manifest、RTO/RPO 计时 | 至少一次 production-like drill 通过，结论达到 `PASS-WITH-GAPS` 或更高，且 gap 不阻断发布 | B-02 | `1` 天 |
| B-04 | 真实支付与人工退款闭环未完成 | 代码支持不等于线上可收款；仍缺真实回调、核账、退款受理与客服路径验证 | finance + backend + ops + support | 低风险真实或等效沙箱验证记录、退款受理记录、客服 FAQ、finance 核账口径 | 证明 `order -> webhook -> entitlement -> refund/manual_review` 可执行 | B-02 | `1` 天 |
| B-05 | 受控上线窗口与值班编排未冻结 | 即使技术可发，没有 release owner、on-call、静态宿主同步与回退路径，仍不应放量 | ops + release manager + support | 窗口计划、on-call 排班、静态资源同步/切回说明、No-Go 条件 | 可执行的放量窗口、回退责任人、24h 观察规则全部明确 | B-03,B-04 | `0.5 ~ 1` 天 |
| B-06 | 严格 GA 额外要求未完成 | beta、总演练、Go / No-Go 包尚未闭环，因此不能宣称正式 GA | product + growth + release manager | beta 复盘、GA 总演练记录、最终决策包 | `GA-12`、`GA-14`、`GA-15` 全部完成 | B-01~B-05 | `2 ~ 3` 周或更长 |

## 5. 今天就要锁定的前提
1. 发布目标锁定为 `同域 Web 受控上线`，不把应用商店、多平台分发纳入本轮。
2. 指定一名 `release manager`，统一拉 owner、排窗口、管 No-Go。
3. 生产平台权限必须当天就位：
- 静态宿主 / CDN / 反向代理
- 服务端宿主机或平台
- Postgres 托管平台
- Stripe / Alipay 控制台
- OpenAI / secret manager / 法务存档
4. 上线范围冻结为当前首发口径：
- 支付：`Stripe + Alipay`
- 退款：`manual_review`
- AI：`OpenAI`
- fallback：`disabled on day-1`
5. 若上述权限或 owner 无法在今天就位，`5 ~ 7` 个工作日目标应自动顺延。

## 6. 按 Owner 的收口动作
### 6.1 Product / Release
1. 冻结首发范围、延后项、已知问题接受边界。
2. 明确本轮仅承诺 `controlled release`，不对外宣称 `GA-ready`。
3. 拉起联签会，确保所有 `Conditional` 条件都有 owner 与截至时间。

### 6.2 Backend / Engineering
1. 在目标环境显式配置所有 `*_STORAGE_BACKEND=postgres`，禁止依赖默认回退链。
2. 在生产或 production-like 环境校验 `/health`、`/v1/system/payments/runtime`、`/v1/system/health/providers`。
3. 配合完成真实支付回调、退款路径、部署/回滚/恢复 drill。

### 6.3 Ops
1. 落地静态资源同步、反向代理、server 启停、日志路径、健康检查与上一版本切回。
2. 配置数据库备份、恢复路径、PITR 或等效能力，并输出证据。
3. 安排上线窗口、on-call 值班、事故升级路径和 24h 观察机制。

### 6.4 Legal / Security
1. 定稿隐私政策、用户协议、删除/保留策略、未成年人提示与供应商处理边界。
2. 完成 OpenAI DPA / ToS / region / retention 审阅。
3. 完成 secret manager、rotation owner、break-glass owner 签署。

### 6.5 Finance / Support
1. 完成 Stripe / Alipay 的低风险真实或等效验证。
2. 对齐退款受理、人工审核、财务核账与客服 FAQ。
3. 形成上线首周的支付异常处理口径。

## 7. 7 天快车道计划
| day | 目标 | 关键动作 | 当天产出 | No-Go 条件 |
|---|---|---|---|---|
| D1 | 锁定目标与 owner | 冻结首发范围；拉起联签；补齐 `Provider-Secret-Signoff-Checklist` 待填字段 | owner 表、缺口清单、联签议程 | 没有 release manager；没有生产平台权限 |
| D2 | 落地真实生产配置 | 配置 callback URL、secret manager、OpenAI endpoint/region；核对 runtime 冻结值 | 配置证据、runtime 截图或响应存档 | callback/secret 仍停留在草案 |
| D3 | 完成部署/回滚/恢复 drill | 执行 production-like deploy、rollback、backup/restore drill，记录 RTO/RPO | drill record、backup evidence manifest、gap list | drill 无法完成；回滚不可执行；RTO/RPO 无记录 |
| D4 | 跑通支付与退款闭环 | 低风险真实或等效沙箱验证订单、webhook、权益、manual_review 退款；同步客服/财务 SOP | 支付验证记录、退款路径记录、客服 FAQ | 无法证明真实链路可执行 |
| D5 | 补上线运营托底 | 冻结上线窗口、on-call、事故升级路径；演练静态资源同步与快速切回 | 值班表、窗口计划、静态宿主回退说明 | 无 24h 值班；静态宿主无法回退 |
| D6 | 发起小流量受控上线 | 仅放量到受控人群或小流量入口；严格观察 health、provider、payments、release metrics | 首轮受控发布记录、观察面板 | 出现 P0/P1、持续 `red`、支付异常 |
| D7 | 做扩量或暂缓决策 | 汇总首日数据、异常、退款/客服情况；决定继续灰度还是保持受控 | Go / Hold / Rollback 决策记录 | 关键指标恶化；出现未关闭 critical issue |

## 8. 哪些可以压缩，哪些不能跳过
### 8.1 为了尽快达到 `controlled-release candidate`，可以压缩
1. 不做公开 beta。
2. 不做应用商店发版。
3. 不把多平台统一上线纳入同一窗口。
4. 不等待完整 `formal GA` 决策包。

### 8.2 但以下事项不能跳过
1. 合规与供应商联签。
2. 真实 callback / secret / runtime 配置验证。
3. 至少一次 production-like deploy / rollback / recovery drill。
4. 至少一次真实支付或等效高可信验证 + 人工退款闭环。
5. 上线窗口、on-call 和回滚责任人明确。

## 9. 受控上线与严格 GA 的差异
| 维度 | 受控上线 | 严格 GA |
|---|---|---|
| 分发范围 | 小流量、邀请制、灰度 | 正式公开发布 |
| beta 结果 | 可作为后续补充，不是本轮硬门槛 | 必须完成并复盘 |
| 发布演练 | 至少一次 production-like drill | 还需真实发布前总演练 |
| 决策材料 | 轻量 Go / Hold / Rollback 记录即可 | 必须形成正式 Go / No-Go 决策包 |
| 对外表述 | `controlled release` / `limited availability` | `GA-ready` / 正式上线 |

## 10. 推荐结论
1. 当前不应再把“补功能”当成主任务，主战场已经是上线执行。
2. 最快且最稳妥的路径，是先冲到 `同域 Web 受控上线候选`，再用小流量灰度换取真实运营证据。
3. 若业务必须对外宣称“正式 GA”，则应明确追加 `GA-12`、`GA-14`、`GA-15`，不要把受控上线包装成正式 GA。

## 11. 相关文档
1. `docs/engineering/GA-Release-Blockers-Shortlist.md`
2. `docs/engineering/GA-Readiness-Checklist.md`
3. `docs/engineering/Production-Environment-Matrix.md`
4. `docs/engineering/Production-Deploy-Rollback-Runbook.md`
5. `docs/engineering/Production-Database-Backup-Recovery-Runbook.md`
6. `docs/engineering/Provider-Secret-Signoff-Checklist.md`
7. `docs/engineering/Compliance-Launch-Checklist.md`
8. `docs/engineering/Beta-Plan.md`
9. `docs/engineering/Launch-Execution-Tracker.md`
