import { getRiskPolicy } from "./financial-config.service";
import { requireDemoFinance } from "@/lib/financial-environment";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { rows, write, atomic, type DB } from "@/lib/db";
import { AppError, requireCondition } from "@/lib/errors";
import { D, money } from "@/lib/money";
import { assessRisk } from "@/lib/risk-engine";
import { getRates, inCurrency } from "./currency.service";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { audit, notify } from "@/lib/audit";
import { checkCategoryLimit } from "./parent-controls.service";
export type Quote = {
  id: string;
  user_id: string;
  provider_id: string;
  source_currency: string;
  target_currency: string;
  receive_amount: string;
  source_amount: string;
  fee: string;
  total: string;
  rate: string;
  eta_days: number;
  expires_at: string;
};
type Transfer = {
  id: string;
  user_id: string;
  quote_id: string;
  account_id: string;
  destination_id: string | null;
  invoice_id: string | null;
  recipient: string;
  purpose: string;
  status: string;
  reference: string | null;
};
async function riskFor(
  userId: string,
  q: Quote,
  accountId: string,
  purpose: string,
  invoiceId: string | null,
  destinationId: string | null,
  db: DB,
  transferId = "",
) {
  const rates = await getRates(db);
  const [a] = await rows<{
    user_id: string;
    balance: string;
    currency: string;
    archived: number;
    type: string;
  }>("SELECT * FROM accounts WHERE id=? FOR UPDATE", [accountId], db);
  requireCondition(a && a.user_id === userId, "NOT_FOUND");
  requireCondition(a.type !== "CASH", "USE_WALLET_ACCOUNT");
  requireCondition(a.currency === q.source_currency, "FIELD_VALIDATION", {"account_id": "The source account must match the quote currency."});
  const previous = await rows<{
    total: string;
    source_currency: string;
    completed_at: string;
  }>(
    "SELECT q.total,q.source_currency,t.completed_at FROM sandbox_transfers t JOIN transfer_quotes q ON q.id=t.quote_id WHERE t.user_id=? AND t.status='COMPLETED' AND t.completed_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01') UNION ALL SELECT amount total,currency source_currency,confirmed_at completed_at FROM financial_requests WHERE user_id=? AND kind<>'TOPUP' AND status IN ('WAITING_PARENT','QUEUED','PROCESSING','COMPLETED') AND confirmed_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')",
    [userId, userId],
    db,
  );
  const today = new Date().toISOString().slice(0, 10);
  const daily = previous.filter((p) => p.completed_at.slice(0, 10) === today);
  const sum = (list: typeof previous) =>
    money(
      list.reduce(
        (s, p) => s.plus(inCurrency(p.total, p.source_currency, "CAD", rates)),
        D(0),
      ),
    );
  const links = await rows<{
    parent_id: string;
    threshold: string;
    per_transfer: string;
    daily_limit: string;
    monthly_limit: string;
    tuition_approval: number;
    conversion_approval: number;
    auto_approve: number;
  }>(
    "SELECT f.parent_id,c.* FROM family_links f JOIN parental_controls c ON c.link_id=f.id WHERE f.student_id=? AND f.status='LINKED'",
    [userId],
    db,
  );
  let deadlineMissed = false;
  if (invoiceId) {
    const [invoice] = await rows<{
      due_date: string;
      currency: string;
      amount: string;
      paid: string;
      scholarship: string;
    }>(
      "SELECT * FROM tuition_invoices WHERE id=? AND user_id=? FOR UPDATE",
      [invoiceId, userId],
      db,
    );
    requireCondition(
      invoice && invoice.currency === q.target_currency,
      "NOT_FOUND",
    );
    requireCondition(
      D(q.receive_amount).lte(D(invoice.amount).minus(invoice.paid)),
      "FIELD_VALIDATION", {"amount": "Payment exceeds the remaining tuition amount."},
    );
    deadlineMissed =
      Date.now() + q.eta_days * 86400000 >
      Date.parse(invoice.due_date + "T23:59:59Z");
  }
  let destinationActive = true;
  if (destinationId) {
    const [dest] = await rows<{ id: string }>(
      "SELECT id FROM accounts WHERE id=? AND user_id=? AND currency=? AND archived=0 FOR UPDATE",
      [destinationId, userId, q.target_currency],
      db,
    );
    destinationActive = !!dest;
  }
  const duplicate = await rows(
    "SELECT t.id FROM sandbox_transfers t JOIN transfer_quotes p ON p.id=t.quote_id WHERE t.user_id=? AND t.id<>? AND t.account_id=? AND p.receive_amount=? AND p.target_currency=? AND t.status='COMPLETED' AND t.completed_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)",
    [userId, transferId, accountId, q.receive_amount, q.target_currency],
    db,
  );
  const [provider] = await rows<{
    minimum: string;
    maximum: string;
    active: number;
  }>(
    "SELECT minimum,maximum,active FROM remittance_providers WHERE id=?",
    [q.provider_id],
    db,
  );
  const amountCad = inCurrency(q.total, q.source_currency, "CAD", rates);
  const min = (
    key: "threshold" | "per_transfer" | "daily_limit" | "monthly_limit",
  ) =>
    links.length
      ? String(Math.min(...links.map((l) => Number(l[key]))))
      : undefined;
  const risk = assessRisk({
    policy: await getRiskPolicy(db),
    amount: amountCad,
    balance: inCurrency(a.balance, a.currency, "CAD", rates),
    active: !a.archived,
    owned: true,
    daily: sum(daily),
    monthly: sum(previous),
    frequency: daily.length,
    destinationActive,
    duplicate: duplicate.length > 0,
    deadlineMissed,
    providerAllowed:
      !!provider?.active &&
      D(inCurrency(q.receive_amount, q.target_currency, "CAD", rates)).gte(
        provider.minimum,
      ) &&
      D(inCurrency(q.receive_amount, q.target_currency, "CAD", rates)).lte(
        provider.maximum,
      ),
    parentThreshold: links.some((l) => !l.auto_approve)
      ? String(
          Math.min(
            ...links
              .filter((l) => !l.auto_approve)
              .map((l) => Number(l.threshold)),
          ),
        )
      : undefined,
    parentMax: min("per_transfer"),
    parentDaily: min("daily_limit"),
    parentMonthly: min("monthly_limit"),
    parentForce: links.some(
      (l) =>
        !l.auto_approve &&
        ((purpose === "TUITION" && !!l.tuition_approval) ||
          (purpose === "CONVERSION" && !!l.conversion_approval)),
    ),
  });
  // Check the original currency as well: converting to CAD can round away a cent.
  if (D(a.balance).lt(q.total)) {
    risk.allowed = false;
    risk.riskLevel = "CRITICAL";
    risk.riskScore = 95;
    if (!risk.flags.includes("INSUFFICIENT_BALANCE"))
      risk.flags.push("INSUFFICIENT_BALANCE");
  }
  if (purpose !== "CONVERSION") {
    try {
      await checkCategoryLimit(
        userId,
        purpose === "TUITION" ? "Education" : "Other",
        q.total,
        q.source_currency,
        today,
        db,
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      risk.allowed = false;
      risk.riskLevel = "CRITICAL";
      risk.riskScore = 95;
      risk.flags.push(error.code);
    }
  }
  return { risk, links, account: a };
}
export async function prepare(
  userId: string,
  input: {
    quoteId: string;
    accountId: string;
    recipient: string;
    purpose: string;
    invoiceId?: string;
    destinationId?: string;
  },
) {
  requireCondition(input.purpose === "CONVERSION", "EXTERNAL_SEND_DISABLED");
  requireCondition(
    !(input.invoiceId && input.destinationId),
    "FIELD_VALIDATION", {"destinationId": "Choose one destination."},
  );
  requireCondition(
    !input.invoiceId,
    "FIELD_VALIDATION", {"invoiceId": "Conversions cannot pay an invoice."},
  );
  requireCondition(
    input.purpose !== "CONVERSION" || !!input.destinationId,
    "FIELD_VALIDATION", {"destinationId": "Select a destination account."},
  );
  requireCondition(
    !input.destinationId || input.destinationId !== input.accountId,
    "FIELD_VALIDATION", {"destinationId": "Source and destination accounts must be different."},
  );
  return atomic(async (db) => {
    await requireDemoFinance(userId, db);
    await checkUsageLimit(userId, "TRANSFER_SIMULATIONS", db);
    const [q] = await rows<Quote>(
      "SELECT * FROM transfer_quotes WHERE id=? AND user_id=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE",
      [input.quoteId, userId],
      db,
    );
    requireCondition(q, "QUOTE_EXPIRED");
    const existing = await rows<Transfer>(
      "SELECT * FROM sandbox_transfers WHERE quote_id=?",
      [q.id],
      db,
    );
    if (existing.length)
      return { id: existing[0].id, status: existing[0].status, risk: null };
    const { risk, links } = await riskFor(
      userId,
      q,
      input.accountId,
      input.purpose,
      input.invoiceId || null,
      input.destinationId || null,
      db,
    );
    const id = randomUUID();
    await write(
      "INSERT INTO risk_assessments(id,user_id,assessment) VALUES (?,?,?)",
      [randomUUID(), userId, JSON.stringify(risk)],
      db,
    );
    if (!risk.allowed) {
      await audit(userId, "RISK_BLOCKED", "transfer_quotes", q.id, risk, db);
      return { id: null, status: "BLOCKED", risk };
    }
    const status = risk.parentRequired ? "WAITING_APPROVAL" : "DRAFT";
    await write(
      "INSERT INTO sandbox_transfers(id,user_id,quote_id,account_id,destination_id,invoice_id,recipient,purpose,status,risk) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        id,
        userId,
        q.id,
        input.accountId,
        input.destinationId || null,
        input.invoiceId || null,
        input.recipient,
        input.purpose,
        status,
        JSON.stringify(risk),
      ],
      db,
    );
    await write(
      "INSERT INTO approval_requests(id,transfer_id,user_id) VALUES (?,?,?)",
      [randomUUID(), id, userId],
      db,
    );
    if (risk.parentRequired)
      for (const l of links.filter((l) => !l.auto_approve)) {
        await write(
          "INSERT INTO parent_approvals(id,transfer_id,parent_id) VALUES (?,?,?)",
          [randomUUID(), id, l.parent_id],
          db,
        );
        await notify(l.parent_id, "APPROVAL_REQUIRED", id, db);
      }
    await audit(
      userId,
      "TRANSFER_PREPARED",
      "sandbox_transfers",
      id,
      { risk, quoteId: q.id },
      db,
    );
    return { id, status, risk };
  });
}
export async function approve(userId: string, transferId: string) {
  await requireDemoFinance(userId);
  return atomic(async (db) => {
    await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [userId], db);
    const [t] = await rows<Transfer>(
      "SELECT * FROM sandbox_transfers WHERE id=? AND user_id=? FOR UPDATE",
      [transferId, userId],
      db,
    );
    requireCondition(
      t && ["DRAFT", "APPROVED", "WAITING_APPROVAL"].includes(t.status),
      "INVALID_STATE",
    );
    const pending = await rows(
      "SELECT p.id FROM parent_approvals p JOIN sandbox_transfers t ON t.id=p.transfer_id JOIN family_links f ON f.parent_id=p.parent_id AND f.student_id=t.user_id AND f.status='LINKED' JOIN parental_controls c ON c.link_id=f.id WHERE p.transfer_id=? AND p.status<>'APPROVED' AND c.auto_approve=0",
      [transferId],
      db,
    );
    requireCondition(!pending.length, "PARENT_APPROVAL_REQUIRED");
    const token = randomBytes(32).toString("hex");
    await write(
      "UPDATE approval_requests SET token_hash=?,expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),approved_at=UTC_TIMESTAMP() WHERE transfer_id=? AND consumed=0",
      [createHash("sha256").update(token).digest("hex"), transferId],
      db,
    );
    await write(
      "UPDATE sandbox_transfers SET status='APPROVED' WHERE id=?",
      [transferId],
      db,
    );
    await audit(
      userId,
      "USER_APPROVED",
      "sandbox_transfers",
      transferId,
      {},
      db,
    );
    return { token };
  });
}
export async function execute(
  userId: string,
  transferId: string,
  token: string,
) {
  await requireDemoFinance(userId);
  return atomic(async (db) => {
    await checkUsageLimit(userId, "TRANSFER_SIMULATIONS", db);
    const [t] = await rows<Transfer>(
      "SELECT * FROM sandbox_transfers WHERE id=? AND user_id=? FOR UPDATE",
      [transferId, userId],
      db,
    );
    requireCondition(t, "NOT_FOUND");
    requireCondition(t.purpose === "CONVERSION", "EXTERNAL_SEND_DISABLED");
    requireCondition(t.status === "APPROVED", "APPROVAL_REQUIRED");
    const [approval] = await rows<{ id: string }>(
      "SELECT id FROM approval_requests WHERE transfer_id=? AND user_id=? AND consumed=0 AND token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE",
      [transferId, userId, createHash("sha256").update(token).digest("hex")],
      db,
    );
    requireCondition(approval, "INVALID_TOKEN");
    const [q] = await rows<Quote>(
      "SELECT * FROM transfer_quotes WHERE id=? AND expires_at>UTC_TIMESTAMP()",
      [t.quote_id],
      db,
    );
    requireCondition(q, "QUOTE_EXPIRED");
    const { risk, links, account } = await riskFor(
      userId,
      q,
      t.account_id,
      t.purpose,
      t.invoice_id,
      t.destination_id,
      db,
      t.id,
    );
    requireCondition(risk.allowed, "RISK_BLOCKED");
    if (risk.parentRequired) {
      for (const link of links.filter((l) => !l.auto_approve)) {
        const approval = await rows(
          "SELECT id FROM parent_approvals WHERE transfer_id=? AND parent_id=? AND status='APPROVED'",
          [t.id, link.parent_id],
          db,
        );
        requireCondition(approval.length, "PARENT_APPROVAL_REQUIRED");
      }
    }
    const balance = money(D(account.balance).minus(q.total));
    const reference = `SIM-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;
    await write(
      "UPDATE accounts SET balance=? WHERE id=?",
      [balance, t.account_id],
      db,
    );
    await write(
      "INSERT INTO sandbox_ledger_entries(id,transfer_id,account_id,direction,amount,currency,balance_after) VALUES (?,?,?,'DEBIT',?,?,?)",
      [randomUUID(), t.id, t.account_id, q.total, q.source_currency, balance],
      db,
    );
    if (t.destination_id) {
      await write(
        "UPDATE accounts SET balance=balance+? WHERE id=? AND user_id=?",
        [q.receive_amount, t.destination_id, userId],
        db,
      );
    }
    if (t.invoice_id)
      await write(
        "UPDATE tuition_invoices SET paid=paid+? WHERE id=? AND user_id=?",
        [q.receive_amount, t.invoice_id, userId],
        db,
      );
    await write(
      "INSERT INTO sandbox_ledger_entries(id,transfer_id,account_id,direction,amount,currency) VALUES (?,?,?,'CREDIT',?,?)",
      [
        randomUUID(),
        t.id,
        t.destination_id,
        q.receive_amount,
        q.target_currency,
      ],
      db,
    );
    // Clearing and fee legs balance each currency independently; FX is an explicit clearing boundary.
    await write(
      "INSERT INTO sandbox_ledger_entries(id,transfer_id,direction,amount,currency) VALUES (?,?,'CREDIT',?,?),(?,?,'DEBIT',?,?)",
      [
        randomUUID(),
        t.id,
        q.total,
        q.source_currency,
        randomUUID(),
        t.id,
        q.receive_amount,
        q.target_currency,
      ],
      db,
    );
    await write(
      "INSERT INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date) VALUES (?,?,?,?,?,'EXPENSE',?,?,UTC_DATE())",
      [
        randomUUID(),
        userId,
        t.account_id,
        q.total,
        q.source_currency,
        "Other",
        reference,
      ],
      db,
    );
    if (t.destination_id)
      await write(
        "INSERT INTO transactions(id,user_id,account_id,amount,currency,type,category,description,date) VALUES (?,?,?,?,?,'INCOME','Other',?,UTC_DATE())",
        [
          randomUUID(),
          userId,
          t.destination_id,
          q.receive_amount,
          q.target_currency,
          reference,
        ],
        db,
      );
    await write(
      "UPDATE sandbox_transfers SET status='COMPLETED',reference=?,risk=?,completed_at=UTC_TIMESTAMP() WHERE id=?",
      [reference, JSON.stringify(risk), t.id],
      db,
    );
    await write(
      "UPDATE approval_requests SET consumed=1 WHERE id=?",
      [approval.id],
      db,
    );
    await incrementUsage(userId, "TRANSFER_SIMULATIONS", db);
    const [verified] = await rows<{ balance: string }>(
      "SELECT balance FROM accounts WHERE id=?",
      [t.account_id],
      db,
    );
    requireCondition(D(verified.balance).eq(balance), "TRANSFER_FAILED");
    await audit(
      userId,
      "TRANSFER_VERIFIED",
      "sandbox_transfers",
      t.id,
      {
        reference,
        source: q.total,
        received: q.receive_amount,
        fee: q.fee,
        balanceAfter: balance,
        risk,
      },
      db,
    );
    await notify(userId, "TRANSFER_COMPLETE", reference, db);
    return {
      id: t.id,
      reference,
      sent: q.total,
      received: q.receive_amount,
      fee: q.fee,
      sourceCurrency: q.source_currency,
      targetCurrency: q.target_currency,
      status: "COMPLETED",
    };
  });
}
