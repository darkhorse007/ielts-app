# Sprint S17 原子任务清单（Tracking Governance Hardening VIII）

## 1. 说明
1. 本清单覆盖 `E10` 在 S17 的新增 Story：`US-11011` ~ `US-11020`。
2. 目标是交付“strict code 发现模式 + 预检耗时可观测 + quality-gate 评论异常精简”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-11011 S17 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11011-01 | 梳理 S17 目标与依赖 | 1 | US-11010 | 明确执行边界 |
| TK-11011-02 | 输出原子任务与验收门槛 | 1 | TK-11011-01 | 产出 `S17-Atomic-Tasks.md` |

### 2.2 US-11012 strict-codes 发现模式
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11012-01 | 增加 `--supported_codes` 参数解析 | 2 | US-11011 | 支持 `true|text|json` |
| TK-11012-02 | 新增文本/JSON 输出路径 | 1 | TK-11012-01 | 工具链可直接消费 |

### 2.3 US-11013 strict-codes 发现模式测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11013-01 | 新增 `supported_codes=true` 测试 | 1 | US-11012 | 文本输出稳定 |
| TK-11013-02 | 新增 `supported_codes=json` 测试 | 1 | TK-11013-01 | JSON 机读稳定 |

### 2.4 US-11014 strict-codes summary 可观测性
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11014-01 | summary 增加 `mode` 字段 | 1 | US-11012 | 支持 validate/discovery 追溯 |
| TK-11014-02 | summary 增加 `duration_ms` 字段 | 2 | TK-11014-01 | 预检耗时可观测 |

### 2.5 US-11015 fix-template JSON 推荐动作对齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11015-01 | dry-run JSON 对齐 `recommended_actions` | 1 | US-11014 | 机读动作完整 |
| TK-11015-02 | 保持 dry-run/out 参数语义稳定 | 1 | TK-11015-01 | 无行为回退 |

### 2.6 US-11016 fix-template 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11016-01 | 新增 `recommended_actions` JSON 断言 | 1 | US-11015 | payload 可验证 |
| TK-11016-02 | 回归 dry-run/out 组合测试 | 2 | TK-11016-01 | 无回归 |

### 2.7 US-11017 quality-gate strict-codes 归档
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11017-01 | CI 增加 strict-codes 预检步骤 | 2 | US-11014 | typecheck-and-test 可执行 |
| TK-11017-02 | 上传/下载 strict-codes summary artifact | 1 | TK-11017-01 | 汇总可追溯 |

### 2.8 US-11018 quality-gate 汇总与 PR 评论增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11018-01 | 聚合 summary 增加 strict-codes 字段/耗时 | 2 | US-11017 | Step Summary 可读 |
| TK-11018-02 | PR 评论支持异常字段精简模式 | 1 | TK-11018-01 | 噪音可控 |

### 2.9 US-11019 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11019-01 | README/Runbook 补齐发现模式与评论开关说明 | 1 | US-11018 | 值班可查 |
| TK-11019-02 | 实施报告与 Sprint 日志同步 | 2 | TK-11019-01 | 代码文档一致 |

### 2.10 US-11020 S17 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11020-01 | 执行脚本/治理/门禁回归 | 2 | US-11013;US-11016;US-11018;US-11019 | 关键命令全通过 |
| TK-11020-02 | 追加 `REL-054` | 1 | TK-11020-01 | 发布记录闭环 |
| TK-11020-03 | 回填 S17 台账 | 2 | TK-11020-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S17 执行顺序建议
1. 先完成 `US-11011~US-11014`，交付 strict-codes 发现与可观测能力。
2. 再完成 `US-11015~US-11018`，打通 fix-template 与 quality-gate 汇总/评论链路。
3. 最后完成 `US-11019~US-11020`，文档同步与发布收口。

## 4. S17 验收门槛
1. strict-codes 支持 `--supported_codes true|json` 且输出稳定。
2. strict-codes summary 含 `mode`、`duration_ms` 并可被 CI 聚合读取。
3. quality-gate summary/PR 评论展示 strict 预检字段，并支持异常字段精简模式。
4. S17 台账与发布记录完整且校验通过。
