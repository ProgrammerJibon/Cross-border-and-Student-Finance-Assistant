"use server";
import { recordBudgetEntry as add } from "@/services/budget-records.service";
import Papa from "papaparse";
import { z } from "zod";
import { requireWorkspaceUser as requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { transactionSchema, id } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { checkCategoryLimit } from "@/services/parent-controls.service";
export async function addTransaction(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const v = transactionSchema.parse(input);
    return atomic(async (db) => {
      const tx = await add(u.id, v, db);
      await audit(u.id, "TRANSACTION_ADDED", "transactions", tx, {}, db);
      return { id: tx };
    });
  });
}
export async function categorizeTransaction(txId: string, category: string) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    id.parse(txId);
    transactionSchema.shape.category.parse(category);
    await atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const [tx] = await rows<{
        amount: string;
        currency: string;
        date: string;
        type: string;
        record_source: string;
      }>(
        "SELECT amount,currency,date,type,record_source FROM finance_records WHERE id=? AND user_id=? FOR UPDATE",
        [txId, u.id],
        db,
      );
      requireCondition(tx, "NOT_FOUND");
      if (tx.type === "EXPENSE" && tx.record_source !== "BUDGET")
        await checkCategoryLimit(
          u.id,
          category,
          tx.amount,
          tx.currency,
          tx.date,
          db,
          txId,
        );
      await write(
        `UPDATE ${tx.record_source === "BUDGET" ? "budget_records" : "transactions"} SET category=?,confidence=NULL WHERE id=? AND user_id=?`,
        [category, txId, u.id],
        db,
      );
      await audit(
        u.id,
        "TRANSACTION_CATEGORIZED",
        "transactions",
        txId,
        {},
        db,
      );
    });
    return null;
  });
}
export async function importCsv(form: FormData) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const file = form.get("file");
    requireCondition(
      file instanceof File &&
        file.size <= 5 * 1024 * 1024 &&
        file.name.toLowerCase().endsWith(".csv") &&
        ["text/csv", "application/vnd.ms-excel", "text/plain", ""].includes(
          file.type,
        ),
      "FIELD_VALIDATION", {"file": "Choose a CSV file no larger than 5 MB."},
    );
    const account = z.object({account_id:id}).parse({account_id:form.get("account_id")}).account_id;
    let rawMapping:unknown;
    try { rawMapping=JSON.parse(String(form.get("mapping") || "{}")); }
    catch { requireCondition(false,"FIELD_VALIDATION",{mapping:"Select a valid CSV column mapping."}); }
    const mapping = z
      .record(z.string(), z.string().max(80))
      .parse(rawMapping);
    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true,
      skipEmptyLines: true,
    });
    requireCondition(
      !parsed.errors.length &&
        parsed.data.length > 0 &&
        parsed.data.length <= 2000,
      "CSV_INVALID",
    );
    const validated = parsed.data.map((r, i) => {
      const get = (k: string) => r[mapping[k] || k];
      const v = transactionSchema.safeParse({
        account_id: account,
        description: get("description"),
        amount: get("amount"),
        category: get("category") || "Other",
        type: get("type"),
        date: get("date"),
        notes: get("notes") || "",
      });
      return { row: i + 2, result: v };
    });
    const errors = validated.filter((r) => !r.result.success).map((r) => r.row);
    if (errors.length) return { imported: 0, invalidRows: errors, invalidFields: validated.flatMap(r=>r.result.success?[]:[{row:r.row,fields:[...new Set(r.result.error.issues.map(issue=>issue.path.join(".")))]}]) };
    return atomic(async (db) => {
      await checkUsageLimit(u.id, "CSV_IMPORTS", db);
      for (const v of validated)
        if (v.result.success) await add(u.id, v.result.data, db);
      await incrementUsage(u.id, "CSV_IMPORTS", db);
      await audit(
        u.id,
        "CSV_IMPORTED",
        "transactions",
        u.id,
        { rows: validated.length },
        db,
      );
      return { imported: validated.length, invalidRows: [] };
    });
  });
}
export async function listTransactions(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(["STUDENT", "PARENT"].includes(u.role));
    const v = z
      .object({
        search: z.string().max(160).default(""),
        category: z.string().max(40).default(""),
        currency: z.string().max(3).default(""),
        account: z.string().max(64).default(""),
        type: z.string().max(10).default(""),
        from: z.string().max(10).default(""),
        to: z.string().max(10).default(""),
        page: z.number().int().min(0).max(10000).default(0),
      })
      .parse(input);
    const where =
      "user_id=? AND (?='' OR description LIKE ?) AND (?='' OR category=?) AND (?='' OR currency=?) AND (?='' OR account_id=?) AND (?='' OR type=?) AND (?='' OR date>=?) AND (?='' OR date<=?)";
    const args = [
      u.id,
      v.search,
      `%${v.search}%`,
      v.category,
      v.category,
      v.currency,
      v.currency,
      v.account,
      v.account,
      v.type,
      v.type,
      v.from,
      v.from,
      v.to,
      v.to,
    ];
    const data = await rows(
      "SELECT * FROM finance_records WHERE " +
        where +
        " ORDER BY date DESC,created_at DESC LIMIT 20 OFFSET " +
        v.page * 20,
      args,
    );
    const [count] = await rows<{ total: number }>(
      "SELECT COUNT(*) total FROM finance_records WHERE " + where,
      args,
    );
    return { rows: data, total: count.total };
  });
}
