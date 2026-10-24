import "server-only";
import { rows, type DB } from "./db";
import { requireCondition } from "./errors";

export type FinancialEnvironment = "DEMO" | "LIVE";
export async function financialIdentity(userId: string, db?: DB) {
  const [user] = await rows<{ id: string; is_demo: number; status: string; role: string }>(
    "SELECT id,is_demo,status,role FROM users WHERE id=?", [userId], db,
  );
  requireCondition(user?.status === "ACTIVE", "UNAUTHORIZED");
  return { ...user, environment: (user.is_demo ? "DEMO" : "LIVE") as FinancialEnvironment };
}
export async function requireDemoFinance(userId: string, db?: DB) {
  const user = await financialIdentity(userId, db);
  requireCondition(user.environment === "DEMO", "LIVE_RAIL_UNAVAILABLE");
  return user;
}
export async function requireSameEnvironment(actorId: string, targetId: string, db?: DB) {
  const actor = await financialIdentity(actorId, db);
  const target = await financialIdentity(targetId, db);
  requireCondition(actor.environment === target.environment, "ENVIRONMENT_MISMATCH");
  return target;
}
export async function checkoutEnvironment(userId: string, requested?: string, db?: DB): Promise<"sandbox" | "live"> {
  const user = await financialIdentity(userId, db);
  const environment = user.is_demo ? "sandbox" : "live";
  requireCondition(!requested || requested === environment, "ENVIRONMENT_MISMATCH");
  return environment;
}
export async function requireCheckoutEnvironment(c: { user_id: string; environment?: string }, db?: DB) {
  requireCondition(c.environment === "sandbox" || c.environment === "live", "ENVIRONMENT_MISMATCH");
  return checkoutEnvironment(c.user_id, c.environment, db);
}
