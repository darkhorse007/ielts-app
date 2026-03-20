# Sprint S31 原子任务清单（Release Ops Polish & RC Packaging）

## 1. 说明
1. 本清单覆盖 `E10` 在 S31 的新增 Story：`US-11157` ~ `US-11160`。
2. 目标是把“能跑完 release checklist”进一步收敛为“环境失败可快速判读 + RC 交付包可一键生成”。

## 2. Story 与原子任务映射

### 2.1 US-11157 S31 范围冻结与验收矩阵
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11157-01 | 盘点当前 open retro action items 与发布运维缺口 | 1 | US-11156 | 明确仅保留 daemon 预检与 RC 出包两条主线 |
| TK-11157-02 | 固化 S31 Story、依赖与验收矩阵 | 1 | TK-11157-01 | 产出 `S31.md` 与 `S31-Atomic-Tasks.md` |

### 2.2 US-11158 Postgres smoke daemon 预检与 FAQ
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11158-01 | 为默认本地容器路径增加 daemon 就绪预检与失败提示 | 2 | US-11157 | daemon 不可用时快速失败并输出可执行指引 |
| TK-11158-02 | 将外部 Postgres fallback 与 FAQ 收敛到 runbook/README | 1 | TK-11158-01 | 值班与本地开发可直接复制命令执行 |

### 2.3 US-11159 RC 交付包自动生成与命令接入
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11159-01 | 设计 RC 包目录结构与输入清单 | 1 | US-11158 | 明确 summary、模板、输出目录与命名规则 |
| TK-11159-02 | 实现基于 gate summary 的 RC 出包脚本与 package 命令 | 2 | TK-11159-01 | 一条命令生成完整 RC 目录 |
| TK-11159-03 | 补脚本测试与文档说明 | 1 | TK-11159-02 | 缺文件 / dry-run / 自定义输出目录场景可回归 |

### 2.4 US-11160 S31 收口与 tracking 同步
| task_id | 任务 | 预估 | 依赖 | 完成定义（DoD） |
|---|---|---|---|---|
| TK-11160-01 | 同步 backlog/activity/metrics/release/risk/runbook | 1 | US-11159 | tracking 与脚本能力保持一致 |
| TK-11160-02 | 输出 S31 验收结论与遗留项清单 | 1 | TK-11160-01 | 为后续 RC / nightly 运维输入留档 |

## 3. 执行顺序建议
1. 先完成 `US-11157`，冻结 S31 范围，避免再次扩张工作面。
2. 再完成 `US-11158`，优先解决环境未就绪时的失败语义问题。
3. 之后完成 `US-11159`，把 summary 驱动的 RC 出包自动化落地。
4. 最后完成 `US-11160`，收敛 release 记录与 tracking 台账。

## 4. 验收关注点
1. daemon 预检不能误拦截“用户显式传入外部 Postgres”的路径。
2. RC 出包默认行为必须避免覆盖已人工编辑的文件。
3. 新增脚本入口需要与 runbook / RC 模板 / 发布记录口径保持一致，避免再次产生文档漂移。
