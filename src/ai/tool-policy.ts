import type { Role } from "@/types";
const shared = [
  "getActionCapabilities",
  "getWorkspaceData",
  "requestAction",
  "respond",
  "getFxRates",
  "calculate",
  "getActivity",
];
const customer = [
  "getAccounts",
  "analyseTransactions",
  "getPaymentOptions",
  "getPaymentRequests",
  "getBeneficiaries",
  "draftPayment",
  "assessPaymentRisk",
  "addBeneficiary",
  "searchTransactions",
];
const student = [
  "getStudentProfile",
  "calculateTuitionGap",
  "compareRemittance",
  "prepareTransfer",
  "generateBudgetSuggestion",
  "analyseFinancialHealth",
  "getCreditGuidance",
  "createAlert",
  "executeSandboxTransfer",
  "getTransfers",
];
export function canUseAgentTool(role: Role, name: string) {
  return (
    ["STUDENT", "PARENT", "ADMIN"].includes(role) &&
    (shared.includes(name) ||
      (["STUDENT", "PARENT"].includes(role) && customer.includes(name)) ||
      (role === "STUDENT" && student.includes(name)) ||
      (role === "PARENT" && name === "getApprovals") ||
      (role === "ADMIN" &&
        ["getAdminConfiguration", "getSettlementQueue"].includes(name)))
  );
}
