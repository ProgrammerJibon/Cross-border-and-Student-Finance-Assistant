"use server";
import { requireFamilyPlan } from "@/lib/entitlements";
import { fundingAssistance } from "@/services/funding-assistance.service";
import { z } from "zod";
import { requireUser, requireAdmin, requireLiveAdmin } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { rows, write, atomic } from "@/lib/db";
import { audit } from "@/lib/audit";
import { paymentMethod } from "@/lib/payment-rules";
import { id } from "@/lib/validation";
import { validCurrency } from "@/lib/catalog";
import {
  createPaymentDraft,
  confirmPayment,
  cancelPayment,
  settlePayment,
  decidePayment,
  createBeneficiary,
  decideBeneficiary,
  paymentWorkspace,
} from "@/services/payment.service";
export async function getPayments() {
  return action(async () => paymentWorkspace((await requireUser()).id));
}
export async function getFundingAssistance(requestId: string) {
  return action(async () => fundingAssistance((await requireUser()).id, id.parse(requestId)));
}
export async function draftPayment(input: unknown, key: string) {
  return action(async () =>
    createPaymentDraft((await requireUser()).id, input, key),
  );
}
export async function confirmPaymentRequest(
  requestId: string,
  card: unknown = {},
  reference = "",
) {
  return action(async () =>
    confirmPayment(
      (await requireUser()).id,
      id.parse(requestId),
      card,
      z.string().max(100).parse(reference),
    ),
  );
}
export async function cancelPaymentRequest(requestId: string) {
  return action(async () =>
    cancelPayment((await requireUser()).id, id.parse(requestId)),
  );
}
export async function parentPaymentDecision(input: unknown) {
  return action(async () => {
    const u = await requireUser("PARENT");
    await requireFamilyPlan(u.id);
    const v = z
      .object({ id, approve: z.boolean(), reason: z.string().min(3).max(500) })
      .parse(input);
    return decidePayment(u.id, v.id, v.approve, v.reason);
  });
}
export async function settlePaymentRequest(input: unknown) {
  return action(async () => {
    const u = await requireAdmin("settlements");
    const v = z
      .object({
        id,
        status: z.enum(["PROCESSING", "COMPLETED", "REJECTED", "FAILED"]),
        note: z.string().min(3).max(500),
        reference: z.string().max(100),
      })
      .parse(input);
    return settlePayment(u.id, v.id, v.status, v.note, v.reference);
  });
}
export async function addBeneficiary(input: unknown) {
  return action(async () => createBeneficiary((await requireUser()).id, input));
}
export async function parentBeneficiaryDecision(input: unknown) {
  return action(async () => {
    const u = await requireUser("PARENT");
    await requireFamilyPlan(u.id);
    const v = z
      .object({ id, approve: z.boolean(), reason: z.string().min(3).max(500) })
      .parse(input);
    return decideBeneficiary(u.id, v.id, v.approve, v.reason);
  });
}
export async function removeBeneficiary(beneficiaryId: string) {
  return action(async () => {
    const u = await requireUser();
    id.parse(beneficiaryId);
    return atomic(async (db) => {
      await rows("SELECT id FROM users WHERE id=? FOR UPDATE", [u.id], db);
      const r = await write(
        "UPDATE beneficiaries SET status='REMOVED' WHERE id=? AND user_id=?",
        [beneficiaryId, u.id],
        db,
      );
      requireCondition(r.affectedRows, "NOT_FOUND");
      await audit(
        u.id,
        "BENEFICIARY_REMOVED",
        "beneficiaries",
        beneficiaryId,
        {},
        db,
      );
      return null;
    });
  });
}
export async function savePaymentMethod(input: unknown) {
  return action(async () => {
    const u = await requireLiveAdmin("payment-methods");
    const v = z
      .object({
        code: paymentMethod,
        name: z.string().min(2).max(80),
        active: z.boolean(),
        deposit_enabled: z.boolean(),
        withdrawal_enabled: z.boolean(),
        instructions: z.string().max(2000),
        currencies: z
          .array(z.string().regex(/^[A-Z]{3}$/))
          .min(1)
          .max(200),
      })
      .parse(input);
    for (const code of v.currencies) await validCurrency(code);
    requireCondition(
      ["CARD", "INTERNAL"].includes(v.code) ||
        !v.active ||
        v.instructions.length >= 5,
      "FIELD_VALIDATION", {"instructions": "Active payment methods require instructions of at least 5 characters."},
    );
    await write(
      "UPDATE payment_methods SET name=?,active=?,deposit_enabled=?,withdrawal_enabled=?,instructions=?,currencies=? WHERE code=?",
      [
        v.name,
        v.active,
        v.deposit_enabled,
        v.withdrawal_enabled,
        v.instructions,
        JSON.stringify(v.currencies),
        v.code,
      ],
    );
    await audit(u.id, "PAYMENT_METHOD_UPDATED", "payment_methods", v.code);
    return null;
  });
}
export async function savePaymentPolicy(input: unknown) {
  return action(async () => {
    const u = await requireLiveAdmin("payment-methods");
    const v = z
      .object({ nonBeneficiaryRmb: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/) })
      .parse(input);
    await write(
      "INSERT INTO admin_settings(name,value) VALUES ('payments',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
      [JSON.stringify(v)],
    );
    await audit(
      u.id,
      "PAYMENT_POLICY_UPDATED",
      "admin_settings",
      "payments",
      v,
    );
    return null;
  });
}
