import { rows, type DB } from "@/lib/db";
import { D, fundingGap, money } from "@/lib/money";
import { getRates, inCurrency } from "./currency.service";
import { tuitionSchedule } from "@/lib/tuition-schedule";
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
    first_due_date: string | null;
    installments: number;
    payment_schedule: string;
  }>(
    "SELECT * FROM tuition_invoices WHERE user_id=? AND amount>paid+scholarship ORDER BY due_date",
    [userId],
    db,
  );
  if (!invoices.length) return null;
  const candidates=invoices.map(invoice=>({invoice,next:tuitionSchedule(invoice).find(payment=>D(payment.remaining).gt(0))})).filter(item=>item.next).sort((a,b)=>a.next!.date.localeCompare(b.next!.date));
  if(!candidates.length)return null;
  const {invoice,next}=candidates[0];
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
      (Date.parse(next!.date + "T23:59:59Z") - Date.now()) / 86400000,
    ),
  );
  const months = Math.max(1, Math.ceil(days / 30));
  const pendingDeposits=await rows("SELECT amount,currency,status FROM wallet_operations WHERE user_id=? AND kind IN ('FUNDING_MANUAL','FUNDING_GATEWAY') AND status NOT IN ('COMPLETED','CANCELLED','REJECTED')",[userId],db);
  const expectedSupport=await rows("SELECT amount,currency,status FROM family_funding_requests WHERE student_id=? AND status IN ('PENDING_PARENT_APPROVAL','APPROVED_AWAITING_FUNDS') AND expires_at>UTC_TIMESTAMP()",[userId],db);
  return {
    pendingDeposits,
    expectedSupport,
    ...invoice,
    nextPayment: next!,
    ...fundingGap(
      next!.remaining,
      available,
      profile
        ? inCurrency(
            profile.monthly_income,
            profile.study_currency,
            invoice.currency,
            rates,
          )
        : "0",
      "0",
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
