import { D } from "./money";
export type RiskInput = {
  policy?: {
    dailyCad: number;
    monthlyCad: number;
    frequency: number;
    largeCad: number;
  };
  amount: string;
  balance: string;
  active: boolean;
  owned: boolean;
  daily: string;
  monthly: string;
  frequency: number;
  destinationActive: boolean;
  duplicate: boolean;
  deadlineMissed: boolean;
  parentThreshold?: string;
  parentMax?: string;
  parentDaily?: string;
  parentMonthly?: string;
  parentForce?: boolean;
  providerAllowed: boolean;
};
export function assessRisk(x: RiskInput) {
  const policy = x.policy || {
    dailyCad: 15000,
    monthlyCad: 50000,
    frequency: 10,
    largeCad: 5000,
  };
  const flags: string[] = [];
  if (!D(x.amount).gt(0)) flags.push("INVALID_AMOUNT");
  if (!x.active) flags.push("ACCOUNT_INACTIVE");
  if (!x.owned) flags.push("FORBIDDEN");
  if (D(x.balance).lt(x.amount)) flags.push("INSUFFICIENT_BALANCE");
  if (
    D(x.daily)
      .plus(x.amount)
      .gt(
        x.parentDaily && D(x.parentDaily).lt(policy.dailyCad)
          ? x.parentDaily
          : policy.dailyCad,
      )
  )
    flags.push("DAILY_LIMIT");
  if (
    D(x.monthly)
      .plus(x.amount)
      .gt(
        x.parentMonthly && D(x.parentMonthly).lt(policy.monthlyCad)
          ? x.parentMonthly
          : policy.monthlyCad,
      )
  )
    flags.push("MONTHLY_LIMIT");
  if (x.parentMax && D(x.amount).gt(x.parentMax)) flags.push("PARENT_LIMIT");
  if (x.frequency >= policy.frequency) flags.push("FREQUENCY_LIMIT");
  if (!x.destinationActive) flags.push("DESTINATION_BLOCKED");
  if (x.duplicate) flags.push("DUPLICATE_TRANSFER");
  if (x.deadlineMissed) flags.push("DEADLINE_MISSED");
  if (!x.providerAllowed) flags.push("PROVIDER_LIMIT");
  const allowed = flags.length === 0;
  const parentRequired =
    !!x.parentForce ||
    !!(x.parentThreshold && D(x.amount).gt(x.parentThreshold));
  if (D(x.amount).gte(policy.largeCad)) flags.push("LARGE_TRANSFER");
  if (parentRequired) flags.push("PARENT_APPROVAL_REQUIRED");
  return {
    allowed,
    flags,
    parentRequired,
    approvalRequired: true,
    riskScore: allowed ? (parentRequired ? 65 : flags.length ? 45 : 20) : 95,
    riskLevel: allowed
      ? parentRequired
        ? "HIGH"
        : flags.length
          ? "MEDIUM"
          : "LOW"
      : "CRITICAL",
  };
}
