import { beforeEach, describe, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { ListeningPracticePage } from "../src/pages/ListeningPracticePage";
import { ReadingPracticePage } from "../src/pages/ReadingPracticePage";
import { SpeakingRealtimePage } from "../src/pages/SpeakingRealtimePage";

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

  emitMessage(payload: Record<string, unknown>): void {
    this.onmessage?.(
      new MessageEvent("message", {
        data: JSON.stringify(payload)
      })
    );
  }

  emitOpen(): void {
    this.onopen?.(new Event("open"));
  }
}

beforeEach(() => {
  localStorage.clear();
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
});

describe("S3 practice/speaking pages", () => {
  test("runs listening flow with playback update and retry queue", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "l-1",
      skill: "listening",
      task_type: "core_training",
      mode: "core_training",
      status: "in_progress",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "multiple_choice",
          prompt: "p1"
        },
        {
          question_id: "q-2",
          type: "fill_blank",
          prompt: "p2"
        }
      ]
    });

    const submitPracticeSession = vi.fn().mockResolvedValue({
      session_id: "l-1",
      skill: "listening",
      task_type: "core_training",
      mode: "core_training",
      status: "submitted",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "multiple_choice",
          prompt: "p1"
        },
        {
          question_id: "q-2",
          type: "fill_blank",
          prompt: "p2"
        }
      ],
      submission: {
        submitted_at: new Date().toISOString(),
        score_breakdown: {
          correct_count: 1,
          total_questions: 2,
          accuracy: 0.5
        },
        question_results: [],
        next_actions: ["next"]
      }
    });

    const updatePlaybackState = vi.fn().mockResolvedValue({
      playback_rate: 1,
      segment_index: 1,
      position_seconds: 30,
      replay_wrong_only: true,
      recovered: true
    });

    const getPlaybackState = vi.fn().mockResolvedValue({
      playback_rate: 1,
      segment_index: 1,
      position_seconds: 30,
      replay_wrong_only: true
    });

    const addRetryQueue = vi.fn().mockResolvedValue({
      items: [
        {
          queue_item_id: "rq-1"
        }
      ]
    });

    render(
      <ListeningPracticePage
        apiClient={{
          createPracticeSession,
          submitPracticeSession,
          updatePlaybackState,
          getPlaybackState,
          addRetryQueue
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "创建听力训练" }));
    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已创建听力训练/)).toBeInTheDocument();
    });

    const answerInputs = screen.getAllByLabelText("答案");
    fireEvent.change(answerInputs[0], { target: { value: "B" } });
    fireEvent.change(answerInputs[1], { target: { value: "King" } });

    fireEvent.click(screen.getByRole("button", { name: "提交听力答案" }));
    await waitFor(() => {
      expect(submitPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/提交完成，正确 1\/2/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("播放倍速"), {
      target: {
        value: "1.1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存播放状态" }));
    await waitFor(() => {
      expect(updatePlaybackState).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/播放器异常已恢复到 1.0x/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "加载播放状态" }));
    await waitFor(() => {
      expect(getPlaybackState).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "加入重练队列" }));
    await waitFor(() => {
      expect(addRetryQueue).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/retry_queue_count: 1/)).toBeInTheDocument();
    });
  });

  test("runs listening dictation mode and renders frequency feedback", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createPracticeSession = vi.fn().mockResolvedValue({
      session_id: "ld-1",
      skill: "listening",
      task_type: "dictation",
      mode: "core_training",
      status: "in_progress",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "dictation_sentence",
          prompt: "Sentence 1"
        },
        {
          question_id: "q-2",
          type: "dictation_sentence",
          prompt: "Sentence 2"
        }
      ]
    });

    const submitPracticeSession = vi.fn().mockResolvedValue({
      session_id: "ld-1",
      skill: "listening",
      task_type: "dictation",
      mode: "core_training",
      status: "submitted",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "dictation_sentence",
          prompt: "Sentence 1"
        },
        {
          question_id: "q-2",
          type: "dictation_sentence",
          prompt: "Sentence 2"
        }
      ],
      submission: {
        submitted_at: new Date().toISOString(),
        score_breakdown: {
          correct_count: 0,
          total_questions: 2,
          accuracy: 0
        },
        question_results: [
          {
            question_id: "q-1",
            type: "dictation_sentence",
            user_answer: "ans",
            correct_answer: "correct",
            is_correct: false,
            explanation: "exp",
            error_tags: ["tag"],
            improvement_actions: ["act"],
            dictation_feedback: {
              expected_token_count: 8,
              answer_token_count: 7,
              spelling_mismatches: [
                {
                  position: 2,
                  expected: "suggested",
                  actual: "sugested"
                }
              ],
              missing_chunks: ["before friday"],
              extra_chunks: []
            }
          },
          {
            question_id: "q-2",
            type: "dictation_sentence",
            user_answer: "ans",
            correct_answer: "correct",
            is_correct: false,
            explanation: "exp",
            error_tags: ["tag"],
            improvement_actions: ["act"],
            dictation_feedback: {
              expected_token_count: 9,
              answer_token_count: 8,
              spelling_mismatches: [],
              missing_chunks: ["reception desk"],
              extra_chunks: []
            }
          }
        ],
        next_actions: ["next"],
        dictation_summary: {
          total_sentences: 2,
          high_frequency_spelling_errors: [
            {
              token: "suggested",
              count: 1
            }
          ],
          high_frequency_chunk_errors: [
            {
              chunk: "before friday",
              count: 1
            }
          ]
        }
      }
    });

    render(
      <ListeningPracticePage
        apiClient={{
          createPracticeSession,
          submitPracticeSession,
          updatePlaybackState: vi.fn(),
          getPlaybackState: vi.fn(),
          addRetryQueue: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.change(screen.getByLabelText("训练形态"), { target: { value: "dictation" } });
    fireEvent.click(screen.getByRole("button", { name: "创建听力听写训练" }));

    await waitFor(() => {
      expect(createPracticeSession).toHaveBeenCalledWith(
        "access",
        expect.objectContaining({
          skill: "listening",
          task_type: "dictation"
        })
      );
      expect(screen.getByText(/status: 已创建听力听写训练/)).toBeInTheDocument();
    });

    const answerInputs = screen.getAllByLabelText("答案");
    fireEvent.change(answerInputs[0], { target: { value: "a-1" } });
    fireEvent.change(answerInputs[1], { target: { value: "a-2" } });
    fireEvent.click(screen.getByRole("button", { name: "提交听力答案" }));

    await waitFor(() => {
      expect(submitPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/dictation_sentence_count: 2/)).toBeInTheDocument();
      expect(screen.getByText(/dictation_top_spelling: suggested\(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/dictation_top_chunks: before friday\(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/听写反馈\[q-1\]: spelling=1, missing_chunks=1/)).toBeInTheDocument();
    });
  });

  test("shows reading evidence count after submission", async () => {
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
      mode: "core_training",
      status: "in_progress",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "tfng",
          prompt: "p1"
        }
      ]
    });

    const submitPracticeSession = vi.fn().mockResolvedValue({
      session_id: "r-1",
      skill: "reading",
      task_type: "core_training",
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
          accuracy: 0
        },
        question_results: [
          {
            question_id: "q-1",
            is_correct: false,
            evidence: {
              sentence: "e1",
              paragraph: 2,
              span_start: 1,
              span_end: 8
            }
          }
        ],
        next_actions: ["next"]
      }
    });
    const switchReadingMode = vi.fn().mockResolvedValue({
      session_id: "r-1",
      skill: "reading",
      task_type: "core_training",
      mode: "core_training",
      status: "in_progress",
      training_mode: "training",
      recovered: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          question_id: "q-1",
          type: "tfng",
          prompt: "p1"
        }
      ],
      timer: {
        status: "running",
        elapsed_seconds: 0,
        remaining_seconds: 1200,
        limit_seconds: 1200
      }
    });
    const getReadingTimer = vi.fn().mockResolvedValue({
      recovered: false,
      timer: {
        status: "running",
        elapsed_seconds: 0,
        remaining_seconds: 1200,
        limit_seconds: 1200
      }
    });
    const pauseReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "paused",
        elapsed_seconds: 10,
        remaining_seconds: 1190,
        limit_seconds: 1200
      }
    });
    const resumeReadingTimer = vi.fn().mockResolvedValue({
      timer: {
        status: "running",
        elapsed_seconds: 10,
        remaining_seconds: 1190,
        limit_seconds: 1200
      }
    });
    const recoverReadingTimer = vi.fn().mockResolvedValue({
      recovered: true,
      timer: {
        status: "running",
        elapsed_seconds: 10,
        remaining_seconds: 1190,
        limit_seconds: 1200
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
    });
    await waitFor(() => {
      expect(screen.getByLabelText("答案")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("答案"), {
      target: {
        value: "wrong"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "提交阅读答案" }));

    await waitFor(() => {
      expect(submitPracticeSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/evidence_count: 1/)).toBeInTheDocument();
      expect(screen.getByText(/证据定位: P2 - e1/)).toBeInTheDocument();
    });
  });

  test("runs speaking realtime page with websocket events", async () => {
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
      resume_token: "resume-token",
      resume_until: new Date().toISOString()
    });
    const getSpeakingSessionEvents = vi.fn().mockResolvedValue({
      items: [
        {
          id: "evt-1"
        },
        {
          id: "evt-2"
        }
      ]
    });
    const endSpeakingSession = vi.fn().mockResolvedValue({
      session_id: "s-1",
      status: "ended",
      resume_until: new Date().toISOString()
    });
    const switchSpeakingPart = vi.fn();
    const createSpeakingRetrySession = vi.fn();
    const getSpeakingComparison = vi.fn();
    const getSpeakingRolePlayScenarios = vi.fn();
    const getSpeakingPronunciationFeedback = vi.fn();
    const trackSpeakingPronunciationTask = vi.fn();

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

    fireEvent.click(screen.getByRole("button", { name: "创建口语会话" }));
    await waitFor(() => {
      expect(createSpeakingSession).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已创建口语实时会话/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "连接实时会话" }));
    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBe(1);
    });
    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.emitOpen();
      socket.emitMessage({ type: "session_start" });
    });

    fireEvent.change(screen.getByLabelText("转写文本"), {
      target: {
        value: "I use weekly study plans."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送转写" }));
    expect(socket.sent.some((item) => item.includes("partial_transcript"))).toBe(true);

    act(() => {
      socket.emitMessage({ type: "coach_question", text: "请举例说明。" });
      socket.emitMessage({
        type: "score_update",
        fluency: 6.5,
        lexical: 6,
        grammar: 6,
        pronunciation: 5.5
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/追问:/)).toBeInTheDocument();
      expect(screen.getByText(/score: F6.5 \/ L6 \/ G6 \/ P5.5/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "发送心跳" }));
    expect(socket.sent.some((item) => item.includes("heartbeat"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "拉取会话日志" }));
    await waitFor(() => {
      expect(getSpeakingSessionEvents).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/event_trace_count: 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "结束会话" }));
    expect(socket.sent.some((item) => item.includes("session_end"))).toBe(true);
    act(() => {
      socket.emitMessage({ type: "session_end" });
    });

    await waitFor(() => {
      expect(screen.getByText(/status: 会话结束/)).toBeInTheDocument();
    });
  });
});
