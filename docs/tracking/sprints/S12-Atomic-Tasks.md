# Sprint S12 原子任务清单（Tracking Governance Hardening III）

## 1. 说明
1. 本清单覆盖 `E10` 在 S12 的新增 Story：`US-10601` ~ `US-10610`。
2. 目标是推进治理校验“严格模式 + 修复幂等 + 发布记录 artifact 可追溯”。

## 2. Story 与原子任务映射

### 2.1 US-10601 S12 任务矩阵与顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10601-01 | 梳理 S12 治理强化范围 | 1 | US-10510 | 明确 10 项 Story 与依赖 |
| TK-10601-02 | 输出执行顺序与验收门槛 | 1 | TK-10601-01 | 产出 `S12-Atomic-Tasks.md` |

### 2.2 US-10602 fix-template 幂等去重
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10602-01 | `apply-fixes.sh` 增加 metrics 去重追加 | 1 | US-10601 | 同 sprint 不重复写入 |
| TK-10602-02 | `apply-fixes.sh` 增加 activity 去重追加 | 1 | TK-10602-01 | 同 id/to_status 不重复写入 |

### 2.3 US-10603 fix-template 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10603-01 | 新增 `tracking-governance-fix-template` 测试 | 1 | US-10602 | 覆盖重复执行幂等场景 |
| TK-10603-02 | 纳入 `test:release-scripts` | 1 | TK-10603-01 | 一键脚本回归覆盖该能力 |

### 2.4 US-10604 治理 `--strict` 模式
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10604-01 | 治理脚本新增 warning 汇总与 strict 提升 | 2 | US-10601 | strict 下 warning 升级为失败 |
| TK-10604-02 | summary 增加 strict/warnings 字段 | 1 | TK-10604-01 | 便于 CI 与值班追踪 |

### 2.5 US-10605 release checklist 严格模式开关
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10605-01 | `release-automation-check` 增加 strict 透传 | 1 | US-10604 | 支持 `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT` |
| TK-10605-02 | summary-json 记录 strict 执行态 | 1 | TK-10605-01 | 输出 `tracking_governance_strict` |

### 2.6 US-10606 本地 quality-gate 严格模式开关
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10606-01 | `local-quality-gate-smoke` 增加 strict 参数 | 1 | US-10605 | 支持 `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT` |
| TK-10606-02 | manifest 记录 strict 开关 | 1 | TK-10606-01 | 失败归档可追溯执行态 |

### 2.7 US-10607 quality-gate 汇总增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10607-01 | 聚合 summary 增加 warnings_count/strict_mode | 1 | US-10604 | summary-json 追踪治理细项 |
| TK-10607-02 | Step Summary/PR 评论展示新增字段 | 1 | TK-10607-01 | PR 可直接查看治理细节 |

### 2.8 US-10608 release 记录注入 artifact
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10608-01 | `release-record-candidate` 支持 artifact 参数 | 1 | US-10601 | notes 可带 artifact 信息 |
| TK-10608-02 | `release-record-from-gate` 自动注入 artifact | 1 | TK-10608-01 | 生成记录无需手工补写 |

### 2.9 US-10609 脚本测试增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10609-01 | 增加 strict 模式测试 | 1 | US-10604 | 覆盖 warning->fail 场景 |
| TK-10609-02 | 增加 artifact 注入测试 | 1 | US-10608 | 覆盖 release notes artifact 字段 |

### 2.10 US-10610 S12 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10610-01 | 同步 tracking/runbook/实施报告 | 1 | US-10603;US-10607;US-10609 | 台账与代码一致 |
| TK-10610-02 | 追加 `REL-049` 并复核校验 | 1 | TK-10610-01 | 发布记录闭环 |

## 3. S12 执行顺序建议
1. 先做 `US-10601~US-10604`，完成核心脚本能力升级。
2. 再做 `US-10605~US-10608`，打通门禁、CI 汇总和发布记录链路。
3. 最后做 `US-10609~US-10610`，补齐测试与台账收口。

## 4. S12 验收门槛
1. `tracking-governance --strict` 可把 warning 升级为失败。
2. `tracking-governance-fix-template` 生成的 apply 脚本重复执行不产生重复追加。
3. `release:record:from-gate` 自动注入 summary/tracking artifact 信息。
4. S12 台账（backlog/activity/metrics/sprint/retro/releases）完整且校验通过。
