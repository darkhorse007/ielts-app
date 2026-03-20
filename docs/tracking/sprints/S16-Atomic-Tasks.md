# Sprint S16 原子任务清单（Tracking Governance Hardening VII）

## 1. 说明
1. 本清单覆盖 `E10` 在 S16 的新增 Story：`US-11001` ~ `US-11010`。
2. 目标是交付“strict 非空约束 + recommended_actions 机读透出 + quality-gate strict 预检汇总”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-11001 S16 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11001-01 | 梳理 S16 目标与依赖 | 1 | US-10910 | 明确执行边界 |
| TK-11001-02 | 输出原子任务与验收门槛 | 1 | TK-11001-01 | 产出 `S16-Atomic-Tasks.md` |

### 2.2 US-11002 strict code 非空约束
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11002-01 | 增加 `--require_non_empty` 参数 | 2 | US-11001 | 空输入可失败 |
| TK-11002-02 | summary 增加 non-empty 相关字段 | 1 | TK-11002-01 | 可机读追溯 |

### 2.3 US-11003 strict 非空约束测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11003-01 | 新增空输入失败测试 | 1 | US-11002 | 覆盖 require_non_empty |
| TK-11003-02 | 保持通过/容错场景回归 | 1 | TK-11003-01 | 无回归 |

### 2.4 US-11004 checklist/local gate 透传
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11004-01 | checklist 增加 require_non_empty 透传 | 2 | US-11002 | strict 预检可配置 |
| TK-11004-02 | local gate 增加透传与 manifest 字段 | 1 | TK-11004-01 | 本地排障可追溯 |

### 2.5 US-11005 summary 字段测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11005-01 | release checklist 测试断言 non-empty 字段 | 1 | US-11004 | summary 字段稳定 |
| TK-11005-02 | strict 预检步骤回归断言 | 1 | TK-11005-01 | 步骤链稳定 |

### 2.6 US-11006 fix-template recommended_actions
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11006-01 | dry-run JSON 增加 `recommended_actions` | 2 | US-11001 | 自动化可直接消费 |
| TK-11006-02 | 保持 `--out` 与不落盘语义 | 1 | TK-11006-01 | 行为一致 |

### 2.7 US-11007 fix-template recommended_actions 测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11007-01 | 增加 recommended_actions JSON 输出断言 | 1 | US-11006 | payload 完整 |
| TK-11007-02 | 回归 out-file 与参数约束 | 1 | TK-11007-01 | 无行为回退 |

### 2.8 US-11008 quality-gate strict 预检汇总
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11008-01 | CI 增加 strict-codes summary artifact 上传/下载 | 2 | US-11004 | 汇总可追溯 |
| TK-11008-02 | summary 与 PR 评论展示 strict 预检字段 | 1 | TK-11008-01 | 审查可见 |

### 2.9 US-11009 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11009-01 | README/Runbook 同步新参数与命令 | 1 | US-11004;US-11006 | 值班可查 |
| TK-11009-02 | 实施报告与 Sprint 日志同步 | 2 | TK-11009-01 | 代码文档一致 |

### 2.10 US-11010 S16 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11010-01 | 执行脚本/治理/门禁回归 | 2 | US-11003;US-11005;US-11007;US-11009 | 关键命令全通过 |
| TK-11010-02 | 追加 `REL-053` | 1 | TK-11010-01 | 发布记录闭环 |
| TK-11010-03 | 回填 S16 台账 | 2 | TK-11010-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S16 执行顺序建议
1. 先完成 `US-11001~US-11003`，交付 strict 非空约束能力。
2. 再完成 `US-11004~US-11007`，打通透传与机读输出。
3. 最后完成 `US-11008~US-11010`，CI 可观测与发布收口。

## 4. S16 验收门槛
1. strict code 快速校验支持 `require_non_empty` 并有明确失败提示。
2. checklist/local gate 支持配置 strict 非空约束并可追溯。
3. fix-template dry-run JSON 包含 `recommended_actions` 且支持 `--out`。
4. quality-gate summary 与 PR 评论展示 strict 预检结果与缺失产物 triage。
5. S16 台账与发布记录完整且校验通过。
