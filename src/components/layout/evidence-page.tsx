"use client";
import { FiLock, FiUsers, FiShield, FiFileText } from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  Metric,
  DataCards,
  ExportButton,
} from "@/components/ui/primitives";
import { JourneyVisual } from "@/components/charts/journey-visual";
import { FinanceBar } from "@/components/charts/finance-charts";
import type { Workspace } from "@/types/workspace";
export function EvidencePage({
  data,
  project = false,
}: {
  data: Workspace;
  project?: boolean;
}) {
  const { t } = useApp();
  const runs = project ? data.adminData.runs || [] : data.runs;
  const transfers = project ? data.adminData.transfers || [] : data.transfers;
  const evidence = {
    runs,
    transfers,
    audit: project ? data.adminData.audit : data.audit,
    tools: project ? data.adminData.tools : data.tools,
    sandbox: true,
  };
  return (
    <>
      <Heading
        title={t(project ? "project-evidence" : "security-assessment")}
        subtitle={t(project ? "projectWalkthrough" : "securityReviewIntro")}
        action={
          <ExportButton
            data={
              project
                ? evidence
                : {
                    controls: [
                      "role checks",
                      "ownership",
                      "approval",
                      "atomic ledger",
                      "encrypted AI keys",
                    ],
                    limitations: t("limitationsBody"),
                  }
            }
          />
        }
      />
      {project ? (
        <>
          <div className="metrics-grid">
            <Metric label={t("agent")} value={runs.length} />
            <Metric
              label={t("COMPLETED")}
              value={transfers.filter((r) => r.status === "COMPLETED").length}
            />
            <Metric
              label={t("toolResult")}
              value={(data.adminData.tools || []).length}
            />
          </div>
          <JourneyVisual architecture />
          <div className="two-grid">
            <Card>
              <h2>{t("executionResults")}</h2>
              <FinanceBar
                labels={["COMPLETED", "FAILED", "PENDING"]}
                series={[
                  {
                    label: "agent",
                    data: ["COMPLETED", "FAILED", "PENDING"].map(
                      (s) => runs.filter((r) => r.status === s).length,
                    ),
                  },
                ]}
              />
            </Card>
            <Card>
              <h2>{t("demoGuide")}</h2>
              <ol className="guide-list">
                {[
                  "connectMoney",
                  "setGoal",
                  "aiAnalyses",
                  "approve",
                  "executeMonitor",
                  "viewEvidence",
                ].map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ol>
            </Card>
          </div>
          <Card>
            <h2>{t("audit")}</h2>
            <DataCards
              rows={(data.adminData.audit || []).slice(0, 20)}
              columns={[
                { key: "action" },
                { key: "entity_type" },
                { key: "created_at" },
              ]}
            />
          </Card>
        </>
      ) : (
        <>
          <div className="security-control-grid">
            {[
              [FiLock, "secureAccess", "authSecurity"],
              [FiUsers, "permissionTiers", "familyPrivacy"],
              [FiShield, "humanControl", "approvalSecurity"],
              [FiFileText, "traceableResults", "auditSecurity"],
            ].map(([Icon, title, body]) => {
              const Component = Icon as typeof FiLock;
              return (
                <Card key={String(title)}>
                  <Component className="feature-icon" />
                  <h2>{t(String(title))}</h2>
                  <p>{t(String(body))}</p>
                </Card>
              );
            })}
          </div>
          <Card>
            <h2>{t("securityBoundaries")}</h2>
            <DataCards
              rows={[
                { control: t("apiKey"), protection: t("apiKeyPrivacy") },
                {
                  control: t("moderatorPermissions"),
                  protection: t("moderatorBoundary"),
                },
                { control: t("savedCards"), protection: t("savedCardHelp") },
              ]}
              columns={[{ key: "control" }, { key: "protection" }]}
            />
          </Card>
          <Card>
            <h2>{t("knownRisks")}</h2>
            <p>{t("limitationsBody")}</p>
            <p className="muted">{t("securityNotCertification")}</p>
          </Card>
        </>
      )}
    </>
  );
}
