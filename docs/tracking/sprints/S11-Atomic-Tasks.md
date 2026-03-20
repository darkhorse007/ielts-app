# Sprint S11 原子任务清单（Tracking Governance Hardening II）

## 1. 说明
1. 本清单覆盖 `E10` 在 S11 的新增 Story：`US-10501` ~ `US-10510`。
2. 目标是把治理能力从“可校验”推进到“可修复、可提示、可追溯”。

## 2. Story 与原子任务映射

### 2.1 US-10501 S11 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10501-01 | 梳理 S11 治理强化范围与依赖 | 1 | US-10410 | 输出 10 项执行清单 |
| TK-10501-02 | 固化执行顺序与收口标准 | 1 | TK-10501-01 | 产出 `S11-Atomic-Tasks.md` |

### 2.2 US-10502 set_status 接入 sprint 自检
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10502-01 | `set_status.sh` 调用 `tracking-governance --sprint` | 2 | US-10501 | Done/Released 前执行 sprint 级治理自检 |
| TK-10502-02 | 输出 sprint 定向修复命令与 summary 路径 | 1 | TK-10502-01 | 失败提示含一键修复命令 |

### 2.3 US-10503 治理修复模板脚本
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10503-01 | 新增 `tracking-governance-fix-template.sh` | 2 | US-10502 | 支持从 summary 生成修复模板 |
| TK-10503-02 | 生成 apply 脚本与 fix-steps 文档 | 1 | TK-10503-01 | 输出目录可直接用于补齐文档 |

### 2.4 US-10504 release helper 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10504-01 | 新增 `release-record-from-gate` 测试脚本 | 1 | US-10503 | 覆盖 dry-run/告警/追加成功/冲突失败 |
| TK-10504-02 | 纳入 `test:release-scripts` 聚合命令 | 1 | TK-10504-01 | release 脚本回归一键执行 |

### 2.5 US-10505 quality-gate 汇总 tracking artifact
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10505-01 | `quality-gate` job 下载 tracking summary artifact | 1 | US-10406 | 下载失败不阻断（continue-on-error） |
| TK-10505-02 | 将 tracking 状态写入 summary-json | 1 | TK-10505-01 | `tracking_governance.status/issues_count` 可追溯 |

### 2.6 US-10506 汇总展示增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10506-01 | Step Summary 增加 tracking 区块 | 1 | US-10505 | 展示状态/问题数/artifact 命中 |
| TK-10506-02 | PR 评论增加 tracking 字段 | 1 | TK-10506-01 | PR 中可直接查看治理状态 |

### 2.7 US-10507 治理校验测试增强
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10507-01 | 增加 `--sprint` 失败场景测试 | 1 | US-10502 | 覆盖 sprint 参数格式错误场景 |
| TK-10507-02 | 校验 `issue_details.code` 结构 | 1 | TK-10507-01 | 错误码回归稳定 |

### 2.8 US-10508 S11 tracking 台账同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10508-01 | 回填 backlog/activity/metrics/sprint/retro | 2 | US-10504;US-10506 | S11 台账完整可校验 |
| TK-10508-02 | 更新 sprint-board 与 README 索引 | 1 | TK-10508-01 | 入口文档可发现 S11 资产 |

### 2.9 US-10509 工程文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10509-01 | runbook 增加 sprint 校验/修复模板命令 | 1 | US-10503 | 值班可直接使用修复命令 |
| TK-10509-02 | 实施报告追加 S11 收口记录 | 1 | TK-10509-01 | 代码与报告一致 |

### 2.10 US-10510 S11 收口与发布记录
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10510-01 | 执行脚本回归与 tracking 校验 | 1 | US-10504;US-10508;US-10509 | 所有关键命令通过 |
| TK-10510-02 | 生成并追加 `REL-048` | 1 | TK-10510-01 | release 台账闭环 |

## 3. S11 执行顺序建议
1. 先完成 `US-10501~US-10504`，补齐脚本能力与测试保障。
2. 再落地 `US-10505~US-10507`，打通 CI 汇总与展示链路。
3. 最后完成 `US-10508~US-10510`，回填台账并完成发布收口。

## 4. S11 验收门槛
1. `set_status.sh` 在 `Done/Released` 状态流转时可调用 sprint 自检并给出修复命令。
2. `tracking-governance-fix-template.sh` 可根据 summary 生成补齐模板与操作步骤。
3. `quality-gate-summary.json` 含 `tracking_governance.status/issues_count` 并同步到 Step Summary 与 PR 评论。
4. S11 台账（backlog/activity/metrics/sprint/retro/releases）完整且校验通过。
