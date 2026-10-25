import "server-only";
import { rows, write, atomic, type DB } from "@/lib/db";
import { financialIdentity, requireSameEnvironment } from "@/lib/financial-environment";
import { requireCondition } from "@/lib/errors";
import { z } from "zod";

export async function familyRecipient(sender: string, recipient: string, db?: DB) {
  const target = await requireSameEnvironment(sender, recipient, db);
  const actor = await financialIdentity(sender, db);
  if (sender === recipient || !["STUDENT", "PARENT"].includes(target.role)) return false;
  const direct = await rows(`SELECT id FROM family_links WHERE status='LINKED' AND
    ((student_id=? AND parent_id=?) OR (student_id=? AND parent_id=?))`, [sender, recipient, recipient, sender], db);
  if (direct.length) return true;
  // Two students may share an accepted active parent. Shared children do not
  // establish consent between two parents; they still require beneficiaries.
  if (actor.role !== "STUDENT" || target.role !== "STUDENT") return false;
  return (await rows(`SELECT a.id FROM family_links a JOIN family_links b ON b.parent_id=a.parent_id
    JOIN users p ON p.id=a.parent_id WHERE a.student_id=? AND b.student_id=?
    AND a.status='LINKED' AND b.status='LINKED' AND p.status='ACTIVE' AND p.is_demo=?`,
    [sender, recipient, actor.is_demo], db)).length > 0;
}

export async function requireRecipient(sender: string, recipient: string, beneficiary: string | null, currency: string, db?: DB) {
  const target = await requireSameEnvironment(sender, recipient, db);
  requireCondition(sender !== recipient && ["STUDENT", "PARENT"].includes(target.role), "RECIPIENT_UNAVAILABLE");
  if (await familyRecipient(sender, recipient, db)) return;
  requireCondition(beneficiary, "BENEFICIARY_REQUIRED");
  const [approved] = await rows(`SELECT b.id FROM beneficiaries b JOIN users u ON u.id=?
    WHERE b.id=? AND b.user_id=? AND b.method='INTERNAL' AND b.status='APPROVED'
    AND b.currency=? AND LOWER(TRIM(b.destination))=LOWER(u.email)
    AND b.financial_environment=IF(u.is_demo=1,'DEMO','LIVE')`, [recipient, beneficiary, sender, currency], db);
  requireCondition(approved, "BENEFICIARY_REQUIRED");
}

export const maskEmail = (email: string) => email.replace(/^(.)(.*)(@.*)$/, "$1***$3");
export async function discoverRecipients(userId: string, query: string, page = 0) {
  const term = z.string().trim().min(3).max(190).parse(query).toLowerCase();
  const offset = z.number().int().min(0).max(4).parse(page) * 10;
  const actor = await financialIdentity(userId);
  requireCondition(["STUDENT", "PARENT"].includes(actor.role));
  const attempts = await atomic(async db => {
    await write(`INSERT INTO auth_attempts(identifier,attempts,window_start) VALUES (?,1,UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE attempts=IF(window_start<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE),1,attempts+1),
      window_start=IF(window_start<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE),UTC_TIMESTAMP(),window_start)`, [`discovery:${userId}`], db);
    return (await rows<{attempts:number}>("SELECT attempts FROM auth_attempts WHERE identifier=?", [`discovery:${userId}`], db))[0].attempts;
  });
  requireCondition(attempts <= 20, "RATE_LIMITED");
  if (term.includes("@") && !z.email().safeParse(term).success) return [];
  const found = await rows<{id:string;name:string;email:string;role:string}>(`SELECT id,name,email,role FROM users
    WHERE id<>? AND is_demo=? AND status='ACTIVE' AND role IN ('STUDENT','PARENT') AND discoverable=1
    AND ${term.includes("@") ? "LOWER(email)=?" : "LOCATE(?,LOWER(name))>0"}
    ORDER BY LOWER(name)=? DESC, LOCATE(?,LOWER(name))=1 DESC,name,id LIMIT 10 OFFSET ${offset}`, [userId, actor.is_demo, term,term,term]);
  return found.map(u => ({id:u.id,name:u.name,role:u.role,email:maskEmail(u.email)}));
}

export async function eligibleRecipients(userId: string) {
  const actor = await financialIdentity(userId);
  const candidates = await rows<{id:string;name:string;email:string;role:string}>(`SELECT DISTINCT u.id,u.name,u.email,u.role FROM users u
    WHERE u.id<>? AND u.is_demo=? AND u.status='ACTIVE' AND u.role IN ('STUDENT','PARENT') AND
    (EXISTS(SELECT 1 FROM family_links f WHERE f.status='LINKED' AND ((f.student_id=? AND f.parent_id=u.id) OR (f.parent_id=? AND f.student_id=u.id)))
    OR EXISTS(SELECT 1 FROM family_links a JOIN family_links b ON b.parent_id=a.parent_id JOIN users p ON p.id=a.parent_id
      WHERE a.student_id=? AND b.student_id=u.id AND a.status='LINKED' AND b.status='LINKED' AND p.status='ACTIVE' AND p.is_demo=?))
    ORDER BY u.name,u.id LIMIT 100`, [userId,actor.is_demo,userId,userId,userId,actor.is_demo]);
  return candidates.map(u=>({...u,email:maskEmail(u.email)}));
}
