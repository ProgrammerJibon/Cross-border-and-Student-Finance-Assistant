import "server-only";
import { z } from "zod";
import { rows, type DB } from "@/lib/db";
export const defaultRiskPolicy = {
  dailyCad: 15000,
  monthlyCad: 50000,
  frequency: 10,
  largeCad: 5000,
};
export const riskPolicySchema = z
  .object({
    dailyCad: z.coerce.number().positive().max(1e9),
    monthlyCad: z.coerce.number().positive().max(1e9),
    frequency: z.coerce.number().int().min(1).max(1000),
    largeCad: z.coerce.number().positive().max(1e9),
  })
  .refine((v) => v.monthlyCad >= v.dailyCad);
export async function getRiskPolicy(db?: DB) {
  const [r] = await rows<{ value: string }>(
    "SELECT value FROM admin_settings WHERE name='risk'",
    [],
    db,
  );
  try {
    return riskPolicySchema.parse(r ? JSON.parse(r.value) : defaultRiskPolicy);
  } catch {
    return defaultRiskPolicy;
  }
}
export const creditKeys = [
  "creditReminders",
  "creditUtilization",
  "creditHistory",
  "creditReport",
] as const;
export async function getCreditGuidance(userId: string) {
  const [r] = await rows<{ value: string }>(
    "SELECT value FROM admin_settings WHERE name='creditGuidance'",
  );
  const [p] = await rows<{ country_code: string }>(
    "SELECT country_code FROM user_preferences WHERE user_id=?",
    [userId],
  );
  try {
    const settings = JSON.parse(r?.value || "{}");
    return z
      .array(z.enum(creditKeys))
      .min(1)
      .parse(settings[p?.country_code] || settings.default || creditKeys);
  } catch {
    return [...creditKeys];
  }
}
