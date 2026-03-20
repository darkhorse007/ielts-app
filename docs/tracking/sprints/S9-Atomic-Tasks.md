# Sprint S9 原子任务清单（发布门禁与自动化治理）

## 1. 说明
1. 本清单覆盖 `E10` 在 S9 的新增 Story：`US-10301` ~ `US-10310`。
2. 目标是将发布链路增强从“脚本可用”推进到“可验证、可追溯、可规模化复用”。

## 2. Story 与原子任务映射

### 2.1 US-10301 任务矩阵对齐与执行计划
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10301-01 | 梳理 E10 剩余增强点并映射到 S9 Story | 1 | US-10202 | `backlog.csv` 中形成 S9 Story 列表与依赖链 |
| TK-10301-02 | 形成 S9 原子任务文档与执行顺序 | 1 | TK-10301-01 | 产出 `S9-Atomic-Tasks.md` 并与 Story 对齐 |

### 2.2 US-10302 CI 消费 summary-json 与失败步骤表
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10302-01 | 在 `quality-gate` 中生成/读取 summary-json | 1 | US-10301 | CI 可产出结构化 summary JSON |
| TK-10302-02 | 解析 summary-json 输出失败步骤表到 Step Summary | 1 | TK-10302-01 | 失败步骤自动展示，值班无需翻日志 |

### 2.3 US-10303 checklist 脚本回归测试
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10303-01 | 设计脚本测试桩（fake npm）与断言机制 | 1 | US-10301 | 可在秒级模拟多种步骤成功/失败 |
| TK-10303-02 | 覆盖 fail-fast 与 continue-on-error 场景 | 2 | TK-10303-01 | 两种模式均有自动化断言 |
| TK-10303-03 | 覆盖 summary-json 关键字段回归 | 1 | TK-10303-02 | `failed_step/failed_steps/continue_on_error` 均有断言 |

### 2.4 US-10304 失败归档清单（manifest）
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10304-01 | 为失败归档新增 manifest 生成逻辑 | 1 | US-10301 | 归档目录包含结构化清单文件 |
| TK-10304-02 | 在 manifest 中记录复制文件与 summary 路径 | 1 | TK-10304-01 | 可快速定位排障文件来源 |

### 2.5 US-10305 release checklist dry-run
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10305-01 | 引入 `RELEASE_AUTOMATION_DRY_RUN` 并支持步骤预览 | 1 | US-10301 | dry-run 模式不执行命令但输出步骤 |
| TK-10305-02 | 将 dry-run 结果写入 summary-json | 1 | TK-10305-01 | summary 中可识别 dry-run 执行模式 |

### 2.6 US-10306 前端全量模式一键执行
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10306-01 | 新增本地一键脚本串行执行 API/页面/视觉 E2E | 1 | US-10305 | 单命令可完成四类前端回归 |
| TK-10306-02 | 补齐根命令入口与说明文档 | 1 | TK-10306-01 | `package.json` 与 runbook 均可发现 |

### 2.7 US-10307 release 记录候选模板自动生成
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10307-01 | 基于 summary-json 生成 release row 候选 | 2 | US-10301 | 可输出 `REL-xxx` 候选行 |
| TK-10307-02 | 支持 scope/owner/rollback/notes 参数覆盖 | 1 | TK-10307-01 | 可按发布场景自定义候选内容 |

### 2.8 US-10308 summary-json artifact 归档
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10308-01 | 在 workflow 上传 summary-json artifact | 1 | US-10302;US-10307 | 门禁完成后可下载 summary JSON |
| TK-10308-02 | 在 Step Summary 增加 artifact 说明 | 1 | TK-10308-01 | 值班可快速定位 artifact 名称 |

### 2.9 US-10309 脚本测试与归档清单纳入回归
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10309-01 | 增加脚本测试命令并纳入本地回归链路 | 1 | US-10303;US-10304 | 脚本测试可单独执行 |
| TK-10309-02 | 补齐最小验证命令与结果记录 | 1 | TK-10309-01 | 回归命令可复现且有结果记录 |

### 2.10 US-10310 S9 收口与台账同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-10310-01 | 同步 runbook/实施报告/发布记录/冲刺日志 | 1 | US-10306;US-10308;US-10309 | 文档台账与代码变更一致 |
| TK-10310-02 | 执行 tracking 校验并输出状态摘要 | 1 | TK-10310-01 | `validate_tracking.sh` 与 `status_summary.sh` 通过 |

## 3. S9 执行顺序建议
1. 先完成 `US-10301`、`US-10305` 打通任务建模与 dry-run 预览能力。
2. 再推进 `US-10302`、`US-10308` 建立 CI summary-json 可见性与归档。
3. 并行完成 `US-10303`、`US-10304`、`US-10309`，确保脚本变更有回归和排障保障。
4. 最后收口 `US-10306`、`US-10307`、`US-10310`，形成可执行命令与发布台账闭环。

## 4. S9 验收门槛
1. `US-10301`~`US-10310` 的 DoD 均满足。
2. quality-gate 可产出并归档 summary-json，且 Step Summary 展示失败步骤。
3. `release:checklist` 支持 `fail-fast`、`continue-on-error`、`dry-run` 三种执行模式。
4. 发布记录候选模板可由 summary-json 自动生成。
