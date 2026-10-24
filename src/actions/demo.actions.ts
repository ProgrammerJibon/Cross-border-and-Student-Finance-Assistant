"use server";
import { z } from "zod";
import { rows } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { requireUser } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { resetDemoData, checkAndAutoResetDemo } from "@/services/demo-reset.service";
import type { User } from "@/types";
import { simulateDemoSubscription } from "@/services/demo-subscription.service";
export async function simulateSubscription(input: unknown) {
  return action(async()=>simulateDemoSubscription((await requireUser()).id,input));
}

export async function demoProfiles() {
  return action(async () => {
    requireCondition(process.env.DEMO_MODE === "true", "FORBIDDEN");
    await checkAndAutoResetDemo();
    return rows(
      `SELECT u.id, u.name, u.role, s.plan_id, p.name AS plan
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN plans p ON p.id = s.plan_id
       WHERE u.is_demo = 1 AND u.id IN ('demo-student-free', 'demo-student', 'demo-parent', 'demo-parent-pro', 'demo-admin')
       ORDER BY FIELD(u.id, 'demo-student-free', 'demo-student', 'demo-parent', 'demo-parent-pro', 'demo-admin')`
    );
  });
}

export async function enterDemo(id: unknown) {
  return action(async () => {
    requireCondition(process.env.DEMO_MODE === "true", "FORBIDDEN");
    const [u] = await rows<User>(
      "SELECT u.*,p.language FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=? AND u.is_demo=1 AND u.status='ACTIVE'",
      [z.string().max(64).parse(id)],
    );
    requireCondition(u, "NOT_FOUND");
    await createSession(u);
    return { role: u.role, locale: u.language, onboarded: u.onboarded };
  });
}

export async function resetDemoUsers() {
  return action(async () => {
    const u = await requireUser();
    requireCondition(!!u.is_demo || u.role === "ADMIN", "FORBIDDEN");
    return resetDemoData(u.id);
  });
}
