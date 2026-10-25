"use client";
import { CompetitionBanner } from "./competition-banner";
import { FooterCredits } from "./footer-credits";
import { SupportedPaymentMethods } from "@/components/payments/supported-methods";
import Image from "next/image";
import {
  HomePlanningPreview,
  PaymentPaths,
  SecurityDataMap,
} from "./public-stories";
import Link from "next/link";
import {
  FiArrowUpRight,
  FiGlobe,
  FiZap,
  FiBookOpen,
  FiShield,
  FiPieChart,
  FiUsers,
  FiCheck,
  FiArrowRight,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { Brand, LanguageSwitch, ThemeToggle } from "./shell";
import {
  JourneyVisual,
  SecurityVisual,
} from "@/components/charts/journey-visual";
import { Card, Badge, Progress } from "@/components/ui/primitives";
import { Plans } from "@/components/billing/subscription-page";
import type { Row } from "@/types";
export function PublicPage({
  page,
  plans,
  team = [],
}: {
  page: string;
  plans: Row[];
  team?: Row[];
}) {
  const { t, locale } = useApp();
  const href = (p: string) => `/${locale}/${p}`;
  const features = [
    { key: "transfer", icon: <FiGlobe />, body: "transferOpportunityBody" },
    { key: "tuition", icon: <FiBookOpen />, body: "plannerHelp" },
    { key: "agent", icon: <FiZap />, body: "agentSubtitle" },
    { key: "budget", icon: <FiPieChart />, body: "budgetExplanation" },
    { key: "family", icon: <FiUsers />, body: "familyPrivacy" },
    { key: "security", icon: <FiShield />, body: "approvalSecurity" },
  ];
  return (
    <div className="public-layout">
      {page === "home" && <CompetitionBanner />}
      <header className="public-header">
        <Link href={`/${locale}`}>
          <Brand />
        </Link>
        <nav>
          {["features", "how-it-works", "security", "pricing"].map((k) => (
            <Link key={k} href={href(k)}>
              {t(k)}
            </Link>
          ))}
        </nav>
        <div className="button-group">
          <LanguageSwitch />
          <ThemeToggle />
          <Link className="text-link desktop-only" href={href("login")}>
            {t("login")}
          </Link>
          <Link className="button small-button" href={href("demo")}>
            {t("demo")}
            <FiArrowUpRight />
          </Link>
        </div>
      </header>
      <main className="public-main">
        {page === "home" ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <Badge>
                  <span className="live-dot" />
                  {t("builtFor")}
                </Badge>
                <h1>{t("heroTitle")}</h1>
                <p>{t("heroSub")}</p>
                <div className="button-group">
                  <Link className="button large" href={href("demo")}>
                    {t("demo")}
                    <FiArrowUpRight />
                  </Link>
                  <Link
                    className="button secondary large"
                    href={href("register")}
                  >
                    {t("startTrial")}
                  </Link>
                </div>
                <div className="hero-trust">
                  <FiShield />
                  {t("sandboxNote")}
                </div>
              </div>
              <div className="hero-visual">
                <div className="orbit-frame">
                  <div className="world-orbit orbit-one" />
                  <div className="world-orbit orbit-two" />
                </div>
                <span className="floating-flag flag-ca">🇨🇳</span>
                <span className="floating-flag flag-bd">🇧🇩</span>
                <span className="floating-flag flag-us">¥</span>
                <div className="hero-account">
                  <div className="between">
                    <Brand />
                    <FiGlobe />
                  </div>
                  <small>{t("totalBalance")}</small>
                  <strong>RMB 65,780.20</strong>
                  <div className="hero-currencies">
                    <span>🇧🇩 BDT</span>
                    <span>🇨🇳 RMB</span>
                    <span>৳ ↔ ¥</span>
                  </div>
                </div>
                <div className="hero-agent">
                  <span>
                    <FiZap />
                  </span>
                  <div>
                    <strong>{t("aiInsight")}</strong>
                    <p>{t("compareRates")}</p>
                  </div>
                  <FiCheck />
                </div>
                <div className="hero-tuition">
                  <div className="between">
                    <FiBookOpen />
                    <Badge>{t("onTrack")}</Badge>
                  </div>
                  <h3>{t("tuitionReadiness")}</h3>
                  <strong>
                    82<small>%</small>
                  </strong>
                  <Progress value={82} />
                  <p>{t("sandbox")}</p>
                </div>
              </div>
            </section>
            <div className="public-intro">
              <p className="eyebrow">{t("workspace")}</p>
              <h2>{t("allConnected")}</h2>
            </div>
          </>
        ) : (
          <div className="public-page-heading">
            <Badge>{t("sandbox")}</Badge>
            <h1>{t(page === "security" ? "securityTitle" : page)}</h1>
            <p>
              {t(
                page === "about"
                  ? "aboutBody"
                  : page === "privacy"
                    ? "privacyBody"
                    : page === "terms"
                      ? "termsBody"
                      : page === "pricing"
                        ? "planStudent"
                        : page === "features"
                          ? "featuresIntro"
                          : page === "how-it-works"
                            ? "howIntro"
                            : page === "security"
                              ? "securityIntro"
                              : "authSubtitle",
              )}
            </p>
          </div>
        )}
        {page === "features" && (
          <div className="three-grid public-features">
            {features.map((f, i) => (
              <Link href={href("demo")} key={f.key}>
                <Card>
                  <span className={`feature-icon feature-${i}`}>{f.icon}</span>
                  <h3>{t(f.key)}</h3>
                  <p>{t(f.body)}</p>
                  <FiArrowUpRight />
                </Card>
              </Link>
            ))}
          </div>
        )}
        {page === "home" && <HomePlanningPreview />}
        {page === "how-it-works" && (
          <>
            <JourneyVisual />
            <PaymentPaths />
          </>
        )}
        {page === "home" && (
          <section className="public-explainer">
            <div>
              <p className="eyebrow">{t("builtFor")}</p>
              <h2>{t("bordersTitle")}</h2>
              <p>{t("bordersBody")}</p>
              <Link href={href("register")} className="button">
                {t("startTrial")}
                <FiArrowUpRight />
              </Link>
            </div>
            <div className="country-pair">
              <Card>
                <span>🇧🇩</span>
                <h3>Bangladesh</h3>
                <strong>BDT · ৳</strong>
                <p>{t("homeMoney")}</p>
              </Card>
              <FiArrowRight />
              <Card>
                <span>🇨🇳</span>
                <h3>中国 · China</h3>
                <strong>RMB · ¥</strong>
                <p>{t("studyMoney")}</p>
              </Card>
            </div>
          </section>
        )}
        {page === "pricing" && <Plans plans={plans} publicPage />}
        {page === "security" && (
          <>
            <SecurityVisual />
            <SecurityDataMap />
          </>
        )}
        {page === "about" && (
          <section>
            <div className="section-title">
              <h2>{t("ourTeam")}</h2>
              <p>{t("teamMission")}</p>
            </div>
            <div className="team-grid">
              {team.map((member, i) => (
                <Card
                  key={i}
                  className={member.is_ceo ? "team-card ceo-card" : "team-card"}
                >
                  {member.avatar && (
                    <Image
                      unoptimized
                      width={480}
                      height={320}
                      src={String(member.avatar)}
                      alt={String(member.name)}
                    />
                  )}
                  <Badge>{member.is_ceo ? t("ceo") : member.department}</Badge>
                  <h2>{member.name}</h2>
                  <strong>{member.designation}</strong>
                  <p>{member.department}</p>
                  <a href={`mailto:${member.email}`}>{member.email}</a>
                  {member.phone && (
                    <a href={`tel:${member.phone}`}>{member.phone}</a>
                  )}
                  {member.portfolio && (
                    <a
                      className="button secondary"
                      href={String(member.portfolio)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("portfolio")}
                      <FiArrowUpRight />
                    </a>
                  )}
                </Card>
              ))}
            </div>
            {!team.length && (
              <Card>
                <p>{t("teamEmpty")}</p>
              </Card>
            )}
          </section>
        )}
        {["about", "terms", "privacy"].includes(page) && (
          <Card className="prose">
            <FiShield />
            <p>
              {t(
                page === "about"
                  ? "evidenceIntro"
                  : page === "privacy"
                    ? "familyPrivacy"
                    : "sandboxDisclosure",
              )}
            </p>
            <Link className="text-link" href={href("demo")}>
              {t("demo")}
              <FiArrowUpRight />
            </Link>
          </Card>
        )}
      </main>
      {page === "home" && <SupportedPaymentMethods />}
      <footer className="public-footer">
        <div className="footer-brand">
          <Brand />
          <p>{t("bordersBody")}</p>
          <Badge>BDT ↔ RMB</Badge>
        </div>
        <div>
          <h3>{t("explore")}</h3>
          {["features", "how-it-works", "pricing", "demo"].map((k) => (
            <Link key={k} href={href(k)}>
              {t(k)}
            </Link>
          ))}
        </div>
        <div>
          <h3>{t("company")}</h3>
          {["about", "security", "terms", "privacy"].map((k) => (
            <Link key={k} href={href(k)}>
              {t(k)}
            </Link>
          ))}
        </div>
        <div>
          <h3>{t("startJourney")}</h3>
          <Link className="button" href={href("register")}>
            {t("register")}
            <FiArrowRight />
          </Link>
          <Link href={href("login")}>{t("login")}</Link>
        </div>
        <div className="footer-bottom">
          <FooterCredits />
          <span>© 2026 FinBridge AI</span>
          <span>{t("sandboxDisclosure")}</span>
        </div>
      </footer>
    </div>
  );
}
