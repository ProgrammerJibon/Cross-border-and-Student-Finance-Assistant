"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { action } from "@/lib/errors";
import { amount, currency, id, shortText } from "@/lib/validation";
import { atomic, write } from "@/lib/db";
import { compareQuotes } from "@/services/remittance.service";
import { prepare, approve, execute } from "@/services/sandbox-payment.service";
import { validCurrency } from "@/lib/catalog";
import { requireDemoFinance } from "@/lib/financial-environment";
export async function compareTransfers(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    await requireDemoFinance(u.id);
    const v = z
      .object({ amount, source: currency, target: currency })
      .refine((v) => v.source !== v.target)
      .parse(input);
    await validCurrency(v.source);
    await validCurrency(v.target);
    const quotes = await compareQuotes(v.amount, v.source, v.target);
    return atomic(async (db) => {
      const saved = [];
      for (const q of quotes) {
        const key = randomUUID();
        await write(
          "INSERT INTO transfer_quotes(id,user_id,provider_id,source_currency,target_currency,receive_amount,source_amount,fee,total,rate,eta_days,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))",
          [
            key,
            u.id,
            q.provider_id,
            v.source,
            v.target,
            q.receive_amount,
            q.source_amount,
            q.fee,
            q.total,
            q.rate,
            q.eta_days,
          ],
          db,
        );
        saved.push({ ...q, id: key });
      }
      return saved;
    });
  });
}
export async function prepareTransfer(input: unknown) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    const v = z
      .object({
        quoteId: id,
        accountId: id,
        recipient: shortText,
        purpose: z.enum([
          "TUITION",
          "LIVING",
          "FAMILY",
          "PERSONAL",
          "CONVERSION",
        ]),
        invoiceId: id.optional(),
        destinationId: id.optional(),
      })
      .refine((v) => v.purpose !== "CONVERSION" || !!v.destinationId)
      .parse(input);
    return prepare(u.id, v);
  });
}
export async function approveTransfer(transferId: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    return approve(u.id, id.parse(transferId));
  });
}
export async function executeTransfer(transferId: string, token: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    return execute(
      u.id,
      id.parse(transferId),
      z.string().length(64).parse(token),
    );
  });
}
