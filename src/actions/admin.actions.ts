"use server";
import {
  riskPolicySchema,
  creditKeys,
} from "@/services/financial-config.service";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { id, nonnegative, currency } from "@/lib/validation";
import { audit, notify } from "@/lib/audit";
import { getRates, inCurrency } from "@/services/currency.service";
import { D } from "@/lib/money";
import { validCurrency } from "@/lib/catalog";
export async function manageUser(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("users");
    const v = z
      .object({
        id,
        status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
        role: z.enum(["STUDENT", "PARENT", "ADMIN"]).optional(),
        reset: z.boolean().optional(),
      })
      .parse(input);
    requireCondition(!v.role || u.role === "ADMIN", "FORBIDDEN");
    requireCondition(v.id !== u.id, "FORBIDDEN");
    await atomic(async (db) => {
      const [target] = await rows<{ role: string }>(
        "SELECT role FROM users WHERE id=? FOR UPDATE",
        [v.id],
        db,
      );
      requireCondition(target, "NOT_FOUND");
      requireCondition(
        target.role !== "ADMIN" &&
          (target.role !== "MODERATOR" || u.role === "ADMIN"),
        "FORBIDDEN",
      );
      if (v.status)
        await write(
          "UPDATE users SET status=?,session_version=session_version+1 WHERE id=?",
          [v.status, v.id],
          db,
        );
      if (v.role) {
        const linked = await rows(
          "SELECT id FROM family_links WHERE (student_id=? OR parent_id=?) AND status<>'REVOKED'",
          [v.id, v.id],
          db,
        );
        requireCondition(!linked.length, "ROLE_LINKED");
        await write(
          "UPDATE users SET role=?,session_version=session_version+1 WHERE id=?",
          [v.role, v.id],
          db,
        );
        if (v.role === "STUDENT")
          await write(
            "INSERT IGNORE INTO student_profiles(user_id) VALUES (?)",
            [v.id],
            db,
          );
      }
      if (v.reset)
        await write("DELETE FROM usage_counters WHERE user_id=?", [v.id], db);
      await audit(u.id, "ADMIN_USER_UPDATED", "users", v.id, v, db);
    });
    return null;
  });
}
export async function savePlan(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("plans");
    const v = z
      .object({
        id,
        name: z.string().min(2).max(40),
        description_key: z.string().max(80),
        monthly: nonnegative,
        yearly: nonnegative,
        currency,
        trial_days: z.number().int().min(0).max(365),
        active: z.boolean(),
        recommended: z.boolean(),
        display_order: z.number().int().min(0).max(100),
        limits: z.object({
          ACCOUNTS: z.number().int().min(1),
          AGENT_MESSAGES: z.number().int().min(0),
          TRANSFER_SIMULATIONS: z.number().int().min(0),
          TUITION_PLANS: z.number().int().min(0),
          CSV_IMPORTS: z.number().int().min(0),
          PARENT_LINKS: z.number().int().min(0),
        }),
      })
      .parse(input);
    await atomic(async (db) => {
      await write(
        "INSERT INTO plans(id,name,description_key,trial_days,limits,recommended,active,display_order) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),description_key=VALUES(description_key),trial_days=VALUES(trial_days),limits=VALUES(limits),recommended=VALUES(recommended),active=VALUES(active),display_order=VALUES(display_order)",
        [
          v.id,
          v.name,
          v.description_key,
          v.trial_days,
          JSON.stringify(v.limits),
          v.recommended,
          v.active,
          v.display_order,
        ],
        db,
      );
      await write(
        "INSERT INTO plan_prices(plan_id,monthly,yearly,currency) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE monthly=VALUES(monthly),yearly=VALUES(yearly),currency=VALUES(currency)",
        [v.id, v.monthly, v.yearly, v.currency],
        db,
      );
      await audit(
        u.id,
        "ADMIN_PLAN_UPDATED",
        "plans",
        v.id,
        { monthly: v.monthly },
        db,
      );
    });
    return null;
  });
}
export async function resolveReport(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("reports");
    const v = z
      .object({
        id,
        status: z.enum(["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"]),
        resolution: z.string().max(1000),
        internal_note: z.string().max(1000),
      })
      .parse(input);
    await atomic(async (db) => {
      const [r] = await rows<{ user_id: string }>(
        "SELECT user_id FROM reports WHERE id=? FOR UPDATE",
        [v.id],
        db,
      );
      requireCondition(r, "NOT_FOUND");
      await write(
        "UPDATE reports SET status=?,resolution=?,internal_note=?,assigned_to=? WHERE id=?",
        [v.status, v.resolution, v.internal_note, u.id, v.id],
        db,
      );
      await notify(r.user_id, "REPORT_UPDATED", v.id, db);
      await audit(
        u.id,
        "REPORT_UPDATED",
        "reports",
        v.id,
        { status: v.status },
        db,
      );
    });
    return null;
  });
}
export async function saveProvider(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("finance");
    const v = z
      .object({
        id,
        name: z.string().min(2).max(100),
        base_fee: nonnegative,
        percentage_fee: z.coerce.number().min(0).max(0.25),
        spread: z.coerce.number().min(0).max(0.25),
        minimum: nonnegative,
        maximum: nonnegative,
        eta_days: z.coerce.number().int().min(0).max(30),
        reliability: z.coerce.number().int().min(0).max(100),
        active: z.boolean(),
      })
      .refine((v) => Number(v.maximum) >= Number(v.minimum))
      .parse(input);
    await atomic(async (db) => {
      const [existing] = await rows(
        "SELECT id FROM remittance_providers WHERE id=? FOR UPDATE",
        [v.id],
        db,
      );
      const rates = await getRates(db);
      await write(
        "INSERT INTO remittance_providers(id,name,base_fee,percentage_fee,spread,minimum,maximum,eta_days,reliability,active) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),base_fee=VALUES(base_fee),percentage_fee=VALUES(percentage_fee),spread=VALUES(spread),minimum=VALUES(minimum),maximum=VALUES(maximum),eta_days=VALUES(eta_days),reliability=VALUES(reliability),active=VALUES(active)",
        [
          v.id,
          v.name,
          v.base_fee,
          v.percentage_fee,
          v.spread,
          inCurrency(v.minimum, "CNY", "CAD", rates),
          inCurrency(v.maximum, "CNY", "CAD", rates),
          v.eta_days,
          v.reliability,
          v.active,
        ],
        db,
      );
      if (!existing)
        await write(
          "INSERT IGNORE INTO remittance_corridors SELECT CONCAT(?,'-',s.code,'-',t.code),?,s.code,t.code FROM currencies s CROSS JOIN currencies t WHERE s.code<>t.code",
          [v.id, v.id],
          db,
        );
      await audit(
        u.id,
        "PROVIDER_UPDATED",
        "remittance_providers",
        v.id,
        {},
        db,
      );
    });
    return null;
  });
}
export async function saveRate(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("finance");
    const v = z
      .object({
        currency,
        rate: z
          .string()
          .regex(/^\d{1,10}(\.\d{1,8})?$/)
          .refine((v) => Number(v) > 0),
      })
      .parse(input);
    await validCurrency(v.currency);
    const rates = await getRates();
    requireCondition(
      v.currency !== "CNY" || D(v.rate).eq(1),
      "VALIDATION_ERROR",
    );
    const normalized = D(v.rate).mul(rates.CNY).toFixed(8);
    requireCondition(
      v.currency !== "CAD" || D(normalized).eq(1),
      "VALIDATION_ERROR",
    );
    await write("INSERT INTO fx_rates(id,currency,rate) VALUES (?,?,?)", [
      randomUUID(),
      v.currency,
      normalized,
    ]);
    await audit(u.id, "FX_UPDATED", "fx_rates", v.currency);
    return null;
  });
}

export async function saveFinancialPolicy(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("finance");
    const v = z
      .object({
        dailyRmb: nonnegative,
        monthlyRmb: nonnegative,
        largeRmb: nonnegative,
        frequency: z.coerce.number().int().min(1).max(1000),
      })
      .parse(input);
    const rates = await getRates();
    const policy = riskPolicySchema.parse({
      dailyCad: inCurrency(v.dailyRmb, "CNY", "CAD", rates),
      monthlyCad: inCurrency(v.monthlyRmb, "CNY", "CAD", rates),
      largeCad: inCurrency(v.largeRmb, "CNY", "CAD", rates),
      frequency: v.frequency,
    });
    await atomic(async (db) => {
      await write(
        "INSERT INTO admin_settings (name,value) VALUES ('risk',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
        [JSON.stringify(policy)],
        db,
      );
      await audit(
        u.id,
        "RISK_POLICY_UPDATED",
        "admin_settings",
        "risk",
        policy,
        db,
      );
    });
    return null;
  });
}
export async function saveCorridor(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("finance");
    const v = z
      .object({
        provider_id: z.string().min(1).max(64),
        source_currency: currency,
        target_currency: currency,
        remove: z.boolean().default(false),
      })
      .refine((v) => v.source_currency !== v.target_currency)
      .parse(input);
    await validCurrency(v.source_currency);
    await validCurrency(v.target_currency);
    await atomic(async (db) => {
      requireCondition(
        (
          await rows(
            "SELECT id FROM remittance_providers WHERE id=?",
            [v.provider_id],
            db,
          )
        ).length,
        "NOT_FOUND",
      );
      if (v.remove)
        await write(
          "DELETE FROM remittance_corridors WHERE provider_id=? AND source_currency=? AND target_currency=?",
          [v.provider_id, v.source_currency, v.target_currency],
          db,
        );
      else
        await write(
          "INSERT IGNORE INTO remittance_corridors(id,provider_id,source_currency,target_currency) VALUES (?,?,?,?)",
          [randomUUID(), v.provider_id, v.source_currency, v.target_currency],
          db,
        );
      await audit(
        u.id,
        "CORRIDOR_UPDATED",
        "remittance_providers",
        v.provider_id,
        v,
        db,
      );
    });
    return null;
  });
}
export async function saveCreditGuidance(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("finance");
    const v = z
      .object({
        country: z.string().regex(/^(default|[A-Z]{2})$/),
        tasks: z.array(z.enum(creditKeys)).min(1).max(4),
      })
      .parse(input);
    if (v.country !== "default")
      requireCondition(
        (await rows("SELECT code FROM countries WHERE code=?", [v.country]))
          .length,
        "NOT_FOUND",
      );
    await atomic(async (db) => {
      const [r] = await rows<{ value: string }>(
        "SELECT value FROM admin_settings WHERE name='creditGuidance' FOR UPDATE",
        [],
        db,
      );
      const settings = JSON.parse(r?.value || "{}");
      settings[v.country] = v.tasks;
      await write(
        "INSERT INTO admin_settings (name,value) VALUES ('creditGuidance',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
        [JSON.stringify(settings)],
        db,
      );
      await audit(
        u.id,
        "CREDIT_GUIDANCE_UPDATED",
        "admin_settings",
        "creditGuidance",
        v,
        db,
      );
    });
    return null;
  });
}
