"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { createSession, clearSession } from "@/lib/session";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { User, Role } from "@/types";
import { avatarSchema } from "@/lib/avatar";
import { validCurrency, validCountry } from "@/lib/catalog";
const credentials = z.object({
  email: z
    .email()
    .max(190)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(72),
});
async function throttle(identifier: string) {
  await atomic(async (db) => {
    await write(
      "INSERT INTO auth_attempts(identifier,attempts,window_start) VALUES (?,1,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE attempts=IF(window_start<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),1,attempts+1),window_start=IF(window_start<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),UTC_TIMESTAMP(),window_start)",
      [identifier],
      db,
    );
  });
  const [r] = await rows<{ attempts: number }>(
    "SELECT attempts FROM auth_attempts WHERE identifier=?",
    [identifier],
  );
  requireCondition(r.attempts <= 12, "RATE_LIMITED");
}
export async function login(input: unknown) {
  return action(async () => {
    const v = credentials.parse(input);
    await throttle(v.email);
    const [u] = await rows<User & { password_hash: string; status: string }>(
      "SELECT u.*,p.language FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE email=?",
      [v.email],
    );
    const valid = await bcrypt.compare(
      v.password,
      u?.password_hash ||
        "$2b$12$0TwWKHGgJKsbbNpxCA5BMumLCGdcvl.FF5znrLhnl9vIKhgLXKoR2",
    );
    requireCondition(
      u && valid && u.status === "ACTIVE",
      "INVALID_CREDENTIALS",
    );
    await createSession(u);
    await audit(u.id, "LOGIN", "users", u.id);
    return { role: u.role, locale: u.language, onboarded: u.onboarded };
  });
}
export async function register(input: unknown) {
  return action(async () => {
    const v = credentials
      .extend({
        name: z.string().trim().min(2).max(160),
        confirm: z.string(),
        role: z.enum(["STUDENT", "PARENT"]),
        locale: z.enum(["en", "zh-CN", "bn-BD"]),
        theme: z.enum(["light", "dark"]),
        country_code: z.string().length(2),
        preferred_currency: z.string().length(3),
        avatar: avatarSchema,
      })
      .refine((v) => v.password === v.confirm)
      .parse(input);
    await throttle(v.email);
    await validCountry(v.country_code);
    await validCurrency(v.preferred_currency);
    const userId = randomUUID();
    const hash = await bcrypt.hash(v.password, 12);
    await atomic(async (db) => {
      requireCondition(
        !(await rows("SELECT id FROM users WHERE email=?", [v.email], db))
          .length,
        "EMAIL_EXISTS",
      );
      await write(
        "INSERT INTO users(id,name,email,password_hash,role,avatar) VALUES (?,?,?,?,?,?)",
        [userId, v.name, v.email, hash, v.role, v.avatar],
        db,
      );
      await write(
        "INSERT INTO user_preferences(user_id,language,theme,country_code,preferred_currency) VALUES (?,?,?,?,?)",
        [userId, v.locale, v.theme, v.country_code, v.preferred_currency],
        db,
      );
      if (v.role === "STUDENT")
        await write(
          "INSERT INTO student_profiles(user_id) VALUES (?)",
          [userId],
          db,
        );
      await write(
        "INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) SELECT ?,?,id,UTC_TIMESTAMP(),IF(id='student-free','2099-12-31',UTC_TIMESTAMP()) FROM plans WHERE id=?",
        [
          randomUUID(),
          userId,
          v.role === "STUDENT" ? "student-free" : "family",
        ],
        db,
      );
      await audit(userId, "REGISTER", "users", userId, {}, db);
    });
    await createSession({ id: userId, session_version: 1 });
    return { role: v.role, locale: v.locale, onboarded: 0 };
  });
}
export async function logout() {
  return action(async () => {
    const u = await requireUser();
    await write(
      "UPDATE users SET session_version=session_version+1 WHERE id=?",
      [u.id],
    );
    await audit(u.id, "LOGOUT", "users", u.id);
    await clearSession();
    return null;
  });
}
export async function demoLogin(
  role: Role,
  studentPlan: "free" | "premium" = "free",
) {
  return action(async () => {
    requireCondition(process.env.DEMO_MODE === "true", "FORBIDDEN");
    z.enum(["STUDENT", "PARENT", "ADMIN"]).parse(role);
    z.enum(["free", "premium"]).parse(studentPlan);
    const [u] = await rows<User>(
      "SELECT u.*,p.language FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.role=? AND u.is_demo=1 AND u.status='ACTIVE' AND (?<>'STUDENT' OR u.id=?) ORDER BY u.id LIMIT 1",
      [
        role,
        role,
        studentPlan === "free" ? "demo-student-free" : "demo-student",
      ],
    );
    requireCondition(u, "NOT_FOUND");
    if (role === "STUDENT")
      await write(
        "INSERT INTO subscriptions(id,user_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'ACTIVE',UTC_TIMESTAMP(),'2099-12-31') ON DUPLICATE KEY UPDATE plan_id=VALUES(plan_id),status='ACTIVE',ends_at=VALUES(ends_at)",
        [randomUUID(), u.id, studentPlan === "free" ? "student-free" : "student"],
      );
    await createSession(u);
    await audit(u.id, "DEMO_LOGIN", "users", u.id);
    return { role: u.role, locale: u.language, onboarded: u.onboarded };
  });
}
export async function changePassword(input: unknown) {
  return action(async () => {
    const u = await requireUser();
    const v = z
      .object({
        current: z.string().max(72),
        password: z.string().min(10).max(72),
        confirm: z.string(),
      })
      .refine((v) => v.password === v.confirm)
      .parse(input);
    const [r] = await rows<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=?",
      [u.id],
    );
    requireCondition(
      await bcrypt.compare(v.current, r.password_hash),
      "INVALID_CREDENTIALS",
    );
    await write(
      "UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?",
      [await bcrypt.hash(v.password, 12), u.id],
    );
    await audit(u.id, "PASSWORD_CHANGE", "users", u.id);
    await clearSession();
    return null;
  });
}
export async function forgotPassword(input: unknown) {
  return action(async () => {
    const email = z.email().max(190).parse(input).toLowerCase();
    await throttle(email);
    const [u] = await rows<User>("SELECT id,is_demo FROM users WHERE email=?", [
      email,
    ]);
    if (!u || !u.is_demo || process.env.DEMO_MODE !== "true")
      return { token: null };
    const token = randomBytes(32).toString("hex");
    await write(
      "INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))",
      [randomUUID(), u.id, createHash("sha256").update(token).digest("hex")],
    );
    return { token };
  });
}
export async function resetPassword(input: unknown) {
  return action(async () => {
    const v = z
      .object({
        token: z.string().length(64),
        password: z.string().min(10).max(72),
      })
      .parse(input);
    const hash = await bcrypt.hash(v.password, 12);
    await atomic(async (db) => {
      const [r] = await rows<{ id: string; user_id: string }>(
        "SELECT id,user_id FROM password_resets WHERE token_hash=? AND consumed=0 AND expires_at>UTC_TIMESTAMP() FOR UPDATE",
        [createHash("sha256").update(v.token).digest("hex")],
        db,
      );
      requireCondition(r, "INVALID_TOKEN");
      await write(
        "UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?",
        [hash, r.user_id],
        db,
      );
      await write(
        "UPDATE password_resets SET consumed=1 WHERE user_id=?",
        [r.user_id],
        db,
      );
      await audit(r.user_id, "PASSWORD_RESET", "users", r.user_id, {}, db);
    });
    return null;
  });
}
