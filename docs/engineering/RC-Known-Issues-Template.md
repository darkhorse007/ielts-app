# RC 已知问题模板（Known Issues Template）

## 1. 使用说明
1. 用于 RC / 预发 / 演练环境记录“已知但暂不阻断发布”的问题。
2. 若问题达到 P0 或主链路阻断级别，不应记录在本模板后继续发布，而应转为 `No-Go`。
3. 每条问题都应包含：
- 用户影响
- 复现条件
- 临时绕过方式
- owner 与修复目标

## 2. 汇总字段
- RC 版本:
- 记录日期:
- 记录人:
- 决策结论: `Go` / `Go with Known Issues` / `No-Go`

## 3. 已知问题列表
| issue_id | severity | area | user_impact | repro_steps | workaround | owner | target_fix | release_decision | status |
|---|---|---|---|---|---|---|---|---|---|
| KI-001 | Medium |  |  | 1. 2. 3. |  |  |  | Go with Known Issues | Open |

## 4. 填写建议
### 4.1 severity 建议
- `Low`: 不影响主链路，可接受的展示或日志问题
- `Medium`: 影响局部功能，但存在明确绕过方式
- `High`: 影响重要功能，通常需要 `Go with Known Issues` 明确批准

### 4.2 status 建议
- `Open`: RC 当下仍存在
- `Accepted`: 已评估接受，允许随 RC 发布
- `Fixed`: 已修复，待下次回归关闭
- `Obsolete`: 环境或范围变化后不再适用

## 5. 示例
| issue_id | severity | area | user_impact | repro_steps | workaround | owner | target_fix | release_decision | status |
|---|---|---|---|---|---|---|---|---|---|
| KI-EXAMPLE-01 | Medium | Postgres Smoke | 本机未启动 Docker daemon 时无法执行默认 Postgres smoke | 1. 执行 `npm run smoke:postgres:e2e-local` 2. Docker daemon 未启动 3. 脚本失败 | 启动 Docker / OrbStack，或设置 `POSTGRES_CONNECTION_STRING=... POSTGRES_SMOKE_START_DOCKER=false` | codex | 下个 infra 收口窗口 | Go with Known Issues | Accepted |
