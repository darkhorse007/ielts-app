# Self-Hosted Delivery Evidence

- 日期: 2026-04-11
- 范围: `US-11310` ~ `US-11312`
- 环境:
  1. 本机 `macOS`
  2. Docker 托管本地 Postgres 16
  3. Maestro `2.3.0`
  4. iOS simulator: `iPhone 16 Pro` / `iOS 18.3` / Expo Go `55.0.27`
  5. Android emulator: `Pixel_8_Pro_API_TiramisuPrivacySandbox` / Expo Go `55.0.5`

## 1. `US-11310` Postgres smoke 留痕

执行命令:
1. `npm run smoke:postgres:e2e-local`

结果:
1. `PASS`
2. 总耗时约 `22s`

关键证据:
1. 6 组 Postgres schema migrate 全部成功:
   - `auth-account`
   - `learner-state`
   - `practice-state`
   - `speaking-state`
   - `writing-state`
   - `mock-state`
2. `npm run test:server:integration:postgres` 通过:
   - `8` 个 test files
   - `24` 个 tests
3. `npm run test:e2e --workspace @ielts/client` 通过:
   - Playwright API smoke `1/1`

结论:
1. 当前仓库在本机可完成一轮 docker-managed Postgres 主链路 smoke。
2. `US-11310` 已具备可追溯执行证据。

## 2. `US-11311` iOS / Android 设备 smoke 留痕

执行命令:
1. `npm run smoke:quality-gate:mobile-local`
2. `npm run smoke:e2e:mobile-android-local`

结果摘要:
1. `npm run test:mobile` 通过:
   - `5` 个 test files
   - `119` 个 tests
2. `npm run smoke:quality-gate:mobile-local` 失败在第 `2/3` 步 iOS device smoke
3. 单独补跑 `npm run smoke:e2e:mobile-android-local` 仍失败

### 2.1 iOS 结果

状态:
1. `FAIL`

已确认事实:
1. simulator 已启动，Expo Go 已检测到。
2. Maestro 在首个 mock exam flow 中未等到登录页文案 `登录移动端工作台`。
3. 失败日志包含:
   - `xcuitest.installer.LocalXCTestInstaller$IOSDriverTimeoutException`
   - `iOS driver not ready in time`
4. 失败截图仍停留在启动页与 `Building JavaScript bundle...` 阶段。

### 2.2 Android 结果

状态:
1. `FAIL`

已确认事实:
1. emulator 已自动启动，Expo Go 已检测到。
2. App 未进入登录页，而是直接停在红屏错误页。
3. Metro 日志已明确报错:
   - `Cannot find native module 'ExpoSpeechRecognition'`
4. 路由层随之出现连带告警:
   - `Route "./speaking.tsx" is missing the required default export`
   - `No route named "speaking" exists in nested children`

### 2.3 结论

1. route-level mobile regression 当前健康，问题不在 `vitest`/页面语义回归。
2. 设备级 smoke 当前未闭环，且 Android 根因已明确为 Expo Go 无法加载 `expo-speech-recognition` 原生模块。
3. 推断:
   - 在 speaking 接入 `expo-speech-recognition` 之后，当前基于 Expo Go 的 device smoke 路径已不再稳定/适配。
   - 下一步应优先把 iOS / Android smoke 迁到 development build / dev client，或补一层 Expo Go 兼容兜底。

## 3. `US-11312` 高风险账户动作专项回归

执行命令:
1. `npm exec --workspace @ielts/server -- vitest run tests/s34-user-data-export.test.ts tests/account.deletion.test.ts tests/s7-reminders.test.ts -t 'exports user-domain data through a single authenticated endpoint|requests deletion then deletes account and revokes access|tracks reminder click and rejects cross-user access|registers lists and removes reminder devices'`
2. `npm exec --workspace @ielts/client -- vitest run tests/s2-progress-account-pages.test.tsx`
3. `npm exec --workspace @ielts/mobile -- vitest run tests/reminder-notification-bridge.test.tsx tests/app-session.test.tsx`
4. `npm exec --workspace @ielts/mobile -- vitest run tests/routes.smoke.test.tsx -t 'instance screen validates health before saving configuration|account screen can click reminder and refresh the stored deep link|account screen can sync and revoke remote reminder device|account screen can delete account and show completion summary'`

结果:
1. server 定向回归通过:
   - `3` 个 test files
   - `4` 个 tests passed
2. client 账户页回归通过:
   - `1` 个 test file
   - `5` 个 tests passed
3. mobile reminder bridge + app session 回归通过:
   - `2` 个 test files
   - `5` 个 tests passed
4. mobile routes 定向回归通过:
   - `1` 个 test file
   - `4` 个 tests passed

动作覆盖映射:
1. 导出:
   - `apps/server/tests/s34-user-data-export.test.ts`
2. 删除:
   - `apps/server/tests/account.deletion.test.ts`
   - `apps/client/tests/s2-progress-account-pages.test.tsx`
   - `apps/mobile/tests/routes.smoke.test.tsx`
3. 提醒点击 / 设备注册:
   - `apps/server/tests/s7-reminders.test.ts`
   - `apps/client/tests/s2-progress-account-pages.test.tsx`
   - `apps/mobile/tests/reminder-notification-bridge.test.tsx`
   - `apps/mobile/tests/app-session.test.tsx`
   - `apps/mobile/tests/routes.smoke.test.tsx`
4. 实例切换 / 实例校验:
   - `apps/mobile/tests/routes.smoke.test.tsx`

结论:
1. `US-11312` 已具备最新专项回归证据。
2. 导出、删除、提醒、实例切换 4 类高风险账户动作均已有 2026-04-11 执行留痕。

## 4. 总结

当前 GC4 状态:
1. `US-11310`: `PASS`
2. `US-11311`: 已留痕，但 device smoke 未通过
3. `US-11312`: `PASS`

当前剩余阻断:
1. 若要把 `GC4` 视为完全收口，仍需修复 `US-11311` 的 device smoke 执行路径。
