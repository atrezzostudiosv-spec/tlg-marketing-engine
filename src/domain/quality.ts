import {composeDraft} from "./content.ts";
import type {ContentInput,ContentDraft} from "./content.ts";
export type QualityContext={input:Omit<ContentInput,"now">;draftId:string|null;draft:ContentDraft|null;original:Omit<ContentInput,"now">|null;variants:{channel:string;body:string;cta:string;claimIds:string[]}[];media:{id:string;hash:string|null;size:number|null;mime:string|null;exists:boolean}[];canApprove:boolean};
export type Review={signature:string;policyReference:string};
export type QualityReport={issues:string[];package:null|{facebook:string;instagram:string;storyText:string;assetIds:string[]};expiresAt:string|null};
export function assessQuality(c:QualityContext,review:Review,now:number):QualityReport{
 const issues:string[]=[];
 const reject=(issue:string)=>{issues.push(issue);return {issues,package:null,expiresAt:null};};
 const p=c.input.post,d=c.draft;
 if(!Number.isFinite(now)||!Number.isFinite(Date.parse(p.planned_at))||Date.parse(p.planned_at)<=now)return reject("PUBLICATION_DATE_EXPIRED");
 if(p.workflow_state!=="PENDIENTE"||!["BORRADOR","REQUIERE_ATENCION","LISTO"].includes(p.editorial_state))return reject("POST_NOT_EDITABLE");
 if(p.format==="story")return reject("STORY_FORMAT_NOT_SUPPORTED");
 if(!d||!c.draftId||!c.original||d.blocked)return reject("DRAFT_MISSING");
 // Reconstruct only from current facts and original editorial history. No model text is trusted.
 const input:ContentInput={...c.input,post:{...p,editorial_state:"BORRADOR"},history:c.original.history,now};
 const candidates=Array.from({length:8},(_,i)=>composeDraft({...input,editorialChoice:i}));
 const same=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
 const match=candidates.find(x=>!x.blocked&&same(x.variants,d.variants)&&same(x.claims,d.claims)&&same(x.assetIds,d.assetIds)&&(x.eventId??null)===(d.eventId??null)&&x.revision===d.revision);
 if(!match)return reject("DRAFT_OR_EVIDENCE_CHANGED");
 if(c.variants.length!==2||!d.variants.every(v=>c.variants.some(x=>x.channel===v.channel&&x.body===v.body&&x.cta===v.cta&&same(x.claimIds,v.claimIds))))return reject("CURRENT_VARIANTS_CHANGED");
 const mediaIssues=match.issues.filter(x=>!["BROKER_SIGNATURE_PENDING","FACT_REVALIDATION_REQUIRED","FINAL_EDITORIAL_REVIEW","MEDIA_OBJECT_CHECK_PENDING"].includes(x));
 if(mediaIssues.length)return {issues:mediaIssues,package:null,expiresAt:null};
 if(c.media.length!==d.assetIds.length||c.media.some((a,i)=>a.id!==d.assetIds[i]||!a.exists||!a.hash||!/^[a-f0-9]{64}$/.test(a.hash)||!Number.isInteger(a.size)||a.size!<=0||!a.mime))return reject("MEDIA_OBJECT_MISSING");
 if(!review.signature.trim()||review.signature.length>300||!review.policyReference.trim()||review.policyReference.length>500)return reject("BROKER_REVIEW_REQUIRED");
 const fb=d.variants.find(v=>v.channel==="facebook")!,ig=d.variants.find(v=>v.channel==="instagram")!;
 const suffix="\n\n"+review.signature.trim();
 const story=[c.input.property.address+" | "+c.input.property.locality,...d.claims.filter(x=>x.key!=="status").map(x=>x.text),p.eventId?fb.body.split("\n\n").find(x=>x.startsWith("Open house: ")):null,ig.cta,c.input.assets.some(a=>a.staging_status==="VIRTUAL")?"Some images include virtual staging.":null,review.signature.trim()].filter(Boolean).join("\n");
 const expiry=Math.min(now+15*60000,Date.parse(p.planned_at),...c.input.facts.flatMap(f=>[...(f.expiresAt?[Date.parse(f.expiresAt)]:[]),...(["status","price","availability"].includes(f.key)?[Date.parse(f.verifiedAt)+86400000]:[])]),...c.input.events.map(e=>Date.parse(e.start_at)));
 if(!Number.isFinite(expiry)||expiry<=now)return reject("EVIDENCE_EXPIRED");
 return {issues,package:{facebook:fb.body+suffix,instagram:ig.body+suffix,storyText:story,assetIds:d.assetIds},expiresAt:new Date(expiry).toISOString()};
}
export function canonical(x:unknown):string{
 if(x===null||typeof x!=="object")return JSON.stringify(x)??"null";
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 const o=x as Record<string,unknown>;return "{"+Object.keys(o).filter(k=>o[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canonical(o[k])).join(",")+"}";
}
