import test from 'node:test';
import assert from 'node:assert/strict';
import {totp,verifyTotp} from '../src/lib/totp';
import {validateIdentifier,validateWalletAmount} from '../src/lib/wallet-rules';
test('TOTP RFC 6238 vector, invalid codes and replay prevention',()=>{
  const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(totp(secret,1),'287082');
  assert.equal(verifyTotp(secret,'287082',0,59000),1);
  assert.equal(verifyTotp(secret,'287082',1,59000),null);
  assert.equal(verifyTotp(secret,'000000',0,59000),null);
});
test('method-specific identifiers and currency precision fail safely',()=>{
  validateIdentifier('PAYPAL','person@example.test');validateIdentifier('BKASH','01712345678');
  assert.throws(()=>validateIdentifier('PAYPAL','01712345678'));
  assert.throws(()=>validateIdentifier('BKASH','person@example.test'));
  validateWalletAmount('1','JPY');assert.throws(()=>validateWalletAmount('1.01','JPY'));
  assert.throws(()=>validateWalletAmount('1','KWD'));assert.throws(()=>validateWalletAmount('-1','USD'));
});
