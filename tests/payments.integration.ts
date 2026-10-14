import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
process.loadEnvFile(".env.local");
const { rows, write, pool } = await import("../src/lib/db");
const {
  createPaymentDraft,
  confirmPayment,
  settlePayment,
  cancelPayment,
  createBeneficiary,
  decideBeneficiary,
  decidePayment,
  paymentWorkspace,
} = await import("../src/services/payment.service");
const { mockAgent } = await import("../src/ai/mock-provider");
const suffix = randomUUID().slice(0, 8);
const ids = [
  "student",
  "parent",
  "friend",
  "admin",
  "moderator",
  "stranger",
].map((r) => `payment-test-${r}-${suffix}`);
const [student, parent, friend, admin, moderator, stranger] = ids;
const wallet = (id: string) => `${id}-cny`;
async function balance(id: string) {
  return (
    await rows<{ balance: string }>("SELECT balance FROM accounts WHERE id=?", [
      wallet(id),
    ])
  )[0].balance;
}
const draft = (
  user: string,
  kind = "SEND",
  method = "INTERNAL",
  amount = "100",
  extra: Record<string, unknown> = {},
) =>
  createPaymentDraft(
    user,
    {
      kind,
      method,
      amount,
      account_id: wallet(user),
      recipient: "Test receiver",
      destination:
        method === "INTERNAL" ? `${friend}@example.com` : "Demo account 1234",
      beneficiary_id: null,
      receive_currency: "CNY",
      category: "Other",
      note: "Integration fixture",
      ...extra,
    },
    randomUUID(),
  );
test("shared financial state machine: approvals, settlement, concurrency, balances and AI", async (t) => {
  try {
    for (const [i, id] of ids.entries()) {
      const role =
        i === 3
          ? "ADMIN"
          : i === 4
            ? "MODERATOR"
            : i === 1 || i === 5
              ? "PARENT"
              : "STUDENT";
      await write(
        "INSERT INTO users(id,name,email,password_hash,role,onboarded,admin_permissions) VALUES (?,?,?,'unused',?,1,?)",
        [
          id,
          "Payment test",
          `${id}@example.com`,
          role,
          JSON.stringify(i === 4 ? ["reports"] : []),
        ],
      );
      await write("INSERT INTO user_preferences(user_id) VALUES (?)", [id]);
      await write(
        "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Test wallet','WALLET','CNY',5000)",
        [wallet(id), id],
      );
      await write(
        "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,'family',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH))",
        [randomUUID(), id],
      );
    }
    const link = `link-${suffix}`;
    await write(
      "INSERT INTO family_links(id,student_id,parent_id,invite_email,status,visibility,invited_by) VALUES (?,?,?,?,'LINKED','{}','PARENT')",
      [link, student, parent, `${student}@example.com`],
    );
    await write(
      "INSERT INTO parental_controls(link_id,threshold,auto_approve,allow_non_beneficiary,non_beneficiary_limit) VALUES (?,10,0,0,50)",
      [link],
    );
    await t.test(
      "beneficiaries require the correct linked parent; rejection blocks use",
      async () => {
        const b = await createBeneficiary(student, {
          name: "Friend",
          method: "INTERNAL",
          currency: "CNY",
          country_code: "CN",
          destination: `${friend}@example.com`,
        });
        assert.equal(b.status, "PENDING");
        await assert.rejects(() =>
          decideBeneficiary(stranger, b.id, true, "Forged approval"),
        );
        assert.equal(
          (await decideBeneficiary(parent, b.id, false, "Not recognized"))
            .status,
          "REJECTED",
        );
        const req = () =>
          draft(student, "SEND", "INTERNAL", "100", { beneficiary_id: b.id });
        await assert.rejects(req, /BENEFICIARY_PENDING/);
        assert.equal(
          (await decideBeneficiary(parent, b.id, true, "Identity checked"))
            .status,
          "APPROVED",
        );
        const r = await req();
        assert.equal(
          (await confirmPayment(student, r.id)).status,
          "WAITING_PARENT",
        );
        assert.equal(await balance(student), "4900.00");
        assert.equal(await balance(friend), "5000.00");
        await assert.rejects(() =>
          decidePayment(stranger, r.id, true, "Forged decision"),
        );
        assert.equal(
          (await decidePayment(parent, r.id, true, "Approved for study"))
            .status,
          "COMPLETED",
        );
        assert.equal(await balance(friend), "5100.00");
        assert.equal((await confirmPayment(student, r.id)).status, "COMPLETED");
        assert.equal(await balance(friend), "5100.00");
      },
    );
    await t.test(
      "medium one-time payments use explicit parent policy; held funds refund once",
      async () => {
        await write(
          "UPDATE parental_controls SET auto_approve=1,allow_non_beneficiary=1,non_beneficiary_limit=50 WHERE link_id=?",
          [link],
        );
        const r = await draft(student, "SEND", "INTERNAL", "100");
        assert.equal((await confirmPayment(student, r.id)).status, "COMPLETED");
        const above = await draft(student, "SEND", "ALIPAY", "300");
        assert.equal(
          (await confirmPayment(student, above.id)).status,
          "WAITING_PARENT",
        );
        assert.equal(await balance(student), "4500.00");
        await decidePayment(parent, above.id, false, "Not approved");
        assert.equal(await balance(student), "4800.00");
        await assert.rejects(() => cancelPayment(student, above.id));
        assert.equal(await balance(student), "4800.00");
      },
    );
    await t.test(
      "each external method queues deposits and never credits before settlement",
      async () => {
        for (const method of [
          "BANK",
          "PAYPAL",
          "ALIPAY",
          "WECHAT",
          "UNIONPAY",
        ]) {
          const before = await balance(parent);
          const r = await draft(parent, "TOPUP", method, "25");
          assert.equal(
            (await confirmPayment(parent, r.id, {}, `DEPOSIT-${method}`))
              .status,
            "QUEUED",
          );
          assert.equal(await balance(parent), before);
          await assert.rejects(() =>
            settlePayment(moderator, r.id, "PROCESSING", "Unauthorized", ""),
          );
          await settlePayment(
            admin,
            r.id,
            "PROCESSING",
            "Checking demo deposit",
            "",
          );
          await settlePayment(
            admin,
            r.id,
            "COMPLETED",
            "Verified demo deposit",
            `RECEIPT-${method}`,
          );
          assert.equal(await balance(parent), (Number(before) + 25).toFixed(2));
          await assert.rejects(() =>
            settlePayment(
              admin,
              r.id,
              "COMPLETED",
              "Replay",
              `RECEIPT-${method}`,
            ),
          );
        }
      },
    );
    await t.test(
      "withdrawal reservation, manual completion and rejection are atomic",
      async () => {
        const before = await balance(parent);
        const r = await draft(parent, "WITHDRAW", "WECHAT", "50");
        await confirmPayment(parent, r.id);
        assert.equal(await balance(parent), (Number(before) - 50).toFixed(2));
        await settlePayment(
          admin,
          r.id,
          "PROCESSING",
          "Processing withdrawal",
          "",
        );
        await assert.rejects(() => cancelPayment(parent, r.id));
        await settlePayment(
          admin,
          r.id,
          "FAILED",
          "Receiver details invalid",
          "",
        );
        assert.equal(await balance(parent), before);
        const second = await draft(parent, "WITHDRAW", "UNIONPAY", "50");
        await confirmPayment(parent, second.id);
        await settlePayment(
          admin,
          second.id,
          "PROCESSING",
          "Processing demo payout",
          "",
        );
        await settlePayment(
          admin,
          second.id,
          "COMPLETED",
          "Payout recorded",
          "UNION-DEMO-1",
        );
        assert.equal(await balance(parent), (Number(before) - 50).toFixed(2));
      },
    );
    await t.test(
      "AI creates a persistent draft and card confirmation uses the same service",
      async () => {
        const run = randomUUID();
        await write(
          "INSERT INTO agent_runs(id,user_id,goal,provider) VALUES (?,?,?,'mock')",
          [run, student, "Add money RMB 100 by card."],
        );
        const before = await balance(student);
        const result = await mockAgent(
          student,
          run,
          "Add money RMB 100 by card.",
        );
        const r = result.outputs.draftPayment as { id: string };
        assert.ok(r.id);
        assert.equal(await balance(student), before);
        await assert.rejects(() =>
          confirmPayment(friend, r.id, {
            card: "4242424242424242",
            expiry: "12/29",
            cvv: "123",
            cardholder: "Test",
          }),
        );
        const confirmations = await Promise.all([
          confirmPayment(student, r.id, {
            card: "4242424242424242",
            expiry: "12/29",
            cvv: "123",
            cardholder: "Test",
            saveCard: true,
          }),
          confirmPayment(student, r.id, {
            card: "4242424242424242",
            expiry: "12/29",
            cvv: "123",
            cardholder: "Test",
            saveCard: true,
          }),
        ]);
        assert.ok(confirmations.every((r) => r.status === "COMPLETED"));
        assert.equal(await balance(student), (Number(before) + 100).toFixed(2));
        const [card] = await rows<{ id: string }>(
          "SELECT id FROM saved_cards WHERE user_id=?",
          [student],
        );
        assert.ok(card.id);
        const saved = await draft(student, "TOPUP", "CARD", "10");
        await confirmPayment(student, saved.id, { savedCardId: card.id });
        assert.equal(await balance(student), (Number(before) + 110).toFixed(2));
        const fail = await draft(student, "TOPUP", "CARD", "10");
        assert.equal(
          (
            await confirmPayment(student, fail.id, {
              card: "4000000000000002",
              expiry: "12/29",
              cvv: "123",
              cardholder: "Test",
            })
          ).status,
          "FAILED",
        );
        assert.equal(await balance(student), (Number(before) + 110).toFixed(2));
      },
    );
    await t.test(
      "parents can send back and cash records cannot fund payments",
      async () => {
        const before = Number(await balance(student));
        const sent = await draft(parent, "SEND", "INTERNAL", "25", {
          destination: `${student}@example.com`,
        });
        assert.equal(
          (await confirmPayment(parent, sent.id)).status,
          "COMPLETED",
        );
        assert.equal(Number(await balance(student)), before + 25);
        const cash = `${student}-cash`;
        await write(
          "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Cash record','CASH','CNY',9999)",
          [cash, student],
        );
        await assert.rejects(
          () => draft(student, "SEND", "INTERNAL", "10", { account_id: cash }),
          /USE_WALLET_ACCOUNT/,
        );
        await assert.rejects(
          () => draft(student, "TOPUP", "CARD", "10", { account_id: cash }),
          /USE_WALLET_ACCOUNT/,
        );
      },
    );
    await t.test(
      "structured responses and action drafts enforce ownership, role and navigation",
      async () => {
        const { runTool } = await import("../src/ai/tools");
        const run = randomUUID();
        await write(
          "INSERT INTO agent_runs(id,user_id,goal,provider) VALUES (?,?,?,'mock')",
          [run, student, "Agent action integration"],
        );
        const nav = (await runTool(student, run, "respond", {
          type: "open_page",
          message: "Opening tuition",
          url: "/en/tuition",
          question: null,
          options: [],
        })) as { url: string };
        assert.equal(nav.url, "tuition");
        const external = (await runTool(student, run, "respond", {
          type: "open_page",
          message: "",
          url: "https://example.com",
          question: null,
          options: [],
        })) as { failed: boolean };
        assert.equal(external.failed, true);
        const adminPage = (await runTool(student, run, "respond", {
          type: "open_page",
          message: "",
          url: "admin/users",
          question: null,
          options: [],
        })) as { failed: boolean };
        assert.equal(adminPage.failed, true);
        const question = (await runTool(student, run, "respond", {
          type: "require_answer",
          message: "",
          url: null,
          question: "How much RMB would you like to send?",
          options: ["100", "200"],
        })) as { type: string };
        assert.equal(question.type, "require_answer");
        const input = {
          action: "saveBudget",
          input_json: JSON.stringify({
            category: "Housing",
            amount: "2200",
            currency: "CNY",
            month: "2026-11",
          }),
        };
        const a = (await runTool(student, run, "requestAction", input)) as {
          id: string;
          status: string;
        };
        const b = (await runTool(student, run, "requestAction", input)) as {
          id: string;
        };
        assert.equal(a.id, b.id);
        assert.equal(a.status, "PENDING");
        assert.equal(
          (await rows("SELECT id FROM budgets WHERE user_id=?", [student]))
            .length,
          0,
        );
        const denied = (await runTool(student, run, "requestAction", {
          action: "inviteStudent",
          input_json: JSON.stringify({ email: "someone@example.com" }),
        })) as { failed: boolean };
        assert.equal(denied.failed, true);
        await assert.rejects(
          () => runTool(stranger, run, "getAccounts", {}),
          /NOT_FOUND/,
        );
        await write(
          "UPDATE agent_action_requests SET status='CANCELLED' WHERE run_id=?",
          [run],
        );
      },
    );
    await t.test(
      "automatic alerts deduplicate, resolve and respect current parent visibility",
      async () => {
        const { syncAutomaticAlerts } =
          await import("../src/services/automatic-alerts.service");
        const original = await balance(student);
        await write("UPDATE accounts SET balance=100 WHERE id=?", [
          wallet(student),
        ]);
        // The test cash record is archived so only the spendable wallet contributes.
        await write("UPDATE accounts SET archived=1 WHERE id=?", [
          `${student}-cash`,
        ]);
        await syncAutomaticAlerts(student);
        await syncAutomaticAlerts(student);
        let alerts = await rows<{ id: string; status: string }>(
          "SELECT a.id,a.status FROM alerts a JOIN generated_alerts g ON g.alert_id=a.id WHERE a.user_id=? AND g.condition_key='low-balance'",
          [student],
        );
        assert.equal(alerts.length, 1);
        await write("UPDATE alerts SET status='READ' WHERE id=?", [
          alerts[0].id,
        ]);
        await syncAutomaticAlerts(student);
        alerts = await rows<{ id: string; status: string }>(
          "SELECT id,status FROM alerts WHERE id=?",
          [alerts[0].id],
        );
        assert.equal(alerts[0].status, "READ");
        await syncAutomaticAlerts(parent);
        let child = await rows(
          "SELECT alert_id FROM generated_alerts WHERE user_id=? AND source_student=? AND active=1",
          [parent, student],
        );
        assert.equal(child.length, 0);
        await write("UPDATE family_links SET visibility=? WHERE id=?", [
          JSON.stringify({ balances: true }),
          link,
        ]);
        await syncAutomaticAlerts(parent);
        child = await rows(
          "SELECT alert_id FROM generated_alerts WHERE user_id=? AND source_student=? AND active=1",
          [parent, student],
        );
        assert.equal(child.length, 1);
        await write("UPDATE family_links SET visibility='{}' WHERE id=?", [
          link,
        ]);
        await syncAutomaticAlerts(parent);
        child = await rows(
          "SELECT alert_id FROM generated_alerts WHERE user_id=? AND source_student=? AND active=1",
          [parent, student],
        );
        assert.equal(child.length, 0);
        await write("UPDATE accounts SET balance=? WHERE id=?", [
          original,
          wallet(student),
        ]);
        await syncAutomaticAlerts(student);
        alerts = await rows<{ id: string; status: string }>(
          "SELECT id,status FROM alerts WHERE id=?",
          [alerts[0].id],
        );
        assert.equal(alerts[0].status, "RESOLVED");
      },
    );
    await t.test(
      "permissions and idempotency prevent forged drafts and duplicate requests",
      async () => {
        const input = {
          kind: "TOPUP",
          method: "BANK",
          amount: "50",
          account_id: wallet(parent),
          recipient: "",
          destination: "",
          beneficiary_id: null,
          receive_currency: "CNY",
          category: "Other",
          note: "",
        };
        await assert.rejects(() =>
          createPaymentDraft(student, input, randomUUID()),
        );
        const key = randomUUID();
        const [a, b] = await Promise.all([
          createPaymentDraft(parent, input, key),
          createPaymentDraft(parent, input, key),
        ]);
        assert.equal(a.id, b.id);
        await cancelPayment(parent, a.id);
        const own = await paymentWorkspace(friend);
        assert.ok(
          own.requests.every(
            (r) => r.user_id === friend || r.recipient_user_id === friend,
          ),
        );
        const mismatch = await rows(
          "SELECT request_id,phase,currency,SUM(IF(direction='DEBIT',amount,-amount)) net FROM financial_ledger_entries WHERE request_id IN (SELECT id FROM financial_requests WHERE user_id IN (?,?,?)) GROUP BY request_id,phase,currency HAVING net<>0",
          [student, parent, friend],
        );
        assert.equal(mismatch.length, 0);
      },
    );
  } finally {
    for (const id of ids)
      await write(
        "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id=?",
        [id],
      );
    await pool.end();
  }
});
