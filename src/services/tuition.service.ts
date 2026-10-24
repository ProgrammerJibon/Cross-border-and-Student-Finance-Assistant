import { rows, type DB } from "@/lib/db";
import { D, fundingGap, money } from "@/lib/money";
import { getRates, inCurrency } from "./currency.service";
export async function tuitionGap(userId: string, db?: DB) {
  const rates = await getRates(db);
  const invoices = await rows<{
    id: string;
    name: string;
    amount: string;
    paid: string;
    scholarship: string;
    currency: string;
    due_date: string;
  }>(
    "SELECT * FROM tuition_invoices WHERE user_id=? AND amount>paid ORDER BY due_date LIMIT 1",
    [userId],
    db,
  );
  if (!invoices.length) return null;
  const invoice = invoices[0];
  const accounts = await rows<{ balance: string; currency: string }>(
    "SELECT balance,currency FROM accounts WHERE user_id=? AND archived=0 AND type<>'CASH'",
    [userId],
    db,
  );
  const available = accounts.reduce(
    (sum, a) =>
      sum.plus(inCurrency(a.balance, a.currency, invoice.currency, rates)),
    D(0),
  );
  const [profile] = await rows<{
    monthly_income: string;
    monthly_expenses: string;
    study_currency: string;
  }>(
    "SELECT monthly_income,monthly_expenses,study_currency FROM student_profiles WHERE user_id=?",
    [userId],
    db,
  );
  const days = Math.max(
    0,
    Math.ceil(
      (Date.parse(invoice.due_date + "T23:59:59Z") - Date.now()) / 86400000,
    ),
  );
  const months = Math.max(1, Math.ceil(days / 30));
  return {
    ...invoice,
    ...fundingGap(
      D(invoice.amount).minus(invoice.paid),
      available,
      profile
        ? inCurrency(
            profile.monthly_income,
            profile.study_currency,
            invoice.currency,
            rates,
          )
        : "0",
      invoice.scholarship,
      profile
        ? inCurrency(
            profile.monthly_expenses,
            profile.study_currency,
            invoice.currency,
            rates,
          )
        : "0",
      months,
    ),
    availableFunds: money(available),
    projectionNotice: "Income, scholarships and FX conversions are estimates, not settled funds.",
    daysRemaining: days,
    months,
    expectedIncome: money(D(profile?.monthly_income || 0).mul(months)),
  };
}
