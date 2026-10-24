import { z } from "zod";

export const approvalSchema = z.object({
  processor: z.enum(["STRIPE", "PAYPAL"]),
  merchantAccount: z.string().min(1),
  merchantCountry: z.string().regex(/^[A-Z]{2}$/),
  customerCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1),
  operation: z.literal("PLAN"),
  methods: z.array(z.enum(["STRIPE", "PAYPAL", "UNIONPAY", "ALIPAY", "WECHAT"])).min(1),
  evidence: z.string().min(8),
  expiresAt: z.iso.datetime(),
});
export type MerchantApproval = z.infer<typeof approvalSchema>;
// Funding/remittance/payouts have no authorized settlement adapter yet. Config
// cannot turn a merchant checkout into a money-transmission capability.
export function eligiblePayment(input: {
  provider: string; operation: string; currency: string; customerCountry: string;
  approvals: MerchantApproval[]; now?: number; suspended?: boolean;
}) {
  if (input.suspended || input.operation !== "PLAN") return false;
  const processor = input.provider === "PAYPAL" ? "PAYPAL" : "STRIPE";
  return input.approvals.some(a => a.processor === processor &&
    a.operation === input.operation && a.methods.includes(input.provider as MerchantApproval["methods"][number]) &&
    a.customerCountries.includes(input.customerCountry) && a.currencies.includes(input.currency) &&
    Date.parse(a.expiresAt) > (input.now ?? Date.now()));
}
