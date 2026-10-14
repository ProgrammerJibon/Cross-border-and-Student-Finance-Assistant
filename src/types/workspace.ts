import type { getDashboardData } from "@/actions/dashboard.actions";
export type Workspace = Extract<
  Awaited<ReturnType<typeof getDashboardData>>,
  { success: true }
>["data"];
