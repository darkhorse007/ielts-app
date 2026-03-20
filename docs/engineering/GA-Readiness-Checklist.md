# GA 就绪清单（Launch Readiness Checklist）

## 1. 目的
1. 将当前仓库从 `RC / 预发布` 推进到 `GA / 正式可发布` 所需的工作显式化。
2. 把“功能已完成”和“可以正式上线”区分开，避免仅凭演练环境通过就提前宣布 GA。
3. 为产品、工程、运维、商业与合规提供统一的出入口标准。

## 2. 当前判断（截至 2026-03-14）
1. 当前阶段: `RC / pre-GA`
2. 判断依据:
- 核心 Epic 已全部 `Done`，主功能范围基本完成。
- 最近发布记录已推进到 `REL-071`，并连续通过演练环境门禁。
- S29 ~ S31 的主要工作已经从“补主功能”转向“持久化、恢复验证、runbook、RC 包与 release automation 收口”。
- PRD 仍为 `Draft for Build`，目标发布窗口仍是 `2026 Q3`，说明产品尚未进入正式 GA 状态。
3. 结论:
- 功能成熟度: 高
- 工程成熟度: 高
- 运维成熟度: 中高
- 商业与合规成熟度: 中低（较前一日已补联签底稿与模板，但仍未完成正式签署）

## 3. 出口定义
### 3.1 可视为 GA 的最低条件
1. 功能范围冻结，形成正式 `GA scope` 与已知问题清单。
2. 生产环境部署、监控、告警、回滚、备份恢复完成实战演练。
3. 支付、订阅、权益、退款和客服路径在真实环境中可执行。
4. 小规模真实用户 beta 已跑通，并有可接受的业务指标。
5. 隐私、协议、数据保留与删除策略完成上线前审查。

### 3.2 不足以证明 GA 的条件
1. 本地 `release:checklist` 通过。
2. 演练环境 `REL-*` 记录持续通过。
3. RC 包、runbook、tracking 治理和脚本回归全部到位。

## 4. 工作面清单
| id | workstream | item | can_start_now | dependency | owner_suggestion | exit_criteria |
|---|---|---|---|---|---|---|
| GA-01 | Product | 冻结 `GA scope`、延后项和已知问题接受边界 | Yes | 无 | product + eng | 形成一页发布范围文档，明确首发范围、延后范围、No-Go 条件 |
| GA-02 | Product | 将 PRD 从 `Draft for Build` 升级为发布版文档 | Yes | GA-01 | product | PRD 标记改为 release-ready，并补最终发布窗口、版本目标和边界 |
| GA-03 | Engineering | 梳理生产环境拓扑、配置矩阵、密钥来源与部署入口 | Yes | 无 | eng + ops | 形成 production env matrix，包含 app/server/db/3rd-party/provider |
| GA-04 | Engineering | 补生产部署 runbook 与一次完整部署演练 | Yes | GA-03 | ops + eng | 形成生产部署/回滚步骤，并完成一次端到端演练记录 |
| GA-05 | Engineering | 完成数据库备份、恢复、迁移、回滚演练 | Yes | GA-03 | ops + backend | 对 SQLite/Postgres 最终方案形成恢复演练记录与 RTO/RPO 结论 |
| GA-06 | Engineering | 执行容量、故障和恢复压测 | Yes | GA-03;GA-05 | backend + qa | 产出压测报告，明确瓶颈、阈值、告警与扩容建议 |
| GA-07 | Security | 做一次上线前安全审查 | Yes | GA-03 | eng + security | 鉴权、RBAC、依赖漏洞、密钥管理、暴露面问题都有处理结论 |
| GA-08 | Compliance | 形成隐私政策、用户协议、数据保留/删除策略 | Yes | GA-01 | product + legal | 文档可发布，且与实际数据流一致 |
| GA-09 | Billing | 验证真实支付、退款、订阅恢复、权益纠错链路 | Yes | GA-03 | ops + finance + eng | 沙箱或真实低风险环境完成端到端记录 |
| GA-10 | Ops | 建立生产监控、告警、值班与 incident 响应机制 | Yes | GA-03 | ops | 有 on-call 规则、分级、升级路径、值班联系人与复盘模板 |
| GA-11 | Growth | 设计小规模 beta 方案与成功指标 | Yes | GA-01 | product + growth | 明确样本量、时长、成功指标、退出条件 |
| GA-12 | Growth | 执行 beta 并收集留存、完成率、满意度、付费数据 | No | GA-11;GA-09;GA-10 | growth + product | 形成 beta 结果复盘并给出 GA 建议 |
| GA-13 | Support | 建立客服与内容运营 SOP | Yes | GA-01 | ops + content | 常见问题、支付问题、账号问题、内容问题均有处理流程 |
| GA-14 | Release | 完成一次真实发布前总演练 | No | GA-04;GA-05;GA-07;GA-09;GA-10 | release manager | 覆盖部署、验收、回滚、告警、客服联动 |
| GA-15 | Launch | 形成最终 GA Go/No-Go 决策包 | No | GA-02;GA-12;GA-14 | product + eng + ops | 决策材料齐全，含范围、风险、指标、回滚和签署结论 |

## 5. 最先可开始做的事（Phase 0）
### 5.1 排序原则
1. 优先做不依赖新代码、但能快速减少 GA 不确定性的工作。
2. 优先做会影响后续所有工作定义边界的事项。
3. 优先做能直接暴露真实缺口的清单化和演练化工作。

### 5.2 建议立刻开工的 5 项
| priority | id | item | reason_to_start_first | expected_output |
|---|---|---|---|---|
| P0 | GA-01 | 冻结 `GA scope`、延后项和已知问题接受边界 | 不先冻结范围，后续 beta、合规、运维准备都会反复返工 | `GA scope` 文档 + 已知问题接受表 |
| P0 | GA-03 | 梳理生产环境拓扑、配置矩阵、密钥来源与部署入口 | 这是所有生产化工作的基础输入 | production env matrix |
| P0 | GA-10 | 建立生产监控、告警、值班与 incident 响应机制 | 没有值班和告警，无法证明系统可运营 | on-call / incident runbook |
| P1 | GA-08 | 形成隐私政策、用户协议、数据保留/删除策略 | 合规文档通常周期长，适合尽早并行 | 合规文档首版 |
| P1 | GA-11 | 设计小规模 beta 方案与成功指标 | 没有 beta 指标，就无法判断何时可以 GA | beta plan + KPI 定义 |

### 5.3 第一周可执行计划
1. 第 1 天:
- 完成 `GA scope` 评审
- 列出首发范围、延后范围、已知问题接受条件
2. 第 2 天:
- 梳理生产环境矩阵
- 明确 server/client/db/provider/secrets/deploy 入口
3. 第 3 天:
- 基于现有 release runbook 派生生产 on-call / incident 版 runbook
- 明确告警等级、值班角色、升级路径
4. 第 4 天:
- 起草隐私政策、用户协议、数据保留/删除策略
- 对照当前数据流和账号删除能力核对缺口
5. 第 5 天:
- 输出 beta 方案
- 明确样本量、招募方式、核心指标、观测周期和 No-Go 条件

## 6. 建议产物
1. `GA scope` 冻结文档
2. production environment matrix
3. production deploy / rollback runbook
4. production deployment / recovery drill record
5. compliance launch checklist
6. incident & on-call runbook
7. beta plan
8. support/content ops SOP
9. compliance signoff packet
10. launch decision record
11. GA release blockers shortlist

## 7. 推荐顺序
1. 先定范围: `GA-01`
2. 再定生产输入: `GA-03`
3. 同步补运营托底: `GA-10`
4. 并行拉起合规与 beta 设计: `GA-08`、`GA-11`
5. 然后进入部署、恢复、压测、安全、支付验证: `GA-04` ~ `GA-09`
6. 最后做总演练与 Go/No-Go: `GA-14`、`GA-15`

## 8. 与现有文档关系
1. 产品范围基线: `docs/PRD-IELTS-AI-App.md`
2. 发布与回滚基线: `docs/engineering/S9-Release-Runbook.md`
3. 正式部署/恢复演练记录入口: `docs/engineering/Production-Deployment-Recovery-Drill-Record.md`
4. 合规上线检查基线: `docs/engineering/Compliance-Launch-Checklist.md`
5. beta 与运营试运行基线: `docs/engineering/Beta-Plan.md`、`docs/engineering/Support-Content-Ops-SOP.md`
6. RC 验收基线: `docs/engineering/RC-Acceptance-Checklist.md`
7. 发布记录: `docs/tracking/releases.md`
8. 追踪与风险: `docs/tracking/README.md`、`docs/tracking/risk-register.csv`
9. 最短阻断清单: `docs/engineering/GA-Release-Blockers-Shortlist.md`
