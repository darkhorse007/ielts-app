export const homePlannedModules: string[] = [];

export const homeAvailableModules = [
  "实例配置",
  "注册登录",
  "入门目标",
  "首次诊断",
  "学习计划",
  "学习进度",
  "听力训练",
  "阅读训练",
  "实时口语",
  "写作批改",
  "模考与报告",
  "账户与导出",
  "API/WS smoke"
];

export type HomeEntryRoute =
  | "/onboarding"
  | "/diagnostic"
  | "/plan"
  | "/progress"
  | "/listening"
  | "/reading"
  | "/speaking"
  | "/writing"
  | "/mock-exam"
  | "/account";

export type HomeEntryHandlerId = "check_speaking_socket";

export type HomeEntryActionConfig =
  | {
      label: string;
      route: HomeEntryRoute;
      testID?: string;
    }
  | {
      label: string;
      handlerId: HomeEntryHandlerId;
      testID?: string;
    };

export type HomeEntryRowConfig = {
  id: string;
  primary: HomeEntryActionConfig;
  secondary: HomeEntryActionConfig;
};

export const homeEntryRows: HomeEntryRowConfig[] = [
  {
    id: "onboarding",
    primary: {
      label: "进入入门目标",
      route: "/onboarding"
    },
    secondary: {
      label: "进入首次诊断",
      route: "/diagnostic"
    }
  },
  {
    id: "plan-progress",
    primary: {
      label: "查看计划",
      route: "/plan"
    },
    secondary: {
      label: "同步进度",
      route: "/progress"
    }
  },
  {
    id: "listening-reading",
    primary: {
      label: "开始听力训练",
      route: "/listening"
    },
    secondary: {
      label: "开始阅读训练",
      route: "/reading"
    }
  },
  {
    id: "speaking-smoke",
    primary: {
      label: "进入实时口语",
      route: "/speaking"
    },
    secondary: {
      label: "检查 WS",
      handlerId: "check_speaking_socket"
    }
  },
  {
    id: "writing-plan",
    primary: {
      label: "进入写作批改",
      route: "/writing"
    },
    secondary: {
      label: "查看计划",
      route: "/plan"
    }
  },
  {
    id: "mock-progress",
    primary: {
      label: "进入模考",
      route: "/mock-exam",
      testID: "home.mockExam"
    },
    secondary: {
      label: "查看进度",
      route: "/progress"
    }
  },
  {
    id: "account",
    primary: {
      label: "进入账户中心",
      route: "/account",
      testID: "home.account"
    },
    secondary: {
      label: "导出/删除",
      route: "/account",
      testID: "home.accountQuick"
    }
  }
];
