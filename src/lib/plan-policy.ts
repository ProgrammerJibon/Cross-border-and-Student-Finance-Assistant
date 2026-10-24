export const familyPlans = ["family", "family-pro"];
export const freePages = ["dashboard", "agent", "money", "payments", "beneficiaries", "transactions", "budget", "family", "subscription", "subscription/checkout", "api-keys", "settings", "alerts", "onboarding"];
export function familySeats(plan: string, extra = 0) {
  return plan === "family-pro"
    ? { pro: 10 + extra, total: 20 + extra }
    : { pro: 5, total: 10 };
}
export const extraSeatPrice = 256;
