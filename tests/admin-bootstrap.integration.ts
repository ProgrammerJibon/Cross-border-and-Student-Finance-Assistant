import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {rows,write,pool} from '../src/lib/db';
test('protected bootstrap does not reset or hijack an existing identity',async()=>{
  assert.match(process.env.DB_NAME||'',/^finbridge_test_/);
  const run=promisify(execFile),password=randomBytes(20).toString('hex');
  try{
    const result=await run(process.execPath,['scripts/bootstrap-live-admin.mjs'],{env:{...process.env,FINBRIDGE_BOOTSTRAP_PASSWORD:password}});
    assert.ok(!result.stdout.includes(password));
    const [u]=await rows<{id:string;is_demo:number;role:string;password_hash:string;must_rotate_password:number;mfa_enabled:number}>("SELECT id,is_demo,role,password_hash,must_rotate_password,mfa_enabled FROM users WHERE email='jibon@jibon.bd'");
    assert.equal(u.is_demo,0);assert.equal(u.role,'ADMIN');assert.equal(u.must_rotate_password,1);assert.equal(u.mfa_enabled,0);
    // A rerun on a reused isolated database must preserve the existing credential.
    const hash=u.password_hash;
    await run(process.execPath,['scripts/bootstrap-live-admin.mjs'],{env:{...process.env,FINBRIDGE_BOOTSTRAP_PASSWORD:randomBytes(20).toString('hex')}});
    assert.equal((await rows("SELECT password_hash FROM users WHERE id=?",[u.id]))[0].password_hash,hash);
    if(result.stdout.includes('created'))assert.equal(await bcrypt.compare(password,hash),true);
    await write("UPDATE users SET bootstrap_identity=0 WHERE id=?",[u.id]);
    await assert.rejects(run(process.execPath,['scripts/bootstrap-live-admin.mjs'],{env:{...process.env,FINBRIDGE_BOOTSTRAP_PASSWORD:password}}));
    await write("UPDATE users SET bootstrap_identity=1 WHERE id=?",[u.id]);
    assert.equal((await rows("SELECT password_hash FROM users WHERE id=?",[u.id]))[0].password_hash,hash);
  }finally{await pool.end();}
});
