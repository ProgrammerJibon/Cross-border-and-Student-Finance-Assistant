import test from "node:test";
import assert from "node:assert/strict";
import { approvalSchema, eligiblePayment } from "../src/lib/payment-capabilities";
const approval=approvalSchema.parse({processor:"STRIPE",merchantAccount:"acct_fixture",merchantCountry:"US",customerCountries:["BD"],currencies:["USD"],operation:"PLAN",methods:["STRIPE"],evidence:"fixture approval, not real authorization",expiresAt:"2099-01-01T00:00:00Z"});
test("credentials and generic merchant approvals never authorize wallet funding or payouts",()=>{
  const base={provider:"STRIPE",operation:"PLAN",currency:"USD",customerCountry:"BD",approvals:[approval]};
  assert.equal(eligiblePayment(base),true);
  for(const change of [{operation:"TOPUP"},{operation:"SEND"},{operation:"WITHDRAW"},{operation:"TUITION"},{customerCountry:"US"},{currency:"BDT"},{provider:"ALIPAY"},{suspended:true},{approvals:[]},{now:Date.parse("2100-01-01")}]) assert.equal(eligiblePayment({...base,...change}),false);
  assert.equal(approvalSchema.safeParse({...approval,operation:"TOPUP"}).success,false);
});
