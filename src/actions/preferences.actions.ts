"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/auth";
import { write } from "@/lib/db";
import { action } from "@/lib/errors";
import { validCountry, validCurrency } from "@/lib/catalog";
export async function updatePreferences(input: unknown) {
  return action(async () => {
    const v = z
      .object({
        language: z.enum(["en", "zh-CN", "bn-BD"]).optional(),
        theme: z.enum(["light", "dark"]).optional(),
        preferred_currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        country_code: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        timezone: z
          .string()
          .max(80)
          .refine((t) => {
            try {
              new Intl.DateTimeFormat("en", { timeZone: t });
              return true;
            } catch {
              return false;
            }
          })
          .optional(),
        notifications: z.boolean().optional(),
        auto_alerts: z.boolean().optional(),
      })
      .parse(input);
    const u = await currentUser();
    if (v.preferred_currency) await validCurrency(v.preferred_currency);
    if (v.country_code) await validCountry(v.country_code);
    for (const [k, value] of Object.entries(v)) {
      if (u)
        await write(`UPDATE user_preferences SET ${k}=? WHERE user_id=?`, [
          value,
          u.id,
        ]);
      if (k === "language" || k === "theme")
        (await cookies()).set(k, String(value), {
          path: "/",
          sameSite: "lax",
          maxAge: 31536000,
        });
    }
    return v;
  });
}
