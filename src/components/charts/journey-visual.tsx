"use client";
import { useState } from "react";
import { Stepper, Step, StepButton } from "@mui/material";
import {
  FiGlobe,
  FiTarget,
  FiZap,
  FiShield,
  FiCheckCircle,
  FiFileText,
  FiArrowRight,
} from "react-icons/fi";
import { useApp } from "@/components/ui/providers";
import { Card, Badge } from "@/components/ui/primitives";
import { FinanceBar } from "./finance-charts";
const icons = [FiGlobe, FiTarget, FiZap, FiShield, FiCheckCircle, FiFileText];
export function JourneyVisual({
  architecture = false,
}: {
  architecture?: boolean;
}) {
  const { t } = useApp();
  const [step, setStep] = useState(0);
  const Icon = icons[step];
  const names = architecture
    ? ["student", "agent", "toolResult", "riskChecks", "approve", "receipt"]
    : [
        "connectMoney",
        "setGoal",
        "aiAnalyses",
        "riskChecks",
        "approve",
        "viewEvidence",
      ];
  return (
    <section className="journey-visual">
      <div className="section-title">
        <div>
          <p className="eyebrow">BDT ↔ RMB</p>
          <h2>{t(architecture ? "architecture" : "visualGuide")}</h2>
        </div>
        <Badge>{t("interactiveDemo")}</Badge>
      </div>
      <Stepper nonLinear activeStep={step} alternativeLabel>
        {names.map((name, i) => (
          <Step key={name}>
            <StepButton onClick={() => setStep(i)}>{t(name)}</StepButton>
          </Step>
        ))}
      </Stepper>
      <div className="journey-detail">
        <div>
          <span className="feature-icon">
            <Icon />
          </span>
          <h3>{t(`journeyTitle${step}`)}</h3>
          <p>{t(`journeyBody${step}`)}</p>
          <button className="text-link" onClick={() => setStep((step + 1) % 6)}>
            {t("continue")}
            <FiArrowRight />
          </button>
        </div>
        <div className="journey-sample" aria-label={t("illustrativeExample")}>
          <small>{t("illustrativeExample")}</small>
          {step === 2 ? (
            <FinanceBar
              labels={[
                "StudentTransfer Demo",
                "GlobeSend Demo",
                "FastRemit Demo",
              ]}
              series={[{ label: "BDT", data: [136500, 137200, 138100] }]}
            />
          ) : (
            <>
              <div className="currency-path">
                <span>
                  ৳<small>BDT</small>
                </span>
                <FiArrowRight />
                <span>
                  ¥<small>RMB</small>
                </span>
              </div>
              <div className="journey-checks">
                {[
                  t(names[step]),
                  t(
                    step < 3
                      ? "sandboxNote"
                      : step === 3
                        ? "riskChecks"
                        : step === 4
                          ? "approvalSecurity"
                          : "auditSecurity",
                  ),
                ].map((s) => (
                  <p key={s}>
                    <FiCheckCircle />
                    {s}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
export function SecurityVisual() {
  const { t } = useApp();
  return (
    <div className="security-visual">
      {["authSecurity", "approvalSecurity", "auditSecurity"].map((key, i) => (
        <Card key={key}>
          <span className="security-number">0{i + 1}</span>
          <FiShield className="feature-icon" />
          <h3>{t(["secureAccess", "humanControl", "traceableResults"][i])}</h3>
          <p>{t(key)}</p>
        </Card>
      ))}
    </div>
  );
}
