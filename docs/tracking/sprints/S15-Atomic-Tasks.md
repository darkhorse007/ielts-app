# Sprint S15 原子任务清单（Tracking Governance Hardening VI）

## 1. 说明
1. 本清单覆盖 `E10` 在 S15 的新增 Story：`US-10901` ~ `US-10910`。
2. 目标是交付“strict code 快速预检 + checklist 前置校验 + fix-template JSON out + 缺失产物排障”并完成闭环。

## 2. Story 与原子任务映射

### 2.1 US-10901 S15 任务矩阵与执行顺序
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10901-01 | 梳理 S15 目标与依赖 | 1 | US-10810 | 明确执行边界 |
| TK-10901-02 | 输出原子任务与验收门槛 | 1 | TK-10901-01 | 产出 `S15-Atomic-Tasks.md` |

### 2.2 US-10902 strict code 快速校验命令
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10902-01 | 新增 strict code 快速校验脚本 | 2 | US-10901 | 支持通过/失败判定 |
| TK-10902-02 | 新增 summary 输出与 allow_unknown 模式 | 1 | TK-10902-01 | 可机读追溯 |

### 2.3 US-10903 strict code 测试补齐
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10903-01 | 覆盖通过/失败场景 | 1 | US-10902 | `TGW001` 通过，非法 code 失败 |
| TK-10903-02 | 覆盖 allow_unknown 场景 | 1 | TK-10903-01 | 容错模式行为稳定 |

### 2.4 US-10904 checklist 前置 strict code 预检
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10904-01 | release checklist 增加 strict code 预检步骤 | 2 | US-10902 | strict 模式下前置执行 |
| TK-10904-02 | summary 步骤链路兼容 | 1 | TK-10904-01 | 兼容 fail-fast/continue-on-error/dry-run |

### 2.5 US-10905 local gate 开关与 manifest
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10905-01 | 本地门禁增加 strict code 预检开关透传 | 1 | US-10904 | 支持环境变量控制 |
| TK-10905-02 | manifest 新增配置字段 | 1 | TK-10905-01 | 排障可追溯 |

### 2.6 US-10906 fix-template JSON `--out`
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10906-01 | 增加 `--out` 参数 | 1 | US-10901 | 支持写入 JSON 输出文件 |
| TK-10906-02 | 限制参数组合 | 2 | TK-10906-01 | 仅 `dry_run + json` 可用 |

### 2.7 US-10907 fix-template `--out` 回归
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10907-01 | 增加 JSON out 文件测试 | 1 | US-10906 | 验证 payload 与文件写入 |
| TK-10907-02 | 增加非法参数组合失败测试 | 1 | TK-10907-01 | 防止误用回退 |

### 2.8 US-10908 PR 缺失 tracking artifact 排障提示
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10908-01 | PR 评论增加 “artifact 缺失” triage 模板 | 1 | US-10904 | 缺失场景可定位 |
| TK-10908-02 | 增加本地复现/验证命令提示 | 1 | TK-10908-01 | 减少沟通成本 |

### 2.9 US-10909 文档同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10909-01 | README 同步 strict 预检命令与 fix-template out 命令 | 1 | US-10905;US-10906 | 命令可查可执行 |
| TK-10909-02 | Runbook/实施报告/Sprint 日志同步 | 2 | TK-10909-01 | 文档与代码一致 |

### 2.10 US-10910 S15 收口
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10910-01 | 执行脚本回归与治理校验 | 2 | US-10903;US-10907;US-10909 | 关键命令全部通过 |
| TK-10910-02 | 追加 `REL-052` | 1 | TK-10910-01 | 发布记录闭环 |
| TK-10910-03 | 回填 S15 台账 | 2 | TK-10910-02 | backlog/activity/metrics/sprint/retro 完整 |

## 3. S15 执行顺序建议
1. 先完成 `US-10901~US-10903`，交付 strict code 快速预检能力。
2. 再完成 `US-10904~US-10907`，打通 checklist/local gate 与 JSON out。
3. 最后完成 `US-10908~US-10910`，完善评审排障与发布收口。

## 4. S15 验收门槛
1. strict code 快速校验命令可独立运行并支持 summary 输出。
2. checklist strict 模式可前置执行 strict code 预检步骤。
3. fix-template dry-run JSON 支持 `--out` 文件输出并有参数约束。
4. PR 评论在 tracking artifact 缺失时含专项排障提示。
5. S15 台账与发布记录完整且校验通过。
