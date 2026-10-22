"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmAgentAction,
  dismissAgentAction,
  getAgentActionStatus,
} from "@/actions/agent-workflow.actions";
import { useApp } from "@/components/ui/providers";
import { Card, Status } from "@/components/ui/primitives";
export type ProposedAction = {
  id: string;
  action: string;
  input: Record<string, unknown>;
  status: string;
  route: string;
};
export function AgentActionReview({
  proposal,
  onComplete,
}: {
  proposal: ProposedAction;
  onComplete?: (proposal: ProposedAction) => void;
}) {
  const { t, run } = useApp();
  const actionLabels: Record<string, string> = {
    saveAccount: "money",
    archiveAccount: "archive",
    categorizeTransaction: "category",
    createReminder: "setReminder",
    updateAlert: "alerts",
    updateCredit: "credit",
    toggleCreditTask: "credit",
    updateProfile: "profile",
    updateFamily: "family",
    updateControls: "controls",
    removeBeneficiary: "remove",
    cancelPayment: "cancel",
    parentPaymentDecision: "approvals",
    parentBeneficiaryDecision: "approvals",
    manageSavedCard: "savedCards",
    selectAiModel: "selectedModel",
    submitReport: "reports",
  };
  const router = useRouter();
  const [status, setStatus] = useState(proposal.status);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    void getAgentActionStatus([proposal.id]).then((r) => {
      if (live && r.success && r.data[0]) {
        setStatus(String(r.data[0].status));
        if (r.data[0].result_json)
          setDetails(JSON.parse(String(r.data[0].result_json)));
      }
    });
    return () => {
      live = false;
    };
  }, [proposal.id]);
  return (
    <Card className="agent-action-review">
      <div className="between">
        <h3>
          {t("reviewAction")}:{" "}
          {t(actionLabels[proposal.action] || proposal.action)}
        </h3>
        <Status value={status} />
      </div>
      <dl className="action-fields">
        {Object.entries(proposal.input).map(([key, value]) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>
              {typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
            </dd>
          </div>
        ))}
      </dl>
      {status === "PENDING" && (
        <div className="button-group">
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await run(() => confirmAgentAction(proposal.id), {
                refresh: false,
              });
              setBusy(false);
              if (result) {
                setStatus(result.status);
                setDetails(result.result);
                if (
                  proposal.action === "updatePreferences" &&
                  proposal.input.theme
                ) {
                  const theme = String(proposal.input.theme);
                  localStorage.setItem("theme", theme);
                  document.documentElement.dataset.theme = theme;
                  window.dispatchEvent(new Event("finbridge-theme"));
                }
                onComplete?.(proposal);
                router.refresh();
              } else {
                const r = await getAgentActionStatus([proposal.id]);
                if (r.success && r.data[0]) setStatus(String(r.data[0].status));
              }
            }}
          >
            {t("confirmAction")}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              const r = await run(() => dismissAgentAction(proposal.id));
              if (r !== undefined) setStatus("CANCELLED");
            }}
          >
            {t("cancel")}
          </button>
        </div>
      )}
      {status === "COMPLETED" && <p role="status">{t("actionCompleted")}</p>}
      {status === "EXECUTING" && (
        <p role="status">{t("agentActionExecuting")}</p>
      )}
      {status === "EXPIRED" && <p role="status">{t("agentActionExpired")}</p>}
      {details != null && (
        <details>
          <summary>{t("result")}</summary>
          <pre className="json-block">{JSON.stringify(details, null, 2)}</pre>
        </details>
      )}
    </Card>
  );
}
