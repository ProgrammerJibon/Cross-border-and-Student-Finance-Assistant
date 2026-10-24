"use server";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireUser, requireLiveAdmin } from "@/lib/auth";
import { rows, write, atomic } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { avatarSchema } from "@/lib/avatar";
import { adminSections } from "@/lib/admin-permissions";
import { encryptSecret, decryptSecret } from "@/lib/secrets";
import { validCurrency } from "@/lib/catalog";
import { getRates } from "@/services/currency.service";
import { D } from "@/lib/money";
import {
  providerCompany,
  priceSchema,
  validateBaseUrl,
  type ProviderCompany,
} from "@/ai/provider-config";
import { recordProviderUsage } from "@/ai/usage";
const url = z
  .string()
  .max(300)
  .refine((v) => !v || /^https:\/\//.test(v));
export async function saveCurrency(input: unknown) {
  return action(async () => {
    const u = await requireLiveAdmin("catalog");
    const v = z
      .object({
        code: z.string().regex(/^[A-Z]{3}$/),
        name: z.string().min(2).max(80),
        symbol: z.string().min(1).max(10),
        rate: z
          .string()
          .regex(/^\d{1,10}(\.\d{1,8})?$/)
          .refine((v) => D(v).gt(0)),
        active: z.boolean(),
      })
      .parse(input);
    const rates = await getRates();
    requireCondition(
      !["CNY", "BDT", "CAD"].includes(v.code) || v.active,
      "VALIDATION_ERROR",
    );
    requireCondition(v.code !== "CNY" || D(v.rate).eq(1), "VALIDATION_ERROR");
    if (!v.active)
      requireCondition(
        !(
          await rows(
            "SELECT code FROM countries WHERE currency_code=? AND active=1",
            [v.code],
          )
        ).length,
        "VALIDATION_ERROR",
      );
    await atomic(async (db) => {
      await write(
        "INSERT INTO currencies(code,name,symbol,active) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),symbol=VALUES(symbol),active=VALUES(active)",
        [v.code, v.name, v.symbol, v.active],
        db,
      );
      if (v.code !== "CAD")
        await write(
          "INSERT INTO fx_rates(id,currency,rate) VALUES (?,?,?)",
          [randomUUID(), v.code, D(v.rate).mul(rates.CNY).toFixed(8)],
          db,
        );
      await audit(u.id, "CURRENCY_UPDATED", "currencies", v.code, {}, db);
    });
    return null;
  });
}
export async function saveCountry(input: unknown) {
  return action(async () => {
    const u = await requireLiveAdmin("catalog");
    const v = z
      .object({
        code: z.string().regex(/^[A-Z]{2}$/),
        name: z.string().min(2).max(100),
        currency_code: z.string().length(3),
        active: z.boolean(),
      })
      .parse(input);
    await validCurrency(v.currency_code);
    await write(
      "INSERT INTO countries(code,name,currency_code,active) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),currency_code=VALUES(currency_code),active=VALUES(active)",
      [v.code, v.name, v.currency_code, v.active],
    );
    await audit(u.id, "COUNTRY_UPDATED", "countries", v.code);
    return null;
  });
}
export async function saveAiModel(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        id: z.string().max(64).optional(),
        shared: z.boolean().default(false),
        company: providerCompany,
        label: z.string().min(2).max(100),
        model: z.string().regex(/^[a-zA-Z0-9._:/-]{1,100}$/),
        key: z.string().trim().max(500).optional(),
        base_url: z.string().max(300).optional(),
        input_price: priceSchema,
        output_price: priceSchema,
        active: z.boolean(),
      })
      .parse(input);
    if (v.shared) await requireLiveAdmin("models");
    let baseUrl: string | null = null;
    if (v.company === "COMPATIBLE") {
      try {
        baseUrl = validateBaseUrl(v.base_url || "");
      } catch {
        requireCondition(false, "AI_ENDPOINT_NOT_ALLOWED");
      }
    }
    const owner = v.shared ? null : u.id;
    const key = v.id || randomUUID();
    await atomic(async (db) => {
      const [old] = v.id
        ? await rows<{ id: string }>(
            "SELECT id FROM ai_models WHERE id=? AND owner_id <=> ? FOR UPDATE",
            [v.id, owner],
            db,
          )
        : [];
      requireCondition(!v.id || old, "NOT_FOUND");
      requireCondition(
        old || (v.key && v.key.length >= 10),
        "VALIDATION_ERROR",
      );
      if (old) {
        await write(
          "UPDATE ai_models SET company=?,label=?,model=?,active=?,base_url=?,input_price=?,output_price=? WHERE id=?",
          [
            v.company,
            v.label,
            v.model,
            v.active,
            baseUrl,
            v.input_price,
            v.output_price,
            key,
          ],
          db,
        );
        if (v.key) {
          requireCondition(v.key.length >= 10, "VALIDATION_ERROR");
          await write(
            "UPDATE ai_models SET key_cipher=?,key_last_four=? WHERE id=?",
            [encryptSecret(v.key), v.key.slice(-4), key],
            db,
          );
        }
      } else
        await write(
          "INSERT INTO ai_models(id,owner_id,company,label,model,key_cipher,key_last_four,active,base_url,input_price,output_price) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [
            key,
            owner,
            v.company,
            v.label,
            v.model,
            encryptSecret(v.key!),
            v.key!.slice(-4),
            v.active,
            baseUrl,
            v.input_price,
            v.output_price,
          ],
          db,
        );
      await audit(
        u.id,
        "AI_MODEL_SAVED",
        "ai_models",
        key,
        { company: v.company, model: v.model },
        db,
      );
    });
    return null;
  });
}
export async function deleteAiModel(id: string, shared = false) {
  return action(async () => {
    const u = await requireUser();
    z.string().max(64).parse(id);
    if (shared) await requireLiveAdmin("models");
    await atomic(async (db) => {
      const r = await write(
        "DELETE FROM ai_models WHERE id=? AND owner_id <=> ?",
        [id, shared ? null : u.id],
        db,
      );
      requireCondition(r.affectedRows, "NOT_FOUND");
      await write(
        "UPDATE user_preferences SET ai_model_id=NULL WHERE ai_model_id=?",
        [id],
        db,
      );
      await audit(u.id, "AI_MODEL_REMOVED", "ai_models", id, {}, db);
    });
    return null;
  });
}
export async function selectAiModel(id: string) {
  return action(async () => {
    const u = await requireUser();
    z.string().max(64).parse(id);
    if (id && id !== "mock" && u.plan_id === "student-free")
      requireCondition((await rows("SELECT id FROM ai_models WHERE id=? AND owner_id=?",[id,u.id])).length, "SHARED_AI_REQUIRES_PRO");
    if (id && id !== "mock")
      requireCondition(
        (
          await rows(
            "SELECT id FROM ai_models WHERE id=? AND active=1 AND (owner_id=? OR owner_id IS NULL)",
            [id, u.id],
          )
        ).length,
        "NOT_FOUND",
      );
    await write("UPDATE user_preferences SET ai_model_id=? WHERE user_id=?", [
      !id || id === "mock" ? null : id,
      u.id,
    ]);
    return null;
  });
}
export async function manageSavedCard(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    requireCondition(u.is_demo, "LIVE_RAIL_UNAVAILABLE");
    const v = z
      .object({
        id: z.string().max(64),
        remove: z.boolean().default(false),
        label: z.string().min(1).max(80).optional(),
      })
      .parse(input);
    const r = v.remove
      ? await write("DELETE FROM saved_cards WHERE id=? AND user_id=?", [
          v.id,
          u.id,
        ])
      : await write("UPDATE saved_cards SET label=? WHERE id=? AND user_id=?", [
          v.label || "Demo card",
          v.id,
          u.id,
        ]);
    requireCondition(r.affectedRows, "NOT_FOUND");
    return null;
  });
}
export async function publicTeam() {
  return action(() =>
    rows(
      "SELECT u.name,u.email,u.avatar,t.department,t.designation,t.phone,t.portfolio,t.is_ceo FROM team_members t JOIN users u ON u.id=t.user_id WHERE t.published=1 AND u.status='ACTIVE' ORDER BY t.is_ceo DESC,t.display_order,u.name",
    ),
  );
}
export async function saveTeamMember(input: unknown) {
  return action(async () => {
    const admin = await requireUser("ADMIN");
    const v = z
      .object({
        id: z.string().max(64).optional(),
        name: z.string().min(2).max(160),
        email: z.email().max(190),
        avatar: avatarSchema,
        password: z.string().max(72).optional(),
        department: z.string().min(1).max(100),
        designation: z.string().min(1).max(100),
        phone: z.string().max(40),
        portfolio: url,
        is_ceo: z.boolean(),
        published: z.boolean(),
        active: z.boolean(),
        permissions: z.array(z.enum(adminSections)),
        display_order: z.coerce.number().int().min(0).max(999),
      })
      .parse(input);
    const id = v.id || randomUUID();
    requireCondition(id !== admin.id, "FORBIDDEN");
    const hash = v.password
      ? await bcrypt.hash(z.string().min(10).parse(v.password), 12)
      : null;
    requireCondition(v.id || hash, "VALIDATION_ERROR");
    await atomic(async (db) => {
      if (v.id) {
        const [target] = await rows(
          "SELECT id FROM users WHERE id=? AND role='MODERATOR' FOR UPDATE",
          [id],
          db,
        );
        requireCondition(target, "NOT_FOUND");
        await write(
          "UPDATE users SET name=?,email=?,avatar=?,admin_permissions=?,status=?,session_version=session_version+1 WHERE id=?",
          [
            v.name,
            v.email.toLowerCase(),
            v.avatar,
            JSON.stringify(v.permissions),
            v.active ? "ACTIVE" : "SUSPENDED",
            id,
          ],
          db,
        );
        if (hash)
          await write(
            "UPDATE users SET password_hash=? WHERE id=?",
            [hash, id],
            db,
          );
      } else {
        await write(
          "INSERT INTO users(id,name,email,password_hash,role,avatar,admin_permissions,status,onboarded) VALUES (?,?,?,?,'MODERATOR',?,?,?,1)",
          [
            id,
            v.name,
            v.email.toLowerCase(),
            hash,
            v.avatar,
            JSON.stringify(v.permissions),
            v.active ? "ACTIVE" : "SUSPENDED",
          ],
          db,
        );
        await write(
          "INSERT INTO user_preferences(user_id) VALUES (?)",
          [id],
          db,
        );
      }
      await write(
        "INSERT INTO team_members(user_id,department,designation,phone,portfolio,is_ceo,published,display_order) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE department=VALUES(department),designation=VALUES(designation),phone=VALUES(phone),portfolio=VALUES(portfolio),is_ceo=VALUES(is_ceo),published=VALUES(published),display_order=VALUES(display_order)",
        [
          id,
          v.department,
          v.designation,
          v.phone,
          v.portfolio,
          v.is_ceo,
          v.published,
          v.display_order,
        ],
        db,
      );
      await audit(
        admin.id,
        "TEAM_UPDATED",
        "users",
        id,
        { permissions: v.permissions },
        db,
      );
    });
    return null;
  });
}
export async function updateOwnIdentity(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        email: z.email().max(190),
        avatar: avatarSchema,
        portfolio: url,
      })
      .parse(input);
    await atomic(async (db) => {
      await write(
        "UPDATE users SET email=?,avatar=? WHERE id=?",
        [v.email.toLowerCase(), v.avatar, u.id],
        db,
      );
      await write(
        "UPDATE team_members SET portfolio=? WHERE user_id=?",
        [v.portfolio, u.id],
        db,
      );
      await audit(u.id, "PROFILE_UPDATED", "users", u.id, {}, db);
    });
    return null;
  });
}

export async function testAiModel(id: string, shared = false) {
  return action(async () => {
    const u = await requireUser();
    z.string().min(1).max(64).parse(id);
    if (shared) await requireLiveAdmin("models");
    let model:
      | {
          company: ProviderCompany;
          model: string;
          key_cipher: string;
          base_url: string | null;
          input_price: string | null;
          output_price: string | null;
        }
      | undefined;
    try {
      const list = await rows<{
        company: ProviderCompany;
        model: string;
        key_cipher: string;
        base_url: string | null;
        input_price: string | null;
        output_price: string | null;
      }>(
        "SELECT company,model,key_cipher,base_url,input_price,output_price FROM ai_models WHERE id=? AND owner_id <=> ?",
        [id, shared ? null : u.id],
      );
      model = list[0];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("base_url")) {
        const list = await rows<{
          company: ProviderCompany;
          model: string;
          key_cipher: string;
          base_url: string | null;
          input_price: string | null;
          output_price: string | null;
        }>(
          "SELECT company,model,key_cipher,NULL AS base_url,NULL AS input_price,NULL AS output_price FROM ai_models WHERE id=? AND owner_id <=> ?",
          [id, shared ? null : u.id],
        );
        model = list[0];
      } else {
        throw err;
      }
    }
    requireCondition(model, "NOT_FOUND");
    const { testModelConnection } = await import("@/ai/provider-health");
    const result = await testModelConnection({
      ...model,
      key: decryptSecret(model.key_cipher),
      onUsage: (usage) => recordProviderUsage(u.id, null, id, usage),
    });
    await audit(u.id, "AI_MODEL_TESTED", "ai_models", id, {
      model: model.model,
      connected: true,
    });
    return result;
  });
}
