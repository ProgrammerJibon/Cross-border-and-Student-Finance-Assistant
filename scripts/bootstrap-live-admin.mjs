import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
// Run from a protected operator shell. Never pass the password as an argument.
try {process.loadEnvFile('.env.local');} catch { /* Deployment uses a secret store. */ }
const password=process.env.FINBRIDGE_BOOTSTRAP_PASSWORD;
delete process.env.FINBRIDGE_BOOTSTRAP_PASSWORD;
if(!password||Buffer.byteLength(password)>72) throw new Error('Provide FINBRIDGE_BOOTSTRAP_PASSWORD through protected environment input.');
const db=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try {
  await db.beginTransaction();
  const [existing]=await db.execute("SELECT id,bootstrap_identity,role,is_demo FROM users WHERE email=? FOR UPDATE",['jibon@jibon.bd']);
  if(existing.length) {
    if(!existing[0].bootstrap_identity||existing[0].role!=='ADMIN'||existing[0].is_demo) throw new Error('Reserved identity already exists; manual identity review required. No changes made.');
    console.log('Bootstrap identity already exists. Password and privileges were not changed.');
  } else {
    const id=randomUUID();
    await db.execute("INSERT INTO users(id,name,email,password_hash,role,is_demo,onboarded,must_rotate_password,bootstrap_identity) VALUES (?,'Live administrator',?,?,'ADMIN',0,1,1,1)",[id,'jibon@jibon.bd',await bcrypt.hash(password,12)]);
    await db.execute('INSERT INTO user_preferences(user_id) VALUES (?)',[id]);
    await db.execute("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,metadata) VALUES (?,?,'ADMIN_BOOTSTRAP','users',?,'{}')",[randomUUID(),id,id]);
    console.log('Live administrator created. Password rotation and MFA enrollment are mandatory before workspace access.');
  }
  await db.commit();
} catch(e) {await db.rollback();console.error(e.code==='ER_DUP_ENTRY'?'Identity exists; no changes made.':'Bootstrap failed; check protected operator diagnostics and migration status.');process.exitCode=1;}
finally {await db.end();}
