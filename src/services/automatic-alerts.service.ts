import "server-only";
import { randomUUID } from "node:crypto";
import { atomic, rows, write, type DB } from "@/lib/db";
import { notify } from "@/lib/audit";
import { D } from "@/lib/money";
import { getRates, inCurrency } from "./currency.service";
import { tuitionGap } from "./tuition.service";
import { parseJson } from "@/lib/json";
import { financeRecordsSource } from "@/lib/finance-records";
type Condition = {
  key: string;
  type: string;
  detail: string;
  severity: string;
  visibility?: string;
  source?: string;
};
async function conditions(userId: string, db: DB): Promise<Condition[]> {
  const result: Condition[] = [];
  const rates = await getRates(db);
  const accounts = await rows<{ balance: string; currency: string }>(
    "SELECT balance,currency FROM accounts WHERE user_id=? AND archived=0",
    [userId],
    db,
  );
  const balance = accounts.reduce(
    (sum, a) => sum.plus(inCurrency(a.balance, a.currency, "CNY", rates)),
    D(0),
  );
  if (accounts.length && balance.lt(500))
    result.push({
      key: "low-balance",
      type: "LOW_BALANCE",
      detail: "autoLowBalance",
      severity: "WARNING",
      visibility: "balances",
    });
  const tuition = await rows<{ id: string; late: number }>(
    "SELECT id,due_date<UTC_DATE() late FROM tuition_invoices WHERE user_id=? AND amount>paid+scholarship AND due_date<=DATE_ADD(UTC_DATE(),INTERVAL 30 DAY)",
    [userId],
    db,
  );
  for (const invoice of tuition)
    result.push({
      key: `tuition-${invoice.id}`,
      type: "TUITION",
      detail: invoice.late ? "autoTuitionOverdue" : "autoTuitionDue",
      severity: invoice.late ? "CRITICAL" : "WARNING",
      visibility: "tuition",
    });
  const gap = await tuitionGap(userId, db);
  if (gap && D(gap.shortage).gt(0))
    result.push({
      key: `funding-${gap.id}`,
      type: "FUNDING_GAP",
      detail: "autoFundingGap",
      severity: "WARNING",
      visibility: "tuition",
    });
  const budgets = await rows<{
    id: string;
    category: string;
    amount: string;
    currency: string;
  }>(
    "SELECT id,category,amount,currency FROM budgets WHERE user_id=? AND month=DATE_FORMAT(UTC_DATE(),'%Y-%m')",
    [userId],
    db,
  );
  const spending = await rows<{
    category: string;
    amount: string;
    currency: string;
  }>(
    `SELECT category,currency,SUM(amount) amount FROM ${financeRecordsSource} WHERE user_id=? AND type='EXPENSE' AND date>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') AND date<=LAST_DAY(UTC_DATE()) GROUP BY category,currency`,
    [userId],
    db,
  );
  for (const b of budgets) {
    const spent = spending
      .filter((t) => t.category === b.category)
      .reduce(
        (sum, t) =>
          sum.plus(inCurrency(t.amount, t.currency, b.currency, rates)),
        D(0),
      );
    if (spent.gt(b.amount))
      result.push({
        key: `budget-${b.id}`,
        type: "BUDGET",
        detail: "autoBudgetExceeded",
        severity: "WARNING",
        visibility: "budgets",
      });
  }
  const recent = await rows<{ id: string; amount: string; currency: string }>(
    `SELECT id,amount,currency FROM ${financeRecordsSource} WHERE user_id=? AND type='EXPENSE' AND date>=DATE_SUB(UTC_DATE(),INTERVAL 7 DAY)`,
    [userId],
    db,
  );
  for (const tx of recent)
    if (D(inCurrency(tx.amount, tx.currency, "CNY", rates)).gte(10000))
      result.push({
        key: `large-${tx.id}`,
        type: "LARGE_TRANSFER",
        detail: "autoLargeExpense",
        severity: "WARNING",
        visibility: "categories",
      });
  const [subscription] = await rows<{
    limits: string;
    soon: number;
    expired: number;
  }>(
    "SELECT p.limits,s.ends_at<=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY) soon,s.ends_at<UTC_TIMESTAMP() expired FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? AND s.status<>'CANCELLED'",
    [userId],
    db,
  );
  if (subscription?.soon)
    result.push({
      key: "subscription",
      type: "SUBSCRIPTION",
      detail: subscription.expired
        ? "autoSubscriptionExpired"
        : "autoSubscriptionDue",
      severity: "WARNING",
    });
  if (subscription) {
    const limits = parseJson<Record<string, number>>(subscription.limits, {});
    const usage = await rows<{ feature: string; used: number }>(
      "SELECT feature,used FROM usage_counters WHERE user_id=? AND period=DATE_FORMAT(UTC_DATE(),'%Y-%m')",
      [userId],
      db,
    );
    for (const item of usage)
      if (limits[item.feature] > 0 && item.used >= limits[item.feature] * 0.8)
        result.push({
          key: `quota-${item.feature}`,
          type: "QUOTA",
          detail: "autoQuotaNear",
          severity: "WARNING",
        });
  }
  const prior = await rows<{ currency: string; rate: string }>(
    "SELECT r.currency,r.rate FROM fx_rates r JOIN (SELECT currency,MAX(recorded_at) latest FROM fx_rates WHERE recorded_at<=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) GROUP BY currency) x ON r.currency=x.currency AND r.recorded_at=x.latest",
    [],
    db,
  );
  const previous = Object.fromEntries(prior.map((r) => [r.currency, r.rate]));
  if (previous.CNY)
    for (const currency of new Set(accounts.map((a) => a.currency))) {
      if (currency === "CNY" || !previous[currency] || !rates[currency])
        continue;
      const old = D(previous[currency]).div(previous.CNY);
      const current = D(rates[currency]).div(rates.CNY);
      if (current.div(old).minus(1).abs().gte(0.02))
        result.push({
          key: `fx-${currency}`,
          type: "FX",
          detail: "autoFxMovement",
          severity: "INFO",
        });
    }
  return result;
}
export async function syncAutomaticAlerts(userId: string) {
  await atomic(async (db) => {
    const [user] = await rows<{ role: string; status: string }>(
      "SELECT role,status FROM users WHERE id=? FOR UPDATE",
      [userId],
      db,
    );
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !["STUDENT", "PARENT"].includes(user.role)
    )
      return;
    const desired = await conditions(userId, db);
    if (user.role === "PARENT") {
      const family = await rows<{ student_id: string; visibility: string }>(
        "SELECT f.student_id,f.visibility FROM family_links f JOIN users u ON u.id=f.student_id WHERE f.parent_id=? AND f.status='LINKED' AND u.status='ACTIVE'",
        [userId],
        db,
      );
      for (const f of family) {
        const visibility = parseJson<Record<string, boolean>>(f.visibility, {});
        for (const c of await conditions(f.student_id, db))
          if (c.visibility && visibility[c.visibility])
            desired.push({
              ...c,
              key: `child-${f.student_id}-${c.key}`,
              source: f.student_id,
            });
      }
    }
    const existing = await rows<{
      condition_key: string;
      alert_id: string;
      active: number;
    }>(
      "SELECT condition_key,alert_id,active FROM generated_alerts WHERE user_id=?",
      [userId],
      db,
    );
    for (const c of desired) {
      const old = existing.find((a) => a.condition_key === c.key);
      const alert = old?.alert_id || randomUUID();
      if (!old) {
        await write(
          "INSERT INTO alerts(id,user_id,type,severity,detail) VALUES (?,?,?,?,?)",
          [alert, userId, c.type, c.severity, c.detail],
          db,
        );
        await write(
          "INSERT INTO generated_alerts(user_id,condition_key,alert_id,source_student,visibility_field) VALUES (?,?,?,?,?)",
          [userId, c.key, alert, c.source || null, c.visibility || null],
          db,
        );
      } else {
        await write(
          "UPDATE alerts SET severity=?,detail=?,status=IF(?=0,'UNREAD',status),snoozed_until=IF(?=0,NULL,snoozed_until) WHERE id=?",
          [c.severity, c.detail, old.active, old.active, alert],
          db,
        );
        await write(
          "UPDATE generated_alerts SET active=1 WHERE user_id=? AND condition_key=?",
          [userId, c.key],
          db,
        );
      }
      // Parent alerts are retrieved through the current visibility check; do not copy private child conditions into permanent notification text.
      if ((!old || !old.active) && !c.source)
        await notify(userId, c.type, c.detail, db);
    }
    for (const old of existing)
      if (old.active && !desired.some((c) => c.key === old.condition_key)) {
        await write(
          "UPDATE generated_alerts SET active=0 WHERE user_id=? AND condition_key=?",
          [userId, old.condition_key],
          db,
        );
        await write(
          "UPDATE alerts SET status='RESOLVED',snoozed_until=NULL WHERE id=?",
          [old.alert_id],
          db,
        );
      }
    await write(
      "UPDATE alerts SET status='UNREAD',snoozed_until=NULL WHERE user_id=? AND status='SNOOZED' AND snoozed_until<=UTC_TIMESTAMP()",
      [userId],
      db,
    );
  });
}
