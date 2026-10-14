"use client";
import { useState } from "react";
import Link from "next/link";
import {
  FiArrowRight,
  FiBookOpen,
  FiCreditCard,
  FiUsers,
  FiShield,
  FiCheckCircle,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { Card, Badge } from "@/components/ui/primitives";
import { FinanceBar } from "@/components/charts/finance-charts";
export function HomePlanningPreview() {
  const { t, locale } = useApp();
  const [family, setFamily] = useState(false);
  return (
    <section className="public-story" data-public-section="home-planning">
      <div className="section-title">
        <div>
          <p className="eyebrow">{t("illustrativeExample")}</p>
          <h2>{t("homePlanningTitle")}</h2>
          <p>{t("homePlanningBody")}</p>
        </div>
      </div>
      <div className="two-grid">
        <Card>
          <div
            className="button-group"
            role="group"
            aria-label={t("perspective")}
          >
            <button
              className={`button ${family ? "secondary" : ""}`}
              aria-pressed={!family}
              onClick={() => setFamily(false)}
            >
              {t("student")}
            </button>
            <button
              className={`button ${family ? "" : "secondary"}`}
              aria-pressed={family}
              onClick={() => setFamily(true)}
            >
              {t("parent")}
            </button>
          </div>
          <h3>{t(family ? "familyPreviewTitle" : "studentPreviewTitle")}</h3>
          <p>{t(family ? "familyPreviewBody" : "studentPreviewBody")}</p>
          <FinanceBar
            labels={[t("tuition"), t("Housing"), t("Food")]}
            series={[
              {
                label: "RMB",
                data: family ? [8000, 2200, 1200] : [6500, 2200, 1200],
              },
            ]}
          />
          <small>{t("illustrativeExample")}</small>
        </Card>
        <div className="stack">
          {[
            [FiBookOpen, "homePlan", "homePlanBody"],
            [FiCreditCard, "homeFund", "homeFundBody"],
            [FiUsers, "homeShare", "homeShareBody"],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof FiBookOpen;
            return (
              <Card key={String(title)}>
                <I className="feature-icon" />
                <h3>{t(String(title))}</h3>
                <p>{t(String(body))}</p>
              </Card>
            );
          })}
          <Link className="text-link" href={`/${locale}/features`}>
            {t("features")}
            <FiArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
export function PaymentPaths() {
  const { t } = useApp();
  const [method, setMethod] = useState("INTERNAL");
  const stages =
    method === "INTERNAL"
      ? ["DRAFT", "reviewConfirm", "WAITING_PARENT", "COMPLETED"]
      : method === "CARD"
        ? ["DRAFT", "cardDetails", "reviewConfirm", "COMPLETED"]
        : ["DRAFT", "reviewConfirm", "QUEUED", "PROCESSING", "COMPLETED"];
  return (
    <section className="public-story" data-public-section="payment-paths">
      <h2>{t("paymentPathsTitle")}</h2>
      <p>{t("paymentPathsBody")}</p>
      <div
        className="button-group"
        role="group"
        aria-label={t("paymentMethod")}
      >
        {["INTERNAL", "CARD", "BANK"].map((m) => (
          <button
            key={m}
            aria-pressed={method === m}
            className={`button ${method === m ? "" : "secondary"}`}
            onClick={() => setMethod(m)}
          >
            {t(m)}
          </button>
        ))}
      </div>
      <ol className="public-status-path">
        {stages.map((stage, i) => (
          <li key={stage}>
            <span>{i + 1}</span>
            <strong>{t(stage)}</strong>
          </li>
        ))}
      </ol>
      <p className="muted">
        {t(
          method === "INTERNAL"
            ? "walletPathHelp"
            : method === "CARD"
              ? "cardPathHelp"
              : "manualPathHelp",
        )}
      </p>
    </section>
  );
}
export function SecurityDataMap() {
  const { t } = useApp();
  return (
    <section className="public-story" data-public-section="security-data">
      <h2>{t("securityDataTitle")}</h2>
      <p>{t("securityDataBody")}</p>
      <div className="two-grid">
        <Card>
          <FiShield className="feature-icon" />
          <h3>{t("dataKept")}</h3>
          <ul className="public-checklist">
            {["keptIdentity", "keptLedger", "keptKeys", "keptCards"].map(
              (k) => (
                <li key={k}>
                  <FiCheckCircle />
                  <span>{t(k)}</span>
                </li>
              ),
            )}
          </ul>
        </Card>
        <Card>
          <Badge>{t("humanControl")}</Badge>
          <h3>{t("modelBoundaryTitle")}</h3>
          <p>{t("modelBoundaryBody")}</p>
          <p>{t("manualBoundaryBody")}</p>
        </Card>
      </div>
      <p className="muted">{t("securityNotCertification")}</p>
    </section>
  );
}
