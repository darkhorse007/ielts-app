# Production Incident Runbook（生产事故响应手册）

## 1. 目的
1. 作为 `GA-10` 的首个正式产物，明确生产事故的分级、值班角色、处置动作与回滚入口。
2. 以当前代码库已实现的系统角色、告警接口、审计事件和 runbook 能力为基线，不假设外部平台已自动接入。
3. 为 GA 前的生产部署演练、值班制度和 Go / No-Go 决策提供可执行模板。

## 2. 适用范围（截至 2026-03-13）
1. 适用于 `/v1/system/release/*`、`/v1/system/stability/*`、`/v1/system/beta/*`、`/v1/system/health/providers` 与 `/health`。
2. 适用于当前仓库的推荐生产基线：`同域前端 + 反向代理 + apps/server + Postgres`。
3. 本文默认沿用 `docs/engineering/Production-Environment-Matrix.md` 中的生产环境矩阵。
4. 具体部署与回滚动作优先参照 `docs/engineering/Production-Deploy-Rollback-Runbook.md`。
5. 本文使用的角色术语与系统权限映射如下：
- `QA 值班` 对应系统角色 `qa`
- `Ops 值班` 对应系统角色 `ops`
- `发布管理员` 对应系统角色 `admin`

## 3. 事故分级与 SLA
### 3.1 生产事故等级
| 等级 | 触发条件（任一） | 首次响应 SLA | 处置闭环 SLA | 默认 owner | 默认动作 |
|---|---|---|---|---|---|
| P1 | `red` 告警连续 2 个检查点；或 `api_success_rate <= 99.0`；或发布链路写接口出现 `503 RELEASE_STORAGE_UNAVAILABLE`；或人工确认用户面影响 > 5% | 10 分钟 | 60 分钟 | QA 值班 + 发布管理员 | 先 ack，再冻结扩量，必要时立即回滚 |
| P2 | `yellow` 告警连续 2 个检查点；或 `latency_p95_ms >= 1500` 且仍在恶化；或 provider degraded 但暂未触发大面积用户失败 | 30 分钟 | 4 小时 | QA 值班 + Ops 值班 | ack、缩小影响面、持续观察、准备回滚 |
| P3 | 单点 `yellow` 告警且下一个检查点恢复；或 nightly drill / artifact 异常但未影响线上用户 | 2 小时 | 24 小时 | Ops / QA | 记录、跟踪、安排修复窗口 |

### 3.2 代码内已实现阈值
| signal | yellow | red | source |
|---|---|---|---|
| `crash_rate_per_1k` | `>= 1.5` | `>= 3.0` | stability alert threshold |
| `api_success_rate` | `<= 99.5` | `<= 99.0` | stability alert threshold / release gate |
| `latency_p95_ms` | `>= 1500` | `>= 2500` | stability alert threshold |
| provider success rate | `< 96%` | `< 90%` | provider health |
| provider fallback rate | `> 15%` | `> 30%` | provider health |
| provider p95 latency | `> 3000ms` | `> 5000ms` | provider health |
| release write latency | `>= 400ms` | `>= 1000ms` | `/v1/system/release/metrics` |

补充说明：
1. `release gate` 的通过线是 `p0_defects == 0`、`regression_pass_rate >= 98`、`api_success_rate >= 99.5`、`provider_healthy=true`。
2. P1 / P2 的最终判断仍以“持续时间 + 用户影响面 + 是否需要回滚”三项一起判断，不只看单次阈值穿透。

## 4. 值班角色与权限边界
| role | system role | permissions | responsibility | can execute rollback |
|---|---|---|---|---|
| QA 值班 | `qa` | `provider_health:read`, `stability:read`, `stability:manage` | 首响、查询告警、记录处置说明、ack / resolve stability alert、生成稳定性报告 | No |
| Ops 值班 | `ops` | `provider_health:read`, `stability:read`, `beta:read`, `beta:manage` | 影响面判断、beta 用户联动、外部依赖协同、用户侧沟通 | No |
| 发布管理员 | `admin` | `provider_health:read`, `release:manage`, `stability:read`, `stability:manage`, `beta:read`, `beta:manage`, `user_roles:manage` | 回滚决策、执行 canary rollback、查看 release metrics、事故总协调 | Yes |
| 产品 / 客服 / 财务 | 非系统角色 | 不在当前仓库权限模型内 | 用户公告、退款承诺、客服脚本、商业决策 | No |

关键边界：
1. 当前只有 `admin` 具备 `release:manage`，因此只有发布管理员能执行 `/v1/system/release/canary/{canary_id}/rollback`。
2. `qa` 可以独立处理 stability alert，但不能单独执行发布回滚。
3. `ops` 可以处理 beta 相关名单和反馈，但当前不能直接处理 release metrics 或 rollback。

## 5. 值班名录与升级链
角色级责任链已冻结为：

| function | role slot | primary responsibility | escalation |
|---|---|---|---|
| QA 值班 | `qa` | stability 首响、alert ack / resolve、指标记录 | `IC-ADMIN` |
| Ops 值班 | `L1-OPS` | 用户影响面判断、beta 联动、支持首响 | `IC-ADMIN` / `L3-SUPERADMIN` |
| 发布管理员（admin） | `IC-ADMIN` | 回滚决策、执行 release / canary 操作 | `L3-SUPERADMIN` |
| 支付 / 财务联络人 | `L2-FINANCE` | 订单、退款口径、权益补偿与核账 | `L3-SUPERADMIN` |
| 超级升级人 | `L3-SUPERADMIN` | 跨域争议、高风险动作与最终例外决策 | Final |

补充说明：
1. 详细客服与运营值班分工见 `docs/engineering/Support-OnCall-Ownership-Matrix.md`。
2. 实际人名、手机号、IM 群仍在仓库外值班表维护；仓库内先冻结角色槽位与升级链。

## 6. 观测入口与排障入口
| source | endpoint / artifact | required role | what to check |
|---|---|---|---|
| 服务健康 | `GET /health` | 无鉴权（由反向代理 / LB 使用） | 进程是否存活 |
| Provider 健康 | `GET /v1/system/health/providers` | `qa` / `ops` / `admin` | `healthy`、`alert_level`、`alert_reasons`、`recent_traces` |
| Stability alerts | `GET /v1/system/stability/alerts` | `qa` / `ops` / `admin` | 是否有 `open` / `acknowledged` / `resolved`，阈值与 actual 是否持续恶化 |
| Stability report | `GET /v1/system/stability/soak-tests/{run_id}/report` | `qa` / `ops` / `admin` | `min_api_success_rate`、`max_latency_p95_ms`、趋势是否恶化 |
| Release metrics | `GET /v1/system/release/metrics` | `admin` | `write_latency`、`storage_resilience`、`circuit_open`、`last_error` |
| Canary 状态 | `GET /v1/system/release/canary/{canary_id}` | `admin` | 当前 canary status、version、rollback_reason |
| CI / release artifact | `quality-gate-summary-json`, `quality-gate-tracking-governance-summary` | release manager | 是否有 failed step、governance drift |
| Nightly drill artifact | `stability-drill-report`, `postgres-chaos-drill-report` | QA 值班 | 是否存在趋势退化或写恢复异常 |

## 7. 标准处置流程
### 7.1 0 ~ 10 分钟：确认与接管
1. QA 值班先确认告警是否真实存在，而不是单点抖动或已恢复历史数据。
2. 立刻查询：
- `/v1/system/stability/alerts`
- `/v1/system/health/providers`
- `/v1/system/release/metrics`（若需要发布管理员介入）
3. 若告警仍处于 `open`，由 QA 值班先执行 `acknowledge`，防止重复处理。
4. 若已满足 P1 条件，10 分钟内拉起发布管理员；若涉及支付或数据库，再同步对应联络人。

### 7.2 10 ~ 30 分钟：定位影响面
1. 判断是以下哪一类问题：
- 稳定性指标退化（crash / success rate / latency）
- Provider 健康退化
- Postgres 写失败 / circuit open
- 仅 beta / canary 人群异常
2. 结合以下信号判断影响面：
- `api_success_rate`
- `provider_healthy`
- `storage_resilience.circuit_open`
- 最近 `failed_writes`
- 用户面影响是否超过 5%
3. 若已命中 “`red` 连续 2 次 + (门禁失败或用户面 > 5%)”，直接进入回滚判定。

### 7.3 30 ~ 60 分钟：处置与验证
1. P1 默认优先级是“恢复服务”，不是“先找根因”。
2. 若决定回滚，由发布管理员执行 canary rollback，并记录 reason。
3. 若不回滚，必须至少完成：
- 保持告警已 ack
- 给出 workaround 或冻结扩量动作
- 指定明确 owner 与下一次复核时间
4. 处置后验证：
- `/health` 正常
- `/v1/system/stability/alerts` 不再新增更高等级告警
- `/v1/system/release/metrics` 中 `failed_writes` 不再持续增加
- 若是 provider 问题，`/v1/system/health/providers` 回到 `healthy=true` 或已证明用户面不受影响

## 8. 常用操作模板
### 8.1 查询 provider 健康
```bash
curl -H "Authorization: Bearer <token>" \
  http://<host>/v1/system/health/providers
```

### 8.2 查询 stability alerts
```bash
curl -H "Authorization: Bearer <token>" \
  "http://<host>/v1/system/stability/alerts?status=open&page=1&page_size=20"
```

### 8.3 acknowledge / resolve stability alert
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: <uuid>" \
  http://<host>/v1/system/stability/alerts/<alert_id>/handle \
  -d '{
    "action": "acknowledge",
    "note": "triage started",
    "expected_version": 1
  }'
```

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: <uuid>" \
  http://<host>/v1/system/stability/alerts/<alert_id>/handle \
  -d '{
    "action": "resolve",
    "note": "metrics recovered after mitigation",
    "expected_version": 2
  }'
```

### 8.4 查询 release metrics
```bash
curl -H "Authorization: Bearer <admin-token>" \
  http://<host>/v1/system/release/metrics
```

重点字段：
1. `write_latency.failed_writes`
2. `write_latency.thresholds_ms`
3. `storage_resilience.circuit_open`
4. `storage_resilience.consecutive_write_failures`
5. `storage_resilience.last_error`
6. `storage_resilience.alerting.recent`

### 8.5 执行 canary rollback
```bash
curl -X POST \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -H "x-idempotency-key: <uuid>" \
  http://<host>/v1/system/release/canary/<canary_id>/rollback \
  -d '{
    "reason": "p1 incident: red alerts persisted and user impact exceeded threshold",
    "expected_version": 3
  }'
```

操作要求：
1. rollback reason 必须写明触发条件，不接受空泛描述。
2. 有并发写风险时，始终带上 `expected_version`。
3. 有重试或脚本重复触发风险时，始终带上 `x-idempotency-key`。

## 9. 典型场景处置
### 9.1 `red` 告警连续 2 次
1. QA 值班先 `acknowledge` 告警。
2. 发布管理员检查：
- 当前 release gate 关键指标
- canary 状态
- provider 健康
- 用户影响面
3. 若命中 `A + (B or C)`：
- A: `red` 告警连续 2 次且指标恶化
- B: 发布门禁关键项失败
- C: 用户影响面 > 5%
4. 立即执行 rollback。
5. rollback 后确认 `canary_release_rolled_back` 与 `stability_alert_handled` 已可审计追溯。

### 9.2 Postgres 写失败 / `RELEASE_STORAGE_UNAVAILABLE`
1. 发布管理员先查询 `/v1/system/release/metrics`。
2. 若看到 `storage_resilience.circuit_open=true`、`failed_writes` 持续上升或 `last_error` 明确为数据库不可用，按 P1 处理。
3. 先恢复数据库可用性；若短时间无法恢复且发布链路正承压，则执行 rollback。
4. 恢复后再次验证写接口返回 `2xx`，并确认 `failed_writes` 不再增长。
5. 事故结束后，补跑一次 Postgres chaos 演练或等效恢复演练，确认不是偶发误判。

### 9.3 Provider 健康退化
1. QA / Ops 先查 `/v1/system/health/providers`。
2. 若出现以下任一条件，至少按 P2 处理：
- success rate 低于 `96%`
- fallback rate 高于 `15%`
- p95 latency 高于 `3000ms`
3. 若同时伴随 `api_success_rate <= 99.0`、大面积超时或用户面异常，升级为 P1。
4. 若仅 provider degraded 但用户主链路仍可用，先冻结扩量，继续观测并准备切换 / 回滚。

## 10. 事故收口要求
### 10.1 处置完成后 30 分钟内
1. 更新 `docs/tracking/releases.md`，记录事故与回滚事实。
2. 若问题暴露系统性风险，更新 `docs/tracking/risk-register.csv`。
3. 若问题影响 RC / beta 决策，补充到 RC 已知问题或 GA 已知问题接受清单。

### 10.2 24 小时内
1. 形成简版 incident note：
- 触发时间
- 影响范围
- 触发信号
- 处置动作
- 是否回滚
- 恢复时间
- 后续修复 owner
2. 如属结构性缺口，同步到下一轮 sprint / backlog。

## 11. 当前未完成项
1. 值班人名、手机号、IM 群和升级链尚未在仓库中落盘，需在 GA 前补齐第 5 节。
2. 当前仓库尚未接入正式 paging / ChatOps 平台，首响仍依赖人工值班纪律。
3. 只有 `admin` 能执行 rollback，若要增强应急韧性，需要单独评估是否引入更细分的 release role。
