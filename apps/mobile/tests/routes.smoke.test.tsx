import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { StoredSession } from "../src/lib/api-types";
import { buildScopedStorageKey } from "../src/lib/storage";
import type { InstanceConfig } from "../src/lib/runtime-config";
import { useAppSession } from "../src/state/app-session";
import AccountScreen from "../app/account";
import DiagnosticScreen from "../app/diagnostic";
import HomeScreen from "../app/home";
import ListeningScreen from "../app/listening";
import ReadingScreen from "../app/reading";
import MockExamScreen from "../app/mock-exam";
import SpeakingScreen from "../app/speaking";
import WritingScreen from "../app/writing";

vi.mock("expo-router", () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn()
  },
  useLocalSearchParams: vi.fn(() => ({}))
}));

vi.mock("../src/state/app-session", () => ({
  useAppSession: vi.fn()
}));

const defaultInstanceConfig: InstanceConfig = {
  apiBaseUrl: "http://127.0.0.1:8787",
  wsBaseUrl: "ws://127.0.0.1:8787"
};

const defaultSession: StoredSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  userId: "user-1"
};

const mockedUseAppSession = vi.mocked(useAppSession);
const mockedSecureStore = SecureStore as typeof SecureStore & {
  __resetMockStorage: () => void;
  __setMockItem: (key: string, value: string) => void;
};

const createSessionContext = (overrides?: {
  apiClient?: Record<string, (...args: any[]) => Promise<any>>;
  session?: StoredSession | null;
  instanceConfig?: InstanceConfig | null;
}): ReturnType<typeof useAppSession> => {
  const apiClient = {
    getProfile: vi.fn().mockResolvedValue({
      id: "user-1",
      email: "learner@example.com",
      phone: "13800000000",
      status: "active",
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    getReminderPreference: vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    getReminderRecommendation: vi.fn().mockResolvedValue({
      subscribed: true,
      active_hour_utc: 12,
      reminder_id: "rem-1",
      scheduled_at: "2026-03-28T12:00:00.000Z",
      reason: "今日写作任务仍未完成",
      deep_link: "/plan"
    }),
    exportUserData: vi.fn().mockResolvedValue({
      filename: "user-data-export-user-1.json",
      content: "{\"user_id\":\"user-1\"}"
    }),
    requestDeletion: vi.fn().mockResolvedValue({
      user_id: "user-1",
      status: "pending_deletion",
      deletion_requested_at: "2026-03-28T00:00:00.000Z"
    }),
    deleteAccount: vi.fn().mockResolvedValue({
      user_id: "user-1",
      status: "deleted",
      deleted_at: "2026-03-28T00:00:00.000Z",
      revoked_sessions: 2,
      removed_assessments: 1,
      removed_plans: 1,
      removed_goal_profiles: 1,
      removed_progress_conflicts: 0,
      removed_practice_sessions: 2,
      removed_retry_queue_items: 1,
      removed_speaking_sessions: 1,
      removed_writing_evaluations: 1,
      removed_writing_rewrite_archives: 1,
      removed_mock_exams: 1,
      removed_mock_exam_reports: 1
    }),
    createMockExam: vi.fn().mockResolvedValue({
      exam_id: "mock-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 0,
      remaining_seconds: 7200,
      current_skill: "reading",
      sections: [],
      created_at: "2026-03-28T00:00:00.000Z",
      updated_at: "2026-03-28T00:00:00.000Z"
    }),
    ...overrides?.apiClient
  };

  return {
    ready: true,
    defaultInstanceConfig,
    instanceConfig: overrides?.instanceConfig ?? defaultInstanceConfig,
    session: overrides?.session ?? defaultSession,
    saveInstanceConfig: vi.fn(),
    saveSession: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    runWithAuthorizedClient: async <T,>(execute: (client: any, accessToken: string) => Promise<T>): Promise<T> =>
      execute(apiClient, "access-token")
  } as unknown as ReturnType<typeof useAppSession>;
};

describe("mobile route smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSecureStore.__resetMockStorage();
  });

  test("home screen renders mock exam and account entry points", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<HomeScreen />);

    expect(screen.getByText("自托管移动端骨架已落地")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("learner@example.com"))).toBeTruthy();
    });
    expect(screen.getByText("模考与报告")).toBeTruthy();
    expect(screen.getByText("进入账户中心")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  test("mock exam screen renders report and export controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已启用自动保存"))).toBeTruthy();
    });
    expect(screen.getByText("模考与报告已进入移动端")).toBeTruthy();
    expect(screen.getByText("创建模考")).toBeTruthy();
    expect(screen.getByText("导出结果")).toBeTruthy();
  });

  test("mock exam screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("mock-exam", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        exam: {
          exam_id: "mock-restored-1",
          status: "in_progress",
          time_limit_seconds: 7200,
          elapsed_seconds: 900,
          remaining_seconds: 6300,
          current_skill: "reading",
          sections: [],
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:15:00.000Z"
        },
        report: {
          report_id: "report-restored-1",
          exam_id: "mock-restored-1",
          total_estimated_band: 6.5,
          skill_band_estimates: {
            listening: 6.5,
            speaking: 6,
            reading: 6.5,
            writing: 6
          },
          error_distribution: {
            listening: 3,
            speaking: 2,
            reading: 4,
            writing: 3
          },
          next_actions: ["补强阅读限时节奏"],
          plan_writeback: {
            applied: false,
            undo_available: false,
            reasons: [],
            changed_tasks: []
          },
          generated_at: "2026-03-31T00:20:00.000Z",
          created_at: "2026-03-31T00:20:00.000Z",
          updated_at: "2026-03-31T00:20:00.000Z"
        },
        timeLimitSeconds: "7200",
        skill: "reading",
        answeredCount: "18",
        listeningBand: "6.5",
        speakingBand: "6",
        readingBand: "6.5",
        writingBand: "6",
        exportPreview: "restored preview",
        exportFilename: "restored-report.json",
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<MockExamScreen />);

    await waitFor(() => {
      expect(screen.getByText("已恢复本地模考中间态")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("exam_id: mock-restored-1"))).toBeTruthy();
    expect(screen.getByText((content) => content.includes("filename: restored-report.json"))).toBeTruthy();
  });

  test("reading screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("reading", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        trainingMode: "exam",
        timeLimitSeconds: "1500",
        session: {
          session_id: "reading-restored-1",
          skill: "reading",
          task_type: "core_training",
          training_mode: "exam",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:10:00.000Z",
          timer: {
            status: "running",
            limit_seconds: 1500,
            elapsed_seconds: 300,
            remaining_seconds: 1200
          },
          questions: [
            {
              question_id: "reading-q-1",
              type: "multiple_choice",
              prompt: "Restored reading question",
              options: ["A", "B", "C"]
            }
          ]
        },
        answers: {
          "reading-q-1": "B"
        },
        timerText: "running / elapsed 300s / remain 1200s",
        timerRecovered: true,
        evidenceCount: 1,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<ReadingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已恢复本地阅读会话")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: reading-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("B")).toBeTruthy();
  });

  test("listening screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("listening", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "dictation",
        session: {
          session_id: "listening-restored-1",
          skill: "listening",
          task_type: "dictation",
          training_mode: "training",
          mode: "core_training",
          status: "in_progress",
          created_at: "2026-03-31T00:00:00.000Z",
          updated_at: "2026-03-31T00:10:00.000Z",
          questions: [
            {
              question_id: "listening-q-1",
              type: "dictation_sentence",
              prompt: "Restored listening question",
              audio_segment_index: 0
            }
          ]
        },
        answers: {
          "listening-q-1": "restored listening answer"
        },
        playbackRate: "1.25",
        segmentIndex: "2",
        positionSeconds: "18",
        replayWrongOnly: true,
        queueCount: 2,
        lastPlaybackSnapshot: {
          playback_rate: 1.25,
          segment_index: 2,
          position_seconds: 18,
          replay_wrong_only: true,
          last_replayed_question_id: "listening-q-1",
          last_recovered_at: "2026-03-31T00:12:00.000Z",
          recovered: true
        },
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<ListeningScreen />);

    await waitFor(() => {
      expect(screen.getByText("已恢复本地听力会话")).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: listening-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("restored listening answer")).toBeTruthy();
  });

  test("diagnostic screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("diagnostic", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        assessmentId: "diag-restored-1",
        questionId: "diagnostic-q-1",
        questionPrompt: "Restored diagnostic question",
        answer: "restored diagnostic answer",
        status: "in_progress",
        elapsedSeconds: 180,
        progressText: "2/12",
        skillBandText: "-",
        planId: null,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<DiagnosticScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByDisplayValue("diag-restored-1")).toBeTruthy();
    expect(screen.getByDisplayValue("restored diagnostic answer")).toBeTruthy();
    expect(screen.getByText("Restored diagnostic question")).toBeTruthy();
  });

  test("account screen loads profile and export/delete controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<AccountScreen />);

    expect(screen.getByText("账户中心已进入移动端")).toBeTruthy();
    expect(screen.getByText((content) => content.includes("user-1"))).toBeTruthy();
    expect(screen.getByText("account_ready")).toBeTruthy();
    expect(screen.getByText("未加载")).toBeTruthy();
    expect(screen.getByText("导出并分享")).toBeTruthy();
    expect(screen.getByText("立即删除")).toBeTruthy();
  });

  test("speaking screen renders permission gate and live controls", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());

    render(<SpeakingScreen />);

    expect(screen.getByText("实时口语已进入移动端")).toBeTruthy();
    expect(screen.getByText("麦克风权限")).toBeTruthy();
    expect(screen.getByText("授权麦克风")).toBeTruthy();
    expect(screen.getByText("连接实时会话")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("已授权")).toBeTruthy();
    });
  });

  test("speaking screen restores local checkpoint snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("speaking", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "role_play",
        scenarioType: "job_interview",
        topic: "Describe a job interview that challenged you.",
        transcript: "I prepared examples before the interview.",
        sessionState: {
          session_id: "speaking-restored-1",
          status: "disconnected",
          task_type: "role_play",
          scenario_type: "job_interview",
          resume_token: "resume-speaking-1",
          resume_until: "2026-03-31T12:50:00.000Z",
          current_part: 2,
          topic: "Describe a job interview that challenged you.",
          turns: 6,
          created_at: "2026-03-31T12:00:00.000Z",
          updated_at: "2026-03-31T12:10:00.000Z"
        },
        resumeToken: "resume-speaking-1",
        scenarioItems: [
          {
            scenario_type: "job_interview",
            title: "求职面试",
            opening_prompt: "Tell me about a time you solved a difficult problem.",
            npc_role: "Interviewer"
          }
        ],
        currentPart: 2,
        scoreText: "F6 / L6 / G6 / P6",
        suggestions: ["Use more specific examples"],
        latencyMs: 320,
        traceCount: 4,
        recentEvents: ["session_resume", "score_update"],
        comparisonText: "ΔF0.5 ΔL0.5 ΔG0.5 ΔP0.5",
        heatmapText: "top_word=problem(2) / top_phoneme=p(3)",
        replaySegmentCount: 2,
        pronunciationTasks: [
          {
            taskId: "task-1",
            title: "Practice /p/",
            description: "Focus on plosive release.",
            phoneme: "p",
            status: "todo",
            linkedTurnNos: [2]
          }
        ],
        trackedTaskText: "task-1:todo",
        reconnectIntent: false,
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<SpeakingScreen />);

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes("checkpoint_status: 已恢复"))).toBeTruthy();
    });
    expect(screen.getByText((content) => content.includes("session_id: speaking-restored-1"))).toBeTruthy();
    expect(screen.getByDisplayValue("Describe a job interview that challenged you.")).toBeTruthy();
    expect(screen.getByDisplayValue("I prepared examples before the interview.")).toBeTruthy();
  });

  test("writing screen restores local draft snapshot", async () => {
    mockedUseAppSession.mockReturnValue(createSessionContext());
    mockedSecureStore.__setMockItem(
      buildScopedStorageKey("writing", "draft", "v1", defaultSession.userId),
      JSON.stringify({
        version: 1,
        taskType: "task1",
        prompt: "Restored prompt",
        essay: "Restored essay body",
        rewriteEssay: "Restored rewrite essay",
        evaluationId: "writing-eval-1",
        comparisonDelta: {
          tr: 0.5,
          cc: 0.5,
          lr: 0.5,
          gra: 0.5,
          overall: 0.5
        },
        selectedTemplateId: "template-1",
        templateInsertionMode: "prepend",
        templatePreservedOriginal: true,
        templateAdoptionText: "total=3, top=template-1, rate=0.8",
        updatedAt: "2026-03-31T12:34:56.000Z"
      })
    );

    render(<WritingScreen />);

    await waitFor(() => {
      expect(screen.getByText("已恢复本地写作草稿，可继续加载评估结果")).toBeTruthy();
    });
    expect(screen.getByDisplayValue("Restored prompt")).toBeTruthy();
    expect(screen.getByDisplayValue("Restored essay body")).toBeTruthy();
    expect(screen.getByDisplayValue("Restored rewrite essay")).toBeTruthy();
    expect(screen.getByDisplayValue("writing-eval-1")).toBeTruthy();
  });
});
