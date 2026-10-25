"use server";
import { requireUser } from "@/lib/auth";
import { action, requireCondition } from "@/lib/errors";
import { z } from "zod";
import { rows, write } from "@/lib/db";
import * as wallet from "@/services/wallet-workflows.service";
import { requestFamilyFunding, decideFamilyFunding } from "@/services/family-funding.service";
export async function getWalletWorkspace() {return action(async()=>wallet.walletWorkspace((await requireUser()).id));}
export async function validateFunding(input:unknown) {return action(async()=>wallet.validateFundingDraft((await requireUser()).id,input));}
export async function submitWallet(input:unknown,key:string) {return action(async()=>wallet.submitWalletOperation((await requireUser()).id,input,key));}
export async function reviewWallet(id:string,decision:string,evidence:unknown={}) {return action(async()=>wallet.reviewWalletOperation((await requireUser()).id,id,decision,evidence));}
export async function saveReceiving(input:unknown) {return action(async()=>wallet.saveReceivingAccount((await requireUser()).id,input));}
export async function searchRecipients(query:string,page=0) {return action(async()=>wallet.discoverRecipients((await requireUser()).id,query,page));}
export async function saveRecipient(recipient:string,currency:string) {return action(async()=>wallet.addDiscoveredBeneficiary((await requireUser()).id,recipient,currency));}
export async function sendToRecipient(input:unknown,key:string) {return action(async()=>wallet.sendInternal((await requireUser()).id,input,key));}
export async function requestSupport(input:unknown,key:string) {return action(async()=>requestFamilyFunding((await requireUser("STUDENT")).id,input,key));}
export async function decideSupport(id:string,decision:string,account="") {return action(async()=>decideFamilyFunding((await requireUser()).id,id,decision,account));}
export async function setDiscoverable(value:boolean) {return action(async()=>{
  const u=await requireUser();z.boolean().parse(value);requireCondition(["STUDENT","PARENT"].includes(u.role));
  await write("UPDATE users SET discoverable=? WHERE id=?",[value,u.id]);return null;
});}
export async function operationDetails(operationId:string) {return action(async()=>{
  // Sensitive destination disclosure is an explicit operator action, audited;
  // it is never included in AI tool responses or general queue snapshots.
  const u=await requireUser();
  const {requireAdmin}=await import("@/lib/auth");await requireAdmin("settlements");
  const [r]=await rows<{details_cipher:string;environment:string}>("SELECT details_cipher,environment FROM wallet_operations WHERE id=?",[z.uuid().parse(operationId)]);
  requireCondition(r&&r.environment===(u.is_demo?"DEMO":"LIVE"),"NOT_FOUND");
  const {audit}=await import("@/lib/audit");await audit(u.id,"PAYOUT_DETAILS_VIEWED","wallet_operations",operationId);
  const {decryptSecret}=await import("@/lib/secrets");
  return JSON.parse(decryptSecret(r.details_cipher)) as {holder:string;identifier:string;reference:string};
});}
