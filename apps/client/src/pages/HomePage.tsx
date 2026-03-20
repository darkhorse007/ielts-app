export const HomePage = () => {
  return (
    <section>
      <h1>学习首页</h1>
      <p>登录成功，已进入首页。</p>
      <nav>
        <a href="/onboarding">入门目标</a> | <a href="/diagnostic">首次诊断</a> | <a href="/plan">8周计划</a>
      </nav>
      <nav>
        <a href="/practice/listening">听力训练</a> | <a href="/practice/reading">阅读训练</a> |{" "}
        <a href="/speaking-live">口语实时会话</a> | <a href="/writing">写作批改</a>
      </nav>
      <nav>
        <a href="/mock-exam">全科模考</a> | <a href="/subscription">订阅权益</a> | <a href="/observability">可观测门禁</a> |{" "}
        <a href="/stability">稳定性控制台</a> | <a href="/system-roles">系统角色管理</a> | <a href="/admin">后台管理</a>
      </nav>
    </section>
  );
};
