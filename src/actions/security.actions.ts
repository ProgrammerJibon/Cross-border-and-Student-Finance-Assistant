"use server";
import { currentUser } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { atomic,rows,write } from "@/lib/db";
import { encryptSecret,decryptSecret } from "@/lib/secrets";
import { newTotpSecret,verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";
import { createSession,clearSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { z } from "zod";
export async function rotateBootstrapPassword(input:unknown) {return action(async()=>{
  const u=await currentUser();requireCondition(u,"UNAUTHORIZED");
  const v=z.object({current:z.string().min(1).max(72),password:z.string().min(14).max(72)}).strict().parse(input);
  requireCondition(v.current!==v.password,"PASSWORD_REUSE");
  await atomic(async db=>{
    const [r]=await rows<{password_hash:string;must_rotate_password:number}>("SELECT password_hash,must_rotate_password FROM users WHERE id=? FOR UPDATE",[u.id],db);
    requireCondition(r.must_rotate_password&&await bcrypt.compare(v.current,r.password_hash),"INVALID_CREDENTIALS");
    await write("UPDATE users SET password_hash=?,must_rotate_password=0,session_version=session_version+1 WHERE id=?",[await bcrypt.hash(v.password,12),u.id],db);
    await audit(u.id,"BOOTSTRAP_PASSWORD_ROTATED","users",u.id,{},db);
  });
  await createSession({id:u.id,session_version:u.session_version+1},!!u.mfa_enabled);return null;
});}
export async function enrollMfa() {return action(async()=>{
  const u=await currentUser();requireCondition(u,"UNAUTHORIZED");
  return atomic(async db=>{
    const [r]=await rows<{mfa_enabled:number;must_rotate_password:number}>("SELECT mfa_enabled,must_rotate_password FROM users WHERE id=? FOR UPDATE",[u.id],db);
    requireCondition(!r.mfa_enabled,"INVALID_STATE");
    const secret=newTotpSecret();await write("UPDATE users SET mfa_secret=?,mfa_last_step=0 WHERE id=?",[encryptSecret(secret),u.id],db);
    return {secret,uri:`otpauth://totp/FinBridge:${encodeURIComponent(u.email)}?secret=${secret}&issuer=FinBridge&algorithm=SHA1&digits=6&period=30`};
  });
});}
export async function confirmMfa(code:string) {return action(async()=>{
  const u=await currentUser();requireCondition(u,"UNAUTHORIZED");z.string().regex(/^\d{6}$/).parse(code);
  await atomic(async db=>{
    const [r]=await rows<{mfa_secret:string;mfa_enabled:number;mfa_last_step:number;must_rotate_password:number}>("SELECT mfa_secret,mfa_enabled,mfa_last_step,must_rotate_password FROM users WHERE id=? FOR UPDATE",[u.id],db);
    requireCondition(!r.mfa_enabled&&r.mfa_secret,"INVALID_STATE");
    const step=verifyTotp(decryptSecret(r.mfa_secret),code,r.mfa_last_step);requireCondition(step!==null,"INVALID_MFA_CODE");
    await write("UPDATE users SET mfa_enabled=1,mfa_last_step=?,session_version=session_version+1 WHERE id=?",[step,u.id],db);
    await audit(u.id,"MFA_ENROLLED","users",u.id,{},db);
  });
  await clearSession();return null;
});}
