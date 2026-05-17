# Self-Hosted Completion Follow-ups

- 日期: 2026-04-10
- 来源: `docs/engineering/Codebase-Completion-Audit-2026-04-10.md`
- 目标: 将当前 self-hosted 分支剩余缺口整理为可执行 backlog

## 1. 使用说明

1. 本文档只覆盖 `self-hosted` 当前仍在范围内的补洞项。
2. 本文档不包含支付、订阅、Admin 后台、发布治理等已明确移出范围的能力。
3. 本文档用于承接“代码已基本完成，但仍未达到强闭环”的需求项。
4. 为避免与历史 `tracking` / `release` Story 编号冲突，本文统一使用 `US-11301~US-11312` 作为本轮 gap-closure 预留编号。

## 2. 优先级定义

- `P0`: 若不完成，将直接影响当前 self-hosted learner 范围的对外交付口径
- `P1`: 不阻断当前主链路，但会影响移动端质量、可演示性或后续维护成本
- `P2`: 收敛型工作，提升工程质量或验证确定性

## 3. 建议执行顺序

1. 先补 Mobile speaking 原生音频输入闭环
2. 再补 Mobile listening 真实播放器闭环
3. 再补关键行为 analytics 接入
4. 再收敛 `packages/shared-client`
5. 最后补部署 / 设备 / Postgres 验证留痕

## 3.1 2026-04-10 实施进展

已完成:
1. `US-11301` Mobile speaking 原生语音输入闭环，设备端语音识别已接入现有 speaking realtime `partial_transcript`。
2. `US-11302` Mobile listening 真实播放器闭环，随包样例音频、原生播放、暂停、定位、恢复与播放状态回写已跑通。
3. `US-11303` Web / Mobile 关键行为 analytics 接入，已覆盖 onboarding、practice submit、writing evaluate、mock submit、reminder click。
4. `US-11306` analytics 覆盖核对 smoke，已补服务端 summary smoke 与 Web / Mobile 埋点核对清单。
5. `US-11308` shared-client 独立收敛，`api-client`、`api-types`、`validators` 已正式迁入 `packages/shared-client/src`。
6. `US-11309` shared-client 契约测试，shared-client 已具备独立 `typecheck` / `test` 与关键契约测试。

已验证:
1. `npm run test --workspace @ielts/client`
2. `npm run test --workspace @ielts/mobile`
3. `npm run typecheck --workspace @ielts/client`
4. `npm run typecheck --workspace @ielts/mobile`
5. `npm run test --workspace @ielts/server -- tests/s36-analytics-coverage-smoke.test.ts`
6. `npm run typecheck --workspace @ielts/shared-client`
7. `npm run test --workspace @ielts/shared-client`

## 3.2 2026-04-11 GC4 留痕进展

已新增执行证据:
1. `US-11310`:
   - `npm run smoke:postgres:e2e-local` 已通过
   - server postgres integration `24/24`
   - client Playwright API smoke `1/1`
2. `US-11312`:
   - server / client / mobile 定向专项回归已通过
   - 导出、删除、提醒、实例切换 4 类动作均已有 2026-04-11 留痕

当前阻断:
1. `US-11311` 虽已执行，但 mobile device smoke 未闭环:
   - iOS: `iOSDriverTimeoutException`
   - Android: `Cannot find native module 'ExpoSpeechRecognition'`
2. 当前 blocker 不在 route-level regression，而在 Expo Go 设备执行路径

证据入口:
1. `docs/engineering/Self-Hosted-Delivery-Evidence-2026-04-11.md`

## 4. P0 Backlog

| Story ID | 优先级 | 用户故事 | 当前缺口 | 建议实现 | 验收标准 | 依赖 | 点数 |
|---|---|---|---|---|---|---|---|
| US-11301 | P0 | 作为移动端考生，我可以通过真实麦克风采集进入实时口语会话，而不是手动输入转写文本。 | 当前 Mobile speaking 只完成权限校验、WebSocket 与文本驱动 transcript 发送。 | 引入原生录音采集与分段上传 / 转写接入，保留现有恢复与 retry 语义。 | iOS / Android 可创建 speaking session、说话、收到评分更新；应用切后台再回来可恢复；无权限时提示明确。 | 现有 speaking API/WS | 8 |
| US-11302 | P0 | 作为移动端考生，我可以在听力训练中使用真实播放器完成播放、暂停、定位与恢复。 | 当前 Mobile listening 更偏播放状态表单化验证，没有真实播放器链路。 | 接入原生音频播放、播放进度监听、中断恢复与耳机切换状态提示。 | iOS / Android 可播放题目音频；倍速 / 位置 / 段落切换真实生效；系统打断后可恢复；播放状态继续回写服务端。 | 现有 listening API | 8 |
| US-11303 | P0 | 作为产品与交付方，我可以看到真实发生的关键学习行为分析事件，而不是只有后端接口。 | `analyticsBatch` 与实验接口已存在，但前端业务未真实调用。 | 在 Web / Mobile 接入关键行为埋点，优先覆盖 onboarding、practice submit、writing evaluate、mock submit、reminder click。 | 服务端 summary 能看到 `web` / `ios` / `android` 平台事件；至少 5 个关键事件端到端可验证；导出数据中可看到已写入事件。 | analytics routes | 5 |

## 5. P1 Backlog

| Story ID | 优先级 | 用户故事 | 当前缺口 | 建议实现 | 验收标准 | 依赖 | 点数 |
|---|---|---|---|---|---|---|---|
| US-11304 | P1 | 作为移动端考生，我可以在 speaking 中看到更完整的录音状态、采集异常和恢复提示。 | 当前 speaking 已有权限和后台恢复，但录音态 UX 仍偏轻。 | 增加录音状态、连接中断、重连中、采集失败和恢复提示；完善音频 session 生命周期。 | 真机场景下，来电 / 后台 / 权限拒绝 / 网络波动均有明确状态提示。 | US-11301 | 5 |
| US-11305 | P1 | 作为移动端考生，我可以在 listening 中获得真实的播放异常提示与继续学习反馈。 | 当前 listening 状态恢复完整，但缺少播放器异常 UX。 | 加入加载中、缓冲失败、耳机切换、播放完成等状态提示；将恢复项和首页主线联动。 | 出现播放失败时有明确提示和重试；恢复到首页后可看到最近 listening 恢复项。 | US-11302 | 5 |
| US-11306 | P1 | 作为产品与研发，我可以基于 analytics 查看当前关键链路覆盖率和字段完整度。 | 服务端能算 summary，但缺少基于当前产品闭环的最小验证清单。 | 增加一组最小 smoke 或文档化核对清单，保证关键行为不会漏埋。 | 新增 smoke 或检查脚本可验证核心事件是否上报成功；缺失事件可被快速发现。 | US-11303 | 3 |
| US-11307 | P1 | 作为移动端考生，我在计划 / 进度冲突场景下能得到更直接的修复建议，而不是仅看解释。 | 当前 plan/progress 主要提供解释与跳转，没有更细动作建议。 | 基于冲突字段生成更强的推荐动作，如“回到最近阅读提交”“重新同步本次训练”等。 | 冲突页至少对 4 类核心字段给出具体下一步建议；相关按钮指向正确页面。 | 现有 progress / study-loop | 3 |

## 6. P2 Backlog

| Story ID | 优先级 | 用户故事 | 当前缺口 | 建议实现 | 验收标准 | 依赖 | 点数 |
|---|---|---|---|---|---|---|---|
| US-11308 | P2 | 作为研发，我希望 `packages/shared-client` 成为真正的共享实现层，而不是对 Web 代码的转发别名。 | 当前 shared-client 基本是 re-export，test / typecheck 为空壳。 | 将 api client、types、validators 正式迁入 shared-client，并让 Web / Mobile 共同依赖。 | `packages/shared-client` 拥有独立实现；自身 typecheck / test 不再为空；Web 与 Mobile 只消费包导出。 | 无 | 8 |
| US-11309 | P2 | 作为研发，我希望关键跨端契约在 shared-client 层拥有独立测试。 | 当前契约测试集中在 Web 或 Mobile 侧。 | 为共享 API client、导出响应解析、提醒设备注册等加入 shared-client 层测试。 | shared-client 至少覆盖 5 类关键契约测试。 | US-11308 | 5 |
| US-11310 | P2 | 作为交付方，我希望 Postgres 模式的主链路验证有实际执行留痕。 | 代码和测试存在，但本轮审计未形成执行记录。 | 实跑 `smoke:postgres:e2e-local` 与 restart smoke，保存结果到跟踪文档或发布记录。 | 至少一轮 Postgres smoke 结果入库；失败项有 issue 或风险记录。 | 无 | 3 |
| US-11311 | P2 | 作为交付方，我希望 iOS / Android 设备级 smoke 有最新留痕。 | Maestro 文件已存在，但未形成本轮执行证据。 | 实跑 `smoke:quality-gate:mobile-local`、iOS / Android smoke，并补执行结果。 | 两端各至少一轮 smoke 记录可追溯到日期、环境和结果。 | 无 | 3 |
| US-11312 | P2 | 作为交付方，我希望导出、删除、提醒、实例切换等高风险账户动作有一轮专项回归记录。 | 功能已在代码和测试里，但缺少最新人工 / 半自动执行留痕。 | 增加专项 runbook 记录模板或在现有 tracking 中补一轮结果。 | 4 类账户高风险动作均有执行留痕。 | 无 | 3 |

## 7. 推荐 Sprint 切分

### Sprint A
1. US-11301 Mobile speaking 原生音频输入闭环
2. US-11304 speaking 录音异常与恢复 UX
3. US-11303 关键行为 analytics 接入

### Sprint B
1. US-11302 Mobile listening 真实播放器闭环
2. US-11305 listening 播放异常提示与恢复 UX
3. US-11306 analytics 覆盖核对 smoke

### Sprint C
1. US-11308 shared-client 独立收敛
2. US-11309 shared-client 契约测试
3. US-11307 progress / plan 冲突修复建议增强

### Sprint D
1. US-11310 Postgres smoke 留痕
2. US-11311 iOS / Android 设备 smoke 留痕
3. US-11312 账户高风险动作专项回归留痕

## 8. 建议口径

在上述 backlog 完成前，建议继续使用以下对内口径:

1. learner 主链路已完成
2. 移动端核心业务已覆盖
3. 原生音频深度、分析接入、共享层收敛和部署验证仍在收尾

在 `US-11301`、`US-11302`、`US-11303` 完成后，可把对外口径提升为:

1. “Web + Mobile self-hosted learner 主链路全面闭环”
2. “关键学习行为与移动端原生交互已进入可验收状态”

结合 2026-04-11 最新证据，当前更准确的对内口径为:
1. Postgres 主链路和账户高风险动作已具备最新执行证据
2. 移动端 device smoke 仍需从 Expo Go 路径切换到更适配 native module 的执行方式
