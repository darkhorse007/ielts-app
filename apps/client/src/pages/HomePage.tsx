export const HomePage = () => {
  return (
    <section>
      <h1>IELTS 自托管学习首页</h1>
      <p>当前版本仅保留雅思备考核心功能，不包含订阅、支付和运营后台入口。</p>
      <nav>
        <a href="/onboarding">入门目标</a> | <a href="/diagnostic">首次诊断</a> | <a href="/plan">8周计划</a> |{" "}
        <a href="/account">账户中心</a>
      </nav>
      <nav>
        <a href="/practice/listening">听力训练</a> | <a href="/practice/reading">阅读训练</a> |{" "}
        <a href="/speaking-live">口语实时会话</a> | <a href="/writing">写作批改</a>
      </nav>
      <nav>
        <a href="/mock-exam">全科模考</a>
      </nav>
    </section>
  );
};
