import { familyPlans, freePages } from "@/lib/plan-policy";
import { redirect, notFound } from "next/navigation";
import { effectiveSubscription } from "@/lib/entitlements";
import { currentUser } from "@/lib/auth";
import { canOpen } from "@/lib/permissions";
import { getDashboardData, publicPlans } from "@/actions/dashboard.actions";
import { PublicPage } from "@/components/layout/public-pages";
import { AuthPage, OnboardingPage } from "@/components/forms/auth-pages";
import { Overview } from "@/components/dashboard/overview";
import { MoneyPage } from "@/components/accounts/money-page";
import { TransactionsPage } from "@/components/accounts/transactions-page";
import { TuitionPage } from "@/components/tuition/tuition-page";
import { BudgetPage } from "@/components/budget/budget-page";
import { AgentPage } from "@/components/agent/agent-page";
import { FamilyPage } from "@/components/family/family-page";
import { SubscriptionPage } from "@/components/billing/subscription-page";
import { AdminPage } from "@/components/admin/admin-page";
import {
  WalletPage,
  CreditPage,
  AlertsPage,
  ActivityPage,
  ReportsPage,
  SettingsPage,
  EvidencePage,
} from "@/components/layout/utility-pages";
import { translator } from "@/lib/i18n";
import {
  CatalogAdmin,
  ModelManager,
  TeamAdmin,
} from "@/components/settings/platform-panels";
import { publicTeam } from "@/actions/platform.actions";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { accountHome } from "@/lib/account-home";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; path?: string[] }>;
}) {
  const { locale, path: parts } = await params;
  const path = parts?.join("/") || "home";
  const user = await currentUser();
  if (
    [
      "home",
      "features",
      "how-it-works",
      "security",
      "pricing",
      "about",
      "terms",
      "privacy",
    ].includes(path)
  ) {
    const plans = path === "pricing" ? await publicPlans() : null;
    const team = path === "about" ? await publicTeam() : null;
    return (
      <PublicPage
        page={path}
        plans={plans?.success ? plans.data : []}
        team={team?.success ? team.data : []}
        user={user&&!user.is_demo?{name:user.name,email:user.email,role:user.role,onboarded:user.onboarded}:null}
      />
    );
  }
  if (["login", "register", "forgot-password", "demo"].includes(path)) {
    if(user&&!user.is_demo) redirect(`/${locale}/${accountHome(user)}`);
    return <AuthPage page={path} />;
  }
  if (!user) redirect(`/${locale}/login`);
  if (!canOpen(user.role, path, user.admin_permissions))
    redirect(
      `/${locale}/${["ADMIN", "MODERATOR"].includes(user.role) ? "admin" : user.role === "PARENT" ? "parent" : "dashboard"}`,
    );
  if (user.role === "PARENT" && !["subscription", "subscription/checkout", "settings", "reports"].includes(path)) {
    const [subscription] = await effectiveSubscription(user.id);
    if (!familyPlans.includes(String(subscription?.plan_id))) redirect(`/${locale}/subscription`);
  }
  if (user.role === "STUDENT" && user.plan_id === "student-free" && !freePages.includes(path)) redirect(`/${locale}/subscription`);
  if (path === "onboarding") return <OnboardingPage user={user} />;
  const allowed = [
    "payments",
    "beneficiaries",
    "admin/settlements",
    "admin/payment-methods",
    "dashboard",
    "money",
    "transactions",
    "wallet",
    "transfer",
    "tuition",
    "budget",
    "credit",
    "agent",
    "api-keys",
    "alerts",
    "activity",
    "family",
    "subscription",
    "subscription/checkout",
    "settings",
    "reports",
    "security-assessment",
    "project-evidence",
    "parent",
    "parent/students",
    "parent/approvals",
    "parent/controls",
    "admin",
    "admin/users",
    "admin/plans",
    "admin/subscriptions",
    "admin/reports",
    "admin/risk",
    "admin/agent",
    "admin/finance",
    "admin/audit",
    "admin/settings",
    "admin/catalog",
    "admin/models",
    "admin/team",
  ];
  if (!allowed.includes(path)) notFound();
  const result = await getDashboardData(path === "agent" ? "agent" : undefined);
  if (!result.success) {
    const t = translator(locale);
    return (
      <div className="setup-error">
        <h1>{t("errorTitle")}</h1>
        <p>{t(result.code)}</p>
        <p>{t("databaseUnavailable")}</p>
      </div>
    );
  }
  const data = result.data;
  const view = [
    "payments",
    "beneficiaries",
    "admin/settlements",
    "admin/payment-methods",
  ].includes(path) ? (
    <PaymentsPanel data={data} mode={path.split("/").at(-1)} />
  ) : path === "admin/catalog" ? (
    <CatalogAdmin data={data} />
  ) : path === "api-keys" ? (
    <ModelManager data={data} />
  ) : path === "admin/models" ? (
    <ModelManager data={data} shared />
  ) : path === "admin/team" ? (
    <TeamAdmin data={data} />
  ) : path === "dashboard" ? (
    <Overview data={data} />
  ) : path === "money" ? (
    <MoneyPage data={data} />
  ) : path === "transactions" ? (
    <TransactionsPage data={data} />
  ) : path === "wallet" ? (
    <WalletPage data={data} />
  ) : path === "transfer" ? (
    <PaymentsPanel data={data} />
  ) : path === "tuition" ? (
    <TuitionPage data={data} />
  ) : path === "budget" ? (
    <BudgetPage data={data} />
  ) : path === "credit" ? (
    <CreditPage data={data} />
  ) : path === "agent" ? (
    <AgentPage data={data} />
  ) : path === "alerts" ? (
    <AlertsPage data={data} />
  ) : path === "activity" ? (
    <ActivityPage data={data} />
  ) : path === "family" || path.startsWith("parent") ? (
    <>
      <FamilyPage data={data} path={path} />
      <PaymentsPanel data={data} compact mode="family" />
      {path === "parent/approvals" && (
        <PaymentsPanel data={data} compact mode="approvals" />
      )}
    </>
  ) : path.startsWith("subscription") ? (
    <SubscriptionPage data={data} checkout={path.endsWith("checkout")} />
  ) : path === "settings" || path === "admin/settings" ? (
    <SettingsPage data={data} />
  ) : path === "reports" ? (
    <ReportsPage data={data} />
  ) : path === "project-evidence" || path === "security-assessment" ? (
    <EvidencePage data={data} project={path === "project-evidence"} />
  ) : (
    <AdminPage data={data} path={path} />
  );
  return view;
}
