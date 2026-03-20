# Sprint S13 原子任务清单（Tracking Governance Hardening IV）

## 1. 说明
1. 本清单覆盖 `E10` 在 S13 的新增 Story：`US-10701` ~ `US-10710`。
2. 目标是交付“修复模板 dry-run + strict 分级 + PR artifact 下载指引”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-10701 S13 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10701-01 | 梳理 S13 范围与依赖 | 1 | US-10610 | 明确执行边界 |
| TK-10701-02 | 输出原子任务清单与验收门槛 | 1 | TK-10701-01 | 产出 `S13-Atomic-Tasks.md` |

### 2.2 US-10702 fix-template dry-run
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10702-01 | `tracking-governance-fix-template` 支持 `--dry_run` | 1 | US-10701 | dry-run 仅输出计划，不落盘 |
| TK-10702-02 | dry-run 输出补齐数量与命令 | 1 | TK-10702-01 | 值班可直接评估修复规模 |

### 2.3 US-10703 fix-template dry-run 测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10703-01 | 新增 dry-run 场景测试 | 1 | US-10702 | 覆盖不落盘断言 |
| TK-10703-02 | 与幂等测试共同纳入回归 | 1 | TK-10703-01 | `test:release-scripts` 一键通过 |

### 2.4 US-10704 strict 分级策略
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10704-01 | `tracking-governance` 增加 `strict_warning_codes` | 2 | US-10701 | 支持仅升级指定 warning code |
| TK-10704-02 | summary 增加 strict 分级字段 | 1 | TK-10704-01 | 输出 `strict_warning_codes`/`strict_promoted_warning_codes` |

### 2.5 US-10705 checklist/local smoke strict 分级透传
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10705-01 | checklist 增加 strict warning code 透传 | 1 | US-10704 | 支持 `RELEASE_AUTOMATION_TRACKING_GOVERNANCE_STRICT_WARNING_CODES` |
| TK-10705-02 | local smoke 增加 strict warning code 透传 | 1 | TK-10705-01 | 支持 `QUALITY_GATE_LOCAL_TRACKING_GOVERNANCE_STRICT_WARNING_CODES` |

### 2.6 US-10706 strict 分级测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10706-01 | 增加 strict 未命中 code 时通过测试 | 1 | US-10704 | 验证分级有效 |
| TK-10706-02 | 增加 checklist summary strict code 字段断言 | 1 | US-10705 | 防止字段回退 |

### 2.7 US-10707 PR 评论 artifact 下载指引
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10707-01 | PR 评论增加 artifact 下载说明 | 1 | US-10701 | 直接提示下载位置 |
| TK-10707-02 | 对齐 quality-gate 汇总字段展示 | 1 | TK-10707-01 | 与 summary-json 一致 |

### 2.8 US-10708 release 记录字段增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10708-01 | release notes 增加 strict 执行态字段 | 1 | US-10705 | notes 可追踪 strict 执行态 |
| TK-10708-02 | 与 artifact 字段共存校验 | 1 | TK-10708-01 | 记录字段完整 |

### 2.9 US-10709 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10709-01 | README/Runbook 同步新参数与命令 | 1 | US-10707 | 值班可直接查到 |
| TK-10709-02 | 实施报告与 Sprint 日志同步 | 1 | TK-10709-01 | 代码/台账一致 |

### 2.10 US-10710 S13 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10710-01 | 执行全量校验与脚本回归 | 1 | US-10703;US-10706;US-10709 | 关键命令全部通过 |
| TK-10710-02 | 追加 `REL-050` | 1 | TK-10710-01 | 发布记录闭环 |

## 3. S13 执行顺序建议
1. 先完成 `US-10701~US-10704`，交付核心脚本能力。
2. 再完成 `US-10705~US-10708`，打通门禁透传与记录链路。
3. 最后完成 `US-10709~US-10710`，文档同步与发布收口。

## 4. S13 验收门槛
1. fix-template `--dry_run` 可用且不落盘。
2. strict 分级支持仅升级指定 warning code。
3. PR 评论包含 artifact 下载指引。
4. S13 台账与发布记录完整且校验通过。
