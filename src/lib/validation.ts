import { z } from "zod";
import { monthlyDate } from "./tuition-schedule";
export const id = z.string().min(1).max(64);
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0, "Amount must be greater than zero.");
export const nonnegative = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export const shortText = z.string().trim().min(1).max(160);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Enter a real calendar date.");
export const studentStatus = z.enum(["FULL_TIME", "PART_TIME", "PROSPECTIVE", "GRADUATED"]);
export const tuitionDetails = {
  programme: shortText,
  funding_needs: nonnegative,
  payment_schedule: z.enum(["ONE_OFF", "MONTHLY", "TERM"]),
  first_due_date: day,
  installments: z.coerce.number().int().min(1).max(60),
};
export function validTuitionSchedule(v: { first_due_date: string; due_date: string; payment_schedule: string; installments: number }) {
  if (!day.safeParse(v.first_due_date).success || !day.safeParse(v.due_date).success) return false;
  if(v.payment_schedule === "ONE_OFF") return v.installments===1 && v.first_due_date===v.due_date;
  return v.installments>=2 && v.first_due_date<v.due_date && (v.payment_schedule!=="MONTHLY" || monthlyDate(v.first_due_date,v.installments-1)===v.due_date);
}
export const accountSchema = z.object({
  id: id.optional(),
  name: shortText,
  type: z.enum(["BANK", "CASH", "WALLET", "SAVINGS"]),
  currency,
  balance: nonnegative,
});
export const transactionSchema = z.object({
  account_id: id,
  description: shortText,
  amount,
  category: z.enum([
    "Housing",
    "Food",
    "Education",
    "Transport",
    "Shopping",
    "Utilities",
    "Health",
    "Other",
    "Income",
  ]),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: day,
  notes: z.string().max(500).default(""),
});
export const tuitionSchema = z.object({
  ...tuitionDetails,
  id: id.optional(),
  name: shortText,
  amount,
  currency,
  due_date: day,
  paid: nonnegative,
  scholarship: nonnegative,
  semester: shortText,
});
export const budgetSchema = z.object({
  id: id.optional(),
  category: transactionSchema.shape.category,
  amount,
  currency,
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
