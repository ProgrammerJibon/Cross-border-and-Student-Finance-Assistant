import { test } from "node:test";
import assert from "node:assert/strict";
import { D, money, convert, fundingGap } from "../src/lib/money";
import { assessRisk, type RiskInput } from "../src/lib/risk-engine";
import {
  calculateQuote,
  type Provider,
} from "../src/services/remittance.service";
import { canOpen } from "../src/lib/permissions";
import { withinLimit, subscriptionActive } from "../src/lib/plan-limits";
import { normalizeLocale } from "../src/lib/i18n";
import { categoryLimitAllows } from "../src/services/parent-controls.service";
import { prepare } from "../src/services/sandbox-payment.service";
const base: RiskInput = {
  amount: "800",
  balance: "5000",
  active: true,
  owned: true,
  daily: "0",
  monthly: "0",
  frequency: 0,
  destinationActive: true,
  duplicate: false,
  deadlineMissed: false,
  providerAllowed: true,
};
test("money uses exact decimals and rounds to cents", () => {
  assert.equal(money(D(".1").plus(".2")), "0.30");
  assert.equal(money("1.005"), "1.01");
  assert.equal(convert("88500", "88.5", "1"), "1000.00");
});
test("tuition forecast includes living costs and scholarship without negative gaps", () => {
  const gap = fundingGap("8000", "5500", "1000", "0", "425", 2);
  assert.equal(gap.shortage, "1350.00");
  assert.equal(gap.monthlyTarget, "675.00");
  assert.equal(gap.readiness, 83.125);
  assert.equal(fundingGap("0", "0", "0", "0", "0", 0).readiness, 100);
  assert.equal(fundingGap("100", "200", "0", "0", "0", 1).shortage, "0.00");
});
test("provider costs include exchange spread, variable and fixed fees", () => {
  const provider: Provider = {
    id: "p",
    name: "demo",
    base_fee: "200",
    percentage_fee: "0.002",
    spread: "0.003",
    minimum: "10",
    maximum: "20000",
    eta_days: 2,
    reliability: 98,
  };
  const quote = calculateQuote(provider, "8000", "88.5", "1");
  assert.equal(quote.source_amount, "710130.39");
  assert.equal(quote.fee, "1620.26");
  assert.equal(quote.total, "711750.65");
  assert.ok(D(quote.total).gt(D("8000").mul("88.5")));
});
test("parent threshold is strict and every transfer still requires user approval", () => {
  assert.equal(
    assessRisk({ ...base, amount: "500", parentThreshold: "500" })
      .parentRequired,
    false,
  );
  assert.equal(
    assessRisk({ ...base, parentThreshold: "500" }).parentRequired,
    true,
  );
  assert.equal(assessRisk(base).approvalRequired, true);
  assert.equal(assessRisk({ ...base, parentForce: true }).parentRequired, true);
});
test("each deterministic hard stop blocks execution", () => {
  const cases: Partial<RiskInput>[] = [
    { amount: "0" },
    { active: false },
    { owned: false },
    { balance: "799.99" },
    { daily: "14900" },
    { monthly: "49900" },
    { frequency: 10 },
    { destinationActive: false },
    { duplicate: true },
    { deadlineMissed: true },
    { providerAllowed: false },
    { parentMax: "500" },
    { parentDaily: "500" },
    { parentMonthly: "500" },
  ];
  for (const input of cases)
    assert.equal(
      assessRisk({ ...base, ...input }).allowed,
      false,
      JSON.stringify(input),
    );
  assert.equal(assessRisk(base).allowed, true);
});
test("quota boundary cannot be exceeded", () => {
  assert.equal(withinLimit(2, 3), true);
  assert.equal(withinLimit(3, 3), false);
  assert.equal(withinLimit(0, 0), false);
  assert.equal(withinLimit(0, NaN), false);
});
test("parent limits can tighten but cannot relax platform risk ceilings", () => {
  assert.equal(
    assessRisk({ ...base, daily: "14900", parentDaily: "50000" }).allowed,
    false,
  );
  assert.equal(
    assessRisk({ ...base, monthly: "49900", parentMonthly: "100000" }).allowed,
    false,
  );
});
test("parent category limits allow exact boundaries and enforce the strictest linked parent", () => {
  assert.equal(categoryLimitAllows("99.90", "0.10", ["100"]), true);
  assert.equal(categoryLimitAllows("99.90", "0.11", ["100"]), false);
  assert.equal(categoryLimitAllows("90", "20", ["500", "100"]), false);
  assert.equal(categoryLimitAllows("0", "0.01", ["0"]), false);
  assert.equal(categoryLimitAllows("100", "1", []), true);
});
test("subscriptions expire and cancelled subscriptions do not authorize usage", () => {
  assert.equal(
    subscriptionActive(
      "ACTIVE",
      "2026-10-13 00:00:00",
      Date.parse("2026-10-12T00:00:00Z"),
    ),
    true,
  );
  assert.equal(
    subscriptionActive(
      "ACTIVE",
      "2026-10-11 00:00:00",
      Date.parse("2026-10-12T00:00:00Z"),
    ),
    false,
  );
  assert.equal(subscriptionActive("CANCELLED", "2027-10-13 00:00:00"), false);
});
test("routes reject cross-role access", () => {
  assert.equal(canOpen("STUDENT", "admin/users"), false);
  assert.equal(canOpen("PARENT", "dashboard"), false);
  assert.equal(canOpen("ADMIN", "parent"), false);
  assert.equal(canOpen("STUDENT", "project-evidence"), false);
  assert.equal(canOpen("ADMIN", "project-evidence"), true);
  assert.equal(canOpen("PARENT", "settings"), true);
});
test("locale fallback is deterministic", () => {
  assert.equal(normalizeLocale("fr"), "en");
  assert.equal(normalizeLocale("bn-BD"), "bn-BD");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
});
test("invalid transfer destinations are rejected before database mutations", async () => {
  const input = {
    quoteId: "quote",
    accountId: "source",
    recipient: "Recipient",
    purpose: "TUITION",
  };
  for (const invalid of [
    { ...input, invoiceId: "invoice", destinationId: "wallet" },
    { ...input, invoiceId: "invoice", purpose: "PERSONAL" },
    { ...input, purpose: "CONVERSION" },
    { ...input, destinationId: "source" },
  ])
    await assert.rejects(() => prepare("student", invalid), {
      message: "VALIDATION_ERROR",
    });
});
