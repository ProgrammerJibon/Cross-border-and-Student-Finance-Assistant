import { randomUUID } from "node:crypto";
import { write, type DB } from "./db";
export async function audit(
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  metadata: unknown = {},
  db?: DB,
) {
  await write(
    "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,metadata) VALUES (?,?,?,?,?,?)",
    [randomUUID(), actor, action, entity, entityId, JSON.stringify(metadata)],
    db,
  );
}
export async function notify(
  userId: string,
  type: string,
  detail: string,
  db?: DB,
) {
  await write(
    "INSERT INTO notifications (id,user_id,type,detail) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM user_preferences WHERE user_id=? AND notifications=1)",
    [randomUUID(), userId, type, detail.slice(0, 500), userId],
    db,
  );
}
