import { z } from "zod";
import { D } from "./money";
import { requireCondition } from "./errors";
export const manualMethods = ["UNIONPAY", "ALIPAY", "PAYPAL", "BKASH", "NAGAD", "ROCKET"] as const;
export const walletAmount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/).refine(v=>D(v).gt(0));
export function validateWalletAmount(amount: string, currency: string) {
  walletAmount.parse(amount);
  const digits = new Intl.NumberFormat("en", {style:"currency",currency}).resolvedOptions().maximumFractionDigits ?? 2;
  // Existing database stores cents. Reject three-decimal currencies rather than rounding.
  requireCondition(digits<=2 && D(amount).decimalPlaces()<=digits,"UNSUPPORTED_PRECISION");
}
export function validateIdentifier(method: string, value: string) {
  requireCondition(value.length>=3 && value.length<=190,"INVALID_DESTINATION");
  if (["BKASH","NAGAD","ROCKET"].includes(method))
    requireCondition(method==="ROCKET" ? /^(?:\+?88)?01\d{9,10}$/.test(value) : /^(?:\+?88)?01\d{9}$/.test(value),"INVALID_DESTINATION");
  else if (method==="PAYPAL") requireCondition(z.email().safeParse(value).success,"INVALID_DESTINATION");
  else if (method==="UNIONPAY") requireCondition(/^[\d -]{12,30}$/.test(value) || value.startsWith("DEMO-"),"INVALID_DESTINATION");
  else if (method==="ALIPAY") requireCondition(z.email().safeParse(value).success || /^\+?[\d -]{6,20}$/.test(value) || value.startsWith("DEMO-"),"INVALID_DESTINATION");
}
export function identifierHint(value:string) { return value.length>4 ? `••••${value.slice(-4)}` : "••••"; }
