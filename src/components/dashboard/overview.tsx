"use client";
import Link from "next/link";
import {
  FiArrowRight,
  FiArrowUpRight,
  FiCreditCard,
  FiTrendingUp,
  FiBookOpen,
  FiShield,
  FiZap,
  FiPlus,
  FiGlobe,
  FiShoppingBag,
  FiHome,
  FiCoffee,
  FiTruck,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Metric,
  Heading,
  SectionTitle,
  Progress,
  Badge,
  Empty,
} from "@/components/ui/primitives";
import {
  FinanceLine,
  FinanceDonut,
  FinanceBar,
  FinanceGauge,
} from "@/components/charts/finance-charts";
import { formatMoney } from "@/lib/money";
import type { Workspace } from "@/types/workspace";
import type { Row } from "@/types";
export function TransactionList({
  rows,
  currency,
}: {
  rows: Row[];
  currency?: string;
}) {
  const { t, locale } = useApp();
  if (!rows.length) return <Empty />;
  const icons: Record<string, React.ReactNode> = {
    Housing: <FiHome />,
    Food: <FiCoffee />,
    Shopping: <FiShoppingBag />,
    Transport: <FiTruck />,
    Income: <FiTrendingUp />,
  };
  return (
    <div className="transaction-list">
      {rows.slice(0, 5).map((r) => (
        <div className="transaction-row" key={String(r.id)}>
          <span
            className={`transaction-icon ${r.type === "INCOME" ? "mint" : ""}`}
          >
            {icons[String(r.category)] || <FiCreditCard />}
          </span>
          <div className="transaction-info">
            <strong>{r.description}</strong>
            <small>
              {t(String(r.category))} <span>·</span>{" "}
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
              }).format(new Date(String(r.date)))}
            </small>
          </div>
          <strong className={r.type === "INCOME" ? "positive" : ""}>
            {r.type === "INCOME" ? "+" : "−"}
            {formatMoney(
              String(r.amount),
              currency || String(r.currency),
              locale,
            )}
          </strong>
        </div>
      ))}
    </div>
  );
}
export function Overview({ data }: { data: Workspace }) {
  const { t, locale } = useApp();
  const href = (s: string) => `/${locale}/${s}`;
  const fmt = (v: string | number, c = data.user.preferred_currency) =>
    formatMoney(v, c, locale);
  const months = [...new Set(data.monthly.map((r) => String(r.month)))];
  const series = (type: string) =>
    months.map((m) =>
      data.monthly
        .filter((r) => r.month === m && r.type === type)
        .reduce(
          (s, r) =>
            s +
            (Number(r.amount) / Number(data.rates[String(r.currency)])) *
              Number(data.rates[data.user.preferred_currency]),
          0,
        ),
    );
  const income = series("INCOME"),
    expenses = series("EXPENSE");
  const categories = Object.entries(
    data.categories.reduce<Record<string, number>>((totals, r) => {
      const category = String(r.category);
      totals[category] =
        (totals[category] || 0) +
        (Number(r.amount) / Number(data.rates[String(r.currency)])) *
          Number(data.rates[data.user.preferred_currency]);
      return totals;
    }, {}),
  ).map(([label, value]) => ({ label, value }));
  const progress = data.gap?.readiness || 0;
  return (
    <>
      <Heading
        eyebrow={`${t("welcomeBack")}, ${data.user.name.split(" ")[0]} 👋`}
        title={t("greeting")}
        subtitle={t("dashboardSubtitle")}
        action={
          <Link className="button" href={href("agent")}>
            <FiPlus />
            {t("quickAction")}
          </Link>
        }
      />
      <div className="metrics-grid">
        <Metric
          label={t("totalBalance")}
          value={fmt(data.metrics.total)}
          icon={<FiCreditCard />}
          note={
            <>
              <span className="positive">
                <FiGlobe /> {data.accounts.length} {t("ACCOUNTS")}
              </span>
              <span>{t("acrossAccounts")}</span>
            </>
          }
        />
        <Metric
          label={t("monthlySpending")}
          value={fmt(data.metrics.spending)}
          icon={<FiTrendingUp />}
          color="amber"
          note={
            <>
              <span>
                {fmt(
                  Math.max(
                    0,
                    Number(data.metrics.budget) - Number(data.metrics.spending),
                  ),
                )}{" "}
                {t("remaining")}
              </span>
            </>
          }
        />
        <Metric
          label={t("tuitionReadiness")}
          value={
            <>
              {Math.round(progress)}
              <small>%</small>
            </>
          }
          icon={<FiBookOpen />}
          note={
            <>
              <Progress value={progress} />
              <span>
                {data.gap
                  ? `${data.gap.daysRemaining} ${t("daysLeft")}`
                  : t("addTuition")}
              </span>
            </>
          }
        />
        <Metric
          label={t("financialHealth")}
          value={
            <>
              {data.metrics.health}
              <small>/100</small>
            </>
          }
          icon={<FiShield />}
          note={
            <>
              <Badge>
                {t(data.metrics.health >= 70 ? "onTrack" : "needsAttention")}
              </Badge>
              <span>{t("financialHealth")}</span>
            </>
          }
        />
      </div>
      <div className="insight-banner">
        <div className="insight-symbol">
          <FiZap />
        </div>
        <div>
          <div className="insight-title">
            {t("aiInsight")}
            <Badge>AI</Badge>
          </div>
          <p>{t("aiInsightBody")}</p>
        </div>
        <Link className="button dark-button" href={href("agent")}>
          {t("analyseFunding")}
          <FiArrowUpRight />
        </Link>
        <div className="insight-orbit" />
      </div>
      <div className="dashboard-grid">
        <Card className="cashflow-card">
          <SectionTitle title={t("cashFlow")}>
            <span className="chart-currency">
              {data.user.preferred_currency} <span>⌄</span>
            </span>
          </SectionTitle>
          <p className="card-subtitle">{t("cashFlowSub")}</p>
          <FinanceLine
            labels={months.map((m) =>
              new Intl.DateTimeFormat(locale, { month: "short" }).format(
                new Date(`${m}-15`),
              ),
            )}
            series={[
              { label: "income", data: income },
              { label: "expenses", data: expenses },
              { label: "net", data: income.map((v, i) => v - expenses[i]) },
            ]}
          />
        </Card>
        <Card className="spending-card">
          <SectionTitle title={t("spendingBreakdown")} />
          <p className="card-subtitle">
            {t("thisMonth")} · {data.user.preferred_currency}
          </p>
          <FinanceDonut
            data={categories}
            total={new Intl.NumberFormat(locale, {
              maximumFractionDigits: 0,
            }).format(Number(data.metrics.spending))}
            label="monthlySpending"
          />
          <div className="chart-legend">
            {categories.slice(0, 4).map((c, i) => (
              <div key={c.label}>
                <i
                  style={{
                    background: ["#207c68", "#8bc8b6", "#d1e9df", "#e1b57f"][i],
                  }}
                />
                <span>{t(c.label)}</span>
                <strong>
                  {Math.round(
                    (c.value / Math.max(1, Number(data.metrics.spending))) *
                      100,
                  )}
                  %
                </strong>
              </div>
            ))}
          </div>
        </Card>
        <Card className="tuition-card">
          <SectionTitle title={t("tuitionGoal")}>
            <FiBookOpen />
          </SectionTitle>
          {data.gap ? (
            <>
              <div className="university-icon">
                <FiBookOpen />
              </div>
              <Badge tone="blue">{data.tuition[0]?.semester}</Badge>
              <h3>{data.gap.name}</h3>
              <p className="muted">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                }).format(new Date(data.gap.due_date))}
              </p>
              <div className="tuition-numbers">
                <strong>{fmt(data.gap.projected, data.gap.currency)}</strong>
                <span>/ {fmt(data.gap.required, data.gap.currency)}</span>
              </div>
              <Progress value={progress} />
              <div className="between muted">
                <span>
                  {Math.round(progress)}% {t("funded")}
                </span>
                <span>
                  {data.gap.daysRemaining} {t("daysLeft")}
                </span>
              </div>
              <Link className="button secondary full" href={href("tuition")}>
                {t("seePlan")}
                <FiArrowRight />
              </Link>
            </>
          ) : (
            <Empty />
          )}
        </Card>
        <Card className="recent-card">
          <SectionTitle title={t("recentTransactions")}>
            <Link className="text-link" href={href("transactions")}>
              {t("viewAll")}
              <FiArrowUpRight />
            </Link>
          </SectionTitle>
          <TransactionList rows={data.transactions} />
        </Card>
        <Card className="accounts-card">
          <SectionTitle title={t("yourAccounts")}>
            <Link
              className="icon-button"
              aria-label={t("addAccount")}
              href={href("money")}
            >
              <FiPlus />
            </Link>
          </SectionTitle>
          <div className="mini-accounts">
            {data.accounts.slice(0, 3).map((a, i) => (
              <Link
                key={String(a.id)}
                className={`mini-account currency-${a.currency}`}
                href={href("money")}
              >
                <span className="currency-flag">
                  {(
                    {
                      BDT: "🇧🇩",
                      CAD: "🇨🇦",
                      USD: "🇺🇸",
                      EUR: "🇪🇺",
                      CNY: "🇨🇳",
                    } as Record<string, string>
                  )[String(a.currency)] || "🌐"}
                </span>
                <span>
                  <strong>{a.currency}</strong>
                  <small>{a.name}</small>
                </span>
                <b>{fmt(String(a.balance), String(a.currency))}</b>
                <FiArrowUpRight className={i === 0 ? "positive" : ""} />
              </Link>
            ))}
          </div>
          <div className="transfer-tip">
            <span className="tip-icon">
              <FiGlobe />
            </span>
            <h3>{t("transferOpportunity")}</h3>
            <p>{t("transferOpportunityBody")}</p>
            <Link className="text-link" href={href("transfer")}>
              {t("compareRates")}
              <FiArrowRight />
            </Link>
          </div>
        </Card>
      </div>
      <div className="three-grid">
        <Card>
          <SectionTitle title={t("currencyExposure")} />
          <FinanceBar
            labels={data.accounts.map((a) => String(a.currency))}
            series={[
              {
                label: "balance",
                data: data.accounts.map(
                  (a) =>
                    (Number(a.balance) /
                      Number(data.rates[String(a.currency)])) *
                    Number(data.rates[data.user.preferred_currency]),
                ),
              },
            ]}
          />
          <small className="muted">{data.user.preferred_currency}</small>
        </Card>
        <Card>
          <SectionTitle title={t("budgetActual")} />
          <FinanceBar
            labels={data.budgets.map((b) => String(b.category))}
            series={[
              {
                label: "budget",
                data: data.budgets.map((b) => Number(b.amount)),
              },
              {
                label: "actual",
                data: data.budgets.map((b) => Number(b.actual)),
              },
            ]}
          />
        </Card>
        <Card>
          <SectionTitle title={t("financialHealth")} />
          <div className="health-center">
            <FinanceGauge value={data.metrics.health} />
            <p>{t("healthNote")}</p>
          </div>
          <div className="stack">
            <div className="between">
              <span>{t("tuitionReadiness")}</span>
              <b>{Math.round(progress)}%</b>
            </div>
            <Progress value={progress} />
            <div className="between">
              <span>{t("budget")}</span>
              <b>
                {Math.round(
                  Math.min(
                    100,
                    (Number(data.metrics.budget) /
                      Math.max(1, Number(data.metrics.spending))) *
                      100,
                  ),
                )}
                %
              </b>
            </div>
            <Progress
              value={
                (Number(data.metrics.budget) /
                  Math.max(1, Number(data.metrics.spending))) *
                100
              }
            />
          </div>
        </Card>
      </div>
    </>
  );
}
