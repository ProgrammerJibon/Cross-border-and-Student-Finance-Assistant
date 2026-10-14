import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentActionCatalog,
  responseSchema,
  actionProposalSchema,
} from "../src/ai/action-catalog";
import { assessRisk } from "../src/lib/risk-engine";
test("agent action schemas reject privileged names and extra credential fields", () => {
  assert.throws(() =>
    actionProposalSchema.parse({ action: "executeSQL", input_json: "{}" }),
  );
  assert.throws(() =>
    agentActionCatalog.saveBudget.schema.parse({
      category: "Housing",
      amount: "22",
      currency: "CNY",
      month: "2026-11",
      user_id: "someone-else",
    }),
  );
  assert.throws(() =>
    responseSchema.parse({
      type: "execute_javascript",
      message: "",
      url: null,
      question: null,
      options: [],
    }),
  );
  assert.ok(!agentActionCatalog.updateControls.roles.includes("STUDENT"));
});
test("configured risk ceilings are enforced without allowing parents to relax them", () => {
  const risk = assessRisk({
    amount: "101",
    balance: "1000",
    active: true,
    owned: true,
    daily: "0",
    monthly: "0",
    frequency: 0,
    destinationActive: true,
    duplicate: false,
    deadlineMissed: false,
    providerAllowed: true,
    parentDaily: "9999",
    policy: { dailyCad: 100, monthlyCad: 200, frequency: 2, largeCad: 50 },
  });
  assert.equal(risk.allowed, false);
  assert.ok(risk.flags.includes("DAILY_LIMIT"));
});
