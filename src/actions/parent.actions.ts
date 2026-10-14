"use server";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { atomic, rows, write } from "@/lib/db";
import { action, requireCondition } from "@/lib/errors";
import { id, nonnegative, amount } from "@/lib/validation";
import { audit, notify } from "@/lib/audit";
import { checkUsageLimit, incrementUsage } from "@/lib/plan-limits";
import { getRates, inCurrency } from "@/services/currency.service";
export async function inviteStudent(email: string) {
  return action(async () => {
    const u = await requireUser("PARENT");
    z.email().max(190).parse(email);
    return atomic(async (db) => {
      await checkUsageLimit(u.id, "PARENT_LINKS", db);
      const [student] = await rows<{ id: string }>(
        "SELECT id FROM users WHERE email=? AND role='STUDENT' AND status='ACTIVE'",
        [email.toLowerCase()],
        db,
      );
      requireCondition(student, "STUDENT_NOT_FOUND");
      requireCondition(
        !(
          await rows(
            "SELECT id FROM family_links WHERE student_id=? AND parent_id=? AND status<>'REVOKED'",
            [student.id, u.id],
            db,
          )
        ).length,
        "INVALID_STATE",
      );
      const token = randomBytes(24).toString("hex");
      const link = randomUUID();
      await write(
        "INSERT INTO family_links(id,student_id,parent_id,invited_by,invite_hash,invite_email,status,expires_at,visibility) VALUES (?,?,?,'PARENT',?,?,'INVITED',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 7 DAY),?)",
        [
          link,
          student.id,
          u.id,
          createHash("sha256").update(token).digest("hex"),
          email.toLowerCase(),
          JSON.stringify({
            balances: true,
            categories: true,
            descriptions: false,
            tuition: true,
            budgets: false,
          }),
        ],
        db,
      );
      await write(
        "INSERT INTO parental_controls(link_id) VALUES (?)",
        [link],
        db,
      );
      await incrementUsage(u.id, "PARENT_LINKS", db);
      await audit(u.id, "PARENT_INVITED", "family_links", link, {}, db);
      return { token };
    });
  });
}
export async function acceptInvitation(token: string) {
  return action(async () => {
    const u = await requireUser("STUDENT");
    z.string().length(48).parse(token);
    return atomic(async (db) => {
      const [f] = await rows<{
        id: string;
        student_id: string;
        invite_email: string;
      }>(
        "SELECT * FROM family_links WHERE invite_hash=? AND invited_by='PARENT' AND status='INVITED' AND expires_at>UTC_TIMESTAMP() FOR UPDATE",
        [createHash("sha256").update(token).digest("hex")],
        db,
      );
      requireCondition(
        f && f.student_id === u.id && f.invite_email === u.email.toLowerCase(),
        "INVALID_TOKEN",
      );
      await write(
        "UPDATE family_links SET status='LINKED',invite_hash=NULL WHERE id=?",
        [f.id],
        db,
      );
      await notify(f.student_id, "LINK_CONFIRMATION", f.id, db);
      await audit(u.id, "PARENT_ACCEPTED", "family_links", f.id, {}, db);
      return null;
    });
  });
}
export async function updateFamily(input: unknown) {
  return action(async () => {
    const u = await requireUser("PARENT");
    const v = z
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
          .optional(),
      })
      .parse(input);
    return atomic(async (db) => {
      const [f] = await rows<{ status: string }>(
        "SELECT status FROM family_links WHERE id=? AND parent_id=? FOR UPDATE",
        [v.id, u.id],
        db,
      );
      requireCondition(f, "NOT_FOUND");
      if (v.status === "LINKED")
        requireCondition(f.status === "PENDING", "INVALID_STATE");
      if (v.status)
        await write(
          "UPDATE family_links SET status=? WHERE id=?",
          [v.status, v.id],
          db,
        );
      if (v.visibility)
        await write(
          "UPDATE family_links SET visibility=? WHERE id=?",
          [JSON.stringify(v.visibility), v.id],
          db,
        );
      await audit(u.id, "FAMILY_UPDATED", "family_links", v.id, {}, db);
      return null;
    });
  });
}
export async function updateControls(input: unknown) {
  return action(async () => {
    const u = await requireUser("PARENT");
    const v = z
      .object({
        link_id: id,
        threshold: nonnegative,
        per_transfer: amount,
        daily_limit: amount,
        monthly_limit: amount,
        tuition_approval: z.boolean(),
        conversion_approval: z.boolean(),
        auto_approve: z.boolean().default(false),
        allow_non_beneficiary: z.boolean().default(false),
        non_beneficiary_limit: nonnegative.default("0"),
        category_limits: z
          .partialRecord(
            z.enum([
              "Housing",
              "Food",
              "Education",
              "Transport",
              "Shopping",
              "Utilities",
              "Health",
              "Other",
            ]),
            nonnegative,
          )
          .default({}),
      })
      .parse(input);
    return atomic(async (db) => {
      const [owner] = await rows<{ student_id: string }>(
        "SELECT student_id FROM family_links WHERE id=? AND parent_id=? AND status='LINKED'",
        [v.link_id, u.id],
        db,
      );
      requireCondition(owner, "NOT_FOUND");
      await rows(
        "SELECT id FROM users WHERE id=? FOR UPDATE",
        [owner.student_id],
        db,
      );
      const [f] = await rows(
        "SELECT id FROM family_links WHERE id=? AND parent_id=? AND status='LINKED' FOR UPDATE",
        [v.link_id, u.id],
        db,
      );
      requireCondition(f, "NOT_FOUND");
      const rates = await getRates(db);
      const cad = (value: string) => inCurrency(value, "CNY", "CAD", rates);
      await write(
        "UPDATE parental_controls SET threshold=?,per_transfer=?,daily_limit=?,monthly_limit=?,tuition_approval=?,conversion_approval=?,category_limits=?,auto_approve=?,allow_non_beneficiary=?,non_beneficiary_limit=? WHERE link_id=?",
        [
          cad(v.threshold),
          cad(v.per_transfer),
          cad(v.daily_limit),
          cad(v.monthly_limit),
          v.tuition_approval,
          v.conversion_approval,
          JSON.stringify(
            Object.fromEntries(
              Object.entries(v.category_limits).map(([k, v]) => [k, cad(v)]),
            ),
          ),
          v.auto_approve,
          v.allow_non_beneficiary,
          cad(v.non_beneficiary_limit),
          v.link_id,
        ],
        db,
      );
      await audit(u.id, "CONTROLS_UPDATED", "family_links", v.link_id, {}, db);
      return null;
    });
  });
}
export async function decideApproval(input: unknown) {
  return action(async () => {
    const u = await requireUser("PARENT");
    const v = z
      .object({
        id,
        decision: z.enum(["APPROVED", "REJECTED"]),
        reason: z.string().max(500),
      })
      .parse(input);
    return atomic(async (db) => {
      const [p] = await rows<{ transfer_id: string; user_id: string }>(
        "SELECT p.transfer_id,t.user_id FROM parent_approvals p JOIN sandbox_transfers t ON t.id=p.transfer_id JOIN family_links f ON f.student_id=t.user_id AND f.parent_id=p.parent_id AND f.status='LINKED' WHERE p.id=? AND p.parent_id=? AND p.status='PENDING' FOR UPDATE",
        [v.id, u.id],
        db,
      );
      requireCondition(p, "NOT_FOUND");
      await write(
        "UPDATE parent_approvals SET status=?,reason=?,decided_at=UTC_TIMESTAMP() WHERE id=?",
        [v.decision, v.reason, v.id],
        db,
      );
      if (v.decision === "REJECTED")
        await write(
          "UPDATE sandbox_transfers SET status='CANCELLED' WHERE id=? AND status='WAITING_APPROVAL'",
          [p.transfer_id],
          db,
        );
      await audit(
        u.id,
        "PARENT_" + v.decision,
        "sandbox_transfers",
        p.transfer_id,
        { reason: v.reason },
        db,
      );
      await notify(p.user_id, "PARENT_" + v.decision, p.transfer_id, db);
      return null;
    });
  });
}
