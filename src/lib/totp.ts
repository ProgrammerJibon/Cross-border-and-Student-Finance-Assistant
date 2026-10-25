import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  let bits="";for(const byte of randomBytes(20))bits+=byte.toString(2).padStart(8,"0");
  return bits.match(/.{5}/g)!.map(chunk=>alphabet[parseInt(chunk,2)]).join("");
}
function decode(secret:string) {
  const bits=[...secret].map(c=>alphabet.indexOf(c).toString(2).padStart(5,"0")).join("");
  return Buffer.from(bits.match(/.{8}/g)!.map(chunk=>parseInt(chunk,2)));
}
export function totp(secret:string,step:number) {
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));
  const mac=createHmac("sha1",decode(secret)).update(counter).digest(),offset=mac[19]&15;
  return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
export function verifyTotp(secret:string,code:string,lastStep:number,now=Date.now()) {
  if(!/^\d{6}$/.test(code))return null;
  const step=Math.floor(now/30000);
  for(const candidate of [step,step-1,step+1]) if(candidate>lastStep&&timingSafeEqual(Buffer.from(code),Buffer.from(totp(secret,candidate))))return candidate;
  return null;
}
