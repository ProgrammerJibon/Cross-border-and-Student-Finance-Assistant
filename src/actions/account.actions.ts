"use server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { accountSchema, id } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { validCurrency } from "@/lib/catalog";
export async function saveAccount(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const v = accountSchema.parse(input);
    if (!v.id) await validCurrency(v.currency);
    return atomic(async (db) => {
      const accountId = v.id || randomUUID();
      if (v.id) {
        const [a] = await rows<{ currency: string; type: string }>(
          "SELECT currency,type FROM accounts WHERE id=? AND user_id=? FOR UPDATE",
          [v.id, u.id],
          db,
        );
        requireCondition(a, "NOT_FOUND");
        requireCondition(a.currency === v.currency, "VALIDATION_ERROR");
        requireCondition(
          (a.type === "CASH") === (v.type === "CASH"),
          "USE_WALLET_ACCOUNT",
        );
        await write(
          "UPDATE accounts SET name=?,type=? WHERE id=? AND user_id=?",
          [v.name, v.type, v.id, u.id],
          db,
        );
      } else {
        requireCondition(Number(v.balance) === 0, "USE_PAYMENT_FLOW");
        await checkUsageLimit(u.id, "ACCOUNTS", db);
        await write(
          "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,?,?,?,?)",
          [accountId, u.id, v.name, v.type, v.currency, v.balance],
          db,
        );
        await incrementUsage(u.id, "ACCOUNTS", db);
      }
      await audit(u.id, "ACCOUNT_SAVED", "accounts", accountId, {}, db);
      return { id: accountId };
    });
  });
}
export async function archiveAccount(accountId: string) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    id.parse(accountId);
    await atomic(async (db) => {
      const [a] = await rows<{ balance: string }>(
        "SELECT balance FROM accounts WHERE id=? AND user_id=? FOR UPDATE",
        [accountId, u.id],
        db,
      );
      requireCondition(a, "NOT_FOUND");
      requireCondition(Number(a.balance) === 0, "ACCOUNT_NOT_EMPTY");
      requireCondition(
        !(
          await rows(
            "SELECT id FROM financial_requests WHERE account_id=? AND status IN ('WAITING_PARENT','QUEUED','PROCESSING')",
            [accountId],
            db,
          )
        ).length,
        "INVALID_STATE",
      );
      await write(
        "UPDATE accounts SET archived=1 WHERE id=? AND user_id=?",
        [accountId, u.id],
        db,
      );
      await audit(u.id, "ACCOUNT_ARCHIVED", "accounts", accountId, {}, db);
    });
    return null;
  });
}
