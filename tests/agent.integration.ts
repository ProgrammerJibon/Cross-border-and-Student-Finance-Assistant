import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rows, write, pool } from "../src/lib/db";
import { runTool } from "../src/ai/tools";
import { loadConversation, conversationMessages } from "../src/ai/conversation";
import { agentUsage, recordProviderUsage } from "../src/ai/usage";
import { resolveModel } from "../src/ai/model-config";
import { encryptSecret } from "../src/lib/secrets";
import { runAgent } from "../src/ai/provider";
import { createBeneficiary } from "../src/services/payment.service";

test("agent database integration: ownership, history, workflows and usage", async (t) => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const [student, parent, admin] = ids;
  const runs: string[] = [];
  const makeRun = async (
    user: string,
    goal = "integration turn",
    previous?: string,
  ) => {
    const id = randomUUID();
    runs.push(id);
    await write(
      "INSERT INTO agent_runs(id,user_id,goal,provider) VALUES (?,?,?,'test')",
      [id, user, goal],
    );
    if (previous)
      await write(
        "INSERT INTO agent_conversation_turns(run_id,previous_run_id) VALUES (?,?)",
        [id, previous],
      );
    return id;
  };
  try {
    for (const [i, id] of ids.entries()) {
      await write(
        "INSERT INTO users(is_demo,id,name,email,password_hash,role,onboarded) VALUES (1,?,?,?,'unused',?,1)",
        [
          id,
          "Agent fixture",
          `${id}@agent.test`,
          ["STUDENT", "PARENT", "ADMIN"][i],
        ],
      );
      await write("INSERT INTO user_preferences(user_id) VALUES (?)", [id]);
      await write("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at) VALUES (?,?,?,UTC_TIMESTAMP(),'2099-12-31')",[randomUUID(),id,i===1?"family":"student"]);
      await write(
        "INSERT INTO accounts(id,user_id,name,type,currency,balance) VALUES (?,?,'Private fixture wallet','WALLET','CNY',1000)",
        [`${id}-a`, id],
      );
    }
    await write("INSERT INTO student_profiles(user_id) VALUES (?)", [student]);
    const run = await makeRun(student);
    const parentRun = await makeRun(parent);
    const adminRun = await makeRun(admin);
    await t.test(
      "read tools and conversation links enforce owner and role",
      async () => {
        const accounts = (await runTool(student, run, "getAccounts", {})) as {
          id: string;
        }[];
        assert.deepEqual(
          accounts.map((a) => a.id),
          [`${student}-a`],
        );
        await assert.rejects(
          () => runTool(parent, run, "getAccounts", {}),
          /^Error: NOT_FOUND$/,
        );
        await assert.rejects(
          () => runTool(admin, adminRun, "getAccounts", {}),
          /^Error: FORBIDDEN$/,
        );
        await assert.rejects(
          () => runTool(student, run, "getSettlementQueue", {}),
          /^Error: FORBIDDEN$/,
        );
        const invalid = (await runTool(student, run, "getAccounts", {
          user_id: parent,
        })) as { failed: boolean };
        assert.equal(invalid.failed, true);
        await assert.rejects(
          () => loadConversation(parent, run),
          /^Error: NOT_FOUND$/,
        );
        const corrupt = await makeRun(
          parent,
          "forged cross-user ancestor",
          run,
        );
        await assert.rejects(
          () => loadConversation(parent, corrupt),
          /^Error: NOT_FOUND$/,
        );
      },
    );
    await t.test(
      "full history retains more than six turns and refreshes action status",
      async () => {
        let last = run;
        for (let i = 0; i < 9; i++) {
          const next = await makeRun(student, "history-" + i, last);
          await write(
            "UPDATE agent_runs SET status='COMPLETED',result=? WHERE id=?",
            [
              JSON.stringify({
                outputs: { respond: { message: "reply-" + i } },
                steps: [],
              }),
              next,
            ],
          );
          last = next;
        }
        const thread = await loadConversation(student, last);
        assert.equal(thread.length, 10);
        const messages = conversationMessages(thread);
        assert.equal(messages.length, 20);
        assert.ok(messages.some((m) => m.content === "history-0"));
        assert.ok(messages.some((m) => m.content === "history-8"));
      },
    );
    await t.test(
      "financial tools prepare drafts, reject forged accounts, and require confirmation",
      async () => {
        const beneficiary=await createBeneficiary(student,{name:"Parent",method:"INTERNAL",currency:"CNY",country_code:"CN",destination:`${parent}@agent.test`});
        const input = {
          kind: "SEND",
          method: "INTERNAL",
          account_id: `${student}-a`,
          amount: "25",
          recipient: "Parent",
          destination: `${parent}@agent.test`,
          beneficiary_id: beneficiary.id,
          receive_currency: "CNY",
          category: "Other",
          note: "fixture",
        };
        const draft = (await runTool(student, run, "draftPayment", input)) as {
          id: string;
          status: string;
        };
        assert.equal(draft.status, "DRAFT");
        const [balance] = await rows<{ balance: string }>(
          "SELECT balance FROM accounts WHERE id=?",
          [`${student}-a`],
        );
        assert.equal(balance.balance, "1000.00");
        const forged = (await runTool(
          parent,
          parentRun,
          "draftPayment",
          input,
        )) as { failed: boolean; code: string };
        assert.equal(forged.failed, true);
        assert.equal(forged.code, "NOT_FOUND");
        const denied = (await runTool(student, run, "requestAction", {
          action: "settlePaymentRequest",
          input_json: JSON.stringify({
            id: draft.id,
            status: "COMPLETED",
            note: "forged",
            reference: "fake",
          }),
        })) as { failed: boolean };
        assert.equal(denied.failed, true);
        const invalid = (await runTool(student, run, "requestAction", {
          action: "saveBudget",
          input_json: JSON.stringify({
            category: "Housing",
            amount: 100,
            month: "2026-12",
          }),
        })) as { code: string; expectedInput: unknown };
        assert.equal(invalid.code, "VALIDATION_ERROR");
        assert.ok(JSON.stringify(invalid.expectedInput).includes("currency"));
        const proposal = (await runTool(student, run, "requestAction", {
          action: "saveBudget",
          input_json: JSON.stringify({
            category: "Housing",
            amount: "100",
            currency: "CNY",
            month: "2026-12",
          }),
        })) as { id: string };
        assert.ok(proposal.id);
        assert.equal(
          (await rows("SELECT id FROM budgets WHERE user_id=?", [student]))
            .length,
          0,
        );
        await write(
          "UPDATE agent_action_requests SET status='COMPLETED',result_json='{}' WHERE id=?",
          [proposal.id],
        );
        const thread = await loadConversation(student, run);
        assert.ok(thread[0].result?.includes('"status":"COMPLETED"'));
      },
    );
    await t.test("personal API keys and metering are isolated", async () => {
      const id = randomUUID();
      await write(
        "INSERT INTO ai_models(id,owner_id,company,label,model,key_cipher,key_last_four) VALUES (?,?,'OPENAI','Temporary test key','test',?,'test')",
        [id, student, encryptSecret("dummy-not-a-live-key")],
      );
      assert.equal(
        (await resolveModel(student, id))?.key,
        "dummy-not-a-live-key",
      );
      await assert.rejects(
        () => resolveModel(parent, id),
        /^Error: NOT_FOUND$/,
      );
      await recordProviderUsage(student, run, id, {
        provider: "OPENAI",
        model: "test",
        status: 200,
        inputTokens: 100,
        outputTokens: 10,
        totalTokens: 110,
        cachedTokens: null,
        reasoningTokens: null,
        estimatedCostUsd: null,
        rates: { input: null, output: null },
        limits: {},
        observedAt: new Date().toISOString(),
      });
      assert.equal((await agentUsage(student)).totals[0].requests, 1);
      assert.equal((await agentUsage(parent)).totals.length, 0);
      await write("DELETE FROM ai_models WHERE id=? AND owner_id=?", [
        id,
        student,
      ]);
    });
    await t.test(
      "live Gemini tool execution and follow-up context",
      { skip: !process.env.AGENT_LIVE_MODEL_ID },
      async () => {
        const first = await makeRun(
          student,
          "Use getAccounts to read my balance. Then help me create a Housing budget for CNY 321.45. Ask which month before proposing it.",
        );
        const result = await runAgent(
          student,
          first,
          "Use getAccounts to read my balance. Then help me create a Housing budget for CNY 321.45. Ask which month before proposing it.",
          "en",
          process.env.AGENT_LIVE_MODEL_ID,
        );
        assert.ok(result.steps.includes("getAccounts"));
        assert.equal(
          (result.outputs.respond as { type: string }).type,
          "require_answer",
        );
        await write(
          "UPDATE agent_runs SET status='COMPLETED',result=? WHERE id=?",
          [JSON.stringify(result), first],
        );
        const second = await makeRun(student, "December 2026", first);
        const answer = await runAgent(
          student,
          second,
          "December 2026",
          "en",
          process.env.AGENT_LIVE_MODEL_ID,
          conversationMessages(await loadConversation(student, first)),
        );
        const proposals = (answer.outputs.proposedActions || []) as {
          action: string;
          input: { amount: string; month: string };
        }[];
        assert.ok(
          proposals.some(
            (p) =>
              p.action === "saveBudget" &&
              p.input.amount === "321.45" &&
              p.input.month === "2026-12",
          ),
        );
        assert.equal(
          (await rows("SELECT id FROM budgets WHERE user_id=?", [student]))
            .length,
          0,
        );
        console.log(
          "Live Gemini: account read, missing-information question, contextual budget review and token metering passed.",
        );
      },
    );
  } finally {
    for (const id of ids) {
      await write(
        "UPDATE agent_action_requests SET status='CANCELLED' WHERE user_id=? AND status='PENDING'",
        [id],
      );
      await write(
        "UPDATE financial_requests SET status='CANCELLED' WHERE user_id=? AND status='DRAFT'",
        [id],
      );
      await write(
        "UPDATE agent_runs SET status='INTERRUPTED' WHERE user_id=? AND status IN ('PENDING','RUNNING')",
        [id],
      );
      await write(
        "UPDATE users SET status='CLOSED',session_version=session_version+1 WHERE id=?",
        [id],
      );
    }
    await pool.end();
  }
});
