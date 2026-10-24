import { z } from "zod";
import {
  accountSchema,
  budgetSchema,
  tuitionSchema,
  transactionSchema,
  id,
  amount,
  nonnegative,
  currency,
} from "@/lib/validation";
import { beneficiarySchema } from "@/lib/payment-rules";
const student = ["STUDENT"];
const customer = ["STUDENT", "PARENT"];
const parent = ["PARENT"];
const admin = ["ADMIN"];
const everyone = ["STUDENT", "PARENT", "ADMIN"];
export const agentActionCatalog = {
  saveAccount: {
    roles: customer,
    route: "money",
    description:
      "Create a zero-balance account or rename an existing account. Never change its currency or turn a cash record into a payment wallet.",
    schema: accountSchema.strict(),
  },
  archiveAccount: {
    roles: customer,
    route: "money",
    description: "Archive an empty account.",
    schema: z.object({ account_id: id }).strict(),
  },
  saveBudget: {
    roles: student,
    route: "budget",
    description:
      "Save a monthly category budget. Rent planning uses Housing. Amount is in the specified currency.",
    schema: budgetSchema.strict(),
  },
  saveTuition: {
    roles: student,
    route: "tuition",
    description:
      "Create or edit a tuition invoice. Ask for name, amount, currency, due date and semester; paid and scholarship are required.",
    schema: tuitionSchema.strict(),
  },
  saveFundingPlan: {
    roles: student,
    route: "tuition",
    description: "Save a monthly funding target for an owned tuition invoice.",
    schema: z
      .object({
        invoice_id: id,
        monthly_target: amount,
        scenario: z.record(z.string(), z.number().finite()),
      })
      .strict(),
  },
  addTransaction: {
    roles: customer,
    route: "transactions",
    description:
      "Record an expense, or cash income. Wallet deposits must use draftPayment instead. Requires account, amount, category and date.",
    schema: transactionSchema.strict(),
  },
  categorizeTransaction: {
    roles: customer,
    route: "transactions",
    description: "Change a transaction category.",
    schema: z
      .object({
        transaction_id: id,
        category: transactionSchema.shape.category,
      })
      .strict(),
  },
  createReminder: {
    roles: student,
    route: "alerts",
    description: "Create a personal reminder after user review.",
    schema: z.object({ detail: z.string().min(1).max(500) }).strict(),
  },
  updateAlert: {
    roles: customer,
    route: "alerts",
    description: "Read, dismiss or snooze an owned alert.",
    schema: z
      .object({ id, status: z.enum(["READ", "DISMISSED", "SNOOZED"]) })
      .strict(),
  },
  updateCredit: {
    roles: student,
    route: "credit",
    description:
      "Update educational credit readiness inputs. Ask for each value; do not invent credit history.",
    schema: z
      .object({
        utilization: z.number().int().min(0).max(100),
        age_months: z.number().int().min(0).max(1200),
        overdue: z.number().int().min(0).max(100),
        on_time: z.number().int().min(0).max(1200),
      })
      .strict(),
  },
  toggleCreditTask: {
    roles: student,
    route: "credit",
    description: "Mark a credit checklist item complete or incomplete.",
    schema: z
      .object({
        task: z.enum([
          "creditReminders",
          "creditUtilization",
          "creditHistory",
          "creditReport",
        ]),
        completed: z.boolean(),
      })
      .strict(),
  },
  updatePreferences: {
    roles: everyone,
    route: "settings",
    description:
      "Change theme, language, country, currency, time zone or notifications.",
    schema: z
      .object({
        theme: z.enum(["light", "dark"]).optional(),
        language: z.enum(["en", "zh-CN", "bn-BD"]).optional(),
        country_code: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
        preferred_currency: currency.optional(),
        timezone: z.string().max(80).optional(),
        notifications: z.boolean().optional(),
        auto_alerts: z.boolean().optional(),
      })
      .strict(),
  },
  updateProfile: {
    roles: everyone,
    route: "settings",
    description:
      "Change your display name. Photos and email use the secure settings page.",
    schema: z.object({ name: z.string().min(2).max(100) }).strict(),
  },
  inviteStudent: {
    roles: parent,
    route: "parent/students",
    description: "Invite a registered student to the family using their email.",
    schema: z.object({ email: z.string().email() }).strict(),
  },
  acceptInvitation: {
    roles: student,
    route: "family",
    description: "Accept a family invitation token supplied by the user.",
    schema: z.object({ token: z.string().min(1).max(200) }).strict(),
  },
  updateFamily: {
    roles: parent,
    route: "parent/controls",
    description:
      "Update a family link or its visibility fields. Use getWorkspaceData family for the actual link ID.",
    schema: z
      .object({
        id,
        status: z.enum(["LINKED", "REVOKED"]).optional(),
        visibility: z
          .object({
            balances: z.boolean(),
            categories: z.boolean(),
            descriptions: z.boolean(),
            tuition: z.boolean(),
            budgets: z.boolean(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  },
  updateControls: {
    roles: parent,
    route: "parent/controls",
    description:
      "Set linked child controls; all money limits in RMB. Preserve fields the user did not ask to change. Read current controls first.",
    schema: z
      .object({
        link_id: id,
        threshold: nonnegative,
        per_transfer: amount,
        daily_limit: amount,
        monthly_limit: amount,
        tuition_approval: z.boolean(),
        conversion_approval: z.boolean(),
        auto_approve: z.boolean(),
        allow_non_beneficiary: z.boolean(),
        non_beneficiary_limit: nonnegative,
        category_limits: z.record(z.string(), nonnegative),
      })
      .strict(),
  },
  addBeneficiary: {
    roles: customer,
    route: "beneficiaries",
    description:
      "Add a beneficiary. Student beneficiaries still require linked-parent approval.",
    schema: beneficiarySchema,
  },
  removeBeneficiary: {
    roles: customer,
    route: "beneficiaries",
    description: "Remove your beneficiary.",
    schema: z.object({ beneficiary_id: id }).strict(),
  },
  cancelPayment: {
    roles: customer,
    route: "payments",
    description:
      "Cancel your eligible payment request and release its held funds through the financial service.",
    schema: z.object({ request_id: id }).strict(),
  },
  parentPaymentDecision: {
    roles: parent,
    route: "parent/approvals",
    description:
      "Prepare a parent decision for explicit review. The model never approves by itself.",
    schema: z
      .object({
        request_id: id,
        approve: z.boolean(),
        reason: z.string().min(3).max(500),
      })
      .strict(),
  },
  parentBeneficiaryDecision: {
    roles: parent,
    route: "beneficiaries",
    description: "Prepare a parent beneficiary decision for explicit review.",
    schema: z
      .object({
        beneficiary_id: id,
        approve: z.boolean(),
        reason: z.string().min(3).max(500),
      })
      .strict(),
  },
  cancelSubscription: {
    roles: student,
    route: "subscription",
    description: "Cancel your subscription after explicit review.",
    schema: z.object({}).strict(),
  },
  manageSavedCard: {
    roles: customer,
    route: "settings",
    description:
      "Rename or remove a saved demo card. Never request full card details in chat.",
    schema: z
      .object({
        id,
        label: z.string().min(1).max(80).optional(),
        remove: z.boolean().optional(),
      })
      .strict(),
  },
  selectAiModel: {
    roles: everyone,
    route: "agent",
    description:
      "Choose an available model ID or mock. API keys must be entered on API Keys.",
    schema: z.object({ model_id: id }).strict(),
  },
  submitReport: {
    roles: everyone,
    route: "reports",
    description: "Submit a support report after review.",
    schema: z
      .object({
        category: z.enum([
          "AI",
          "TRANSACTION",
          "CALCULATION",
          "ACCOUNT",
          "APPLICATION",
        ]),
        subject: z.string().min(3).max(160),
        description: z.string().min(10).max(4000),
        related_id: z.string().max(64).default(""),
        priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
      })
      .strict(),
  },
  decideApproval: {
    roles: parent,
    route: "parent/approvals",
    description:
      "Review a legacy remittance approval. Requires explicit confirmation.",
    schema: z
      .object({
        id,
        decision: z.enum(["APPROVED", "REJECTED"]),
        reason: z.string().min(3).max(500),
      })
      .strict(),
  },
  settlePaymentRequest: {
    roles: admin,
    route: "admin/settlements",
    description:
      "Review a manual payment settlement transition. Requires explicit confirmation; never invent a payout reference.",
    schema: z
      .object({
        id,
        status: z.enum(["PROCESSING", "COMPLETED", "REJECTED", "FAILED"]),
        note: z.string().min(3).max(500),
        reference: z.string().max(100),
      })
      .strict(),
  },
  saveRate: {
    roles: admin,
    route: "admin/finance",
    description: "Update a sandbox FX rate after review.",
    schema: z
      .object({ currency, rate: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/) })
      .strict(),
  },
  saveFinancialPolicy: {
    roles: admin,
    route: "admin/finance",
    description:
      "Review platform financial ceilings in RMB. Read existing configuration and preserve unchanged values.",
    schema: z
      .object({
        dailyRmb: nonnegative,
        monthlyRmb: nonnegative,
        largeRmb: nonnegative,
        frequency: z.number().int().min(1).max(1000),
      })
      .strict(),
  },
  saveCorridor: {
    roles: admin,
    route: "admin/finance",
    description: "Add or remove a remittance currency route.",
    schema: z
      .object({
        provider_id: id,
        source_currency: currency,
        target_currency: currency,
        remove: z.boolean(),
      })
      .strict(),
  },
  saveCountry: {
    roles: admin,
    route: "admin/catalog",
    description: "Review a country catalog change.",
    schema: z
      .object({
        code: z.string().regex(/^[A-Z]{2}$/),
        name: z.string().min(2).max(100),
        currency_code: currency,
        active: z.boolean(),
      })
      .strict(),
  },
  saveCurrency: {
    roles: admin,
    route: "admin/catalog",
    description: "Review a currency catalog and rate change.",
    schema: z
      .object({
        code: currency,
        name: z.string().min(2).max(80),
        symbol: z.string().min(1).max(10),
        rate: z.string().regex(/^\d{1,10}(\.\d{1,8})?$/),
        active: z.boolean(),
      })
      .strict(),
  },
  savePaymentPolicy: {
    roles: admin,
    route: "admin/payment-methods",
    description: "Review the one-time beneficiary payment limit in RMB.",
    schema: z
      .object({ nonBeneficiaryRmb: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/) })
      .strict(),
  },
  savePaymentMethod: {
    roles: admin,
    route: "admin/payment-methods",
    description:
      "Review a payment channel configuration. Never invent receiving instructions.",
    schema: z
      .object({
        code: z.enum([
          "INTERNAL",
          "CARD",
          "BANK",
          "PAYPAL",
          "ALIPAY",
          "WECHAT",
          "UNIONPAY",
        ]),
        name: z.string().min(2).max(80),
        active: z.boolean(),
        deposit_enabled: z.boolean(),
        withdrawal_enabled: z.boolean(),
        instructions: z.string().max(2000),
        currencies: z.array(currency).min(1).max(200),
      })
      .strict(),
  },
  saveCreditGuidance: {
    roles: admin,
    route: "admin/finance",
    description: "Review the educational credit checklist for a country.",
    schema: z
      .object({
        country: z.string().regex(/^(default|[A-Z]{2})$/),
        tasks: z
          .array(
            z.enum([
              "creditReminders",
              "creditUtilization",
              "creditHistory",
              "creditReport",
            ]),
          )
          .min(1)
          .max(4),
      })
      .strict(),
  },
  saveProvider: {
    roles: admin,
    route: "admin/finance",
    description:
      "Review remittance provider configuration. Read and preserve unchanged fields.",
    schema: z
      .object({
        id,
        name: z.string().min(2).max(100),
        base_fee: nonnegative,
        percentage_fee: z.number().min(0).max(0.25),
        spread: z.number().min(0).max(0.25),
        minimum: nonnegative,
        maximum: nonnegative,
        eta_days: z.number().int().min(0).max(30),
        reliability: z.number().int().min(0).max(100),
        active: z.boolean(),
      })
      .strict(),
  },
  savePlan: {
    roles: admin,
    route: "admin/plans",
    description:
      "Review subscription plan pricing and quotas. Read and preserve unchanged values.",
    schema: z
      .object({
        id,
        name: z.string().min(2).max(40),
        description_key: z.string().max(80),
        monthly: nonnegative,
        yearly: nonnegative,
        currency,
        trial_days: z.number().int().min(0).max(365),
        active: z.boolean(),
        recommended: z.boolean(),
        display_order: z.number().int().min(0).max(100),
        limits: z
          .object({
            ACCOUNTS: z.number().int().min(1),
            AGENT_MESSAGES: z.number().int().min(0),
            TRANSFER_SIMULATIONS: z.number().int().min(0),
            TUITION_PLANS: z.number().int().min(0),
            CSV_IMPORTS: z.number().int().min(0),
            PARENT_LINKS: z.number().int().min(0),
            BENEFICIARIES: z.number().int().min(0),
            BUDGETS: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  },
} as const;
export type AgentActionName = keyof typeof agentActionCatalog;
export const responseSchema = z
  .object({
    type: z.enum(["message", "open_page", "require_answer"]),
    intent: z.string().min(1).max(200).default("assist"),
    message: z.string().max(4000),
    url: z.string().max(160).nullable(),
    question: z.string().max(1000).nullable(),
    options: z.array(z.string().max(160)).max(6),
  })
  .strict();
export const actionProposalSchema = z
  .object({
    action: z.enum(
      Object.keys(agentActionCatalog) as [
        AgentActionName,
        ...AgentActionName[],
      ],
    ),
    input_json: z.string().max(12000),
  })
  .strict();
export const agentRoutes = [
  "dashboard",
  "money",
  "payments",
  "beneficiaries",
  "transactions",
  "wallet",
  "transfer",
  "tuition",
  "budget",
  "credit",
  "alerts",
  "activity",
  "family",
  "parent",
  "parent/students",
  "parent/approvals",
  "parent/controls",
  "subscription",
  "subscription/checkout",
  "settings",
  "api-keys",
  "agent",
  "admin",
  "admin/users",
  "admin/reports",
  "admin/team",
  "admin/finance",
  "admin/catalog",
  "admin/plans",
  "admin/subscriptions",
  "admin/settlements",
  "admin/payment-methods",
  "admin/models",
  "admin/audit",
  "admin/agent",
  "admin/risk",
  "reports",
  "security-assessment",
];
