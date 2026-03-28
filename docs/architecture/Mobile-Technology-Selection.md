# Mobile Technology Selection（Self-Hosted）

## 文档信息
- 版本: v1.7
- 状态: Approved Decision + Mobile Core Coverage
- 适用分支: `self-hosted`
- 决策日期: 2026-03-23

## 1. 决策摘要
结论是：`self-hosted` 分支的 iOS 与 Android 客户端采用 `React Native + Expo`。

这里的“原生移动客户端”指交付为 iOS 与 Android 原生应用形态，不要求必须使用 Swift + Kotlin 双栈实现。对于当前代码库，React Native + Expo 是“最快达到功能对齐、最能复用现有 TypeScript 契约、同时不破坏自托管边界”的方案。

## 2. 当前代码库事实
1. 当前唯一客户端实现位于 `apps/client`，技术栈是 React + TypeScript。
2. 已经存在可抽取的 API 与领域层代码，包括 `apps/client/src/lib/api-client.ts`、`api-types.ts`、`validators.ts`、`session-manager.ts`、`runtime-config.ts`。
3. 当前服务端已经为认证、学习计划、训练、实时口语、写作、模考、分析、提醒提供完整 API/WS 契约。
4. 当前仓库已经新增 `apps/mobile` 基础应用，接入首日学习链路、听力训练、阅读训练、实时口语、写作批改、模考与报告、账户中心、提醒偏好、数据导出、删除账号，并且仍然没有独立移动端后端。

## 3. 选型约束
1. 必须复用当前 self-hosted 服务端，不为移动端单独造业务后端。
2. 必须尽快做到与 Web 学习主链路的功能对齐。
3. 必须支持安全存储、WebSocket、音频权限、文件导出、设备分享等移动端能力。
4. 必须尽量复用现有 React/TypeScript 认知与代码。
5. 不能把核心学习链路绑死在第三方托管服务上。

## 4. 备选方案对比
| 方案 | 复用当前 TS 契约 | 达成功能对齐速度 | 原生能力接入 | 自托管适配 | 团队认知切换 | 结论 |
|---|---|---|---|---|---|---|
| React Native + Expo | 高 | 高 | 高 | 高 | 低 | 选用 |
| Flutter | 低 | 中 | 高 | 高 | 中 | 不选 |
| Kotlin Multiplatform + 原生 UI | 低到中 | 低 | 高 | 中到高 | 高 | 不选 |

## 5. 为什么选 React Native + Expo
1. 当前仓库已经是 React + TypeScript，移动端可以优先复用类型、校验、API 调用和会话管理逻辑，而不是重写成 Dart 或 Kotlin。
2. React Native 官方当前明确建议新项目使用 framework，并点名推荐 Expo。
3. Expo Router、development builds、安全存储、通知能力已经组成了完整的移动端基础设施，足够覆盖本项目第一阶段所需能力。
4. Expo 的通知能力并不强制绑定 Expo Push Service，后续如需推送，可直接对接 FCM/APNs，符合 self-hosted 的边界。
5. 当前 Web 端已经是独立成熟应用，第一阶段不应为了“统一 UI 代码”牺牲移动端交付速度；更合理的做法是保留 `apps/client`，新增 `apps/mobile`，只共享契约与领域层。

## 6. 为什么不选其他方案
### 6.1 Flutter
1. Flutter 本身成熟，原生能力覆盖也足够，但需要把现有 TypeScript 契约和客户端领域逻辑重写成 Dart。
2. 这会让 Web 与 Mobile 在客户端语言层完全分叉，增加长期维护成本。
3. 对当前仓库来说，Flutter 的主要优势不足以抵消“重写一套客户端基础层”的代价。

### 6.2 Kotlin Multiplatform + 原生 UI
1. Kotlin Multiplatform 更适合 Android/Kotlin 认知占主导、并且愿意长期维护 iOS 原生接入细节的团队。
2. 当前仓库是 TypeScript/React 主导，并没有现成 Kotlin 共享层可复用。
3. iOS 集成、framework 边界和依赖管理会增加额外复杂度，不适合作为当前阶段最快交付方案。

## 7. 选定后的技术基线
### 7.1 应用形态
1. 新增 `apps/mobile`
2. 保留 `apps/client` 作为 Web 端
3. 同一套 Fastify API/WS 服务同时服务 Web、iOS、Android

### 7.2 基础栈
1. 框架: Expo
2. UI 运行时: React Native
3. 页面与深链接: Expo Router
4. 安全存储: `expo-secure-store`
5. 通知能力: `expo-notifications`
6. 实时通信: 原生 WebSocket，对齐当前实时口语接口

### 7.3 代码复用策略
1. 先抽取 API 类型、校验器、API 客户端、会话刷新逻辑。
2. Web UI 与 Mobile UI 分离维护，不在第一阶段追求共享视图层。
3. `token-storage.ts` 改造为存储适配器模式，Web 用浏览器存储，Mobile 用安全存储。
4. `runtime-config.ts` 抽取为跨端共享模块，补充移动端实例配置入口。

### 7.4 自托管策略
1. 移动端核心链路不要求依赖 Expo 云服务才能运行。
2. OTA 更新不是第一阶段前置条件，首期以常规商店包或内部原生安装包交付为准。
3. 如未来需要 OTA，应在发布治理明确后再评估 `expo-updates`、EAS Update 或自托管更新服务。

## 8. 仓库落地建议
1. 第一步已经完成：新增 `apps/mobile`，打通认证、实例配置、首页骨架、入门目标、首次诊断、学习计划、学习进度、听力训练、阅读训练、实时口语、写作批改、模考与报告、账户中心，以及 API/WS 连通性。
2. 第二步已经开始：新增 `packages/shared-client`，先复用 API 契约、校验器和 API 客户端。
3. 第三步继续按质量与交付推进：自动化验收、通知/原生能力深化、以及商店或内测分发准备。
4. 在移动端稳定前，不改写现有 Web 客户端结构，也不引入 React Native Web 替代当前 Web 应用。

## 9. 官方参考
1. React Native Environment Setup: https://reactnative.dev/docs/environment-setup
2. Expo Router Introduction: https://docs.expo.dev/router/introduction/
3. Expo Development Builds: https://docs.expo.dev/develop/development-builds/introduction/
4. Expo SecureStore: https://docs.expo.dev/versions/latest/sdk/securestore/
5. Expo Notifications: https://docs.expo.dev/versions/latest/sdk/notifications/
6. Expo custom push with FCM/APNs: https://docs.expo.dev/push-notifications/sending-notifications-custom/
7. EAS Update Introduction: https://docs.expo.dev/eas-update/introduction/
8. Flutter Architectural Overview: https://docs.flutter.dev/resources/architectural-overview
9. Kotlin Multiplatform iOS integration overview: https://kotlinlang.org/docs/multiplatform/multiplatform-ios-integration-overview.html
