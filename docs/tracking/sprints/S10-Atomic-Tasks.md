# Sprint S10 原子任务清单（Tracking Governance Automation）

## 1. 说明
1. 本清单覆盖 `E10` 在 S10 的新增 Story：`US-10401` ~ `US-10410`。
2. 目标是将 Sprint 收尾治理从“人工补录”升级为“脚本校验 + 门禁执行 + artifact 追溯”。

## 2. Story 与原子任务映射

### 2.1 US-10401 S10 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10401-01 | 梳理 tracking 治理缺口并映射 S10 Story | 1 | US-10310 | 形成 S10 Story 列表与依赖链 |
| TK-10401-02 | 输出 S10 原子任务与执行顺序 | 1 | TK-10401-01 | 产出 `S10-Atomic-Tasks.md` |

### 2.2 US-10402 tracking 治理校验脚本
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10402-01 | 新增治理校验脚本（sprint/retro/metrics/release/risk/activity） | 2 | US-10401 | 脚本可输出通过/失败结论 |
| TK-10402-02 | 增加治理 summary JSON 输出能力 | 1 | TK-10402-01 | 支持 `TRACKING_GOVERNANCE_SUMMARY_PATH` |

### 2.3 US-10403 release checklist 集成治理校验
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10403-01 | checklist 默认执行治理校验步骤 | 1 | US-10402 | `release:checklist` 默认包含治理校验 |
| TK-10403-02 | 增加治理校验开关 | 1 | TK-10403-01 | 支持 `RELEASE_AUTOMATION_RUN_TRACKING_GOVERNANCE` |

### 2.4 US-10404 本地 quality-gate 治理参数与归档
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10404-01 | 本地 quality-gate 透传治理开关和 summary 路径 | 1 | US-10403 | 支持本地参数控制 |
| TK-10404-02 | 失败归档 manifest 增加治理字段 | 1 | TK-10404-01 | manifest 可追溯治理 summary |

### 2.5 US-10405 治理脚本测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10405-01 | 新增治理脚本通过/失败测试 | 1 | US-10402 | 覆盖 missing retro 失败场景 |
| TK-10405-02 | 将治理测试纳入 `test:release-scripts` | 1 | TK-10405-01 | 统一命令可回归治理脚本 |

### 2.6 US-10406 CI 归档治理 summary artifact
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10406-01 | `typecheck-and-test` 执行治理校验 | 1 | US-10403 | CI 在基础门禁阶段执行治理校验 |
| TK-10406-02 | 上传治理 summary artifact | 1 | TK-10406-01 | 可下载 `quality-gate-tracking-governance-summary` |

### 2.7 US-10407 release 候选行合并治理摘要
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10407-01 | release 记录候选脚本支持 `--tracking_summary` | 1 | US-10402 | 生成 notes 时可合并治理统计字段 |
| TK-10407-02 | 验证追加到 releases 的内容可读 | 1 | TK-10407-01 | notes 含 tracking_status 等字段 |

### 2.8 US-10408 治理基线补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10408-01 | 补齐 S2-S9 metrics 行并更新风险时效 | 2 | US-10402 | metrics/risk 不落后于最新 release 日期 |
| TK-10408-02 | 补齐 S8/S9 retrospective 与 activity 同步 | 1 | TK-10408-01 | retrospective/action items 与活动日志齐备 |

### 2.9 US-10409 文档入口补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10409-01 | runbook 增加治理校验命令与参数 | 1 | US-10403;US-10404;US-10407 | 值班可直接按文档执行 |
| TK-10409-02 | tracking README 增加治理校验入口 | 1 | TK-10409-01 | 新成员可快速发现命令 |

### 2.10 US-10410 S10 收口与台账同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10410-01 | 同步实施报告/release/sprint 日志 | 1 | US-10405;US-10406;US-10408;US-10409 | 台账与代码一致 |
| TK-10410-02 | 执行 tracking 与 quality-gate 本地校验 | 1 | TK-10410-01 | `validate_tracking.sh`、`status_summary.sh`、`smoke:quality-gate:local` 通过 |

## 3. S10 执行顺序建议
1. 先完成 `US-10401`、`US-10402` 建立治理校验能力。
2. 再推进 `US-10403`、`US-10404`、`US-10405` 打通本地门禁与测试回归。
3. 然后落地 `US-10406`、`US-10407`，形成 CI artifact 与 release 台账联动。
4. 最后完成 `US-10408`、`US-10409`、`US-10410`，补齐治理基线并收口文档。

## 4. S10 验收门槛
1. `US-10401`~`US-10410` DoD 全部满足。
2. `release:checklist` 默认执行 tracking 治理校验且可开关。
3. quality-gate 可产出 tracking 治理 summary artifact。
4. tracking 治理校验在本地与 CI 均可复现。
