"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AgentActionReview, type ProposedAction } from "./action-review";
import Link from "next/link";
import {
  FiZap,
  FiArrowUp,
  FiCheck,
  FiArrowUpRight,
  FiShield,
  FiCircle,
} from "react-icons/fi";
import {
  askAgent,
  getAgentHistory,
  getAgentConversation,
} from "@/actions/agent.actions";
import type { SavedTurn } from "@/ai/conversation";
import { AgentUsagePanel } from "./usage-panel";
import { parseJson } from "@/lib/json";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { saveAgentBudget } from "@/actions/budget.actions";
import { selectAiModel } from "@/actions/platform.actions";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Badge,
  Progress,
  ExportButton,
  Modal,
} from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
type AgentResult = {
  id: string;
  kind: string;
  summary?: string;
  summaryKey: string;
  outputs: Record<string, unknown>;
  steps: string[];
  amount: string;
  toolCalls?: { name: string; status: string }[];
};
export function AgentPage({ data }: { data: Workspace }) {
  const { t, locale, run } = useApp();
  const router = useRouter();
  const [runningId, setRunningId] = useState("");
  const [liveSteps, setLiveSteps] = useState<
    { name: string; status: string }[]
  >([]);
  const [conversations, setConversations] = useState(data.runs);
  const [thread, setThread] = useState<SavedTurn[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const submitting = useRef(false);
  const [input, setInput] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [budgetReview, setBudgetReview] = useState(false);
  const [model, setModel] = useState(data.user.ai_model_id || "mock");
  const [modelBusy, setModelBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const storageKey = `finbridge-agent-${data.user.id}`;
  const loadThread = useCallback(
    async (id: string) => {
      const saved = await getAgentConversation(id);
      if (!saved.success) {
        setError(saved.code);
        return;
      }
      setThread(saved.data);
      const last = saved.data.at(-1)!;
      setSelectedRunId(last.id);
      localStorage.setItem(storageKey, last.id);
      setGoal(last.goal);
      if (last.result) {
        const parsed = parseJson<Partial<AgentResult> & { error?: string }>(
          last.result,
          {},
        );
        setResult({
          kind: "action",
          summaryKey: "",
          amount: "0",
          ...parsed,
          id: last.id,
          outputs: parsed.outputs || {},
          steps: parsed.steps || [],
        });
        setError(parsed.error || "");
      } else {
        setResult(null);
        setError(
          last.status === "RUNNING" ? "AI_RUN_IN_PROGRESS" : "AI_INTERRUPTED",
        );
      }
    },
    [storageKey],
  );
  useEffect(() => {
    let live = true;
    void getAgentHistory()
      .then(async (r) => {
        if (!live || !r.success) return;
        setConversations(r.data.runs);
        setHasMore(r.data.hasMore);
        const id = localStorage.getItem(storageKey);
        if (id) await loadThread(id);
      })
      .catch(() => {
        if (live) setError("AI_UNAVAILABLE");
      });
    return () => {
      live = false;
    };
  }, [loadThread, storageKey]);
  const submit = async (prompt: string) => {
    if (!prompt.trim() || submitting.current || historyBusy || modelBusy)
      return;
    submitting.current = true;
    const previousRunId = selectedRunId || undefined;
    const requestId = crypto.randomUUID();
    setRunningId(requestId);
    setLiveSteps([]);
    setGoal(prompt);
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const r = await askAgent(prompt, model, previousRunId, requestId);
      if (r.success) {
        setResult(r.data);
        setSelectedRunId(r.data.id);
        localStorage.setItem(storageKey, r.data.id);
        const saved = await getAgentConversation(r.data.id);
        if (saved.success) setThread(saved.data);
        setInput("");
        setConversations((c) => [
          {
            id: r.data.id,
            goal: prompt,
            status: "COMPLETED",
            result: JSON.stringify(r.data),
            provider: model,
            created_at: new Date().toISOString(),
          },
          ...c,
        ]);
        const navigation = r.data.outputs.respond as
          { type?: string; url?: string } | undefined;
        if (navigation?.type === "open_page" && navigation.url)
          router.push(`/${locale}/${navigation.url}`);
      } else {
        const saved = await getAgentConversation(requestId);
        if (saved.success) {
          setThread(saved.data);
          setSelectedRunId(requestId);
          localStorage.setItem(storageKey, requestId);
          const last = saved.data.at(-1)!;
          const partial = parseJson<Partial<AgentResult>>(last.result, {});
          setResult({
            id: last.id,
            kind: "action",
            summaryKey: "",
            amount: "0",
            ...partial,
            outputs: partial.outputs || {},
            steps: partial.steps || [],
          });
          setConversations((c) => [{ ...last }, ...c]);
        }
        setError(r.code);
        setInput(prompt);
      }
    } catch {
      // A lost HTTP response may still have completed server-side. Preserve its
      // identifier so refresh/reopen can recover it without repeating mutations.
      localStorage.setItem(storageKey, requestId);
      setError("AI_UNAVAILABLE");
      setInput(prompt);
    }
    submitting.current = false;
    setBusy(false);
  };
  useEffect(() => {
    if (!busy || !runningId) return;
    const poll = async () => {
      try {
        const r = await fetch(
          `/api/agent/progress?runId=${encodeURIComponent(runningId)}`,
          { cache: "no-store" },
        );
        if (r.ok) setLiveSteps((await r.json()).steps);
      } catch {
        /* Keep the conversation; a transient progress failure is harmless. */
      }
    };
    const timer = setInterval(() => void poll(), 1500);
    return () => clearInterval(timer);
  }, [busy, runningId]);
  const outputs = result?.outputs || {};
  const timeline = busy
    ? liveSteps
    : result?.toolCalls ||
      (result?.steps || []).map((name) => ({
        name,
        status: (outputs[name] as { failed?: boolean })?.failed
          ? "FAILED"
          : "SUCCESS",
      }));
  const response = outputs.respond as
    | {
        type: string;
        message: string;
        question: string | null;
        options: string[];
        url: string | null;
      }
    | undefined;
  const proposals = (outputs.proposedActions || []) as ProposedAction[];
  const gap = outputs.calculateTuitionGap as {
    readiness: number;
    shortage: string;
    monthlyTarget: string;
    currency: string;
  } | null;
  const quotes = (
    (outputs.compareRemittance || outputs.prepareTransfer) as
      | {
          quotes: {
            provider: string;
            total: string;
            source_currency: string;
            target_currency: string;
            eta_days: number;
          }[];
        }
      | undefined
  )?.quotes;
  return (
    <>
      <Heading
        title={t("agentTitle")}
        subtitle={t("agentSubtitle")}
        action={
          <Badge>
            <FiShield />
            {t("sandbox")}
          </Badge>
        }
      />
      <div className="agent-grid">
        <Card className="agent-conversation">
          <div className="agent-header">
            <span className="agent-avatar">
              <FiZap />
            </span>
            <div>
              <strong>{t("agent")}</strong>
              <small>
                <i />
                {model === "mock"
                  ? t("mockMode")
                  : String(
                      data.aiModels.find((m) => m.id === model)?.company || "",
                    )}
              </small>
            </div>
            <Badge>AI</Badge>
            <select
              aria-label={t("selectedModel")}
              value={model}
              disabled={busy || modelBusy}
              onChange={async (e) => {
                const id = e.target.value;
                const previous = model;
                setModel(id);
                setModelBusy(true);
                try {
                  const result = await run(() => selectAiModel(id), {
                    quiet: true,
                    refresh: false,
                  });
                  if (result === undefined) setModel(previous);
                } finally {
                  setModelBusy(false);
                }
              }}
            >
              <option value="mock">{t("mockMode")}</option>
              {data.aiModels
                .filter((m) => m.active)
                .map((m) => (
                  <option value={String(m.id)} key={String(m.id)}>
                    {m.label} · {m.model}
                  </option>
                ))}
            </select>
          </div>
          <div className="agent-content">
            <p className="muted">
              {t("agentKeysHelp")}{" "}
              <Link className="text-link" href={`/${locale}/api-keys`}>
                {t("api-keys")}
              </Link>
            </p>
            {model === "mock" && <p className="muted">{t("agentDemoHelp")}</p>}
            <label className="model-select">
              {t("previousConversations")}
              <select
                aria-label={t("previousConversations")}
                value={selectedRunId}
                disabled={busy || historyBusy}
                onChange={async (e) => {
                  const id = e.target.value;
                  if (!e.target.value) {
                    setSelectedRunId("");
                    setThread([]);
                    localStorage.removeItem(storageKey);
                    setResult(null);
                    setGoal("");
                    setInput("");
                    setError("");
                    return;
                  }
                  setHistoryBusy(true);
                  try {
                    await loadThread(id);
                  } catch {
                    setError("AI_UNAVAILABLE");
                  } finally {
                    setHistoryBusy(false);
                  }
                }}
              >
                <option value="">{t("newConversation")}</option>
                {conversations.map((r) => (
                  <option value={String(r.id)} key={String(r.id)}>
                    {String(r.goal).slice(0, 75)} · {t(String(r.status))}
                  </option>
                ))}
              </select>
            </label>
            {hasMore && (
              <button
                className="text-link"
                disabled={busy || historyBusy}
                onClick={async () => {
                  setHistoryBusy(true);
                  try {
                    const r = await getAgentHistory(historyPage + 1);
                    if (r.success) {
                      setConversations((c) => [
                        ...c,
                        ...r.data.runs.filter(
                          (row) =>
                            !c.some((existing) => existing.id === row.id),
                        ),
                      ]);
                      setHistoryPage((p) => p + 1);
                      setHasMore(r.data.hasMore);
                    } else setError(r.code);
                  } finally {
                    setHistoryBusy(false);
                  }
                }}
              >
                {t("loadOlderConversations")}
              </button>
            )}
            <div aria-label={t("conversationHistory")}>
              {thread
                .filter((turn) => busy || turn.id !== selectedRunId)
                .map((turn) => {
                  const prior = parseJson<{
                    summary?: string;
                    summaryKey?: string;
                    error?: string;
                    outputs?: { proposedActions?: ProposedAction[] };
                  }>(turn.result, {});
                  return (
                    <div key={turn.id}>
                      <div className="user-message">{turn.goal}</div>
                      <div className="agent-message">
                        <span className="agent-avatar">
                          <FiZap />
                        </span>
                        <div className="agent-response">
                          <p className="prewrap">
                            {prior.summary ||
                              t(prior.summaryKey || prior.error || turn.status)}
                          </p>
                          {prior.outputs?.proposedActions?.map((proposal) => (
                            <AgentActionReview
                              key={proposal.id}
                              proposal={proposal}
                              onComplete={() => void loadThread(selectedRunId)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
            {error && <p role="alert">{t(error)}</p>}
            {!goal ? (
              <div className="agent-welcome">
                <span className="agent-large-icon">
                  <FiZap />
                </span>
                <h2>{t("agentIntro")}</h2>
                <p>{t("agentSubtitle")}</p>
                <div className="prompt-grid">
                  {[
                    "promptTuition",
                    "promptTransfer",
                    "promptBudget",
                    "promptRisk",
                    "promptSend",
                    "promptTopup",
                    "promptBalance",
                    "promptWithdrawal",
                  ].map((k) => (
                    <button
                      key={k}
                      className="prompt-card"
                      onClick={() => submit(t(k))}
                    >
                      {t(k)}
                      <FiArrowUpRight />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="user-message">{goal}</div>
                <div className="agent-message">
                  <span className="agent-avatar">
                    <FiZap />
                  </span>
                  <div className="agent-response">
                    {busy ? (
                      <div className="working-state">
                        <span className="pulse-dot" />
                        {t("loading")}
                        <p>
                          {liveSteps.length
                            ? t(liveSteps.at(-1)!.name)
                            : t("agentUnderstanding")}
                        </p>
                      </div>
                    ) : result ? (
                      <>
                        <p className="prewrap">
                          {"summary" in result && result.summary
                            ? result.summary
                            : t(result.summaryKey || "")}
                        </p>
                        {response?.type === "require_answer" && (
                          <div className="agent-question">
                            <strong>{response.question}</strong>
                            <div className="button-group">
                              {response.options.map((option) => (
                                <button
                                  key={option}
                                  className="button secondary"
                                  onClick={() => void submit(option)}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {response?.type === "open_page" && response.url && (
                          <Link
                            className="button"
                            href={`/${locale}/${response.url}`}
                          >
                            {t("openPage")}
                          </Link>
                        )}
                        {proposals.map((proposal) => (
                          <AgentActionReview
                            key={proposal.id}
                            proposal={proposal}
                            onComplete={(p) => {
                              if (p.action === "selectAiModel")
                                setModel(String(p.input.model_id));
                              if (
                                p.action === "updatePreferences" &&
                                p.input.language
                              )
                                router.push(`/${p.input.language}/agent`);
                              else void loadThread(selectedRunId);
                            }}
                          />
                        ))}
                        {gap && (
                          <div className="agent-metrics">
                            <div>
                              <span>{t("tuitionReadiness")}</span>
                              <strong>{Math.round(gap.readiness)}%</strong>
                              <Progress value={gap.readiness} />
                            </div>
                            <div>
                              <span>{t("fundingGap")}</span>
                              <strong>
                                {formatMoney(
                                  gap.shortage,
                                  gap.currency,
                                  locale,
                                )}
                              </strong>
                            </div>
                          </div>
                        )}
                        {quotes && (
                          <div className="agent-quotes">
                            {quotes.map((q, i) => (
                              <div key={q.provider}>
                                <span>
                                  {i === 0 && <FiCheck />}
                                  {q.provider}
                                </span>
                                <strong>
                                  {formatMoney(
                                    q.total,
                                    q.source_currency,
                                    locale,
                                  )}
                                </strong>
                              </div>
                            ))}
                          </div>
                        )}
                        {result.kind === "payment" && (
                          <PaymentsPanel
                            data={data}
                            compact
                            focusId={String(
                              (
                                outputs.draftPayment as
                                  { id?: string } | undefined
                              )?.id || "",
                            )}
                          />
                        )}
                        <div className="button-group">
                          {result.kind === "budget" && (
                            <button
                              className="button"
                              onClick={() => setBudgetReview(true)}
                            >
                              {t("reviewBudget")}
                            </button>
                          )}
                          {result.kind !== "payment" &&
                            result.kind !== "action" && (
                              <Link
                                className="button"
                                href={`/${locale}/${result.kind === "transfer" ? `transfer?amount=${result.amount}&source=${quotes?.[0]?.source_currency || "BDT"}&target=${quotes?.[0]?.target_currency || "CNY"}` : result.kind === "budget" ? "budget" : result.kind === "credit" ? "credit" : "tuition"}`}
                              >
                                {t(
                                  result.kind === "transfer"
                                    ? "reviewTransfer"
                                    : result.kind === "budget"
                                      ? "createBudget"
                                      : "seePlan",
                                )}
                                <FiArrowUpRight />
                              </Link>
                            )}
                          <ExportButton
                            data={result}
                            name={`agent-${result.id}`}
                          />
                        </div>
                      </>
                    ) : (
                      !error && <p>{t("retry")}</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <form
            className="agent-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit(input);
            }}
          >
            <textarea
              aria-label={t("agentInput")}
              placeholder={t("agentInput")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit(input);
                }
              }}
            />
            <button
              aria-label={t("send")}
              disabled={
                busy || historyBusy || modelBusy || input.trim().length < 1
              }
            >
              <FiArrowUp />
            </button>
          </form>
          <div className="agent-footnote">
            <FiShield />
            {t("sandboxDisclosure")}
          </div>
        </Card>
        <div className="agent-context">
          <AgentUsagePanel revision={`${selectedRunId}-${busy}`} />
          <Card>
            <h3>{t("context")}</h3>
            <div className="detail-list">
              <div>
                <span>{t("totalBalance")}</span>
                <b>
                  {formatMoney(
                    data.metrics.total,
                    data.user.preferred_currency,
                    locale,
                  )}
                </b>
              </div>
              <div>
                <span>{t("tuitionReadiness")}</span>
                <b>{Math.round(data.gap?.readiness || 0)}%</b>
              </div>
              <div>
                <span>{t("daysLeft")}</span>
                <b>{data.gap?.daysRemaining || 0}</b>
              </div>
            </div>
            <Progress value={data.gap?.readiness || 0} />
          </Card>
          <Card>
            <h3>{t("executionTimeline")}</h3>
            <div className="timeline">
              {timeline.map((s, i) => (
                <div
                  className={`timeline-step ${s.status === "SUCCESS" ? "done" : ""}`}
                  key={`${s.name}-${i}`}
                >
                  <span>
                    {s.status === "SUCCESS" ? <FiCheck /> : <FiCircle />}
                  </span>
                  <div>
                    <strong>{t(s.name)}</strong>
                    <small>
                      {t(s.status === "SUCCESS" ? "COMPLETED" : s.status)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {result && (
            <Card>
              <h3>{t("toolResult")}</h3>
              {Object.entries(outputs).map(([name, value]) => (
                <details key={name}>
                  <summary>{t(name)}</summary>
                  <pre className="json-block">
                    {JSON.stringify(value, null, 2)}
                  </pre>
                </details>
              ))}
            </Card>
          )}
        </div>
      </div>
      {budgetReview && result && (
        <Modal title={t("reviewBudget")} onClose={() => setBudgetReview(false)}>
          <p>{t("budgetReviewHelp")}</p>
          <pre className="json-block">
            {JSON.stringify(outputs.generateBudgetSuggestion, null, 2)}
          </pre>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await run(() => saveAgentBudget(result.id));
              setBusy(false);
              if (r !== undefined) setBudgetReview(false);
            }}
          >
            {t("save")}
          </button>
        </Modal>
      )}
    </>
  );
}
