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
  FiPlus,
  FiMessageSquare,
  FiClock,
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

function formatConversationTitle(text: string): string {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Untitled Conversation";
  if (words.length <= 20) return words.join(" ");
  return words.slice(0, 20).join(" ") + "...";
}

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
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [budgetReview, setBudgetReview] = useState(false);
  const activeModels = data.aiModels.filter((m) => m.active);
  const defaultModel =
    data.user.ai_model_id &&
    activeModels.some((m) => String(m.id) === String(data.user.ai_model_id))
      ? String(data.user.ai_model_id)
      : activeModels[0]?.id
        ? String(activeModels[0].id)
        : "";
  const [model, setModel] = useState<string>(defaultModel);
  const [modelBusy, setModelBusy] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    scrollToBottom("smooth");
  }, [result, liveSteps, busy, error, goal, thread, scrollToBottom]);

  useEffect(() => {
    if (rateLimitCountdown === null || rateLimitCountdown <= 0) return;
    const timer = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitCountdown]);

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
    const trimmed = prompt.trim();
    if (!trimmed || submitting.current || historyBusy || modelBusy)
      return;
    submitting.current = true;
    setInput("");
    const previousRunId = selectedRunId || undefined;
    const requestId = crypto.randomUUID();
    setRunningId(requestId);
    setLiveSteps([]);
    setGoal(trimmed);
    setBusy(true);
    setResult(null);
    setError("");
    try {
      const r = await askAgent(trimmed, model, previousRunId, requestId);
      if (r.success) {
        setResult(r.data);
        setSelectedRunId(r.data.id);
        localStorage.setItem(storageKey, r.data.id);
        const saved = await getAgentConversation(r.data.id);
        if (saved.success) setThread(saved.data);
        setRateLimitCountdown(null);
        setConversations((c) => {
          const updatedRun: SavedTurn = {
            id: r.data.id,
            goal: trimmed,
            status: "COMPLETED",
            result: JSON.stringify(r.data),
            provider: model,
            created_at: new Date().toISOString(),
            previous_run_id: previousRunId || null,
          };
          if (previousRunId) {
            const idx = c.findIndex((turn) => turn.id === previousRunId);
            if (idx !== -1) {
              const nextList = [...c];
              nextList[idx] = updatedRun;
              return nextList;
            }
          }
          return [updatedRun, ...c];
        });
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
          setConversations((c) => {
            if (previousRunId) {
              const idx = c.findIndex((turn) => turn.id === previousRunId);
              if (idx !== -1) {
                const nextList = [...c];
                nextList[idx] = { ...last };
                return nextList;
              }
            }
            return [{ ...last }, ...c];
          });
        }
        setError(r.code);
        if (
          [
            "AI_RATE_LIMITED",
            "AI_QUOTA_EXCEEDED",
            "AI_OUTPUT_LIMIT",
            "PLAN_LIMIT_REACHED",
          ].includes(r.code)
        ) {
          setRateLimitCountdown(60);
        }
      }
    } catch {
      // A lost HTTP response may still have completed server-side. Preserve its
      // identifier so refresh/reopen can recover it without repeating mutations.
      localStorage.setItem(storageKey, requestId);
      setError("AI_UNAVAILABLE");
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
      <div className="agent-page-layout">
        <aside className="agent-history-sidebar" aria-label={t("previousConversations")}>
          <div className="agent-history-header">
            <div className="agent-history-header-top">
              <strong>{t("previousConversations")}</strong>
              <Badge>{conversations.length}</Badge>
            </div>
            <button
              type="button"
              className="agent-new-chat-btn"
              disabled={busy || historyBusy}
              onClick={() => {
                setSelectedRunId("");
                setThread([]);
                localStorage.removeItem(storageKey);
                setResult(null);
                setGoal("");
                setInput("");
                setError("");
              }}
            >
              <FiPlus />
              <span>{t("newConversation")}</span>
            </button>
          </div>
          <div className="agent-history-list">
            {conversations.length === 0 ? (
              <div className="agent-history-empty">
                <p className="muted">{t("emptyBody")}</p>
              </div>
            ) : (
              conversations.map((r) => {
                const isSelected = selectedRunId === String(r.id);
                return (
                  <button
                    type="button"
                    key={String(r.id)}
                    className={`agent-history-item ${isSelected ? "active" : ""}`}
                    disabled={busy || historyBusy}
                    onClick={async () => {
                      if (isSelected) return;
                      setHistoryBusy(true);
                      try {
                        await loadThread(String(r.id));
                      } catch {
                        setError("AI_UNAVAILABLE");
                      } finally {
                        setHistoryBusy(false);
                      }
                    }}
                  >
                    <span className="history-item-icon">
                      <FiMessageSquare />
                    </span>
                    <div className="history-item-content">
                      <span className="history-item-goal" title={String(r.goal)}>
                        {formatConversationTitle(String(r.goal))}
                      </span>
                      <span className="history-item-meta">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                        {" · "}
                        <span className={`status-pill ${String(r.status).toLowerCase()}`}>
                          {t(String(r.status))}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {hasMore && (
            <div className="agent-history-footer">
              <button
                type="button"
                className="button secondary small full-width"
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
            </div>
          )}
        </aside>

        <Card className="agent-conversation">
          <div className="agent-header">
            <span className="agent-avatar">
              <FiZap />
            </span>
            <div>
              <strong>{t("agent")}</strong>
              <small>
                <i />
                {String(
                  activeModels.find((m) => m.id === model)?.label ||
                    activeModels.find((m) => m.id === model)?.company ||
                    t("agent"),
                )}
              </small>
            </div>
            <Badge>AI</Badge>
            <select
              aria-label={t("selectedModel")}
              value={model}
              disabled={busy || modelBusy || activeModels.length === 0}
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
              {activeModels.length === 0 ? (
                <option value="" disabled>
                  {t("noActiveModels") || "No AI models available"}
                </option>
              ) : (
                activeModels.map((m) => (
                  <option value={String(m.id)} key={String(m.id)}>
                    {m.label} · {m.model}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="agent-content">
            {activeModels.length === 0 && (
              <p className="muted">
                {t("agentKeysHelp")}{" "}
                <Link className="text-link" href={`/${locale}/api-keys`}>
                  {t("api-keys")}
                </Link>
              </p>
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
            {error && (
              <div
                className={`agent-error-banner ${["AI_RATE_LIMITED", "AI_QUOTA_EXCEEDED", "AI_OUTPUT_LIMIT", "PLAN_LIMIT_REACHED"].includes(error) ? "token-limit-alert" : ""}`}
                role="alert"
              >
                <div className="error-banner-header">
                  <FiClock className="error-icon" />
                  <div>
                    <strong>
                      {["AI_RATE_LIMITED", "AI_QUOTA_EXCEEDED"].includes(error)
                        ? t("tokenLimitReached")
                        : error === "PLAN_LIMIT_REACHED"
                          ? t("planLimitReached") || "Plan Message Limit Reached"
                          : t(error)}
                    </strong>
                    <p className="error-desc">{t(error)}</p>
                  </div>
                </div>
                {rateLimitCountdown !== null && rateLimitCountdown > 0 && (
                  <div className="countdown-box">
                    <span className="countdown-label">
                      {t("tokenRefreshCountdown")}{" "}
                      {activeModels.find((m) => m.id === model)?.label ||
                        activeModels.find((m) => m.id === model)?.model ||
                        "this model"}
                    </span>
                    <span className="countdown-timer">
                      {Math.floor(rateLimitCountdown / 60)}:
                      {(rateLimitCountdown % 60).toString().padStart(2, "0")}s
                    </span>
                  </div>
                )}
                {["AI_RATE_LIMITED", "AI_QUOTA_EXCEEDED"].includes(error) &&
                  activeModels.length > 1 && (
                    <div className="error-action-hint">
                      <span>💡 {t("switchModelHint")}</span>
                    </div>
                  )}
              </div>
            )}
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
            <div ref={messagesEndRef} style={{ height: "1px", width: "100%" }} />
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
          <Card className="agent-hero-card">
            <div className="agent-hero-top">
              <Badge>
                <FiShield />
                {t("sandbox")}
              </Badge>
            </div>
            <h2 className="agent-hero-title">{t("agentTitle")}</h2>
            <p className="agent-hero-subtitle">{t("agentSubtitle")}</p>
          </Card>
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
