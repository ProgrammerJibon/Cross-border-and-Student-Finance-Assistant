import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { action, requireCondition } from "../src/lib/errors";
import { day, tuitionSchema, validTuitionSchedule } from "../src/lib/validation";
import { studentProfileSchema } from "../src/lib/student-profile";
import { tuitionSchedule } from "../src/lib/tuition-schedule";

test("profile selectors reject unsupported status and countries", () => {
  assert.ok(studentProfileSchema.safeParse({student_status:"PART_TIME",home_country:"Bangladesh",study_country:"China"}).success);
  for (const input of [{student_status:"invented",home_country:"Bangladesh",study_country:"China"},{student_status:"FULL_TIME",home_country:"invented",study_country:"China"}]) assert.equal(studentProfileSchema.safeParse(input).success,false);
});
test("tuition requires programme, valid dates, funding and a coherent schedule", () => {
  assert.equal(day.safeParse("2027-02-30").success,false);
  const v={name:"University",programme:"Computer Science",amount:"1000",currency:"USD",due_date:"2027-09-01",paid:"0",scholarship:"100",semester:"Fall",funding_needs:"900",payment_schedule:"ONE_OFF",first_due_date:"2027-09-01",installments:1};
  const schema=tuitionSchema.refine(validTuitionSchedule);
  assert.ok(schema.safeParse(v).success);
  for(const input of [{...v,programme:""},{...v,funding_needs:"-1"},{...v,installments:0},{...v,first_due_date:"2027-09-02"},{...v,installments:2}]) assert.equal(schema.safeParse(input).success,false);
});
test("validation returns named field constraints without echoing secret input or database errors", async () => {
  const secret="secret-user-input";
  const result=await action(async()=>z.object({key:z.enum(["allowed"]),amount:z.string().min(2)}).parse({key:secret,amount:""}));
  assert.equal(result.success,false);
  if(!result.success) {assert.ok(result.fieldErrors?.key);assert.ok(result.fieldErrors?.amount);}
  assert.equal(JSON.stringify(result).includes(secret),false);
  const custom=await action(async()=>requireCondition(false,"FIELD_VALIDATION",{currency:"Select an active currency."}));
  assert.equal(custom.success,false);
  if(!custom.success) assert.equal(custom.fieldErrors?.currency,"Select an active currency.");
});
test("monthly schedules preserve month ends, allocate paid funds and never lose cents",()=>{
  const invoice={amount:"1000",scholarship:"100",paid:"350",due_date:"2027-03-31",first_due_date:"2027-01-31",payment_schedule:"MONTHLY",installments:3};
  assert.ok(validTuitionSchedule(invoice));
  assert.equal(validTuitionSchedule({...invoice,due_date:"2027-03-30"}),false);
  assert.deepEqual(tuitionSchedule(invoice),[{date:"2027-01-31",amount:"300.00",remaining:"0.00"},{date:"2027-02-28",amount:"300.00",remaining:"250.00"},{date:"2027-03-31",amount:"300.00",remaining:"300.00"}]);
  const schedule=tuitionSchedule({...invoice,amount:"1000.01",paid:"0",scholarship:"0"});
  assert.deepEqual(schedule.map(r=>r.amount),["333.33","333.33","333.35"]);
});
