import { z } from "zod";
export const id = z.string().min(1).max(64);
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const amount = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,2})?$/)
  .refine((v) => Number(v) > 0);
export const nonnegative = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
export const shortText = z.string().trim().min(1).max(160);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !isNaN(Date.parse(v)));
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
