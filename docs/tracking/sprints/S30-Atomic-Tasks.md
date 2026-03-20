# Sprint S30 原子任务清单（Practice Persistence & Recovery II）

## 1. 说明
1. 本清单覆盖 `E10` 在 S30 的新增 Story：`US-11149` ~ `US-11156`。
2. 目标是把内容训练主链路从“基础持久化”推进到“practice / speaking / writing / mock 全链路恢复验证”。

## 2. Story 与原子任务映射

### 2.1 US-11149 S30 范围冻结与验收矩阵
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11149-01 | 盘点 S29 后剩余未持久化模块与恢复缺口 | 1 | US-11148 | 输出优先级顺序 |
| TK-11149-02 | 固化 S30 Story、依赖与验收矩阵 | 1 | TK-11149-01 | 产出 `S30.md` 与 `S30-Atomic-Tasks.md` |

### 2.2 US-11150 practice 与 retry queue 持久化
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11150-01 | 设计 practice/retry queue 仓储与 schema | 2 | US-11149 | schema 与对象边界明确 |
| TK-11150-02 | 接入 listening/reading practice 与 retry queue Postgres 后端 | 3 | TK-11150-01 | 现有 API 与回归保持通过 |

### 2.3 US-11151 speaking 持久化与重连恢复
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11151-01 | 持久化 speaking session 与关键 transcript / status 状态 | 3 | US-11150 | speaking session 可跨重启恢复 |
| TK-11151-02 | 增加 reconnect / resume recovery 回归 | 2 | TK-11151-01 | reconnect 后状态一致 |

### 2.4 US-11152 writing 持久化
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11152-01 | 持久化 writing evaluation / rewrite archive / template usage | 3 | US-11150 | writing 结果与历史可恢复 |
| TK-11152-02 | 补充 writing 持久化专项测试 | 2 | TK-11152-01 | 正反向回归通过 |

### 2.5 US-11153 mock exam/report 持久化与恢复
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11153-01 | 持久化 mock exam、report 与进度恢复状态 | 3 | US-11151;US-11152 | mock exam 可恢复 |
| TK-11153-02 | 增加 mock exam restart recovery 回归 | 2 | TK-11153-01 | 报告与回写状态稳定 |

### 2.6 US-11154 内容训练主链路 restart recovery
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11154-01 | 扩展 Postgres 集成测试覆盖 practice / speaking / writing / mock 恢复 | 1 | US-11151;US-11152;US-11153 | 关键恢复路径自动化 |
| TK-11154-02 | 增加本地浏览器 smoke 覆盖内容训练恢复链路 | 2 | TK-11154-01 | smoke 可一条命令执行 |

### 2.7 US-11155 多仓储运行手册与 smoke 扩展
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11155-01 | 更新 runbook/env 继承顺序与推荐矩阵 | 1 | US-11154 | 值班与本地排障可直接执行 |
| TK-11155-02 | 扩展 smoke/release 文档说明 | 1 | TK-11155-01 | RC 清单与 runbook 一致 |

### 2.8 US-11156 S30 收口与台账同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11156-01 | 同步 backlog/activity/metrics/release/risk/runbook | 1 | US-11155 | tracking 与代码一致 |
| TK-11156-02 | 输出 S30 验收结论与遗留项清单 | 1 | TK-11156-01 | 为下一轮输入留档 |

## 3. 执行顺序建议
1. 先完成 `US-11150`，建立 practice/retry queue 的仓储模式。
2. 再完成 `US-11151`、`US-11152`、`US-11153`，把 speaking / writing / mock 分别落库。
3. 最后完成 `US-11154`、`US-11155`、`US-11156`，收敛 smoke、手册与发布台账。

## 4. 验收关注点
1. 不得因新增仓储破坏现有 learner / practice / observability / release 回归。
2. 需要明确 practice / speaking / writing / mock 的重启后“恢复”定义，避免只存数据而无可用恢复路径。
3. 所有新增 Story 状态流转必须同步回写 `backlog.csv` 与 `activity-log.csv`。
