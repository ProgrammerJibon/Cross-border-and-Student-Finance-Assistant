import { getRiskPolicy } from "./financial-config.service";
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, rows, write, type DB } from "@/lib/db";
import { requireCondition, AppError } from "@/lib/errors";
import {
  requestSchema,
  beneficiarySchema,
  cardSchema,
  canSettle,
} from "@/lib/payment-rules";
import { validCountry, validCurrency } from "@/lib/catalog";
import { D, money } from "@/lib/money";
import { getRates, inCurrency } from "./currency.service";
import { assessRisk } from "@/lib/risk-engine";
import { checkCategoryLimit } from "./parent-controls.service";
import { audit, notify } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { hasPermission } from "@/lib/admin-permissions";

type Request = {
  id: string;
  user_id: string;
  account_id: string;
  kind: string;
  method: string;
  amount: string;
  currency: string;
  recipient: string;
  destination: string;
  beneficiary_id: string | null;
  recipient_account_id: string | null;
  recipient_user_id: string | null;
  receive_amount: string;
  receive_currency: string;
  category: string;
  status: string;
  held: number;
  created_at: string;
  confirmed_at: string | null;
  reference: string;
};
type Actor = {
  id: string;
  role: string;
  status: string;
  admin_permissions: string | null;
};
type Control = {
  parent_id: string;
  auto_approve: number;
  allow_non_beneficiary: number;
  non_beneficiary_limit: string;
  threshold: string;
  per_transfer: string;
  daily_limit: string;
  monthly_limit: string;
};
export async function paymentActor(userId: string, db?: DB) {
  const [u] = await rows<Actor>(
    "SELECT id,role,status,admin_permissions FROM users WHERE id=?",
    [userId],
    db,
  );
  requireCondition(u?.status === "ACTIVE", "UNAUTHORIZED");
  return u;
}
async function customer(userId: string, db?: DB) {
  const u = await paymentActor(userId, db);
  requireCondition(["STUDENT", "PARENT"].includes(u.role));
  return u;
}
async function lockRequest(requestId: string, db: DB) {
  const [preview] = await rows<Request>(
    "SELECT * FROM financial_requests WHERE id=?",
    [requestId],
    db,
  );
  requireCondition(preview, "NOT_FOUND");
  for (const id of [
    ...new Set(
      [preview.user_id, preview.recipient_user_id].filter(Boolean) as string[],
    ),
  ].sort())
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [id], db);
  const [r] = await rows<Request>(
    "SELECT * FROM financial_requests WHERE id=? FOR UPDATE",
    [requestId],
    db,
  );
  return r;
}
async function event(
  r: Request,
  actor: string,
  status: string,
  note: string,
  db: DB,
) {
  await write(
    "UPDATE financial_requests SET status=?,note=? WHERE id=?",
    [status, note, r.id],
    db,
  );
  await write(
    "INSERT INTO financial_events(id,request_id,actor_id,status,note) VALUES (?,?,?,?,?)",
    [randomUUID(), r.id, actor, status, note],
    db,
  );
  await audit(
    actor,
    `PAYMENT_${status}`,
    "financial_requests",
    r.id,
    { kind: r.kind, method: r.method },
    db,
  );
  await notify(
    r.user_id,
    "PAYMENT_STATUS",
    `${r.id.slice(0, 8)} · ${status} · ${note}`,
    db,
  );
  r.status = status;
}
async function pair(
  r: Request,
  phase: string,
  account: string | null,
  direction: "DEBIT" | "CREDIT",
  value: string,
  currency: string,
  db: DB,
) {
  for (const [entry, accountId, dir] of [
    [`${currency}-customer`, account, direction],
    [`${currency}-clearing`, null, direction === "DEBIT" ? "CREDIT" : "DEBIT"],
  ] as const)
    await write(
      "INSERT INTO financial_ledger_entries(id,request_id,phase,entry_key,account_id,direction,amount,currency) VALUES (?,?,?,?,?,?,?,?)",
      [randomUUID(), r.id, phase, entry, accountId, dir, value, currency],
      db,
    );
}
async function controls(userId: string, db: DB) {
  return rows<Control>(
    "SELECT f.parent_id,c.* FROM family_links f JOIN parental_controls c ON c.link_id=f.id JOIN users p ON p.id=f.parent_id WHERE f.student_id=? AND f.status='LINKED' AND p.status='ACTIVE'",
    [userId],
    db,
  );
}
async function parentRequirements(r: Request, db: DB) {
  const u = await customer(r.user_id, db);
  if (u.role === "PARENT" || r.kind === "TOPUP") return [];
  const cs = await controls(u.id, db);
  const rates = await getRates(db);
  const cad = inCurrency(r.amount, r.currency, "CAD", rates);
  let approved = false;
  if (r.beneficiary_id) {
    const [b] = await rows<{ status: string }>(
      "SELECT status FROM beneficiaries WHERE id=? AND user_id=?",
      [r.beneficiary_id, u.id],
      db,
    );
    requireCondition(
      b && !["REJECTED", "REMOVED"].includes(b.status),
      "BENEFICIARY_PENDING",
    );
    const decisions = await rows<{ parent_id: string; status: string }>(
      "SELECT parent_id,status FROM beneficiary_decisions WHERE beneficiary_id=?",
      [r.beneficiary_id],
      db,
    );
    approved =
      cs.length > 0 &&
      cs.every((c) =>
        decisions.some(
          (d) => d.parent_id === c.parent_id && d.status === "APPROVED",
        ),
      );
  }
  if (!cs.length) {
    requireCondition(!r.beneficiary_id, "BENEFICIARY_PENDING");
    const [setting] = await rows<{ value: string }>(
      "SELECT value FROM admin_settings WHERE name='payments'",
      [],
      db,
    );
    const cap = setting ? JSON.parse(setting.value).nonBeneficiaryRmb : "1000";
    requireCondition(
      D(inCurrency(r.amount, r.currency, "CNY", rates)).lte(cap),
      "NON_BENEFICIARY_LIMIT",
    );
    return [];
  }
  return cs
    .filter((c) =>
      approved
        ? !c.auto_approve && D(cad).gt(c.threshold)
        : !(
            c.auto_approve &&
            c.allow_non_beneficiary &&
            D(cad).lte(c.non_beneficiary_limit)
          ),
    )
    .map((c) => c.parent_id);
}
async function risk(r: Request, db: DB, held = false) {
  const [a] = await rows<{ balance: string; archived: number }>(
    "SELECT balance,archived FROM accounts WHERE id=? AND user_id=? FOR UPDATE",
    [r.account_id, r.user_id],
    db,
  );
  requireCondition(a, "NOT_FOUND");
  requireCondition(held || D(a.balance).gte(r.amount), "INSUFFICIENT_BALANCE");
  const rates = await getRates(db),
    cs = await controls(r.user_id, db);
  const history = await rows<{ amount: string; currency: string; day: number }>(
    "SELECT amount,currency,DATE(confirmed_at)=UTC_DATE() day FROM financial_requests WHERE user_id=? AND id<>? AND kind<>'TOPUP' AND status IN ('WAITING_PARENT','QUEUED','PROCESSING','COMPLETED') AND confirmed_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01') UNION ALL SELECT q.total amount,q.source_currency currency,DATE(t.completed_at)=UTC_DATE() day FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id WHERE t.user_id=? AND t.status='COMPLETED' AND t.completed_at>=DATE_FORMAT(UTC_DATE(),'%Y-%m-01')",
    [r.user_id, r.id, r.user_id],
    db,
  );
  const min = (key: "per_transfer" | "daily_limit" | "monthly_limit") =>
    cs.length
      ? cs.map((c) => c[key]).reduce((a, b) => (D(a).lt(b) ? a : b))
      : undefined;
  const total = (daily: boolean) =>
    money(
      history
        .filter((h) => !daily || h.day)
        .reduce(
          (s, h) => s.plus(inCurrency(h.amount, h.currency, "CAD", rates)),
          D(0),
        ),
    );
  const result = assessRisk({
    policy: await getRiskPolicy(db),
    amount: inCurrency(r.amount, r.currency, "CAD", rates),
    balance: inCurrency(
      money(D(a.balance).plus(held ? r.amount : 0)),
      r.currency,
      "CAD",
      rates,
    ),
    active: !a.archived,
    owned: true,
    daily: total(true),
    monthly: total(false),
    frequency: history.filter((h) => h.day).length,
    destinationActive: true,
    duplicate: false,
    deadlineMissed: false,
    providerAllowed: true,
    parentMax: min("per_transfer"),
    parentDaily: min("daily_limit"),
    parentMonthly: min("monthly_limit"),
  });
  requireCondition(result.allowed, result.flags[0] || "FORBIDDEN");
  await checkCategoryLimit(
    r.user_id,
    r.category,
    r.amount,
    r.currency,
    new Date().toISOString().slice(0, 10),
    db,
    "",
    r.id,
  );
  await write(
    "INSERT INTO risk_assessments(id,user_id,assessment) VALUES (?,?,?)",
    [randomUUID(), r.user_id, JSON.stringify({ ...result, request_id: r.id })],
    db,
  );
}
async function validateMethod(r: Request, db: DB) {
  const [method] = await rows<{
    active: number;
    deposit_enabled: number;
    withdrawal_enabled: number;
    currencies: string;
  }>("SELECT * FROM payment_methods WHERE code=?", [r.method], db);
  requireCondition(method?.active, "PAYMENT_METHOD_DISABLED");
  requireCondition(
    JSON.parse(method.currencies).includes(r.currency) &&
      JSON.parse(method.currencies).includes(r.receive_currency),
    "UNSUPPORTED_CURRENCY",
  );
  requireCondition(
    r.kind === "TOPUP"
      ? method.deposit_enabled
      : r.method === "INTERNAL" || method.withdrawal_enabled,
    "PAYMENT_METHOD_DISABLED",
  );
}
export async function createPaymentDraft(
  userId: string,
  input: unknown,
  key: string,
) {
  const v = requestSchema.parse(input);
  z.string().min(8).max(100).parse(key);
  await customer(userId);
  requireCondition(
    !(v.method === "CARD" && v.kind !== "TOPUP") &&
      !(v.method === "INTERNAL" && v.kind !== "SEND"),
    "VALIDATION_ERROR",
  );
  return atomic(async (db) => {
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [userId], db);
    const [existing] = await rows<Request>(
      "SELECT * FROM financial_requests WHERE user_id=? AND idempotency_key=?",
      [userId, key],
      db,
    );
    if (existing) return existing;
    const [a] = await rows<{ currency: string; type: string }>(
      "SELECT currency,type FROM accounts WHERE id=? AND user_id=? AND archived=0",
      [v.account_id, userId],
      db,
    );
    requireCondition(a, "NOT_FOUND");
    requireCondition(a.type !== "CASH", "USE_WALLET_ACCOUNT");
    await validCurrency(a.currency, db);
    await validCurrency(v.receive_currency, db);
    let recipient = v.recipient,
      destination = v.destination;
    if (v.beneficiary_id) {
      const [b] = await rows<{
        name: string;
        destination: string;
        currency: string;
        method: string;
        status: string;
      }>(
        "SELECT * FROM beneficiaries WHERE id=? AND user_id=?",
        [v.beneficiary_id, userId],
        db,
      );
      requireCondition(
        b && !["REMOVED", "REJECTED"].includes(b.status),
        "BENEFICIARY_PENDING",
      );
      requireCondition(
        b.method === v.method && b.currency === v.receive_currency,
        "VALIDATION_ERROR",
      );
      recipient = b.name;
      destination = b.destination;
    }
    requireCondition(
      v.kind === "TOPUP" || (recipient.length >= 2 && destination.length >= 3),
      "VALIDATION_ERROR",
    );
    requireCondition(
      v.kind === "SEND" || v.receive_currency === a.currency,
      "VALIDATION_ERROR",
    );
    let receiver: { id: string; user_id: string } | undefined;
    if (v.method === "INTERNAL") {
      [receiver] = await rows<{ id: string; user_id: string }>(
        "SELECT a.id,a.user_id FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.email=? AND u.status='ACTIVE' AND u.role IN ('STUDENT','PARENT') AND a.currency=? AND a.archived=0 AND a.type<>'CASH' ORDER BY a.id LIMIT 1",
        [destination.toLowerCase(), v.receive_currency],
        db,
      );
      requireCondition(
        receiver && receiver.user_id !== userId,
        "RECIPIENT_UNAVAILABLE",
      );
    }
    const rates = await getRates(db);
    const receive = money(
      D(v.amount).div(rates[a.currency]).mul(rates[v.receive_currency]),
    );
    requireCondition(D(receive).gt(0), "VALIDATION_ERROR");
    const [method] = await rows<{ instructions: string }>(
      "SELECT instructions FROM payment_methods WHERE code=?",
      [v.method],
      db,
    );
    const id = randomUUID();
    await write(
      "INSERT INTO financial_requests(id,user_id,account_id,kind,method,amount,currency,recipient,destination,beneficiary_id,recipient_account_id,recipient_user_id,receive_amount,receive_currency,fx_rate,category,note,idempotency_key,payment_instructions) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        userId,
        v.account_id,
        v.kind,
        v.method,
        v.amount,
        a.currency,
        recipient,
        destination,
        v.beneficiary_id,
        receiver?.id || null,
        receiver?.user_id || null,
        receive,
        v.receive_currency,
        D(rates[v.receive_currency]).div(rates[a.currency]).toFixed(8),
        v.category,
        v.note,
        key,
        method?.instructions || "",
      ],
      db,
    );
    const [r] = await rows<Request>(
      "SELECT * FROM financial_requests WHERE id=?",
      [id],
      db,
    );
    await validateMethod(r, db);
    await event(
      r,
      userId,
      "DRAFT",
      "Review and confirm to submit. No balance change yet.",
      db,
    );
    return r;
  });
}
async function addTransaction(
  r: Request,
  userId: string,
  accountId: string,
  type: "INCOME" | "EXPENSE",
  amount: string,
  currency: string,
  db: DB,
) {
  await write(
    "INSERT INTO transactions(id,user_id,account_id,amount,currency,type,category,description,notes,date) VALUES (?,?,?,?,?,?,?,?,?,UTC_DATE())",
    [
      randomUUID(),
      userId,
      accountId,
      amount,
      currency,
      type,
      r.category,
      `${r.kind} · ${r.method} · ${r.recipient || "My wallet"}`.slice(0, 160),
      `Request ${r.id}`,
    ],
    db,
  );
}
async function finish(r: Request, actor: string, note: string, db: DB) {
  if (r.kind === "TOPUP") {
    const [a] = await rows(
      "SELECT id FROM accounts WHERE id=? AND user_id=? AND archived=0 FOR UPDATE",
      [r.account_id, r.user_id],
      db,
    );
    requireCondition(a, "ACCOUNT_INACTIVE");
    await write(
      "UPDATE accounts SET balance=balance+? WHERE id=?",
      [r.amount, r.account_id],
      db,
    );
    await pair(r, "SETTLE", r.account_id, "CREDIT", r.amount, r.currency, db);
    await addTransaction(
      r,
      r.user_id,
      r.account_id,
      "INCOME",
      r.amount,
      r.currency,
      db,
    );
  } else {
    requireCondition(r.held, "INVALID_STATE");
    if (r.method === "INTERNAL") {
      const [a] = await rows(
        "SELECT a.id FROM accounts a JOIN users u ON u.id=a.user_id WHERE a.id=? AND a.user_id=? AND a.archived=0 AND u.status='ACTIVE' FOR UPDATE",
        [r.recipient_account_id, r.recipient_user_id],
        db,
      );
      requireCondition(a, "RECIPIENT_UNAVAILABLE");
      await write(
        "UPDATE accounts SET balance=balance+? WHERE id=?",
        [r.receive_amount, r.recipient_account_id],
        db,
      );
      await pair(
        r,
        "SETTLE",
        r.recipient_account_id,
        "CREDIT",
        r.receive_amount,
        r.receive_currency,
        db,
      );
      await addTransaction(
        r,
        r.recipient_user_id!,
        r.recipient_account_id!,
        "INCOME",
        r.receive_amount,
        r.receive_currency,
        db,
      );
      await notify(
        r.recipient_user_id!,
        "PAYMENT_RECEIVED",
        `${r.receive_amount} ${r.receive_currency} · ${r.id.slice(0, 8)}`,
        db,
      );
    } else
      await pair(
        r,
        "SETTLE",
        null,
        "CREDIT",
        r.receive_amount,
        r.receive_currency,
        db,
      );
    await addTransaction(
      r,
      r.user_id,
      r.account_id,
      "EXPENSE",
      r.amount,
      r.currency,
      db,
    );
  }
  await write(
    "UPDATE financial_requests SET held=0,completed_at=UTC_TIMESTAMP() WHERE id=?",
    [r.id],
    db,
  );
  await event(r, actor, "COMPLETED", note, db);
}
async function reject(
  r: Request,
  actor: string,
  status: string,
  note: string,
  db: DB,
) {
  if (r.held) {
    await write(
      "UPDATE accounts SET balance=balance+? WHERE id=?",
      [r.amount, r.account_id],
      db,
    );
    await pair(r, "REFUND", r.account_id, "CREDIT", r.amount, r.currency, db);
    await write("UPDATE financial_requests SET held=0 WHERE id=?", [r.id], db);
  }
  await event(r, actor, status, note, db);
}
async function queueOrComplete(r: Request, actor: string, db: DB) {
  if (r.method === "INTERNAL")
    await finish(r, actor, "Wallet transfer completed.", db);
  else
    await event(
      r,
      actor,
      "QUEUED",
      "Awaiting manual settlement. No external payment has been sent by this app.",
      db,
    );
}
async function cardCharge(userId: string, input: unknown, db: DB) {
  const v = cardSchema.parse(input);
  const [saved] = v.savedCardId
    ? await rows<{ demo_token: string; expiry: string }>(
        "SELECT demo_token,expiry FROM saved_cards WHERE id=? AND user_id=?",
        [v.savedCardId, userId],
        db,
      )
    : [];
  requireCondition(!v.savedCardId || saved, "NOT_FOUND");
  const expiry = saved?.expiry || v.expiry;
  requireCondition(/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry), "VALIDATION_ERROR");
  const [m, y] = expiry.split("/").map(Number);
  requireCondition(Date.UTC(2000 + y, m, 1) > Date.now(), "VALIDATION_ERROR");
  if (!saved)
    requireCondition(
      v.cardholder.length >= 2 && /^\d{3}$/.test(v.cvv) && v.card,
      "VALIDATION_ERROR",
    );
  const ok = saved
    ? saved.demo_token === "DEMO_SUCCESS"
    : v.card === "4242424242424242";
  if (ok && v.saveCard && !saved) {
    const [old] = await rows(
      "SELECT id FROM saved_cards WHERE user_id=? AND last_four='4242' AND expiry=?",
      [userId, expiry],
      db,
    );
    if (!old)
      await write(
        "INSERT INTO saved_cards(id,user_id,label,last_four,expiry,demo_token) VALUES (?,?,?,'4242',?,'DEMO_SUCCESS')",
        [randomUUID(), userId, v.cardholder, expiry],
        db,
      );
  }
  return ok;
}
export async function confirmPayment(
  userId: string,
  id: string,
  card: unknown = {},
  reference = "",
) {
  return atomic(async (db) => {
    const r = await lockRequest(id, db);
    requireCondition(r.user_id === userId);
    await customer(userId, db);
    if (r.status !== "DRAFT") return { id: r.id, status: r.status };
    requireCondition(
      Date.now() - new Date(r.created_at.replace(" ", "T") + "Z").getTime() <
        30 * 60 * 1000,
      "QUOTE_EXPIRED",
    );
    await validateMethod(r, db);
    if (r.kind !== "TOPUP") {
      await checkUsageLimit(userId, "TRANSFER_SIMULATIONS", db);
      await risk(r, db);
      await write(
        "UPDATE accounts SET balance=balance-? WHERE id=?",
        [r.amount, r.account_id],
        db,
      );
      await pair(r, "HOLD", r.account_id, "DEBIT", r.amount, r.currency, db);
      await write(
        "UPDATE financial_requests SET held=1 WHERE id=?",
        [r.id],
        db,
      );
      r.held = 1;
      await incrementUsage(userId, "TRANSFER_SIMULATIONS", db);
    }
    await write(
      "UPDATE financial_requests SET confirmed_at=UTC_TIMESTAMP(),reference=? WHERE id=?",
      [reference.slice(0, 100), id],
      db,
    );
    if (r.kind === "TOPUP" && r.method === "CARD") {
      if (await cardCharge(userId, card, db))
        await finish(
          r,
          userId,
          "Demo card payment approved. Sandbox funds credited.",
          db,
        );
      else
        await event(
          r,
          userId,
          "FAILED",
          "Demo card declined. No funds credited.",
          db,
        );
    } else {
      if (r.kind === "TOPUP")
        requireCondition(
          reference.trim().length >= 3,
          "PAYMENT_REFERENCE_REQUIRED",
        );
      const parents = await parentRequirements(r, db);
      if (parents.length) {
        for (const p of parents) {
          await write(
            "INSERT INTO financial_approvals(request_id,parent_id) VALUES (?,?)",
            [r.id, p],
            db,
          );
          await notify(
            p,
            "PAYMENT_APPROVAL",
            `Payment ${r.id.slice(0, 8)} requires your decision.`,
            db,
          );
        }
        await event(
          r,
          userId,
          "WAITING_PARENT",
          "Funds reserved. Waiting for parent approval.",
          db,
        );
      } else await queueOrComplete(r, userId, db);
    }
    return { id: r.id, status: r.status };
  });
}
export async function decidePayment(
  userId: string,
  id: string,
  approve: boolean,
  reason: string,
) {
  return atomic(async (db) => {
    const r = await lockRequest(id, db);
    const u = await paymentActor(userId, db);
    requireCondition(
      u.role === "PARENT" && r.status === "WAITING_PARENT",
      "INVALID_STATE",
    );
    const cs = await controls(r.user_id, db);
    requireCondition(cs.some((c) => c.parent_id === userId));
    const [a] = await rows<{ status: string }>(
      "SELECT status FROM financial_approvals WHERE request_id=? AND parent_id=?",
      [id, userId],
      db,
    );
    requireCondition(a?.status === "PENDING", "INVALID_STATE");
    await write(
      "UPDATE financial_approvals SET status=?,reason=? WHERE request_id=? AND parent_id=?",
      [approve ? "APPROVED" : "REJECTED", reason, id, userId],
      db,
    );
    if (!approve) await reject(r, userId, "REJECTED", reason, db);
    else {
      const needed = await parentRequirements(r, db);
      const decisions = await rows<{ parent_id: string; status: string }>(
        "SELECT parent_id,status FROM financial_approvals WHERE request_id=?",
        [id],
        db,
      );
      for (const p of needed)
        await write(
          "INSERT IGNORE INTO financial_approvals(request_id,parent_id) VALUES (?,?)",
          [id, p],
          db,
        );
      if (
        needed.every((p) =>
          decisions.some((d) => d.parent_id === p && d.status === "APPROVED"),
        )
      ) {
        await risk(r, db, true);
        await queueOrComplete(r, userId, db);
      } else await event(r, userId, "WAITING_PARENT", reason, db);
    }
    return { id, status: r.status };
  });
}
export async function cancelPayment(userId: string, id: string) {
  return atomic(async (db) => {
    const r = await lockRequest(id, db);
    requireCondition(r.user_id === userId);
    requireCondition(
      ["DRAFT", "WAITING_PARENT", "QUEUED"].includes(r.status),
      "INVALID_STATE",
    );
    await reject(r, userId, "CANCELLED", "Cancelled by account owner.", db);
    return null;
  });
}
export async function settlePayment(
  actorId: string,
  id: string,
  status: string,
  note: string,
  reference: string,
) {
  return atomic(async (db) => {
    const r = await lockRequest(id, db);
    const actor = await paymentActor(actorId, db);
    requireCondition(hasPermission(actor, "settlements"));
    requireCondition(canSettle(r.status, status), "INVALID_STATE");
    if (status === "COMPLETED") {
      requireCondition(
        reference.trim().length >= 3,
        "PAYMENT_REFERENCE_REQUIRED",
      );
      await customer(r.user_id, db);
      const needed = await parentRequirements(r, db);
      const decisions = await rows<{ parent_id: string; status: string }>(
        "SELECT parent_id,status FROM financial_approvals WHERE request_id=?",
        [id],
        db,
      );
      requireCondition(
        needed.every((p) =>
          decisions.some((d) => d.parent_id === p && d.status === "APPROVED"),
        ),
        "APPROVAL_REQUIRED",
      );
      if (r.kind !== "TOPUP") await risk(r, db, true);
      await write(
        "UPDATE financial_requests SET reference=? WHERE id=?",
        [reference, id],
        db,
      );
      await finish(r, actorId, note, db);
    } else if (["REJECTED", "FAILED"].includes(status))
      await reject(r, actorId, status, note, db);
    else await event(r, actorId, status, note, db);
    return { id, status: r.status };
  });
}
export async function createBeneficiary(userId: string, input: unknown) {
  const v = beneficiarySchema.parse(input);
  const user = await customer(userId);
  await validCountry(v.country_code);
  await validCurrency(v.currency);
  return atomic(async (db) => {
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [userId], db);
    const id = randomUUID();
    await write(
      "INSERT INTO beneficiaries(id,user_id,name,method,currency,country_code,destination,status) VALUES (?,?,?,?,?,?,?,?)",
      [
        id,
        userId,
        v.name,
        v.method,
        v.currency,
        v.country_code,
        v.destination,
        user.role === "PARENT" ? "APPROVED" : "PENDING",
      ],
      db,
    );
    for (const p of await controls(userId, db))
      await notify(
        p.parent_id,
        "BENEFICIARY_APPROVAL",
        `${v.name} requires beneficiary approval.`,
        db,
      );
    await audit(userId, "BENEFICIARY_CREATED", "beneficiaries", id, {}, db);
    return { id, status: user.role === "PARENT" ? "APPROVED" : "PENDING" };
  });
}
export async function decideBeneficiary(
  parentId: string,
  id: string,
  approve: boolean,
  reason: string,
) {
  return atomic(async (db) => {
    const [b] = await rows<{ user_id: string; status: string }>(
      "SELECT user_id,status FROM beneficiaries WHERE id=?",
      [id],
      db,
    );
    requireCondition(b, "NOT_FOUND");
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [b.user_id], db);
    const [fresh] = await rows<{ status: string }>(
      "SELECT status FROM beneficiaries WHERE id=? FOR UPDATE",
      [id],
      db,
    );
    const parent = await paymentActor(parentId, db);
    requireCondition(parent.role === "PARENT" && fresh.status !== "REMOVED");
    const cs = await controls(b.user_id, db);
    requireCondition(cs.some((c) => c.parent_id === parentId));
    await write(
      "INSERT INTO beneficiary_decisions(beneficiary_id,parent_id,status,reason) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),reason=VALUES(reason),decided_at=UTC_TIMESTAMP()",
      [id, parentId, approve ? "APPROVED" : "REJECTED", reason],
      db,
    );
    const decisions = await rows<{ parent_id: string; status: string }>(
      "SELECT parent_id,status FROM beneficiary_decisions WHERE beneficiary_id=?",
      [id],
      db,
    );
    const status = decisions.some(
      (d) =>
        cs.some((c) => c.parent_id === d.parent_id) && d.status === "REJECTED",
    )
      ? "REJECTED"
      : cs.every((c) =>
            decisions.some(
              (d) => d.parent_id === c.parent_id && d.status === "APPROVED",
            ),
          )
        ? "APPROVED"
        : "PENDING";
    await write(
      "UPDATE beneficiaries SET status=? WHERE id=?",
      [status, id],
      db,
    );
    await audit(
      parentId,
      "BENEFICIARY_DECIDED",
      "beneficiaries",
      id,
      { status, reason },
      db,
    );
    await notify(
      b.user_id,
      "BENEFICIARY_STATUS",
      `${id.slice(0, 8)} · ${status}`,
      db,
    );
    return { id, status };
  });
}
export async function paymentWorkspace(userId: string) {
  const u = await paymentActor(userId);
  const admin = hasPermission(u, "settlements");
  const requests = await rows(
    "SELECT r.*,u.name owner_name FROM financial_requests r JOIN users u ON u.id=r.user_id WHERE r.user_id=? OR r.recipient_user_id=? OR ?=1 OR (?='PARENT' AND EXISTS(SELECT 1 FROM family_links f WHERE f.student_id=r.user_id AND f.parent_id=? AND f.status='LINKED') AND r.status='WAITING_PARENT') ORDER BY r.created_at DESC LIMIT 100",
    [userId, userId, admin, u.role, userId],
  );
  const beneficiaries = await rows(
    "SELECT b.*,u.name owner_name FROM beneficiaries b JOIN users u ON u.id=b.user_id WHERE b.status<>'REMOVED' AND (b.user_id=? OR (?='PARENT' AND EXISTS(SELECT 1 FROM family_links f WHERE f.student_id=b.user_id AND f.parent_id=? AND f.status='LINKED'))) ORDER BY b.created_at DESC",
    [userId, u.role, userId],
  );
  const methods = await rows(
    "SELECT * FROM payment_methods WHERE active=1 OR ?=1",
    [hasPermission(u, "payment-methods")],
  );
  // Only return events for requests the caller was allowed to see.
  const ids = requests.map((r) => String(r.id));
  const events = ids.length
    ? await rows(
        `SELECT * FROM financial_events WHERE request_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at,id`,
        ids,
      )
    : [];
  const [policy] = await rows<{ value: string }>(
    "SELECT value FROM admin_settings WHERE name='payments'",
  );
  return {
    requests,
    beneficiaries,
    methods,
    events,
    policy: policy
      ? (JSON.parse(policy.value) as { nonBeneficiaryRmb: string })
      : { nonBeneficiaryRmb: "1000" },
  };
}

export async function previewPaymentRisk(userId: string, requestId: string) {
  try {
    return await atomic(async (db) => {
      await customer(userId, db);
      const r = await lockRequest(requestId, db);
      requireCondition(r.user_id === userId, "NOT_FOUND");
      requireCondition(r.status === "DRAFT", "INVALID_STATE");
      await validateMethod(r, db);
      if (r.kind !== "TOPUP") await risk(r, db);
      const parents = await parentRequirements(r, db);
      return {
        allowed: true,
        parentApprovalRequired: parents.length > 0,
        userConfirmationRequired: true,
        manualSettlementRequired:
          r.method !== "INTERNAL" && r.method !== "CARD",
        status: r.status,
      };
    });
  } catch (error) {
    if (error instanceof AppError)
      return {
        allowed: false,
        code: error.code,
        userConfirmationRequired: true,
      };
    throw error;
  }
}
