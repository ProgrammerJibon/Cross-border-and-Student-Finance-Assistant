import "server-only";
import { rows } from "@/lib/db";
import { recordProviderException } from "./webhook-events.service";

// Local integrity checks are NOT provider/bank settlement reconciliation. No
// discrepancy is repaired by minting money or editing historical entries.
export async function reconcileFinancialIntegrity() {
  const discrepancies: {environment: "live" | "sandbox"; processor: string; id: string; type: string}[] = [];
  const journal=await rows<{operation_id:string;environment:string}>("SELECT j.operation_id,o.environment FROM wallet_journal j JOIN wallet_operations o ON o.id=j.operation_id GROUP BY j.operation_id,o.environment,j.phase,j.currency HAVING SUM(IF(j.direction='DEBIT',j.amount,-j.amount))<>0");
  discrepancies.push(...journal.map(r=>({environment:r.environment==='DEMO'?'sandbox' as const:'live' as const,processor:'LEDGER',id:r.operation_id,type:'UNBALANCED_WALLET_JOURNAL'})));
  const reserves=await rows<{id:string;financial_environment:string}>("SELECT a.id,a.financial_environment FROM accounts a WHERE a.reserved_balance<>(SELECT COALESCE(SUM(o.amount),0) FROM wallet_operations o WHERE o.account_id=a.id AND o.kind='WITHDRAWAL_MANUAL' AND o.status IN ('WAITING_PARENT','PENDING_REVIEW','PROCESSING','PAID_PENDING_VERIFICATION'))+(SELECT COALESCE(SUM(r.amount),0) FROM financial_requests r WHERE r.account_id=a.id AND r.held=1 AND r.financial_environment='DEMO')");
  discrepancies.push(...reserves.map(r=>({environment:r.financial_environment==='DEMO'?'sandbox' as const:'live' as const,processor:'LEDGER',id:r.id,type:'WITHDRAWAL_RESERVATION_MISMATCH'})));
  const liveBalances=await rows<{id:string}>("SELECT a.id FROM accounts a JOIN users u ON u.id=a.user_id WHERE u.is_demo=0 AND a.balance<>0");
  discrepancies.push(...liveBalances.map(r=>({environment:"live" as const,processor:"LEDGER",id:r.id,type:"UNVERIFIED_LIVE_BALANCE"})));
  const entries=await rows<{request_id:string;financial_environment:string}>("SELECT request_id,financial_environment FROM financial_ledger_entries GROUP BY request_id,financial_environment,phase,currency HAVING SUM(IF(direction='DEBIT',amount,-amount))<>0");
  discrepancies.push(...entries.map(r=>({environment:r.financial_environment==="DEMO"?"sandbox" as const:"live" as const,processor:"LEDGER",id:r.request_id,type:"UNBALANCED_JOURNAL"})));
  const checkouts=await rows<{id:string;environment:"live"|"sandbox";provider:string}>("SELECT c.id,c.environment,c.provider FROM provider_checkouts c JOIN users u ON u.id=c.user_id WHERE c.environment<>IF(u.is_demo=1,'sandbox','live') OR (c.purpose='TOPUP' AND c.environment='live')");
  discrepancies.push(...checkouts.map(c=>({environment:c.environment,processor:c.provider,id:c.id,type:"CHECKOUT_ENVIRONMENT_OR_PURPOSE"})));
  const pending=await rows<{id:string;environment:"live"|"sandbox";provider:string}>("SELECT id,environment,provider FROM provider_checkouts WHERE status='CREATED' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 HOUR)");
  discrepancies.push(...pending.map(c=>({environment:c.environment,processor:c.provider,id:c.id,type:"PROVIDER_CHECKOUT_REQUIRES_REVIEW"})));
  const failed=await rows<{event_id:string;environment:"live"|"sandbox";processor:string}>("SELECT event_id,environment,processor FROM provider_webhook_events WHERE status='FAILED' OR (status='PROCESSING' AND lease_until<UTC_TIMESTAMP())");
  discrepancies.push(...failed.map(c=>({environment:c.environment,processor:c.processor,id:c.event_id,type:"WEBHOOK_RETRY_REQUIRED"})));
  for(const d of discrepancies) await recordProviderException(d.processor,d.environment,d.id,d.type);
  return {checkedAt:new Date().toISOString(),discrepancies:discrepancies.length,providerSettlementVerified:false};
}
