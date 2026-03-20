# Sprint S26 原子任务清单（Tracking Governance Hardening XVII）

## 1. 说明
1. 本清单覆盖 `E10` 在 S26 的新增 Story：`US-11111` ~ `US-11120`。
2. 目标是交付“env-file export 兼容 + checked_at 格式契约收紧 + 截断调参模板化”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-11111 S26 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11111-01 | 梳理 S26 边界与依赖 | 1 | US-11100 | 输出执行范围 |
| TK-11111-02 | 固化原子任务与验收门槛 | 1 | TK-11111-01 | 产出 `S26-Atomic-Tasks.md` |

### 2.2 US-11112 env-file export 兼容
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11112-01 | 支持 `export\s+KEY=VALUE` 解析 | 2 | US-11111 | 与现有 KEY=VALUE 共存 |
| TK-11112-02 | 保持 env 合并优先级语义不变 | 1 | TK-11112-01 | `env_file < process.env` |

### 2.3 US-11113 export 非法赋值失败语义
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11113-01 | `export` 缺失 `=` 时返回 assignment 错误 | 1 | US-11112 | 错误可定位 |
| TK-11113-02 | 保持 key 格式校验与行号定位 | 1 | TK-11113-01 | 无回退 |

### 2.4 US-11114 export 回归测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11114-01 | 增加 export 正向解析测试 | 1 | US-11112 | 渲染结果可断言 |
| TK-11114-02 | 增加 export 非法赋值负向测试 | 1 | TK-11113 | 失败语义稳定 |

### 2.5 US-11115 checked_at 格式约束
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11115-01 | schema 为 `checked_at` 增加 `format: date-time` | 2 | US-11116 | 时间格式明确 |
| TK-11115-02 | 验证 strict-codes 输出满足新约束 | 1 | TK-11115-01 | 无兼容回退 |

### 2.6 US-11116 date-time 契约测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11116-01 | 契约测试接入 Ajv formats 插件 | 1 | US-11115 | 启用 format 校验 |
| TK-11116-02 | 增加 invalid `checked_at` 负向断言 | 1 | TK-11116-01 | date-time 异常可检测 |

### 2.7 US-11117 回归验证
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11117-01 | 执行 `test:release-scripts` 回归 | 2 | US-11114;US-11116 | 脚本链路通过 |
| TK-11117-02 | 执行 strict checklist 与 tracking 校验 | 1 | TK-11117-01 | 门禁与治理一致 |

### 2.8 US-11118 runbook 调参指引
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11118-01 | 增加 `abnormal_steps_truncated` 调参建议区间 | 1 | US-11114 | 值班可快速调参 |
| TK-11118-02 | 明确临时升高后回落策略 | 1 | TK-11118-01 | 控制评论噪声 |

### 2.9 US-11119 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11119-01 | 更新实施报告与 S8 执行日志 | 1 | US-11118 | 变更可追溯 |
| TK-11119-02 | 更新 README/sprint-board/索引 | 1 | TK-11119-01 | 索引一致 |

### 2.10 US-11120 S26 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11120-01 | 同步 backlog/activity/metrics 与 S26 文档 | 2 | US-11119 | 台账字段完整 |
| TK-11120-02 | 追加 `REL-063` 并复核治理校验 | 2 | TK-11120-01 | 发布记录闭环 |

## 3. S26 执行顺序建议
1. 先完成 `US-11111~US-11114`，交付 env-file export 兼容与回归。
2. 再完成 `US-11115~US-11117`，完成 checked_at 格式契约与门禁验证。
3. 最后完成 `US-11118~US-11120`，补齐调参模板、台账与发布收口。

## 4. S26 验收门槛
1. env-file 支持 `export KEY=VALUE`，错误语义保持可定位。
2. strict-codes schema 对 `checked_at` 强制 date-time，契约测试覆盖正负场景。
3. runbook 包含 `abnormal_steps_truncated` 调参指引。
4. `test:release-scripts` 与 strict `release:checklist` 全通过。
5. S26 台账与发布记录完整且治理校验通过。
