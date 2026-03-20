import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import type { WritingEvaluationResponse } from "../lib/api-types";
import { TokenStorage } from "../lib/token-storage";

type WritingEvaluationPageProps = {
  apiClient: Pick<
    ApiClient,
    | "evaluateWriting"
    | "getWritingEvaluation"
    | "rewriteWriting"
    | "getWritingArchives"
    | "getWritingTemplates"
    | "insertWritingTemplate"
    | "getWritingTemplateAdoption"
  >;
  tokenStorage: TokenStorage;
};

export const WritingEvaluationPage = ({ apiClient, tokenStorage }: WritingEvaluationPageProps) => {
  const [taskType, setTaskType] = useState<"task1" | "task2">("task2");
  const [prompt, setPrompt] = useState("Some people think students should learn practical skills at school.");
  const [essay, setEssay] = useState(
    "I strongly agree with this statement because practical skills can help students adapt to real life more effectively. For example, communication and collaboration are essential in both study and work."
  );
  const [evaluation, setEvaluation] = useState<WritingEvaluationResponse | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [rewriteEssay, setRewriteEssay] = useState(
    "I strongly agree that practical skills should be integrated into school courses because they directly improve students' readiness for work and life."
  );
  const [comparisonText, setComparisonText] = useState("-");
  const [archiveCount, setArchiveCount] = useState(0);
  const [templateCount, setTemplateCount] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateInsertionMode, setTemplateInsertionMode] = useState<"append" | "prepend">("append");
  const [templatePreservedOriginal, setTemplatePreservedOriginal] = useState(false);
  const [templateAdoptionText, setTemplateAdoptionText] = useState("-");
  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }
    return accessToken;
  };

  const evaluate = async (): Promise<void> => {
    try {
      const result = await apiClient.evaluateWriting(withToken(), {
        task_type: taskType,
        prompt,
        essay
      });
      setEvaluation(result);
      setEvaluationId(result.evaluation_id);
      setStatus(`写作批改完成，overall=${result.scores.overall}`);
      setError(null);
    } catch (evaluateError) {
      setError(evaluateError instanceof Error ? evaluateError.message : "写作批改失败");
    }
  };

  const reload = async (): Promise<void> => {
    if (!evaluationId.trim()) {
      setError("请先输入 evaluation_id");
      return;
    }
    try {
      const result = await apiClient.getWritingEvaluation(withToken(), evaluationId.trim());
      setEvaluation(result);
      setStatus("已加载写作评估结果");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载评估结果失败");
    }
  };

  const rewrite = async (): Promise<void> => {
    if (!evaluationId.trim()) {
      setError("请先完成一次写作评估");
      return;
    }
    try {
      const result = await apiClient.rewriteWriting(withToken(), evaluationId.trim(), {
        essay: rewriteEssay
      });
      setEvaluation(result.evaluation);
      setEvaluationId(result.evaluation.evaluation_id);
      setComparisonText(
        `ΔTR${result.comparison.delta.tr} ΔCC${result.comparison.delta.cc} ΔLR${result.comparison.delta.lr} ΔGRA${result.comparison.delta.gra} ΔOverall${result.comparison.delta.overall}`
      );
      setStatus("改写复评完成");
      setError(null);
    } catch (rewriteError) {
      setError(rewriteError instanceof Error ? rewriteError.message : "改写复评失败");
    }
  };

  const loadArchives = async (): Promise<void> => {
    try {
      const result = await apiClient.getWritingArchives(withToken());
      setArchiveCount(result.items.length);
      setStatus("已加载改写档案");
      setError(null);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "加载改写档案失败");
    }
  };

  const loadTemplates = async (): Promise<void> => {
    try {
      const result = await apiClient.getWritingTemplates(withToken(), {
        task_type: taskType
      });
      setTemplateCount(result.items.length);
      if (result.items.length > 0) {
        const exists = result.items.some((item) => item.template_id === selectedTemplateId);
        if (!exists) {
          setSelectedTemplateId(result.items[0].template_id);
        }
      }
      setStatus("已加载写作模板库");
      setError(null);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "加载模板失败");
    }
  };

  const insertTemplate = async (): Promise<void> => {
    if (!selectedTemplateId) {
      setError("请先加载并选择模板");
      return;
    }
    try {
      const result = await apiClient.insertWritingTemplate(withToken(), selectedTemplateId, {
        essay,
        insertion_mode: templateInsertionMode
      });
      setEssay(result.merged_essay);
      setTemplatePreservedOriginal(result.preserved_original);
      setStatus(`模板已插入：${result.template.title}`);
      setError(null);
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : "插入模板失败");
    }
  };

  const loadTemplateAdoption = async (): Promise<void> => {
    try {
      const result = await apiClient.getWritingTemplateAdoption(withToken());
      const top = result.items[0];
      setTemplateAdoptionText(
        top
          ? `total=${result.total_insertions}, top=${top.template_id}, rate=${top.adoption_rate}`
          : `total=${result.total_insertions}, top=-, rate=0`
      );
      setStatus("已加载模板采纳率");
      setError(null);
    } catch (adoptionError) {
      setError(adoptionError instanceof Error ? adoptionError.message : "加载采纳率失败");
    }
  };

  return (
    <section>
      <h1>写作四维评分与证据建议</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="writing-task-type">Task 类型</label>
      <select
        id="writing-task-type"
        value={taskType}
        onChange={(event) => setTaskType(event.target.value as "task1" | "task2")}
      >
        <option value="task1">task1</option>
        <option value="task2">task2</option>
      </select>

      <label htmlFor="writing-prompt">题目</label>
      <textarea
        id="writing-prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <label htmlFor="writing-essay">作文</label>
      <textarea
        id="writing-essay"
        value={essay}
        onChange={(event) => setEssay(event.target.value)}
      />

      <label htmlFor="writing-template-id">模板ID</label>
      <input
        id="writing-template-id"
        value={selectedTemplateId}
        onChange={(event) => setSelectedTemplateId(event.target.value)}
      />

      <label htmlFor="writing-template-insertion-mode">模板插入方式</label>
      <select
        id="writing-template-insertion-mode"
        value={templateInsertionMode}
        onChange={(event) => setTemplateInsertionMode(event.target.value as "append" | "prepend")}
      >
        <option value="append">append</option>
        <option value="prepend">prepend</option>
      </select>

      <button type="button" onClick={() => void loadTemplates()}>
        加载写作模板
      </button>
      <button type="button" onClick={() => void insertTemplate()}>
        插入模板框架
      </button>
      <button type="button" onClick={() => void loadTemplateAdoption()}>
        查看模板采纳率
      </button>

      <button type="button" onClick={() => void evaluate()}>
        提交写作批改
      </button>

      <label htmlFor="writing-evaluation-id">evaluation_id</label>
      <input
        id="writing-evaluation-id"
        value={evaluationId}
        onChange={(event) => setEvaluationId(event.target.value)}
      />
      <button type="button" onClick={() => void reload()}>
        加载批改结果
      </button>

      <label htmlFor="writing-rewrite-essay">改写作文</label>
      <textarea
        id="writing-rewrite-essay"
        value={rewriteEssay}
        onChange={(event) => setRewriteEssay(event.target.value)}
      />
      <button type="button" onClick={() => void rewrite()}>
        改写复评
      </button>
      <button type="button" onClick={() => void loadArchives()}>
        加载改写档案
      </button>

      {evaluation ? (
        <div>
          <p>scores: TR{evaluation.scores.tr} / CC{evaluation.scores.cc} / LR{evaluation.scores.lr} / GRA{evaluation.scores.gra}</p>
          <p>overall: {evaluation.scores.overall}</p>
          <p>latency_ms: {evaluation.latency_ms}</p>
          <p>fallback_triggered: {String(evaluation.fallback_triggered)}</p>
          <p>suggestion_count: {evaluation.suggestions.length}</p>
          {evaluation.suggestions.map((item) => (
            <p key={item.suggestion_id}>
              {item.issue} | evidence: {item.evidence_sentence} | recommendation: {item.recommendation}
            </p>
          ))}
        </div>
      ) : null}

      <p>comparison: {comparisonText}</p>
      <p>archive_count: {archiveCount}</p>
      <p>template_count: {templateCount}</p>
      <p>template_preserved_original: {String(templatePreservedOriginal)}</p>
      <p>template_adoption: {templateAdoptionText}</p>
      <p>status: {status}</p>
    </section>
  );
};
