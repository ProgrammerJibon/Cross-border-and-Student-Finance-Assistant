import Decimal from "decimal.js";
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
export const D = (value: Decimal.Value) => new Decimal(value);
export const money = (value: Decimal.Value) => D(value).toFixed(2);
export function formatMoney(
  value: Decimal.Value,
  currency = "CNY",
  locale = "en",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  })
    .format(Number(value))
    .replace("CNY", "RMB");
}
export function convert(
  amount: Decimal.Value,
  fromRate: Decimal.Value,
  toRate: Decimal.Value,
) {
  return money(D(amount).div(fromRate).mul(toRate));
}
export function fundingGap(
  required: Decimal.Value,
  available: Decimal.Value,
  income: Decimal.Value,
  scholarship: Decimal.Value,
  expenses: Decimal.Value,
  months: number,
) {
  const projected = Decimal.max(
    0,
    D(available).plus(D(income).minus(expenses).mul(months)).plus(scholarship),
  );
  const gap = Decimal.max(0, D(required).minus(projected));
  return {
    required: money(required),
    available: money(available),
    projected: money(projected),
    shortage: money(gap),
    monthlyTarget: money(gap.div(Math.max(1, months))),
    readiness: Math.min(
      100,
      D(required).gt(0) ? projected.div(required).mul(100).toNumber() : 100,
    ),
  };
}
