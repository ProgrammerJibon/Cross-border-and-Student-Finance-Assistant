import { z } from "zod";
import { amount, currency, id } from "./validation";
export const paymentMethod = z.enum([
  "INTERNAL",
  "CARD",
  "BANK",
  "PAYPAL",
  "ALIPAY",
  "WECHAT",
  "UNIONPAY",
  "STRIPE",
]);
export const beneficiarySchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    method: paymentMethod.exclude(["CARD"]),
    currency,
    country_code: z.string().regex(/^[A-Z]{2}$/),
    destination: z.string().trim().min(3).max(1500),
  })
  .strict();
// All fields required (nullable when unused) to support strict provider function schemas.
export const requestSchema = z
  .object({
    kind: z.enum(["TOPUP", "SEND", "WITHDRAW"]),
    account_id: id,
    method: paymentMethod,
    amount,
    recipient: z.string().trim().max(160),
    destination: z.string().trim().max(1500),
    beneficiary_id: id.nullable(),
    receive_currency: currency,
    category: z.enum([
      "Housing",
      "Food",
      "Education",
      "Transport",
      "Shopping",
      "Utilities",
      "Health",
      "Other",
    ]),
    note: z.string().max(500),
  })
  .strict();
export const cardSchema = z.object({
  cardholder: z.string().max(100).default(""),
  card: z.enum(["4242424242424242", "4000000000000002", ""]).default(""),
  expiry: z.string().default(""),
  cvv: z.string().default(""),
  savedCardId: z.string().max(64).default(""),
  saveCard: z.boolean().default(false),
});
export const terminalStatuses = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
];
export function canSettle(from: string, to: string) {
  return (
    (from === "QUEUED" && ["PROCESSING", "REJECTED"].includes(to)) ||
    (from === "PROCESSING" && ["COMPLETED", "FAILED"].includes(to))
  );
}
