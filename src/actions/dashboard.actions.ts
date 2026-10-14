"use server";
import { syncAutomaticAlerts } from "@/services/automatic-alerts.service";
import {
  getRiskPolicy,
  getCreditGuidance,
} from "@/services/financial-config.service";
import { requireUser } from "@/lib/auth";
import { rows } from "@/lib/db";
import { action } from "@/lib/errors";
import {
  getRates,
  getRateHistory,
  inCurrency,
} from "@/services/currency.service";
import { tuitionGap } from "@/services/tuition.service";
import { D, money } from "@/lib/money";
import type { Row } from "@/types";
import { activeProvider } from "@/ai/provider";
import { hasPermission } from "@/lib/admin-permissions";
import { canOpen } from "@/lib/permissions";
import { translator } from "@/lib/i18n";
export async function getDashboardData() {
  return action(async () => {
    const user = await requireUser();
    const student = user.role === "STUDENT",
      admin = user.role === "ADMIN" || user.role === "MODERATOR";
    await syncAutomaticAlerts(user.id);
    const rates = await getRates();
    const rateHistory = student ? await getRateHistory() : [];
    const [
      accounts,
      transactions,
      budgets,
      tuition,
      alerts,
      notifications,
      transfers,
      runs,
      audit,
      plans,
      subscription,
      usage,
      payments,
      reports,
      creditTasks,
      creditProfile,
      profile,
      monthly,
      categories,
      tools,
    ] = await Promise.all([
      student || user.role === "PARENT"
        ? rows(
            "SELECT * FROM accounts WHERE user_id=? AND archived=0 ORDER BY currency",
            [user.id],
          )
        : [],
      student || user.role === "PARENT"
        ? rows(
            "SELECT * FROM transactions WHERE user_id=? ORDER BY date DESC,created_at DESC LIMIT 20",
            [user.id],
          )
        : [],
      student
        ? rows(
            "SELECT b.*,COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.user_id=b.user_id AND t.category=b.category AND t.currency=b.currency AND t.type='EXPENSE' AND DATE_FORMAT(t.date,'%Y-%m')=b.month),0) actual FROM budgets b WHERE b.user_id=? AND b.month=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m')",
            [user.id],
          )
        : [],
      student
        ? rows(
            "SELECT * FROM tuition_invoices WHERE user_id=? ORDER BY due_date",
            [user.id],
          )
        : [],
      rows(
        "SELECT a.*,g.source_student,u.name source_name FROM alerts a LEFT JOIN generated_alerts g ON g.alert_id=a.id LEFT JOIN users u ON u.id=g.source_student WHERE a.user_id=? AND a.status NOT IN ('DISMISSED','RESOLVED') AND (a.snoozed_until IS NULL OR a.snoozed_until<=UTC_TIMESTAMP()) AND (g.source_student IS NULL OR EXISTS (SELECT 1 FROM family_links f WHERE f.parent_id=a.user_id AND f.student_id=g.source_student AND f.status='LINKED' AND JSON_UNQUOTE(JSON_EXTRACT(f.visibility,CONCAT('$.',g.visibility_field)))='true')) ORDER BY a.created_at DESC LIMIT 100",
        [user.id],
      ),
      rows(
        "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        [user.id],
      ),
      student
        ? rows(
            "SELECT t.*,q.total,q.fee,q.receive_amount,q.source_currency,q.target_currency,q.rate,p.name provider FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id JOIN remittance_providers p ON p.id=q.provider_id WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT 100",
            [user.id],
          )
        : [],
      rows(
        "SELECT id,goal,status,provider,result,created_at FROM agent_runs WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
        [user.id],
      ),
      rows(
        "SELECT * FROM audit_logs WHERE actor_id=? ORDER BY created_at DESC LIMIT 100",
        [user.id],
      ),
      rows(
        "SELECT p.*,pr.monthly,pr.yearly,pr.currency FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id WHERE p.active=1 ORDER BY display_order",
      ),
      rows(
        "SELECT s.*,p.name,p.limits,pr.monthly,pr.currency FROM subscriptions s JOIN plans p ON p.id=s.plan_id JOIN plan_prices pr ON pr.plan_id=p.id WHERE s.user_id=?",
        [user.id],
      ),
      rows(
        "SELECT * FROM usage_counters WHERE user_id=? AND period=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m')",
        [user.id],
      ),
      rows(
        "SELECT * FROM demo_payments WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
        [user.id],
      ),
      rows(
        "SELECT id,category,subject,description,priority,status,resolution,created_at FROM reports WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
        [user.id],
      ),
      student
        ? rows("SELECT * FROM credit_tasks WHERE user_id=?", [user.id])
        : [],
      student
        ? rows("SELECT * FROM credit_profiles WHERE user_id=?", [user.id])
        : [],
      student
        ? rows("SELECT * FROM student_profiles WHERE user_id=?", [user.id])
        : [],
      student
        ? rows(
            "SELECT DATE_FORMAT(date,'%Y-%m') month,currency,type,SUM(amount) amount FROM transactions WHERE user_id=? AND date>=DATE_SUB(UTC_DATE(),INTERVAL 6 MONTH) GROUP BY month,currency,type ORDER BY month",
            [user.id],
          )
        : [],
      student
        ? rows(
            "SELECT category,currency,SUM(amount) amount FROM transactions WHERE user_id=? AND type='EXPENSE' AND DATE_FORMAT(date,'%Y-%m')=DATE_FORMAT(UTC_DATE(),'%Y-%m') GROUP BY category,currency",
            [user.id],
          )
        : [],
      rows(
        "SELECT t.* FROM agent_tool_calls t JOIN agent_runs r ON r.id=t.run_id WHERE r.user_id=? ORDER BY t.created_at DESC LIMIT 150",
        [user.id],
      ),
    ]);
    const total = accounts.reduce(
      (s, a) =>
        s.plus(
          inCurrency(
            String(a.balance),
            String(a.currency),
            user.preferred_currency,
            rates,
          ),
        ),
      D(0),
    );
    const spending = categories.reduce(
      (s, c) =>
        s.plus(
          inCurrency(
            String(c.amount),
            String(c.currency),
            user.preferred_currency,
            rates,
          ),
        ),
      D(0),
    );
    const budget = budgets.reduce(
      (s, b) =>
        s.plus(
          inCurrency(
            String(b.amount),
            String(b.currency),
            user.preferred_currency,
            rates,
          ),
        ),
      D(0),
    );
    const gap = student ? await tuitionGap(user.id) : null;
    const family = await rows(
      "SELECT f.id,f.student_id,f.parent_id,f.invite_email,f.status,f.visibility,f.invited_by,u.name student_name,p.name parent_name,c.threshold,c.per_transfer,c.daily_limit,c.monthly_limit,c.tuition_approval,c.conversion_approval,c.category_limits,c.auto_approve,c.allow_non_beneficiary,c.non_beneficiary_limit FROM family_links f JOIN users u ON u.id=f.student_id LEFT JOIN users p ON p.id=f.parent_id LEFT JOIN parental_controls c ON c.link_id=f.id WHERE f.student_id=? OR f.parent_id=?",
      [user.id, user.id],
    );
    const parentStudents: {
      link: Row;
      accounts: Row[];
      tuition: Row[];
      budgets: Row[];
      transactions: Row[];
    }[] = [];
    if (user.role === "PARENT")
      for (const f of family.filter((f) => f.status === "LINKED")) {
        const v = JSON.parse(String(f.visibility));
        parentStudents.push({
          link: f,
          accounts: v.balances
            ? await rows(
                "SELECT currency,SUM(balance) balance FROM accounts WHERE user_id=? AND archived=0 GROUP BY currency",
                [f.student_id],
              )
            : [],
          tuition: v.tuition
            ? await rows(
                "SELECT name,amount,paid,currency,due_date FROM tuition_invoices WHERE user_id=?",
                [f.student_id],
              )
            : [],
          budgets: v.budgets
            ? await rows(
                "SELECT category,amount,currency,month FROM budgets WHERE user_id=?",
                [f.student_id],
              )
            : [],
          transactions: v.descriptions
            ? await rows(
                "SELECT description,category,amount,currency,date FROM transactions WHERE user_id=? ORDER BY date DESC LIMIT 20",
                [f.student_id],
              )
            : v.categories
              ? await rows(
                  "SELECT category,currency,SUM(amount) amount FROM transactions WHERE user_id=? AND type='EXPENSE' AND date>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') GROUP BY category,currency",
                  [f.student_id],
                )
              : [],
        });
      }
    const approvals =
      user.role === "PARENT"
        ? await rows(
            "SELECT p.*,t.recipient,t.purpose,t.status transfer_status,q.receive_amount,q.target_currency,q.total,q.source_currency,u.name student_name FROM parent_approvals p JOIN sandbox_transfers t ON t.id=p.transfer_id JOIN transfer_quotes q ON q.id=t.quote_id JOIN users u ON u.id=t.user_id WHERE p.parent_id=? AND EXISTS (SELECT 1 FROM family_links f WHERE f.parent_id=p.parent_id AND f.student_id=t.user_id AND f.status='LINKED') ORDER BY p.created_at DESC LIMIT 100",
            [user.id],
          )
        : [];
    const adminData: Record<string, Row[]> = {};
    if (admin) {
      const queries: Record<string, string> = {
        users:
          "SELECT u.id,u.name,u.email,u.role,u.status,u.created_at,s.plan_id FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC LIMIT 200",
        reports: "SELECT * FROM reports ORDER BY created_at DESC LIMIT 200",
        risk: "SELECT * FROM risk_assessments ORDER BY created_at DESC LIMIT 200",
        runs: "SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 100",
        tools:
          "SELECT * FROM agent_tool_calls ORDER BY created_at DESC LIMIT 200",
        audit: "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200",
        providers: "SELECT * FROM remittance_providers",
        corridors:
          "SELECT c.*,p.name provider FROM remittance_corridors c JOIN remittance_providers p ON p.id=c.provider_id ORDER BY p.name,c.source_currency,c.target_currency",
        guidance:
          "SELECT value FROM admin_settings WHERE name='creditGuidance'",
        rates: "SELECT * FROM fx_rates ORDER BY recorded_at DESC LIMIT 100",
        subscriptions:
          "SELECT s.*,u.name,p.name plan FROM subscriptions s JOIN users u ON u.id=s.user_id JOIN plans p ON p.id=s.plan_id",
        payments:
          "SELECT * FROM demo_payments ORDER BY created_at DESC LIMIT 100",
        transfers:
          "SELECT t.id,t.status,q.total,q.source_currency,t.created_at FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id ORDER BY t.created_at DESC LIMIT 200",
        plans:
          "SELECT p.*,pr.monthly,pr.yearly,pr.currency FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id ORDER BY display_order",
        countries: "SELECT * FROM countries ORDER BY name",
        currencies: "SELECT * FROM currencies ORDER BY name",
        team: "SELECT u.id,u.name,u.email,u.avatar,u.status,u.admin_permissions,t.* FROM users u JOIN team_members t ON t.user_id=u.id ORDER BY t.is_ceo DESC,t.display_order,u.name",
      };
      await Promise.all(
        Object.entries(queries).map(async ([k, q]) => {
          const section =
            (
              {
                countries: "catalog",
                currencies: "catalog",
                rates: "finance",
                providers: "finance",
                corridors: "finance",
                guidance: "finance",
                tools: "agent",
                runs: "agent",
                transfers: "risk",
                payments: "subscriptions",
              } as Record<string, string>
            )[k] || k;
          adminData[k] = hasPermission(user, section) ? await rows(q) : [];
        }),
      );
    }
    const aiModels = await rows(
      "SELECT id,owner_id,company,label,model,key_last_four,active FROM ai_models WHERE owner_id=? OR (owner_id IS NULL AND (active=1 OR ?=1)) ORDER BY owner_id,label",
      [user.id, hasPermission(user, "models")],
    );
    const savedCards = await rows(
      "SELECT id,label,last_four,expiry FROM saved_cards WHERE user_id=? ORDER BY created_at DESC",
      [user.id],
    );
    const myTeam = await rows(
      "SELECT portfolio FROM team_members WHERE user_id=?",
      [user.id],
    );
    const subscriptionHistory = await rows(
      "SELECT * FROM subscription_events WHERE user_id=? ORDER BY created_at DESC",
      [user.id],
    );
    return {
      financialPolicy: hasPermission(user, "finance")
        ? await getRiskPolicy()
        : null,
      creditGuidance: student ? await getCreditGuidance(user.id) : [],
      subscriptionHistory,
      user,
      aiModels,
      savedCards,
      myTeam,
      aiMode: activeProvider(),
      rates,
      rateHistory,
      accounts,
      transactions,
      budgets,
      tuition,
      alerts,
      notifications,
      transfers,
      runs,
      audit,
      plans,
      subscription,
      usage,
      payments,
      reports,
      creditTasks,
      creditProfile,
      profile,
      monthly,
      categories,
      tools,
      family,
      parentStudents,
      approvals,
      adminData,
      gap,
      metrics: {
        total: money(total),
        spending: money(spending),
        budget: money(budget),
        health: Math.round(
          Math.min(
            100,
            (gap?.readiness ?? 100) * 0.4 +
              (budget.gte(spending) ? 25 : 10) +
              (total.gte(spending.mul(3)) ? 25 : 10) +
              (gap && gap.daysRemaining < 7 && gap.readiness < 100 ? 0 : 10),
          ),
        ),
      },
    };
  });
}
export async function publicPlans() {
  return action(async () =>
    rows(
      "SELECT p.*,pr.monthly,pr.yearly,pr.currency FROM plans p JOIN plan_prices pr ON pr.plan_id=p.id WHERE p.active=1 ORDER BY display_order",
    ),
  );
}
export async function globalSearch(query: string) {
  return action(async () => {
    const u = await requireUser();
    const term = query.slice(0, 100);
    if (term.length < 2) return [];
    const q = `%${term}%`;
    const t = translator(u.language);
    const pages = [
      "dashboard",
      "money",
      "payments",
      "beneficiaries",
      "transactions",
      "wallet",
      "transfer",
      "tuition",
      "budget",
      "agent",
      "credit",
      "family",
      "settings",
      "subscription",
      "reports",
      "alerts",
      "activity",
      "parent",
      "parent/students",
      "parent/approvals",
      "parent/controls",
      "admin",
      "admin/users",
      "admin/reports",
      "admin/finance",
      "admin/settlements",
      "admin/payment-methods",
      "admin/catalog",
      "admin/models",
      "admin/team",
      "admin/plans",
      "admin/audit",
    ];
    const matches: Row[] = pages
      .filter(
        (path) =>
          canOpen(u.role, path, u.admin_permissions) &&
          `${path} ${t(path.split("/").at(-1)!)}`
            .toLowerCase()
            .includes(term.toLowerCase()),
      )
      .map((path) => ({
        id: path,
        title: t(path.split("/").at(-1)!),
        kind: path,
      }));
    if (u.role === "STUDENT")
      for (const [sql, kind] of [
        [
          "SELECT id,description title FROM transactions WHERE user_id=? AND description LIKE ? LIMIT 8",
          "transactions",
        ],
        [
          "SELECT id,name title FROM accounts WHERE user_id=? AND name LIKE ? LIMIT 8",
          "money",
        ],
        [
          "SELECT id,name title FROM tuition_invoices WHERE user_id=? AND name LIKE ? LIMIT 8",
          "tuition",
        ],
        [
          "SELECT id,recipient title FROM sandbox_transfers WHERE user_id=? AND recipient LIKE ? LIMIT 8",
          "transfer",
        ],
        [
          "SELECT id,goal title FROM agent_runs WHERE user_id=? AND goal LIKE ? LIMIT 8",
          "agent",
        ],
      ])
        matches.push(
          ...(await rows(sql, [u.id, q])).map((r) => ({ ...r, kind })),
        );
    if (hasPermission(u, "users"))
      matches.push(
        ...(
          await rows(
            "SELECT id,name title FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 8",
            [q, q],
          )
        ).map((r) => ({ ...r, kind: "admin/users" })),
      );
    return matches.slice(0, 25);
  });
}
