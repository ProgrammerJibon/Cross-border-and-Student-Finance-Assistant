"use client";
import { DemoProfiles } from "./demo-profiles";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FiArrowRight,
  FiShield,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import {
  Card,
  Heading,
  FormFields,
  Badge,
  type Field,
} from "@/components/ui/primitives";
import {
  login,
  register,
  forgotPassword,
  resetPassword,
} from "@/actions/auth.actions";
import { completeOnboarding } from "@/actions/user.actions";
import { Brand, LanguageSwitch, ThemeToggle } from "@/components/layout/shell";
import { ProfilePhoto } from "@/components/ui/profile-photo";
import { currencyOptions } from "@/components/accounts/money-page";
import type { User } from "@/types";
export function AuthPage({ page }: { page: string }) {
  const { t, locale, run, theme, catalog } = useApp();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    role: "STUDENT",
    email: "",
    password: "",
    confirm: "",
    name: "",
    token: "",
    country_code: "BD",
    preferred_currency: "BDT",
    avatar: "",
  });
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const route = (r: { role: string; locale: string; onboarded: number }) =>
    router.push(
      `/${r.locale}/${["ADMIN", "MODERATOR"].includes(r.role) ? "admin" : r.role === "PARENT" ? "parent" : r.onboarded ? "dashboard" : "onboarding"}`,
    );
  const fields: Field[] =
    page === "register"
      ? [
          { name: "name" },
          { name: "email", type: "email" },
          {
            name: "country_code",
            label: "currentCountry",
            options: catalog.countries.map((c) => ({
              value: c.code,
              label: c.name,
            })),
          },
          { name: "preferred_currency", options: currencyOptions },
          { name: "password", type: "password" },
          { name: "confirm", label: "confirmPassword", type: "password" },
          {
            name: "role",
            label: "type",
            options: [
              { value: "STUDENT", label: "student" },
              { value: "PARENT", label: "parent" },
            ],
          },
        ]
      : page === "forgot-password"
        ? reset
          ? [{ name: "token" }, { name: "password", type: "password" }]
          : [{ name: "email", type: "email" }]
        : [
            { name: "email", type: "email" },
            { name: "password", type: "password" },
          ];
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Link href={`/${locale}`}>
          <Brand />
        </Link>
        <div>
          <Badge>FinTechathon 2026</Badge>
          <h1>{t("authTitle")}</h1>
          <p>{t("authSubtitle")}</p>
          <div className="auth-visual">
            <span>৳</span>
            <FiGlobeIcon />
            <span>¥</span>
          </div>
          <div className="auth-proof">
            <FiShield />
            {t("sandboxNote")}
          </div>
        </div>
        <small>{t("sandboxDisclosure")}</small>
      </div>
      <div className="auth-form-side">
        <div className="auth-top">
          <Link href={`/${locale}`}>{t("home")}</Link>
          <div className="button-group">
            <LanguageSwitch />
            <ThemeToggle />
          </div>
        </div>
        {page === "demo" ? (
          <div className="demo-content">
            <Heading title={t("demoTitle")} subtitle={t("demoSubtitle")} />
            <DemoProfiles />
          </div>
        ) : (
          <div className="auth-form">
            <h1>{t(page)}</h1>
            <p>{t("authSubtitle")}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                if (page === "forgot-password") {
                  if (reset) {
                    const r = await run(() => resetPassword(form));
                    if (r !== undefined) router.push(`/${locale}/login`);
                  } else {
                    const r = await run(() => forgotPassword(form.email), {
                      quiet: true,
                    });
                    if (r) {
                      setReset(true);
                      setForm({ ...form, token: r.token || "" });
                    }
                  }
                } else {
                  const r = await run(
                    () =>
                      page === "register"
                        ? register({ ...form, locale, theme })
                        : login(form),
                    { quiet: true, refresh: false },
                  );
                  if (r) route(r);
                }
                setBusy(false);
              }}
            >
              {page === "register" && (
                <ProfilePhoto
                  required
                  value={form.avatar}
                  onChange={(avatar) => setForm({ ...form, avatar })}
                />
              )}
              <FormFields
                fields={fields}
                values={form}
                setValues={(v) =>
                  setForm(
                    v.country_code !== form.country_code
                      ? {
                          ...v,
                          preferred_currency:
                            catalog.countries.find(
                              (c) => c.code === v.country_code,
                            )?.currency_code || "CNY",
                        }
                      : v,
                  )
                }
              />
              {page === "forgot-password" && (
                <p className="muted">{t(reset ? "resetSent" : "demoReset")}</p>
              )}
              <button className="button full" disabled={busy}>
                {t(busy ? "loading" : page)}
                <FiArrowRight />
              </button>
            </form>
            <div className="auth-links">
              <Link
                href={`/${locale}/${page === "register" ? "login" : "register"}`}
              >
                {t(page === "register" ? "login" : "register")}
              </Link>
              <Link href={`/${locale}/forgot-password`}>
                {t("forgotPassword")}
              </Link>
            </div>
            <div className="auth-divider">
              <span>{t("sandbox")}</span>
            </div>
            <Link className="button secondary full" href={`/${locale}/demo`}>
              <FiZap />
              {t("demo")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
function FiGlobeIcon() {
  return (
    <div className="globe-art">
      <div />
      <div />
      <i />
      <FiArrowRight />
    </div>
  );
}
export function OnboardingPage({ user }: { user: User }) {
  const { t, locale, run, catalog } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: user.name,
    birth_date: "2003-01-01",
    student_status: "FULL_TIME",
    university: "",
    home_country:
      catalog.countries.find((c) => c.code === user.country_code)?.name ||
      "Bangladesh",
    study_country: "China",
    home_currency: user.preferred_currency,
    study_currency: "CNY",
    preferred_currency: user.preferred_currency,
    tuition: "8000",
    paid: "0",
    scholarship: "0",
    due_date: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    semester: "",
    balance: "0",
    income: "0",
    expenses: "0",
  }));
  const [goals, setGoals] = useState(["tuition"]);
  const steps = [
    "identity",
    "currencies",
    "tuition",
    "finances",
    "goals",
    "family",
  ];
  const fields: Field[][] = [
    [
      { name: "name" },
      { name: "birth_date", type: "date" },
      { name: "student_status" },
      { name: "university" },
      { name: "home_country" },
      { name: "study_country" },
    ],
    ["home_currency", "study_currency", "preferred_currency"].map((name) => ({
      name,
      options: currencyOptions,
    })),
    [
      { name: "tuition", type: "number", min: 0.01 },
      { name: "paid", type: "number", min: 0 },
      { name: "scholarship", type: "number", min: 0 },
      { name: "due_date", type: "date" },
      { name: "semester" },
    ],
    ["balance", "income", "expenses"].map((name) => ({
      name,
      type: "number",
      min: 0,
    })),
    [],
    [],
  ];
  return (
    <div className="onboarding-container">
      <Link href={`/${locale}`}>
        <Brand />
      </Link>
      <Heading title={t("onboarding")} subtitle={t(steps[step])} />
      <div className="onboarding-stepper">
        {steps.map((s, i) => (
          <div className={i <= step ? "active" : ""} key={s}>
            <span>{i + 1}</span>
            <small>{t(s)}</small>
          </div>
        ))}
      </div>
      <Card>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (step < 5) {
              setStep(step + 1);
              return;
            }
            setBusy(true);
            const r = await run(() => completeOnboarding({ ...values, goals }));
            setBusy(false);
            if (r !== undefined) router.push(`/${locale}/dashboard`);
          }}
        >
          <FormFields
            fields={fields[step].filter(f => user.is_demo || !["paid", "balance"].includes(f.name))}
            values={values}
            setValues={setValues}
          />
          {step === 4 && (
            <div className="goal-options">
              {["tuition", "transfer", "budget", "credit", "currency"].map(
                (key, i) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={goals.includes(key)}
                      onChange={(e) =>
                        setGoals(
                          e.target.checked
                            ? [...goals, key]
                            : goals.filter((k) => k !== key),
                        )
                      }
                    />
                    {t(
                      [
                        "goalTuition",
                        "goalTransfer",
                        "goalBudget",
                        "goalCredit",
                        "goalCurrency",
                      ][i],
                    )}
                  </label>
                ),
              )}
            </div>
          )}
          {step === 5 && (
            <div className="empty">
              <FiUsers />
              <h2>{t("family")}</h2>
              <p>{t("familyLater")}</p>
            </div>
          )}
          <div className="between">
            <button
              type="button"
              className="button secondary"
              disabled={!step || busy}
              onClick={() => setStep(step - 1)}
            >
              {t("back")}
            </button>
            <button className="button" disabled={busy}>
              {t(busy ? "loading" : step === 5 ? "finish" : "continue")}
              <FiArrowRight />
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
