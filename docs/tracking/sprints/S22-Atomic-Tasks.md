# Sprint S22 原子任务清单（Tracking Governance Hardening XIII）

## 1. 说明
1. 本清单覆盖 `E10` 在 S22 的新增 Story：`US-11061` ~ `US-11070`。
2. 目标是交付“PR 评论逻辑模块化 + abnormal token 参考与 exact 提示 + strict-codes schema 契约一致性”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-11061 S22 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11061-01 | 梳理 S22 目标与依赖 | 1 | US-11060 | 明确执行边界 |
| TK-11061-02 | 输出原子任务与验收门槛 | 1 | TK-11061-01 | 产出 `S22-Atomic-Tasks.md` |

### 2.2 US-11062 PR 评论逻辑模块化
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11062-01 | 抽离评论生成逻辑到 `scripts/ci/quality-gate-pr-comment.js` | 2 | US-11061 | 逻辑可复用 |
| TK-11062-02 | 保持现有评论字段与 triage 模板兼容 | 1 | TK-11062-01 | 输出无回退 |

### 2.3 US-11063 workflow 模块调用改造
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11063-01 | `stability-e2e.yml` 改为调用评论生成模块 | 1 | US-11062 | workflow 逻辑收敛 |
| TK-11063-02 | 保持 PR 评论 upsert 行为一致 | 1 | TK-11063-01 | Bot 评论可持续更新 |

### 2.4 US-11064 标准 token 参考
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11064-01 | 增加标准 token 对照表 | 1 | US-11062 | token 可解释 |
| TK-11064-02 | 增加示例 step name 映射 | 1 | TK-11064-01 | 值班可快速配置 |

### 2.5 US-11065 exact 命中提示
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11065-01 | exact 模式输出 token 命中统计 | 1 | US-11064 | 命中可量化 |
| TK-11065-02 | exact 模式输出未命中 token 调整提示 | 1 | TK-11065-01 | 配置可自修复 |

### 2.6 US-11066 评论生成测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11066-01 | 新增 `quality-gate-pr-comment.test.mjs` | 2 | US-11065 | 覆盖 contains/exact/fallback |
| TK-11066-02 | 接入 `test:release-scripts` Node 聚合摘要链路 | 1 | TK-11066-01 | 门禁可执行 |

### 2.7 US-11067 strict-codes 输出契约对齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11067-01 | `supported_codes+json` 输出补齐 summary 字段 | 2 | US-11061 | 输出结构一致 |
| TK-11067-02 | 保持 validate/json 输出兼容 | 1 | TK-11067-01 | 既有消费不回退 |

### 2.8 US-11068 schema 契约测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11068-01 | 新增 strict-codes schema 契约测试 | 2 | US-11067 | 双模式可验证 |
| TK-11068-02 | 将契约测试接入 Node 摘要链路 | 1 | TK-11068-01 | release 测试可观测 |

### 2.9 US-11069 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11069-01 | README/Runbook 补 token 参考与 exact 提示说明 | 1 | US-11065 | 值班可查 |
| TK-11069-02 | 实施报告与 S8 日志补齐 S22 记录 | 1 | TK-11069-01 | 追溯一致 |

### 2.10 US-11070 S22 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11070-01 | 执行脚本/治理/门禁回归 | 2 | US-11063;US-11066;US-11068;US-11069 | 关键命令全通过 |
| TK-11070-02 | 追加 `REL-059` | 1 | TK-11070-01 | 发布记录闭环 |
| TK-11070-03 | 回填 S22 台账 | 2 | TK-11070-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S22 执行顺序建议
1. 先完成 `US-11061~US-11066`，交付 PR 评论逻辑模块化与异常排序可解释能力。
2. 再完成 `US-11067~US-11068`，交付 strict-codes schema 契约一致性与回归测试。
3. 最后完成 `US-11069~US-11070`，文档同步与发布收口。

## 4. S22 验收门槛
1. quality-gate PR 评论生成逻辑已模块化并通过 Node 单测。
2. 异常模式包含标准 token 参考；`exact` 模式包含命中统计与提示。
3. strict-codes `supported_codes + output_mode=json` 输出可通过 schema 契约验证。
4. `test:release-scripts`、`release:checklist`、tracking 校验全部通过。
5. S22 台账与发布记录完整且校验通过。
