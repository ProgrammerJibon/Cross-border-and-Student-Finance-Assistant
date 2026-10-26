import { getRates, inCurrency } from "@/services/currency.service";
import { parseJson } from "@/lib/json";
import "server-only";
import { effectiveSubscription } from "@/lib/entitlements";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { rows, write, atomic } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { canOpen } from "@/lib/permissions";
import { paymentActor } from "@/services/payment.service";
import { financeRecordsSource } from "@/lib/finance-records";
import {
  agentActionCatalog,
  agentRoutes,
  actionProposalSchema,
  responseSchema,
} from "./action-catalog";
import type { Role } from "@/types";
import { canUseAgentTool } from "./tool-policy";
export async function agentCapabilities(userId: string) {
  const actor = await paymentActor(userId);
  return {
    date: new Date().toISOString().slice(0, 10),
    role: actor.role,
    privacy:
      "Only your own private data is available. Linked-parent approvals and admin settlement expose only necessary payment details. Other users' accounts, chats, reports and credentials are never sent to the provider.",
    availableTools: [
      "getAccounts",
      "analyseTransactions",
      "searchTransactions",
      "getPaymentOptions",
      "getPaymentRequests",
      "getBeneficiaries",
      "getApprovals",
      "getTransfers",
      "getSettlementQueue",
      "getAdminConfiguration",
      "calculate",
      "getActivity",
    ].filter((name) => canUseAgentTool(actor.role as Role, name)),
    routes: agentRoutes.filter((path) => canOpen(actor.role as Role, path)),
    actions: Object.entries(agentActionCatalog)
      .filter(([, v]) => (v.roles as readonly string[]).includes(actor.role))
      .map(([name, v]) => ({
        name,
        description: v.description,
        input: z.toJSONSchema(v.schema),
      })),
    secureForms: {
      card: "payments",
      password: "settings",
      apiKey: "api-keys",
      profilePhoto: "settings",
      csvImport: "transactions",
      checkout: "subscription/checkout",
      closeAccount: "settings",
      exportData: "settings",
      adminUsers: actor.role === "ADMIN" ? "admin/users" : null,
      adminTeam: actor.role === "ADMIN" ? "admin/team" : null,
      adminReports: actor.role === "ADMIN" ? "admin/reports" : null,
    },
  };
}
export async function validateAgentResponse(userId: string, input: unknown) {
  const v = responseSchema.parse(input);
  if (v.type !== "require_answer")
    requireCondition(v.message.trim(), "VALIDATION_ERROR");
  if (v.type === "open_page") {
    requireCondition(v.url, "VALIDATION_ERROR");
    const route = v.url.replace(/^\/(en|zh-CN|bn-BD)\//, "").replace(/^\//, "");
    const actor = await paymentActor(userId);
    requireCondition(
      agentRoutes.includes(route) && canOpen(actor.role as Role, route),
      "FORBIDDEN",
    );
    return { ...v, url: route };
  }
  if (v.type === "require_answer")
    requireCondition(v.question?.trim(), "VALIDATION_ERROR");
  return { ...v, url: null };
}
export async function proposeAgentAction(
  userId: string,
  runId: string,
  input: unknown,
) {
  const v = actionProposalSchema.parse(input);
  const actor = await paymentActor(userId);
  const definition = agentActionCatalog[v.action];
  requireCondition(
    (definition.roles as readonly string[]).includes(actor.role),
    "FORBIDDEN",
  );
  const args = definition.schema.parse(parseJson(v.input_json, {}));
  const serialized = JSON.stringify(args);
  const hash = createHash("sha256")
    .update(v.action + serialized)
    .digest("hex");
  return atomic(async (db) => {
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [userId], db);
    requireCondition(
      (
        await rows(
          "SELECT id FROM agent_runs WHERE id=? AND user_id=? AND status='RUNNING'",
          [runId, userId],
          db,
        )
      ).length,
      "NOT_FOUND",
    );
    await write(
      "INSERT IGNORE INTO agent_action_requests(id,user_id,run_id,action_name,input_json,fingerprint) VALUES (?,?,?,?,?,?)",
      [randomUUID(), userId, runId, v.action, serialized, hash],
      db,
    );
    const [r] = await rows<{ id: string; status: string }>(
      "SELECT id,status FROM agent_action_requests WHERE run_id=? AND fingerprint=?",
      [runId, hash],
      db,
    );
    return {
      type: "review_action",
      id: r.id,
      action: v.action,
      input: args,
      status: r.status,
      route: definition.route,
      confirmationRequired: true,
    };
  });
}
export async function agentWorkspaceData(userId: string, topic: string) {
  const actor = await paymentActor(userId);
  if (topic === "subscriptions") return effectiveSubscription(userId);
  const queries: Record<string, string> = {
    tuition:
      "SELECT * FROM tuition_invoices WHERE user_id=? ORDER BY due_date LIMIT 50",
    budgets:
      "SELECT * FROM budgets WHERE user_id=? ORDER BY month DESC LIMIT 100",
    transactions:
      `SELECT id,account_id,description,amount,currency,category,type,date FROM ${financeRecordsSource} WHERE user_id=? ORDER BY date DESC LIMIT 50`,
    alerts:
      "SELECT id,type,detail,status FROM alerts WHERE user_id=? AND status NOT IN ('DISMISSED','RESOLVED') AND NOT EXISTS (SELECT 1 FROM generated_alerts g WHERE g.alert_id=alerts.id AND g.source_student IS NOT NULL) ORDER BY created_at DESC LIMIT 50",
    subscriptions:
      "SELECT s.plan_id,s.status,s.ends_at,p.limits FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=?",
    settings:
      "SELECT language,theme,preferred_currency,country_code,timezone,notifications,auto_alerts,ai_model_id FROM user_preferences WHERE user_id=?",
    reports:
      "SELECT id,category,subject,status,resolution FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
    savedCards:
      "SELECT id,label,last_four,expiry FROM saved_cards WHERE user_id=?",
  };
  if (topic === "family") {
    const family = await rows(
      "SELECT f.id,f.student_id,f.parent_id,f.status,f.visibility,u.name student_name,u.email student_email,p.name parent_name,p.email parent_email,c.* FROM family_links f JOIN users u ON u.id=f.student_id LEFT JOIN users p ON p.id=f.parent_id LEFT JOIN parental_controls c ON c.link_id=f.id WHERE (f.student_id=? OR f.parent_id=?) AND f.status='LINKED'",
      [userId, userId],
    );
    const rates = await getRates();
    return family.map((f) => ({
      ...f,
      limit_currency: "CNY",
      ...Object.fromEntries(
        [
          "threshold",
          "per_transfer",
          "daily_limit",
          "monthly_limit",
          "non_beneficiary_limit",
        ].map((key) => [
          key,
          inCurrency(String(f[key] || "0"), "CAD", "CNY", rates),
        ]),
      ),
      category_limits: Object.fromEntries(
        Object.entries(
          parseJson<Record<string, string>>(f.category_limits, {}),
        ).map(([key, v]) => [key, inCurrency(String(v), "CAD", "CNY", rates)]),
      ),
    }));
  }
  if (topic === "models")
    return rows(
      "SELECT id,label,company,model FROM ai_models WHERE active=1 AND (owner_id=? OR owner_id IS NULL)",
      [userId],
    );
  if (topic === "plans")
    return rows(
      "SELECT p.id,p.name,p.limits,r.monthly,r.yearly,r.currency FROM plans p JOIN plan_prices r ON r.plan_id=p.id WHERE p.active=1",
    );
  requireCondition(queries[topic], "VALIDATION_ERROR");
  if (["tuition", "budgets"].includes(topic))
    requireCondition(actor.role === "STUDENT", "FORBIDDEN");
  return rows(queries[topic], [userId]);
}
