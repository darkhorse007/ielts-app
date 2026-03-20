# Sprint S14 原子任务清单（Tracking Governance Hardening V）

## 1. 说明
1. 本清单覆盖 `E10` 在 S14 的新增 Story：`US-10801` ~ `US-10810`。
2. 目标是交付“strict code 配置校验 + fix-template JSON dry-run + PR 失败排障模板”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-10801 S14 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10801-01 | 梳理 S14 范围、依赖与收口标准 | 1 | US-10710 | 明确执行边界 |
| TK-10801-02 | 输出原子任务清单与验收门槛 | 1 | TK-10801-01 | 产出 `S14-Atomic-Tasks.md` |

### 2.2 US-10802 strict warning code 配置校验
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10802-01 | warning code 输入规范化（大小写与去重） | 1 | US-10801 | `strict_warning_codes` 可稳定解析 |
| TK-10802-02 | 增加非法 code 提示与 summary 字段 | 2 | TK-10802-01 | 输出 `TGW002` 与 `strict_warning_codes_unknown` |

### 2.3 US-10803 strict warning code 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10803-01 | 增加非法 code 提示测试 | 1 | US-10802 | 覆盖 `TGW002` 与 unknown 字段 |
| TK-10803-02 | 增加大小写规范化测试 | 1 | TK-10803-01 | 覆盖 `tgw001 -> TGW001` |

### 2.4 US-10804 fix-template dry-run JSON
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10804-01 | `tracking-governance-fix-template` 支持 `--output_format json` | 2 | US-10801 | dry-run 可输出 JSON |
| TK-10804-02 | JSON 输出补齐计划字段与 apply 命令 | 1 | TK-10804-01 | 自动化可直接消费 |

### 2.5 US-10805 fix-template JSON 测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10805-01 | 新增 dry-run JSON 输出测试 | 1 | US-10804 | 验证 payload 结构 |
| TK-10805-02 | 验证 JSON 模式不落盘 | 1 | TK-10805-01 | 输出目录不生成 |

### 2.6 US-10806 release notes 字段增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10806-01 | release candidate 合并 tracking warnings/strict 字段 | 2 | US-10802 | notes 字段可追溯 |
| TK-10806-02 | 补充 `release-record-from-gate` 断言 | 1 | TK-10806-01 | 防止字段回退 |

### 2.7 US-10807 PR 评论失败排障模板
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10807-01 | PR 评论失败场景增加 triage 模板 | 1 | US-10801 | 失败时首查路径清晰 |
| TK-10807-02 | 增加本地复现命令提示 | 1 | TK-10807-01 | 可直接执行本地复现 |

### 2.8 US-10808 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10808-01 | README 同步 strict code 校验与 JSON dry-run 命令 | 1 | US-10806 | 命令可查 |
| TK-10808-02 | Runbook 同步排障/命令说明 | 2 | TK-10808-01 | 值班可直接执行 |

### 2.9 US-10809 报告与日志同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10809-01 | 实施报告追加 S14 章节 | 1 | US-10808 | 代码与文档一致 |
| TK-10809-02 | Sprint 日志追加 S14 收口记录 | 2 | TK-10809-01 | 时间线可追溯 |

### 2.10 US-10810 S14 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10810-01 | 执行全量校验与脚本回归 | 2 | US-10803;US-10805;US-10808 | 关键命令全部通过 |
| TK-10810-02 | 追加 `REL-051` | 1 | TK-10810-01 | 发布记录闭环 |
| TK-10810-03 | 回填 S14 台账 | 2 | TK-10810-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S14 执行顺序建议
1. 先完成 `US-10801~US-10805`，交付校验与机读计划核心能力。
2. 再完成 `US-10806~US-10808`，打通发布记录与评审排障链路。
3. 最后完成 `US-10809~US-10810`，文档同步与发布收口。

## 4. S14 验收门槛
1. strict warning code 支持非法 code 提示与规范化输出。
2. fix-template dry-run 支持 JSON 输出且不落盘。
3. release notes 含 tracking warnings/strict 字段。
4. PR 评论失败场景含 triage 指引与本地复现命令。
5. S14 台账与发布记录完整且校验通过。
