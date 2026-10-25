import { D } from "./money";
export function monthlyDate(first: string, offset: number) {
  const source=new Date(`${first}T12:00:00Z`);
  const end=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+offset+1,0,12));
  end.setUTCDate(Math.min(source.getUTCDate(),end.getUTCDate()));
  return end.toISOString().slice(0,10);
}
export function tuitionSchedule(invoice: {amount:string;scholarship:string;paid:string;due_date:string;first_due_date?:string|null;payment_schedule?:string;installments?:number}) {
  const count=Math.max(1,Math.min(60,Number(invoice.installments)||1));
  const first=invoice.first_due_date||invoice.due_date;
  const cents=D(invoice.amount).minus(invoice.scholarship).mul(100).toDecimalPlaces(0);
  const base=cents.div(count).floor();
  let paid=D(invoice.paid);
  return Array.from({length:count},(_,index)=>{
    const amount=(index===count-1?cents.minus(base.mul(count-1)):base).div(100);
    const applied=paid.lt(amount)?paid:amount;paid=paid.minus(applied);
    const date=count===1?invoice.due_date:invoice.payment_schedule==="MONTHLY"?monthlyDate(first,index):
      new Date(Date.parse(first)+Math.round((Date.parse(invoice.due_date)-Date.parse(first))*index/(count-1))).toISOString().slice(0,10);
    return {date,amount:amount.toFixed(2),remaining:amount.minus(applied).toFixed(2)};
  });
}
