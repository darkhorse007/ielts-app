# Mobile Delivery Runbook（Self-Hosted）

## 1. 目标
这份 runbook 用于把当前 `apps/mobile` 从“仓库内可运行”推进到“可交付 iOS / Android preview 或 production build”。

## 2. 适用前提
1. 当前分支为 `self-hosted`。
2. 服务端已具备可达的 API / WebSocket 地址。
3. 已完成 `npm install`。
4. 已具备 Apple Developer / Google Play 所需账号、签名材料与 EAS 权限。

## 3. 交付前置检查
### 3.1 服务端
1. 已配置 `AUTH_SECRET` 或 `AUTH_SECRET_FILE`。
2. 目标环境的 API 地址可从真机或 simulator / emulator 访问。
3. 对 preview / production 包，优先使用 `https://` 和 `wss://`。
4. 如目标环境启用 Postgres，先完成对应迁移与 smoke。

### 3.2 移动端
1. 如需预置实例，先创建 `apps/mobile/.env.local`。
2. 至少填写:
   - `EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com`
   - `EXPO_PUBLIC_WS_BASE_URL=wss://your-api.example.com`
3. 若不填写 `EXPO_PUBLIC_WS_BASE_URL`，脚本会按 API 地址推导。

## 4. 本地质量门禁
### 4.1 基础校验
```bash
npm run test:mobile
npm run typecheck:mobile
```

### 4.2 完整本地移动门禁
```bash
npm run smoke:quality-gate:mobile-local
```

该命令会顺序执行：
1. route-level vitest smoke
2. iOS simulator Maestro smoke
3. Android emulator/device Maestro smoke

### 4.3 按平台单独执行
```bash
npm run smoke:e2e:mobile-ios-local
npm run smoke:e2e:mobile-android-local
```

## 5. EAS 项目绑定
仓库默认未提交 `extra.eas.projectId`。首次接入时先在 `apps/mobile` 目录完成 EAS 绑定：

```bash
npx eas-cli@latest init
```

完成后再执行任何 build 命令。

## 6. 构建命令
### 6.1 Development Build
用于开发联调或 Dev Client：

```bash
npm run build:mobile:development:ios
npm run build:mobile:development:android
```

### 6.2 Preview Build
用于 QA / 内测安装包：

```bash
npm run build:mobile:preview:ios
npm run build:mobile:preview:android
```

### 6.3 Production Build
用于商店包或正式分发：

```bash
npm run build:mobile:production:ios
npm run build:mobile:production:android
```

## 7. 安装与验收顺序
### 7.1 Preview 包验收
1. 安装 iOS / Android preview build。
2. 校验实例配置来源是否符合预期。
3. 完成以下最短主链路：
   - 登录
   - 入门目标
   - 诊断
   - 计划
   - 进度
   - 听力 / 阅读
   - 口语
   - 写作
   - 模考与报告
   - 账户导出 / 删除
4. 与 Web 端同账号切换，确认计划、进度、模考状态一致。

### 7.2 Production 包验收
1. 基于 preview 验收结果复跑主链路。
2. 确认 bundle identifier / package name、版本号、build number / versionCode 正确。
3. 确认 production 包不再指向测试实例。

## 8. 设备级人工检查清单
1. 启动时实例来源提示正确，不误用回环地址。
2. 前后台切换后，会话与恢复入口仍正常。
3. 听力播放状态、阅读计时、口语会话、模考中间态都有恢复路径。
4. 训练完成后的下一步引导与按钮跳转一致。
5. 导出报告、导出账号、删除账号都有明确反馈。

## 9. 提醒推送专项
若目标交付包含 reminder push，再追加：

```bash
npm run smoke:reminder-push:local
```

适用说明：
1. 需要真实 APNs 或 FCM token。
2. iOS 的 `REMINDER_PUSH_SMOKE_ENVIRONMENT` 必须与安装包环境一致。
3. provider accepted send 通过后，仍需人工点开通知，确认 deep link 恢复正常。

## 10. 常见落地风险
1. 真机或内测包仍指向 `localhost/127.0.0.1`，导致设备不可达。
2. preview / production 仍使用 `http/ws`，被系统策略或网络环境拦截。
3. EAS 未绑定 projectId 就直接发起 build。
4. 只跑了 route smoke，没有跑设备级 smoke。
5. 只验证单端，不验证 Web 与 Mobile 的跨端一致性。

## 11. 出包完成定义
满足以下条件后，可认为仓库侧已经具备 mobile delivery readiness：
1. `npm run smoke:quality-gate:mobile-local` 通过。
2. 对应平台的 preview 或 production build 成功产出。
3. 至少 1 台 iOS 与 1 台 Android 设备完成主链路验收。
4. 若启用提醒推送，push smoke 与通知点击恢复已验证。
