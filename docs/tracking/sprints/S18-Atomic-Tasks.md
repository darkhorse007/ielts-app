# Sprint S18 原子任务清单（Tracking Governance Hardening IX）

## 1. 说明
1. 本清单覆盖 `E10` 在 S18 的新增 Story：`US-11021` ~ `US-11030`。
2. 目标是交付“strict-codes 输出控制 + strict mode 可观测增强 + PR 评论限幅”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-11021 S18 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11021-01 | 梳理 S18 目标与依赖 | 1 | US-11020 | 明确执行边界 |
| TK-11021-02 | 输出原子任务与验收门槛 | 1 | TK-11021-01 | 产出 `S18-Atomic-Tasks.md` |

### 2.2 US-11022 strict-codes summary 输出通道控制
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11022-01 | 增加 `--summary_to_stderr` 参数 | 2 | US-11021 | 可控制 summary-file 日志输出通道 |
| TK-11022-02 | 保持 JSON 输出纯净不受影响 | 1 | TK-11022-01 | 机读稳定 |

### 2.3 US-11023 strict-codes quiet 与 env 透传修正
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11023-01 | 增加 `--quiet` 参数 | 2 | US-11021 | 可抑制非必要日志 |
| TK-11023-02 | 修正参数/环境变量优先级解析 | 1 | TK-11023-01 | env 透传行为一致 |

### 2.4 US-11024 strict-codes 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11024-01 | 新增 stdout/stderr/quiet 回归测试 | 2 | US-11022;US-11023 | 输出控制稳定 |
| TK-11024-02 | 新增 require_non_empty env 透传测试 | 1 | TK-11024-01 | 环境变量可验证 |

### 2.5 US-11025 quality-gate strict mode 聚合增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11025-01 | 聚合 summary JSON 增加 strict-codes `mode` | 2 | US-11022 | 预检语义可追溯 |
| TK-11025-02 | 兼容 invalid/missing 场景回退 | 1 | TK-11025-01 | 聚合稳定 |

### 2.6 US-11026 Step Summary/评论字段同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11026-01 | Step Summary 展示 strict-codes `mode` | 1 | US-11025 | CI 可读 |
| TK-11026-02 | PR 评论 full 模式展示 strict-codes `mode` | 1 | TK-11026-01 | 审查可见 |

### 2.7 US-11027 PR 评论异常模式限幅
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11027-01 | 增加 `QUALITY_GATE_PR_COMMENT_ABNORMAL_MAX_STEPS` | 2 | US-11026 | 异常步骤展示可控 |
| TK-11027-02 | 超限追加截断提示 | 1 | TK-11027-01 | 值班可调可见 |

### 2.8 US-11028 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11028-01 | README 更新 strict-codes 新参数示例 | 1 | US-11023 | 值班可查 |
| TK-11028-02 | Runbook 更新评论限幅与 mode 字段说明 | 2 | TK-11028-01 | CI 排障可查 |

### 2.9 US-11029 实施报告与 Sprint 日志同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11029-01 | 实施报告新增 S18 能力记录 | 2 | US-11027 | 代码文档一致 |
| TK-11029-02 | S8 Sprint 日志追加本期执行记录 | 1 | TK-11029-01 | 历史可追溯 |

### 2.10 US-11030 S18 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11030-01 | 执行脚本/治理/门禁回归 | 2 | US-11024;US-11027;US-11029 | 关键命令全通过 |
| TK-11030-02 | 追加 `REL-055` | 1 | TK-11030-01 | 发布记录闭环 |
| TK-11030-03 | 回填 S18 台账 | 2 | TK-11030-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S18 执行顺序建议
1. 先完成 `US-11021~US-11024`，交付 strict-codes 输出控制与测试。
2. 再完成 `US-11025~US-11027`，打通 quality-gate 聚合与 PR 评论限幅。
3. 最后完成 `US-11028~US-11030`，文档同步与发布收口。

## 4. S18 验收门槛
1. strict-codes 支持 `summary_to_stderr/quiet` 且 JSON 输出稳定。
2. strict-codes 环境变量透传行为符合文档预期。
3. quality-gate summary/Step Summary/PR 评论展示 strict-codes `mode`。
4. PR 评论异常模式支持限幅与截断提示。
5. S18 台账与发布记录完整且校验通过。
