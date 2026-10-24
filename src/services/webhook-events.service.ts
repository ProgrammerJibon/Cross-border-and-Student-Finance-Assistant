import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { atomic, rows, write } from "@/lib/db";
import { requireCondition } from "@/lib/errors";
import type { Environment } from "./gateway-config.service";

// Invoke only AFTER provider signature verification. No raw PII payload is stored.
export async function processWebhook(processor: string, environment: Environment,
  id: string, type: string, body: string, process: () => Promise<void>) {
  requireCondition(typeof id === "string" && id.length > 0 && id.length <= 255 && typeof type === "string" && type.length <= 100, "INVALID_WEBHOOK");
  const hash = createHash("sha256").update(body).digest("hex");
  const key = [processor, environment, id];
  const claimed = await atomic(async db => {
    await write("INSERT IGNORE INTO provider_webhook_events(processor,environment,event_id,event_type,payload_hash) VALUES (?,?,?,?,?)", [...key,type,hash], db);
    const [event] = await rows<{status: string; payload_hash: string; leased: number}>("SELECT status,payload_hash,lease_until>UTC_TIMESTAMP() leased FROM provider_webhook_events WHERE processor=? AND environment=? AND event_id=? FOR UPDATE", key, db);
    requireCondition(event.payload_hash === hash, "WEBHOOK_REPLAY_MISMATCH");
    if (event.status === "PROCESSED") return false;
    requireCondition(!event.leased, "WEBHOOK_PROCESSING");
    await write("UPDATE provider_webhook_events SET status='PROCESSING',attempts=attempts+1,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE processor=? AND environment=? AND event_id=?", key, db);
    return true;
  });
  if (!claimed) return;
  try {
    await process();
    await write("UPDATE provider_webhook_events SET status='PROCESSED',processed_at=UTC_TIMESTAMP(),lease_until=NULL WHERE processor=? AND environment=? AND event_id=?", key);
  } catch (error) {
    await write("UPDATE provider_webhook_events SET status='FAILED',lease_until=NULL WHERE processor=? AND environment=? AND event_id=?", key);
    throw error;
  }
}

export async function recordProviderException(processor: string, environment: Environment, externalId: string, type: string) {
  requireCondition(typeof externalId === "string" && externalId.length <= 255, "INVALID_WEBHOOK");
  // No wallet credit or fabricated reversal. Operations must reconcile canonical
  // provider records and any affected subscription/settlement before resolution.
  await write("INSERT IGNORE INTO financial_reconciliation_issues(id,environment,processor,external_id,issue_type) VALUES (?,?,?,?,?)",
    [randomUUID(),environment,processor,externalId,type.slice(0,80)]);
}
