import "server-only";
import { randomUUID } from "node:crypto";
import { rows, write, type DB } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import { transactionSchema } from "@/lib/validation";

// Budget observations never authorize payments or mutate a wallet/ledger.
export async function recordBudgetEntry(userId: string, input: unknown, db: DB) {
  const v = transactionSchema.parse(input);
  const [account] = await rows<{ currency: string }>(
    "SELECT currency FROM accounts WHERE id=? AND user_id=? AND archived=0", [v.account_id, userId], db,
  );
  requireCondition(account, "NOT_FOUND");
  const id = randomUUID();
  await write("INSERT INTO budget_records(id,user_id,account_id,amount,currency,type,category,description,notes,date) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [id,userId,v.account_id,v.amount,account.currency,v.type,v.category,v.description,v.notes,v.date], db);
  return id;
}
