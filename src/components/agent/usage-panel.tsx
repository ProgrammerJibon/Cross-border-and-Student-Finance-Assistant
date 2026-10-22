"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getAgentUsage } from "@/actions/agent.actions";
import { Card } from "@/components/ui/primitives";
import { useApp } from "@/components/ui/providers";
type Usage = Extract<
  Awaited<ReturnType<typeof getAgentUsage>>,
  { success: true }
>["data"];
export function AgentUsagePanel({ revision }: { revision: string }) {
  const { t, locale } = useApp();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void getAgentUsage()
      .then((r) => {
        if (live) {
          if (r.success) {
            setUsage(r.data);
            setError("");
          } else setError(r.code);
        }
      })
      .catch(() => {
        if (live) setError("AI_UNAVAILABLE");
      });
    return () => {
      live = false;
    };
  }, [revision]);
  return (
    <Card className="agent-usage">
      <h3>{t("agentUsageTitle")}</h3>
      <p className="muted">{t("agentUsageHelp")}</p>
      {error && <p role="alert">{t(error)}</p>}
      {usage && (
        <>
          <p>
            {t("agentUsagePeriod")}: {usage.period} (UTC)
          </p>
          <dl className="detail-list">
            <div>
              <dt>{t("agentPlanMessages")}</dt>
              <dd>
                {usage.plan.used} / {usage.plan.limit ?? t("notApplicable")}
              </dd>
            </div>
            <div>
              <dt>{t("agentPlanRemaining")}</dt>
              <dd>{usage.plan.remaining ?? t("notApplicable")}</dd>
            </div>
            {usage.plan.status && (
              <div>
                <dt>{t("status")}</dt>
                <dd>{t(usage.plan.status)}</dd>
              </div>
            )}
          </dl>
          {!usage.totals.length && <p>{t("agentNoProviderUsage")}</p>}
          {usage.totals.map((row) => (
            <details key={`${row.provider}-${row.model}`} open>
              <summary>
                {row.provider} · {row.model}
              </summary>
              <dl className="detail-list">
                <div>
                  <dt>{t("providerRequests")}</dt>
                  <dd>
                    {row.requests} ({row.failures} {t("failedRequests")})
                  </dd>
                </div>
                <div>
                  <dt>{t("inputTokens")}</dt>
                  <dd>{row.input_tokens ?? t("notAvailable")}</dd>
                </div>
                <div>
                  <dt>{t("outputTokens")}</dt>
                  <dd>{row.output_tokens ?? t("notAvailable")}</dd>
                </div>
                <div>
                  <dt>{t("totalTokens")}</dt>
                  <dd>{row.total_tokens ?? t("notAvailable")}</dd>
                </div>
                <div>
                  <dt>{t("estimatedCost")}</dt>
                  <dd>
                    {row.estimated_cost_usd === null
                      ? t("notAvailable")
                      : `USD ${row.estimated_cost_usd}`}
                  </dd>
                </div>
              </dl>
              {Number(row.unmetered) > 0 && (
                <p className="muted">
                  {row.unmetered} {t("unmeteredRequests")}
                </p>
              )}
              {Number(row.unpriced) > 0 && (
                <p className="muted">
                  {row.unpriced} {t("unpricedRequests")}
                </p>
              )}
            </details>
          ))}
          <p className="muted">{t("agentCostHelp")}</p>
          <Link className="text-link" href={`/${locale}/api-keys`}>
            {t("configurePrices")}
          </Link>
          <h4>{t("providerLimits")}</h4>
          {usage.latest && Object.keys(usage.latest.limits).length ? (
            <>
              <p>
                {usage.latest.provider} · {usage.latest.model}
                <br />
                {new Date(usage.latest.observedAt).toLocaleString(locale)}
              </p>
              <dl className="detail-list">
                {Object.entries(usage.latest.limits).map(([name, value]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p>{t("providerLimitsUnavailable")}</p>
          )}
          <p className="muted">{t("providerQuotaHelp")}</p>
        </>
      )}
    </Card>
  );
}
