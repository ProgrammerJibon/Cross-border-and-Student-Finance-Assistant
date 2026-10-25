export type Role = "STUDENT" | "PARENT" | "ADMIN" | "MODERATOR";
export type Row = { [key: string]: string | number | null };
export type Result<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code: string; fieldErrors?: Record<string, string> };
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  language: string;
  theme: string;
  preferred_currency: string;
  timezone: string;
  onboarded: number;
  is_demo: number;
  session_version: number;
  notifications: number;
  auto_alerts: number;
  avatar: string | null;
  admin_permissions: string | null;
  country_code: string;
  ai_model_id: string | null;
  plan_id?: string;
  must_rotate_password?: number;
  mfa_enabled?: number;
};
export type Feature =
  | "AGENT_MESSAGES"
  | "ACCOUNTS"
  | "CSV_IMPORTS"
  | "TRANSFER_SIMULATIONS"
  | "TUITION_PLANS"
  | "PARENT_LINKS"
  | "BENEFICIARIES"
  | "BUDGETS";
