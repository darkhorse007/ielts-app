import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { ReadingPracticePage } from "../src/pages/ReadingPracticePage";
import { SpeakingRealtimePage } from "../src/pages/SpeakingRealtimePage";
import { WritingEvaluationPage } from "../src/pages/WritingEvaluationPage";

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close"));
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }

  emitMessage(payload: Record<string, unknown>): void {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(payload)
      })
    );
  }
}

beforeEach(() => {
  localStorage.clear();
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
});

describe("S4 reading/speaking/writing pages", () => {
  test("supports reading exam mode timer controls and submit elapsed time", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "r-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "training",
      mode: "core_training",
      status: "in_progress",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      timer: {
        status: "idle",
        elapsed_seconds: 0
      },
      questions: [
        {
          question_id: "q-1",
          type: "tfng",
          prompt: "p1"
        }
      ]
    });

    const switchReadingMode = vi.fn().mockResolvedValue({
      session_id: "r-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "exam",
      mode: "core_training",
      status: "in_progress",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      timer: {
        status: "running",
        elapsed_seconds: 10,
        remaining_seconds: 590,
        limit_seconds: 600
      },
      questions: [
        {
          question_id: "q-1",
          type: "tfng",
          prompt: "p1"
        }
      ],
      recovered: false
    });

    const getReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "running",
        elapsed_seconds: 20,
        remaining_seconds: 580
      },
      recovered: false
    });

    const pauseReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "paused",
        elapsed_seconds: 21
      }
    });

    const resumeReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "running",
        elapsed_seconds: 21
      }
    });

    const recoverReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "running",
        elapsed_seconds: 21
      },
      recovered: true
    });

    const submitPracticeSession = vi.fn().mockResolvedValue({
      session_id: "r-1",
      skill: "reading",
      task_type: "core_training",
      training_mode: "exam",
      mode: "core_training",
      status: "submitted",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "tfng",
          prompt: "p1"
        }
      ],
      submission: {
        submitted_at: new Date().toISOString(),
        score_breakdown: {
          correct_count: 0,
          total_questions: 1,
          accuracy: 0,
          elapsed_seconds: 52,
          mode: "exam"
        },
        question_results: [
          {
            question_id: "q-1",
            is_correct: false,
            evidence: {
              sentence: "e1",
              paragraph: 1,
              span_start: 1,
              span_end: 10
            }
          }
        ],
        next_actions: ["next"]
      }
    });

    render(
      <ReadingPracticePage
        apiClient={{
          createPracticeSession,
          submitPracticeSession,
          switchReadingMode,
          getReadingTimer,
          pauseReadingTimer,
          resumeReadingTimer,
          recoverReadingTimer
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "创建阅读训练" }));
    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/training_mode: training/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "切换考试模式" }));
    await waitFor(() => {
      expect(switchReadingMode).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已切换到考试模式/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "拉取计时状态" }));
    fireEvent.click(screen.getByRole("button", { name: "暂停计时" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复计时" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复异常计时" }));

    await waitFor(() => {
      expect(getReadingTimer).toHaveBeenCalledTimes(1);
      expect(pauseReadingTimer).toHaveBeenCalledTimes(1);
      expect(resumeReadingTimer).toHaveBeenCalledTimes(1);
      expect(recoverReadingTimer).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("答案"), {
      target: {
        value: "wrong"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交阅读答案" }));

    await waitFor(() => {
      expect(submitPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/timer: exam \/ 52s/)).toBeInTheDocument();
    });
  });

  test("supports speaking part switch, score suggestions and retry comparison", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "s-1",
      status: "created",
      task_type: "role_play",
      scenario_type: "job_interview",
      resume_token: "resume-token",
      resume_until: new Date().toISOString(),
      current_part: 1
    });
    const getSpeakingRolePlayScenarios = vi.fn().mockResolvedValue({
      items: [
        { scenario_type: "campus_service", title: "t1", opening_prompt: "o1", npc_role: "r1" },
        { scenario_type: "travel_support", title: "t2", opening_prompt: "o2", npc_role: "r2" },
        { scenario_type: "job_interview", title: "t3", opening_prompt: "o3", npc_role: "r3" },
        { scenario_type: "academic_tutor", title: "t4", opening_prompt: "o4", npc_role: "r4" },
        { scenario_type: "community_event", title: "t5", opening_prompt: "o5", npc_role: "r5" }
      ]
    });
    const getSpeakingSessionEvents = vi.fn().mockResolvedValue({
      items: [{ id: "evt-1" }, { id: "evt-2" }, { id: "evt-3" }]
    });
    const endSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "s-1",
      status: "ended",
      resume_until: new Date().toISOString()
    });
    const switchSpeakingPart = vi.fn().mockResolvedValue({
      session_id: "s-1",
      current_part: 2,
      status: "connected",
      updated_at: new Date().toISOString()
    });
    const createSpeakingRetrySession = vi.fn().mockResolvedValue({
      session_id: "s-2",
      status: "created",
      resume_token: "retry-token",
      resume_until: new Date().toISOString(),
      current_part: 1
    });
    const getSpeakingComparison = vi.fn().mockResolvedValue({
      source_session_id: "s-1",
      retry_session_id: "s-2",
      source_scores: {
        fluency: 5.5,
        lexical: 5.5,
        grammar: 5.5,
        pronunciation: 5.5
      },
      retry_scores: {
        fluency: 6,
        lexical: 6,
        grammar: 5.5,
        pronunciation: 5.8
      },
      delta: {
        fluency: 0.5,
        lexical: 0.5,
        grammar: 0,
        pronunciation: 0.3
      },
      next_actions: ["next"]
    });
    const getSpeakingPronunciationFeedback = vi.fn().mockResolvedValue({
      turns: [
        {
          turn_no: 1,
          part_no: 2,
          word_issues: [
            {
              word: "because",
              position: 1,
              phoneme: "/k/",
              severity: "medium",
              issue_tag: "sample",
              suggestion: "sug",
              replay_segment_id: "turn-1-seg-1"
            }
          ],
          phoneme_issues: [
            {
              phoneme: "/r/",
              issue_tag: "r_coloring_inconsistent",
              suggestion: "sug",
              severity: "high",
              count: 2,
              example_words: ["practice"]
            }
          ],
          replay_segments: [
            {
              segment_id: "turn-1-seg-1",
              turn_no: 1,
              start_ms: 0,
              end_ms: 900,
              reference_text: "practice",
              user_text: "practice",
              reference_audio_url: "https://ref",
              user_audio_url: "https://user"
            }
          ]
        }
      ],
      hotspot_words: [
        {
          word: "practice",
          count: 2,
          max_severity: "high"
        }
      ],
      hotspot_phonemes: [
        {
          phoneme: "/r/",
          issue_tag: "r_coloring_inconsistent",
          suggestion: "sug",
          severity: "high",
          count: 2,
          example_words: ["practice"]
        }
      ],
      tasks: [
        {
          task_id: "pron-r",
          title: "纠音任务 /r/",
          description: "d",
          phoneme: "/r/",
          status: "todo",
          linked_turn_nos: [1]
        }
      ]
    });
    const trackSpeakingPronunciationTask = vi.fn().mockResolvedValue({
      task_id: "pron-r",
      status: "done",
      linked_turn_nos: [1]
    });

    render(
      <SpeakingRealtimePage
        apiClient={{
          createSpeakingSession,
          getSpeakingRolePlayScenarios,
          getSpeakingSessionEvents,
          endSpeakingSession,
          switchSpeakingPart,
          createSpeakingRetrySession,
          getSpeakingComparison,
          getSpeakingPronunciationFeedback,
          trackSpeakingPronunciationTask
        }}
        tokenStorage={tokenStorage}
        wsBaseUrl="ws://localhost:8787"
      />
    );

    fireEvent.change(screen.getByLabelText("训练形态"), { target: { value: "role_play" } });
    fireEvent.change(screen.getByLabelText("角色场景"), { target: { value: "job_interview" } });
    fireEvent.click(screen.getByRole("button", { name: "拉取角色场景" }));
    await waitFor(() => {
      expect(getSpeakingRolePlayScenarios).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/scenario_count: 5/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "创建口语会话" }));
    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(createSpeakingSession).toHaveBeenCalledWith(
        "access",
        expect.objectContaining({
          task_type: "role_play",
          scenario_type: "job_interview"
        })
      );
      expect(screen.getByText(/task_type: role_play/)).toBeInTheDocument();
      expect(screen.getByText(/scenario_type: job_interview/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "连接实时会话" }));
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.emitOpen();
      socket.emitMessage({ type: "session_start", current_part: 1 });
    });

    fireEvent.click(screen.getByRole("button", { name: "切换Part2" }));
    expect(socket.sent.some((item) => item.includes("part_switch"))).toBe(true);

    fireEvent.change(screen.getByLabelText("转写文本"), {
      target: {
        value: "Because I practiced daily, I can answer faster."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送转写" }));
    expect(socket.sent.some((item) => item.includes("partial_transcript"))).toBe(true);

    act(() => {
      socket.emitMessage({
        type: "score_update",
        part_no: 2,
        fluency: 6.5,
        lexical: 6,
        grammar: 6,
        pronunciation: 5.5,
        suggestions: ["s1", "s2"],
        latency_ms: 120,
        pronunciation_feedback: {
          word_issues: [{ word: "practice" }],
          phoneme_issues: [{ phoneme: "/r/" }],
          replay_segments: [{ segment_id: "seg-1" }],
          task_recommendations: [{ task_id: "pron-r", status: "todo" }]
        }
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/suggestions: s1 \| s2/)).toBeInTheDocument();
      expect(screen.getByText(/latency_ms: 120/)).toBeInTheDocument();
      expect(screen.getByText(/pronunciation_heatmap: word=1 \/ phoneme=1/)).toBeInTheDocument();
      expect(screen.getByText(/replay_segment_count: 1/)).toBeInTheDocument();
      expect(screen.getByText(/pronunciation_task_count: 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "同题再答" }));
    await waitFor(() => {
      expect(createSpeakingRetrySession).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "拉取前后对比" }));
    await waitFor(() => {
      expect(getSpeakingComparison).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/comparison: ΔF0.5 ΔL0.5 ΔG0 ΔP0.3/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "拉取发音热力图" }));
    await waitFor(() => {
      expect(getSpeakingPronunciationFeedback).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已拉取发音热力图反馈/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "标记首个纠音任务完成" }));
    await waitFor(() => {
      expect(trackSpeakingPronunciationTask).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/tracked_task: pron-r:done/)).toBeInTheDocument();
    });
  });

  test("submits writing and renders evidence-based suggestions", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const evaluateWriting = vi.fn().mockResolvedValue({
      evaluation_id: "w-1",
      task_type: "task2",
      prompt: "p",
      scores: {
        tr: 6,
        cc: 6,
        lr: 6,
        gra: 5.5,
        overall: 6
      },
      suggestions: [
        {
          suggestion_id: "s-1",
          issue: "i1",
          evidence_sentence: "e1",
          recommendation: "r1",
          revised_sample: "rs1"
        },
        {
          suggestion_id: "s-2",
          issue: "i2",
          evidence_sentence: "e2",
          recommendation: "r2",
          revised_sample: "rs2"
        },
        {
          suggestion_id: "s-3",
          issue: "i3",
          evidence_sentence: "e3",
          recommendation: "r3",
          revised_sample: "rs3"
        }
      ],
      latency_ms: 88,
      fallback_triggered: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    const getWritingEvaluation = vi.fn().mockResolvedValue({
      evaluation_id: "w-1",
      task_type: "task2",
      prompt: "p",
      scores: {
        tr: 6,
        cc: 6,
        lr: 6,
        gra: 5.5,
        overall: 6
      },
      suggestions: [
        {
          suggestion_id: "s-1",
          issue: "i1",
          evidence_sentence: "e1",
          recommendation: "r1",
          revised_sample: "rs1"
        },
        {
          suggestion_id: "s-2",
          issue: "i2",
          evidence_sentence: "e2",
          recommendation: "r2",
          revised_sample: "rs2"
        },
        {
          suggestion_id: "s-3",
          issue: "i3",
          evidence_sentence: "e3",
          recommendation: "r3",
          revised_sample: "rs3"
        }
      ],
      latency_ms: 88,
      fallback_triggered: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const rewriteWriting = vi.fn().mockResolvedValue({
      evaluation: {
        evaluation_id: "w-2",
        task_type: "task2",
        prompt: "p",
        scores: {
          tr: 6.5,
          cc: 6.5,
          lr: 6.5,
          gra: 6,
          overall: 6.5
        },
        suggestions: [],
        latency_ms: 90,
        fallback_triggered: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      comparison: {
        source_evaluation_id: "w-1",
        rewrite_evaluation_id: "w-2",
        source_scores: {
          tr: 6,
          cc: 6,
          lr: 6,
          gra: 5.5,
          overall: 6
        },
        rewrite_scores: {
          tr: 6.5,
          cc: 6.5,
          lr: 6.5,
          gra: 6,
          overall: 6.5
        },
        delta: {
          tr: 0.5,
          cc: 0.5,
          lr: 0.5,
          gra: 0.5,
          overall: 0.5
        },
        next_actions: ["next"]
      },
      archive: {
        archive_id: "a-1",
        task_type: "task2",
        source_evaluation_id: "w-1",
        rewrite_evaluation_id: "w-2",
        delta_overall: 0.5,
        created_at: new Date().toISOString()
      }
    });
    const getWritingArchives = vi.fn().mockResolvedValue({
      items: [
        {
          archive_id: "a-1",
          task_type: "task2",
          source_evaluation_id: "w-1",
          rewrite_evaluation_id: "w-2",
          delta_overall: 0.5,
          created_at: new Date().toISOString()
        }
      ]
    });
    const getWritingTemplates = vi.fn().mockResolvedValue({
      items: [
        {
          template_id: "task2-balanced-opinion",
          task_type: "task2",
          title: "平衡观点论证模板",
          argument_framework: "立场-让步-论证-结论",
          scenario_tag: "opinion",
          usage_tips: ["tip-1"],
          sections: [
            {
              section_id: "intro",
              title: "引言",
              content: "People have different views on this issue."
            }
          ],
          usage_count: 2,
          adoption_rate: 0.5
        }
      ]
    });
    const insertWritingTemplate = vi.fn().mockResolvedValue({
      template: {
        template_id: "task2-balanced-opinion",
        task_type: "task2",
        title: "平衡观点论证模板",
        argument_framework: "立场-让步-论证-结论",
        scenario_tag: "opinion",
        usage_tips: ["tip-1"],
        sections: []
      },
      merged_essay: "original essay\n\n[模板框架]\n(1) 引言: ...",
      preserved_original: true,
      usage: {
        usage_id: "u-1",
        template_id: "task2-balanced-opinion",
        inserted_at: new Date().toISOString(),
        original_essay_length: 100,
        merged_essay_length: 140
      }
    });
    const getWritingTemplateAdoption = vi.fn().mockResolvedValue({
      total_insertions: 3,
      items: [
        {
          template_id: "task2-balanced-opinion",
          title: "平衡观点论证模板",
          task_type: "task2",
          usage_count: 2,
          adoption_rate: 0.67
        }
      ]
    });

    render(
      <WritingEvaluationPage
        apiClient={{
          evaluateWriting,
          getWritingEvaluation,
          rewriteWriting,
          getWritingArchives,
          getWritingTemplates,
          insertWritingTemplate,
          getWritingTemplateAdoption
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "加载写作模板" }));
    await waitFor(() => {
      expect(getWritingTemplates).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/template_count: 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "插入模板框架" }));
    await waitFor(() => {
      expect(insertWritingTemplate).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/template_preserved_original: true/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看模板采纳率" }));
    await waitFor(() => {
      expect(getWritingTemplateAdoption).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/template_adoption: total=3, top=task2-balanced-opinion, rate=0.67/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "提交写作批改" }));
    await waitFor(() => {
      expect(evaluateWriting).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/overall: 6/)).toBeInTheDocument();
      expect(screen.getByText(/suggestion_count: 3/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "加载批改结果" }));
    await waitFor(() => {
      expect(getWritingEvaluation).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已加载写作评估结果/)).toBeInTheDocument();
    });
  });
});
