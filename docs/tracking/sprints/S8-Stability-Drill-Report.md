# S8 稳定性告警演练报告（72h Soak Drill）

## 1. 演练信息
- 日期: 2026-02-28
- 环境: 本地演练环境（Server `http://127.0.0.1:8787`）
- 脚本: `apps/server/scripts/stability-soak-drill.mjs`
- 执行命令:
```bash
node apps/server/scripts/stability-soak-drill.mjs --base_url=http://127.0.0.1:8787 --scenario=all --retry=2 --concurrency=2 --output=artifacts/stability-drill-report.json
```

## 2. 场景结果
| scenario | release_id | run_id | alert_total | 结果 |
|---|---|---|---:|---|
| high-latency | REL-S8-STABLE-DRILL-HIGH-LATENCY | c26c822f-4da5-4d01-b97b-f88294fe3cc5 | 3 | PASS |
| low-success | REL-S8-STABLE-DRILL-LOW-SUCCESS | 11b94baa-ab12-4c25-9c13-8278a3e09320 | 3 | PASS |
| crash-surge | REL-S8-STABLE-DRILL-CRASH-SURGE | 592c32bb-17ce-4e17-8cb2-22d16d59347d | 4 | PASS |

## 3. 演练结论
1. 三类故障注入场景均可触发稳定性告警并可通过接口查询。
2. 脚本已覆盖告警处理动作（自动 `acknowledge` 首条告警）。
3. 长测告警链路满足 `TK-10202-05` 的“形成告警记录”验收目标。

## 4. 复盘建议
1. 将该脚本接入 CI 定时任务，按周输出趋势快照并沉淀历史报告。
2. 告警处理后补充责任人与处置时长字段，便于 SLA 统计。
