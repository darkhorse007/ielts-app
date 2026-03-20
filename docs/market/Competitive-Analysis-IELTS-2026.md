# 竞品调研：雅思提分商业软件（2026-02）

## 文档信息
- 版本: v1.0
- 状态: Draft for Build Gate
- 更新时间: 2026-02-26
- 适用范围: 本项目动工前市场基线与差异化策略输入

## 1. 结论先行
1. 市场上已存在大量成熟商业产品，覆盖官方备考生态、国际在线课程和中国大陆本地化 App。
2. 官方生态（IDP / British Council / Cambridge）在“权威性”和“考试流程衔接（报名、结果、官方资源）”上占优。
3. 中国大陆产品在“题库刷题、机经/预测、社群、课程”上竞争激烈，移动端覆盖充分。
4. 国际数字平台在“结构化课程 + 订阅付费”上成熟，价格带已形成锚点。
5. 未发现主流、可直接商用且覆盖“听说读写+模考+AI 教练+跨端”的开源一体化产品；商业软件为主流形态。

## 2. 调研范围与方法
1. 时间点: 2026-02-26（公开网页快照）。
2. 样本类型: 官方机构、国际付费平台、中国大陆常见备考 App。
3. 数据来源: 官方站点、App Store 页面、课程官网公开价格页。
4. 说明: 价格、活动和功能可能随区域与促销变化，以下为公开信息基线，不等同最终采购价。

## 3. 竞品分层

### 3.1 官方生态（高权威）
1. IDP IELTS Ready App
   - 提供官方练习、视频课程、学习资料，并与 IDP 账户体系衔接。
   - 价值: 强官方信任、从备考到出分流程连续。
2. British Council IELTS Ready
   - 免费层含练习与模拟；Premium 提供更大题量（页面标注价值约 US$170）。
   - 提供写作/口语 AI Feedback 套餐（页面显示起价 US$9.99）。
3. Cambridge IELTS Preparation
   - 官方考试体系关联教材与样题资源，构成长期权威内容入口。

### 3.2 中国大陆主流商业产品（高本地化）
1. 新东方雅思 Pro（iOS）
   - 描述强调“剑桥雅思官方授权、听说读写一站式、学练测评闭环”。
   - App Store 显示持续版本更新与订阅型内购。
2. 雅思哥（iOS）
   - 描述强调“口语预测、听力题库、写作批改、备考资料”。
   - App Store 显示订阅/内购选项。
3. 雅思考满分（iOS）
   - 描述强调“剑桥雅思真题、听说读写练测、错题复盘”。
   - App Store 显示持续维护（存在较新版本记录）。
4. 小站雅思（官网）
   - 官网展示 iOS/Android/鸿蒙下载入口，定位为提分训练平台。
5. 流利说·雅思（iOS）
   - 主打 AI 陪练与口语写作相关训练，App Store 显示订阅与内购模式。

### 3.3 国际数字课程平台（高课程化）
1. Magoosh IELTS
   - 公开价格页展示 1/6 个月方案（示例: US$109 / US$129）。
   - 以结构化视频课、题库与学习计划为核心。
2. E2 IELTS
   - 公开价格页展示分层课程（示例: Short Course、2-Week Trial）。
   - 以课程体系和技巧训练为核心卖点。

## 4. 能力与商业模式对比（摘要）

| 类别 | 代表产品 | 主要能力 | 定价模式（公开页） | 平台覆盖 | 对本项目启示 |
| --- | --- | --- | --- | --- | --- |
| 官方生态 | IDP, British Council, Cambridge | 官方资料、练习、考试流程衔接 | 免费 + 会员/增值包 | Web + 移动为主 | 需要建立“权威感”和考试场景可信度 |
| 中国大陆 App | 新东方雅思 Pro、雅思哥、雅思考满分、小站雅思、流利说·雅思 | 题库、机经、课程、社群、AI 辅助 | 订阅+内购 | 移动端强，桌面端普遍弱 | 我们可用“全平台一致体验 + 桌面深度学习场景”差异化 |
| 国际课程平台 | Magoosh, E2 | 结构化课程、学习路径 | 月/季订阅或套餐 | Web + App（视产品而定） | 需在“路径可执行性 + 反馈即时性”上超越纯课程形态 |

## 5. 与本项目的差异化建议
1. 目标差异化
   - 从“内容供给型”转向“提分结果型”，以 8 周提分达成率为北极星指标。
2. 体验差异化
   - 做强 Windows/macOS 深学习场景（长文阅读、写作改稿、模考）与手机碎片场景的无缝切换。
3. AI 差异化
   - 提供实时口语对练与证据化反馈（片段定位、改写建议、二次作答对比），避免泛点评。
   - 采用多 LLM 可插拔与回退，提高稳定性与成本可控性。
4. 运营差异化
   - 后台管理系统支持内容发布、权益校正、审计闭环，保证可持续运营。

## 6. 对 S1 动工的直接影响
1. 必须保留并优先实现:
   - 账号跨端一致、学习进度同步、目标设置与诊断入口（对应 S1 范围）。
2. S1 不做但需预留:
   - 口语实时反馈链路、写作证据化评分链路、订阅权益系统的统一接口。
3. 数据与合规前置:
   - 题库授权与审计字段从数据模型第一版即纳入，避免后期返工。

## 7. 数据来源（访问日期: 2026-02-26）
1. IDP IELTS Ready App: https://ielts.idp.com/about/ielts-ready-app
2. IDP Result Timeline: https://ielts.idp.com/results/check-your-result
3. British Council IELTS Ready Member: https://takeielts.britishcouncil.org/take-ielts/prepare/free-ielts-english-practice-tests/ielts-ready-member
4. British Council IELTS Ready Premium: https://takeielts.britishcouncil.org/take-ielts/prepare/ielts-ready-premium
5. British Council IELTS Writing/Speaking AI Feedback: https://takeielts.britishcouncil.org/take-ielts/prepare/ielts-ready/writing-and-speaking-feedback
6. IELTS.org Partner Updates: https://ielts.org/for-organisations/ielts-partner-resources/news-and-insights/partner-social-media-changes
7. Cambridge IELTS Preparation: https://www.cambridgeenglish.org/learning-english/exams/ielts/preparation/
8. 新东方雅思 Pro（App Store）: https://apps.apple.com/us/app/%E6%96%B0%E4%B8%9C%E6%96%B9%E9%9B%85%E6%80%9Dpro/id1592802128
9. 雅思考满分（App Store）: https://apps.apple.com/us/app/%E9%9B%85%E6%80%9D%E8%80%83%E6%BB%A1%E5%88%86-%E5%89%91%E9%9B%85%E5%90%AC%E5%8A%9B%E9%98%85%E8%AF%BB%E5%86%99%E4%BD%9C%E5%8F%A3%E8%AF%AD/id791946259
10. 雅思哥（App Store）: https://apps.apple.com/us/app/%E9%9B%85%E6%80%9D%E5%93%A5-%E5%AE%98%E6%96%B9ielts%E5%A4%87%E8%80%83%E5%B9%B3%E5%8F%B0/id1460610941
11. 小站雅思官网: https://top.zhan.com/ielts/
12. 流利说·雅思（App Store）: https://apps.apple.com/cn/app/%E6%B5%81%E5%88%A9%E8%AF%B4-%E9%9B%85%E6%80%9D/id1465508615
13. Magoosh IELTS Pricing: https://magoosh.com/ielts/ielts-pricing/
14. E2 IELTS Preparation Course: https://e2language.com/ielts-preparation-course/
