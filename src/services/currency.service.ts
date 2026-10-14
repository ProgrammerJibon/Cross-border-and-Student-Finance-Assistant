import { rows, type DB } from "@/lib/db";
import { convert } from "@/lib/money";
export async function getRates(db?: DB) {
  const all = await rows<{
    currency: string;
    rate: string;
    recorded_at: string;
  }>(
    "SELECT currency,rate,recorded_at FROM (SELECT currency,rate,recorded_at,ROW_NUMBER() OVER (PARTITION BY currency ORDER BY recorded_at DESC,id DESC) rn FROM fx_rates) latest WHERE rn=1",
    [],
    db,
  );
  return Object.fromEntries(all.map((r) => [r.currency, r.rate]));
}
export async function getRateHistory() {
  return rows<{ currency: string; rate: string; day: string }>(
    "SELECT currency,rate,DATE_FORMAT(recorded_at,'%Y-%m-%d') day FROM (SELECT currency,rate,recorded_at,ROW_NUMBER() OVER (PARTITION BY currency,DATE(recorded_at) ORDER BY recorded_at DESC,id DESC) rn FROM fx_rates WHERE recorded_at>=DATE_SUB(UTC_DATE(),INTERVAL 30 DAY)) daily WHERE rn=1 ORDER BY recorded_at,currency",
  );
}
export function inCurrency(
  amount: string,
  from: string,
  to: string,
  rates: Record<string, string>,
) {
  if (!rates[from] || !rates[to]) throw new Error("Unsupported currency");
  return convert(amount, rates[from], rates[to]);
}
