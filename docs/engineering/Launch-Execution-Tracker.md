# Launch Execution Tracker（上线执行台账）

## 1. 目的
1. 把 `Launch-Fast-Track-Plan.md` 的策略结论转成可执行的上线作战台账。
2. 用同一份文档追踪 owner、证据、截止时间与 Go / No-Go 条件。
3. 默认目标是 `controlled-release candidate`，不是 `formal GA-ready`。

## 2. 当前冲刺窗口
| item | value |
|---|---|
| kickoff_date | `2026-03-20` |
| kickoff_day | `Friday` |
| target_decision_date | `2026-03-30` |
| target_window | `7` 个工作日 |
| target_state | `controlled-release candidate` |
| non_goal | `formal GA-ready`、公开 beta、应用商店同步发布 |
| current_status | `D1 ready to start` |

说明：
1. 这里按工作日排期，不把 `2026-03-21`、`2026-03-22` 周末计入冲刺日。
2. 若 `release manager`、生产平台权限或法务/财务 owner 在 `2026-03-20` 当天无法就位，目标日应顺延。

## 3. 指挥席位
| role | actual_owner | backup_owner | must_confirm_by | exit_criteria |
|---|---|---|---|---|
| release manager | `[待填写]` | `[待填写]` | `2026-03-20` | 能统一排窗口、定 Go / No-Go、拉齐 owner |
| product owner | `[待填写]` | `[待填写]` | `2026-03-20` | 冻结首发范围、延后项和已知问题接受边界 |
| backend owner | `[待填写]` | `[待填写]` | `2026-03-20` | 能完成 runtime 配置核对、支付链路验证与 drill 配合 |
| ops owner | `[待填写]` | `[待填写]` | `2026-03-20` | 能完成宿主平台、静态同步、回退、值班与恢复演练 |
| legal owner | `[待填写]` | `[待填写]` | `2026-03-20` | 能完成隐私、协议、删除/保留、供应商文案签署 |
| security owner | `[待填写]` | `[待填写]` | `2026-03-20` | 能完成 secret / DPA / region / break-glass 签署 |
| finance owner | `[待填写]` | `[待填写]` | `2026-03-20` | 能完成支付、退款、核账路径确认 |
| support or ops on duty | `[待填写]` | `[待填写]` | `2026-03-26` | 能承接上线首周支付、账号、内容与 beta 异常 |

## 4. Blocker Matrix
| blocker_id | blocker | actual_owner | status | hard_due | required_evidence | next_action | no_go_if_missing |
|---|---|---|---|---|---|---|---|
| B-01 | 合规与商业联签完成 | `[待填写]` | `Not Started` | `2026-03-23` | 已定稿法务文案、版权台账、signoff record、provider signoff checklist | 准备联签会并填完会前字段 | `2026-03-23` 结束仍无联签结论 |
| B-02 | 真实生产配置落地 | `[待填写]` | `Not Started` | `2026-03-23` | callback 配置截图、secret manager 路径、runtime 校验结果 | 在目标环境配置并固化 Stripe / Alipay / OpenAI 真实值 | runtime 与冻结值不一致 |
| B-03 | 生产式部署 / 回滚 / 恢复 drill | `[待填写]` | `Not Started` | `2026-03-24` | drill record、rollback record、backup evidence manifest、RTO/RPO | 执行 production-like drill 并留下计时证据 | 没有真实 drill 或 rollback 不可执行 |
| B-04 | 真实支付与人工退款闭环 | `[待填写]` | `Not Started` | `2026-03-25` | 订单、webhook、权益、manual_review 退款验证记录 | 跑低风险真实或等效高可信链路 | 无法证明支付闭环可执行 |
| B-05 | 上线窗口、值班、静态回退编排 | `[待填写]` | `Not Started` | `2026-03-26` | on-call 表、窗口计划、静态同步与切回说明 | 冻结上线窗口、观察机制、回退责任人 | 没有值班或静态回退路径 |
| B-06 | 严格 GA 额外要求 | `[待填写]` | `Out of Scope for This Sprint` | `TBD` | beta 结果、总演练、正式 Go / No-Go 包 | 受控上线后再推进 | 若业务要求对外宣称正式 GA |

## 5. 冲刺日历
| day | date | must_finish | primary_output |
|---|---|---|---|
| D1 | `2026-03-20` | 锁定目标、owner、平台权限、会前字段 | owner 表、访问权确认、联签议程 |
| D2 | `2026-03-23` | 完成 callback、secret manager、runtime 冻结值落地 | provider config evidence、runtime 存档 |
| D3 | `2026-03-24` | 完成 deploy / rollback / backup / restore drill | drill record、backup evidence manifest、gap list |
| D4 | `2026-03-25` | 完成支付、webhook、权益、退款闭环验证 | payment validation record、refund handling record |
| D5 | `2026-03-26` | 完成窗口、值班、静态资源同步 / 切回方案 | 上线窗口、on-call 表、static rollback note |
| D6 | `2026-03-27` | 小流量受控上线并观测 | release record、监控观察结果 |
| D7 | `2026-03-30` | 输出 Go / Hold / Rollback 决策 | 决策记录、扩量或维持受控的下一步 |

## 6. D1 Immediate Checklist（2026-03-20）
| item | owner | expected_output | status |
|---|---|---|---|
| 指定 `release manager` | `[待填写]` | owner 名单冻结 | `Not Started` |
| 确认本轮目标仅为 `controlled release` | `[待填写]` | 范围声明 | `Not Started` |
| 确认平台访问权限 | `[待填写]` | 静态宿主 / server / Postgres / Stripe / Alipay / OpenAI / secret manager 访问清单 | `Not Started` |
| 选定 production-like 环境名 | `[待填写]` | `env_name` 与 `drill_id` 命名 | `Not Started` |
| 补齐 `Provider-Secret-Signoff-Checklist.md` 待填字段 | `[待填写]` | callback、secret path、endpoint、region、DPA | `Not Started` |
| 确认沿用还是新建合规 signoff 实例 | `[待填写]` | `COMPLIANCE-*` 实例路径 | `Not Started` |
| 敲定联签会议时间 | `[待填写]` | 会议邀请 / 议程 | `Not Started` |
| 锁定本轮 release 标识 | `[待填写]` | `REL-*` 或等效窗口编号 | `Not Started` |

## 7. 证据挂载表
| evidence | path | owner | needed_by | status |
|---|---|---|---|---|
| 快车道策略基线 | `docs/engineering/Launch-Fast-Track-Plan.md` | release manager | D1 | `Ready` |
| 执行台账 | `docs/engineering/Launch-Execution-Tracker.md` | release manager | D1 | `Ready` |
| 合规联签包 | `docs/engineering/GA-Compliance-Signoff-Packet.md` | legal + product | D1 | `Ready` |
| 合规 signoff 实例 | `docs/tracking/signoffs/COMPLIANCE-20260314-001.md` 或新实例 | legal + release manager | D1 | `Draft` |
| provider / secret 联签清单 | `docs/engineering/Provider-Secret-Signoff-Checklist.md` | ops + backend + security | D2 | `Draft` |
| 部署与恢复 drill 记录 | `docs/engineering/Production-Deployment-Recovery-Drill-Record.md` | ops + backend | D3 | `Template Ready` |
| 上线运维 SOP | `docs/engineering/Support-Content-Ops-SOP.md` | ops | D5 | `Ready` |
| 风险台账 | `docs/tracking/risk-register.csv` | release manager | D7 | `Ready` |
| 活动日志 | `docs/tracking/activity-log.csv` | release manager | D1-D7 | `Ready` |

## 8. Final Go / No-Go Gates
1. 若 `2026-03-23` 结束时 `B-01` 或 `B-02` 未完成，本轮不进入 drill。
2. 若 `2026-03-24` 结束时 `B-03` 未完成或 rollback 无法执行，本轮不进入小流量上线。
3. 若 `2026-03-25` 结束时 `B-04` 未完成，本轮不开放真实支付。
4. 若 `2026-03-26` 结束时 `B-05` 未完成，本轮不进入受控上线窗口。
5. 若 `D6` 出现 P0/P1、持续 `red`、支付异常、退款口径不一致或静态回退失败，`D7` 默认结论为 `Hold` 或 `Rollback`。

## 9. D7 Decision Template
| field | value |
|---|---|
| decision_date | `2026-03-30` |
| final_decision | `[Go / Hold / Rollback]` |
| scope | `[待填写]` |
| unresolved_blockers | `[待填写]` |
| required_followups | `[待填写]` |
| next_review_date | `[待填写]` |

