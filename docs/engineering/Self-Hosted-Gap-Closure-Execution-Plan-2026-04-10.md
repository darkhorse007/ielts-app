# Self-Hosted Gap Closure Execution Plan

- 日期: 2026-04-10
- 依据:
  1. `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`
  2. `docs/backlog/Self-Hosted-Completion-Followups-2026-04-10.md`
- 目标: 把“代码主链路基本完成”推进到“原生交互、前端消费、工程收敛、验证留痕均可交付”

## 1. 当前基线与目标口径

当前基线:
1. learner 主链路完成度约 `90%-92%`
2. 若将原生音频深度、analytics 前端消费、shared-client 收敛、设备 / Postgres 留痕纳入，整体约 `83%-86%`

目标口径:
1. `GC1-GC2` 完成后，可对外表述为“Web + Mobile self-hosted learner 主链路全面闭环并进入可验收状态”
2. `GC3-GC4` 完成后，可对内表述为“跨端共享层、设备验证与交付证据均已收口”

## 1.1 2026-04-10 进展更新

已完成:
1. `US-11301` Mobile speaking 原生语音输入闭环
2. `US-11302` Mobile listening 真实播放器闭环
3. `US-11303` Web / Mobile 关键 analytics 接入
4. `US-11306` analytics 覆盖核对 smoke
5. `US-11308` shared-client 独立收敛
6. `US-11309` shared-client 契约测试

本次新增验证:
1. `npm run typecheck --workspace @ielts/client`
2. `npm run typecheck --workspace @ielts/mobile`
3. `npm run test --workspace @ielts/client`
4. `npm run test --workspace @ielts/mobile`
5. `npm run test --workspace @ielts/server -- tests/s36-analytics-coverage-smoke.test.ts`
6. `npm run typecheck --workspace @ielts/shared-client`
7. `npm run test --workspace @ielts/shared-client`

当前下一优先级:
1. `US-11310` ~ `US-11312` Postgres / 真机 / 高风险账户动作执行留痕
2. `US-11307` progress / plan 冲突修复建议增强

## 1.2 2026-04-11 GC4 进展更新

已完成:
1. `US-11310` 已形成最新 Postgres smoke 留痕:
   - `npm run smoke:postgres:e2e-local`
   - 6 组 migrate 成功
   - server postgres integration `24/24`
   - client Playwright API smoke `1/1`
2. `US-11312` 已形成高风险账户动作专项回归留痕:
   - 导出
   - 删除
   - 提醒点击 / 设备注册
   - 实例切换

已记录但未完全收口:
1. `US-11311` 已形成最新执行证据，但 device smoke 当前未通过:
   - `npm run test:mobile` 通过，`119/119`
   - iOS simulator smoke 卡在 bundle / driver ready
   - Android emulator smoke 明确报错 `Cannot find native module 'ExpoSpeechRecognition'`

当前剩余优先级:
1. 修复 `US-11311` 的 device smoke 执行路径，优先转向 development build / dev client
2. 继续推进 `US-11307` progress / plan 冲突修复建议增强
3. 持续同步交付证据到 release / runbook / roadmap

## 2. 执行原则

1. 只处理 `self-hosted learner` 当前范围内缺口，不回滚到支付、Admin、发布治理历史范围。
2. 优先补“用户真实体验未闭环”的项，再补“工程与验证证据不足”的项。
3. 每个 Story 必须同时产出代码改动和可复验的证据，不能只补文档或只补接口。
4. 本轮编号统一使用 `US-11301~US-11312`，避免与历史 tracking / release Story 冲突。

## 3. 工作流分组

### GC1 原生口语 + 行为埋点首批闭环

| Story | 目标 | 主要代码区域 | 退出标准 |
|---|---|---|---|
| `US-11301` | Mobile speaking 原生音频输入闭环 | `apps/mobile/app/speaking.tsx` | iOS / Android 真正采集麦克风输入进入 speaking session；前后台切换后可恢复；无权限时提示明确 |
| `US-11304` | speaking 录音异常 / 恢复 UX | `apps/mobile/app/speaking.tsx` | 连接中断、录音失败、权限拒绝、后台恢复均有显式状态反馈 |
| `US-11303` | Web / Mobile 关键 analytics 接入 | `apps/client/src/lib/api-client.ts`、`apps/mobile/src/lib/api-client.ts`、`apps/server/src/routes/analytics.ts` | onboarding、practice submit、writing evaluate、mock submit、reminder click 至少 5 类关键事件端到端可见 |

### GC2 原生听力 + 埋点覆盖校验

| Story | 目标 | 主要代码区域 | 退出标准 |
|---|---|---|---|
| `US-11302` | Mobile listening 真实播放器闭环 | `apps/mobile/app/listening.tsx` | 真实播放、暂停、定位、倍速与中断恢复生效，播放状态继续回写 |
| `US-11305` | listening 播放异常 / 恢复 UX | `apps/mobile/app/listening.tsx` | 缓冲失败、耳机切换、播放完成、重试入口均可见 |
| `US-11306` | analytics 覆盖核对 smoke | Web / Mobile 提交链路与 analytics summary | 关键事件存在 smoke / checklist，缺失埋点可被快速发现 |

### GC3 工程收敛与冲突修复引导

| Story | 目标 | 主要代码区域 | 退出标准 |
|---|---|---|---|
| `US-11308` | shared-client 独立收敛 | `packages/shared-client/src/*` | shared-client 不再只是 re-export；Web / Mobile 从包导出消费共享实现 |
| `US-11309` | shared-client 契约测试 | `packages/shared-client/src/*`、`packages/shared-client` tests | 至少覆盖 5 类关键契约测试 |
| `US-11307` | progress / plan 冲突修复建议增强 | Mobile progress / study-loop 相关页面与状态层 | 至少 4 类核心冲突场景给出可执行下一步动作 |

### GC4 交付证据补齐

| Story | 目标 | 主要证据输出 | 退出标准 |
|---|---|---|---|
| `US-11310` | Postgres smoke 留痕 | release / tracking / runbook 记录 | 至少 1 轮 Postgres 主链路 smoke 结果可追溯 |
| `US-11311` | iOS / Android 设备 smoke 留痕 | mobile runbook / tracking 记录 | 两端各至少 1 轮 smoke 记录可追溯 |
| `US-11312` | 高风险账户动作专项回归留痕 | 账户专项回归记录 | 导出、删除、提醒、实例切换 4 类动作均有最新执行留痕 |

## 4. 推荐执行顺序

1. `GC1`
   - 先解决 speaking 的“协议层完成但原生音频没闭环”问题，同时把 analytics 真正接到业务动作上。
2. `GC2`
   - 再解决 listening 的“状态恢复已完成但真实播放器没闭环”问题，并把 analytics 校验补齐。
3. `GC3`
   - 在主体验可交付后，再做 shared-client 收敛和冲突修复建议增强，避免过早抽象。
4. `GC4`
   - 最后统一补 Postgres、真机、账户高风险动作的最新执行证据，形成交付留痕。

## 5. 每组最小验证清单

### GC1 / GC2
1. `npm run typecheck`
2. `npm test`
3. `npm run smoke:quality-gate:mobile-local`
4. 至少一轮 iOS / Android 实机或模拟器 smoke

### GC3
1. `npm run typecheck`
2. `npm test`
3. `packages/shared-client` 独立 test / typecheck 通过

### GC4
1. `npm run smoke:postgres:e2e-local`
2. `npm run smoke:e2e:mobile-ios-local`
3. `npm run smoke:e2e:mobile-android-local`
4. 在 tracking / runbook / release 记录中补日期、环境、结果、失败项

## 6. 不建议并行推进的组合

1. 不建议在 `US-11301` 未稳定前先做 `US-11308`，否则会把移动端原生音频问题和共享层抽象问题耦合在一起。
2. 不建议在 `US-11303` 未落地前先做 `US-11306`，否则 smoke 只能验证空壳。
3. 不建议把 `GC4` 提前到 `GC1-GC2` 之前，否则只会固化一份针对半闭环实现的验证记录。

## 7. 完成判定

当以下条件同时满足时，可认为本轮 gap closure 达标:
1. `US-11301`、`US-11302`、`US-11303` 已完成并通过真实链路验证
2. `US-11308` / `US-11309` 让 shared-client 脱离空壳状态
3. `US-11310` ~ `US-11312` 已形成可追溯执行证据
4. `docs/README.md`、路线图、补洞 backlog 与实际代码状态一致

当前判断:
1. `US-11310`、`US-11312` 已达标
2. `US-11311` 已留痕但未通过设备门禁，因此 `GC4` 仍处于“部分收口”
