import { parseJson } from "@/lib/json";
import { rows, type DB } from "@/lib/db";
import { D, money } from "@/lib/money";
import { requireCondition } from "@/lib/errors";
import { getRates, inCurrency } from "./currency.service";

export function categoryLimitAllows(
  spent: string,
  amount: string,
  limits: string[],
) {
  return limits.every((limit) => D(spent).plus(amount).lte(limit));
}

/** Caller holds the student's user-row lock for the complete financial mutation. */
export async function checkCategoryLimit(
  userId: string,
  category: string,
  amount: string,
  currency: string,
  date: string,
  db: DB,
  excludedId = "",
  excludedRequest = "",
) {
  const controls = await rows<{ category_limits: string | null }>(
    "SELECT c.category_limits FROM parental_controls c JOIN family_links f ON f.id=c.link_id WHERE f.student_id=? AND f.status='LINKED'",
    [userId],
    db,
  );
  const limits = controls.flatMap((c) => {
    const value = c.category_limits
      ? parseJson<Record<string, string>>(c.category_limits, {})[category]
      : undefined;
    return value === undefined ? [] : [String(value)];
  });
  if (!limits.length) return;
  const rates = await getRates(db);
  const totals = await rows<{ amount: string; currency: string }>(
    "SELECT currency,SUM(amount) amount FROM transactions WHERE user_id=? AND category=? AND type='EXPENSE' AND DATE_FORMAT(date,'%Y-%m')=? AND id<>? GROUP BY currency",
    [userId, category, date.slice(0, 7), excludedId],
    db,
  );
  const spent = money(
    totals.reduce(
      (sum, row) =>
        sum.plus(inCurrency(row.amount, row.currency, "CAD", rates)),
      D(0),
    ),
  );
  const held = await rows<{ amount: string; currency: string }>(
    "SELECT amount,currency FROM financial_requests WHERE user_id=? AND category=? AND held=1 AND id<>? AND DATE_FORMAT(confirmed_at,'%Y-%m')=? UNION ALL SELECT amount,currency FROM wallet_operations WHERE user_id=? AND ?='Other' AND kind='WITHDRAWAL_MANUAL' AND status IN ('WAITING_PARENT','PENDING_REVIEW','PROCESSING','PAID_PENDING_VERIFICATION') AND id<>? AND DATE_FORMAT(created_at,'%Y-%m')=?",
    [userId, category, excludedRequest, date.slice(0, 7),userId,category,excludedRequest,date.slice(0,7)],
    db,
  );
  const reserved = held.reduce(
    (sum, r) => sum.plus(inCurrency(r.amount, r.currency, "CAD", rates)),
    D(0),
  );
  requireCondition(
    categoryLimitAllows(
      money(D(spent).plus(reserved)),
      inCurrency(amount, currency, "CAD", rates),
      limits,
    ),
    "CATEGORY_LIMIT_REACHED",
  );
}
