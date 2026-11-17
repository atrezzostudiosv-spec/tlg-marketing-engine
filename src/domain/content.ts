import type {Fact,PropertyStatus,Format,WorkflowState,EditorialState} from "./contracts.ts";
import type {PlanAsset,PlanSource,PlanEvent} from "./planner.ts";
import {isFactCurrent} from "./eligibility.ts";
import {parseFact} from "./facts.ts";
import {dateKey,shiftDay} from "../client/calendar.ts";

export type ContentInput={
 property:{id:string;address:string;locality:string;status:PropertyStatus;revision:number;transaction_type:"SALE"|"LEASE"};
 post:{id:string;property_id:string;property_revision:number;planned_at:string;format:Format;workflow_state:WorkflowState;editorial_state:EditorialState;angle?:string;eventId?:string};
 facts:Fact[];sources:PlanSource[];factIds:string[];assets:PlanAsset[];assetIds:string[];events:PlanEvent[];now:number;history?:string[];
};
export type Claim={factId:string;key:string;value:unknown;sourceId:string;text:string};
export type DraftVariant={channel:"facebook"|"instagram";body:string;cta:string;claimIds:string[]};
export type ContentDraft={variants:DraftVariant[];claims:Claim[];eventId?:string;assetIds:string[];issues:string[];blocked:boolean;generator:"controlled-v1";generatedAt:string;revision:number;recipeIds?:string[]};
const angles:Record<string,string[]>={
 "Distribución y superficie":["bedrooms","bathrooms","living_sqft"],
 "Terreno y dimensiones":["lot_acres"],
 "Precio confirmado":["price"],
 "Disponibilidad del alquiler":["availability"],
 "Descripción oficial por revisar":["description"],
 "Presentación del listing":[],
 "Open House confirmado":[]
};
// Curated editorial language. The facts, identity, and disclosure are rendered separately.
const phrases={
 distribution:["When you're comparing homes, start with the space itself.","Let's look at the numbers behind the floor plan.","The right amount of space matters. Here's a closer look.","Before you schedule a tour, here's a useful overview."],
 land:["Take a closer look at the property beyond the home.","Here's a detail worth considering as you compare properties.","A property's lot size can be an important part of your decision.","If land is on your list, here's where to start."],
 price:["Considering your next move? Here's the current asking price.","A closer look at the asking price for this property.","Start your search with the current listing price.","Let's talk about the numbers behind this listing."],
 general:["I'd love to help you explore this listing.","Let's take a closer look at this property.","Have a property on your shortlist? Let's talk about the details.","A private tour can help you decide what feels right for you."],
 rental:["Exploring rental options? I'd be happy to help.","Let's talk about your next rental.","Planning your next move? Here's a rental to explore.","If you're comparing rental options, let's talk through the details."],
 event:["I'd love to welcome you at our upcoming open house.","Come see the property in person at our upcoming open house.","Mark your calendar for our next open house.","Have questions about this listing? Join us at the open house."]
};
const actions={
 sale:["I'd be happy to answer your questions or arrange a private tour. Send me a message.","Message me for the full property details or to arrange a private tour.","Reach out for the listing details and let's talk about a private tour.","Have questions? Send me a message and I'll help you with the next steps."],
 rental:["Send me a message for rental details.","I'd be happy to share the rental information. Message me.","Reach out to discuss the rental details.","Have questions about the rental? Send me a message."],
 event:["Message me for open house details.","Reach out with any questions before the open house.","Send me a message if you'd like more information about the event.","I'd be happy to help with your open house questions. Message me."]
};
const instagramActions={
 sale:["DM me for details or a private tour.","DM me for the full listing details.","Interested in seeing more? Send me a DM.","Let's talk about the property. DM me."],
 rental:["DM me for rental details.","DM me to discuss the rental.","Questions about the rental? DM me.","Send me a DM for more information."],
 event:["DM me for open house details.","Questions before the open house? DM me.","DM me for event information.","Send me a DM if you have questions about the open house."]
};
const norm=(s:string)=>s.trim().replace(/\s+/g," ");
const numeric=(n:number)=>{
 const s=new Intl.NumberFormat("en-US",{maximumFractionDigits:20}).format(n);
 if(Number(s.replace(/,/g,""))!==n)throw Error("Unsupported numeric precision");
 return s;
};
function hash(s:string){let h=0;for(const c of s)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h;}
function eventLabel(e:PlanEvent){
 const zone="America/Chicago";
 const date=(s:string)=>new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(new Date(s));
 const time=(s:string)=>new Intl.DateTimeFormat("en-US",{timeZone:zone,hour:"numeric",minute:"2-digit"}).format(new Date(s));
 return date(e.start_at)+", "+time(e.start_at)+"–"+(dateKey(e.start_at)===dateKey(e.end_at)?"":date(e.end_at)+", ")+time(e.end_at)+" CT";
}
function isoAvailability(s:unknown):string|null{
 if(typeof s!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
 try{if(shiftDay(s,0)!==s)return null;return new Intl.DateTimeFormat("en-US",{timeZone:"UTC",month:"long",day:"numeric",year:"numeric"}).format(new Date(s+"T12:00:00Z"));}catch{return null;}
}
// Controlled composition: no arbitrary text from listing descriptions enters captions.
// This is a draft generator, not a legal/ factual approval or an export permission.
export function composeDraft(input:ContentInput):ContentDraft{
 const {property:p,post,now}=input;
 if(!Number.isFinite(now))throw Error("Invalid time");
 const issues:string[]=[];
 const stop=(why:string):ContentDraft=>({variants:[],claims:[],assetIds:[],issues:[why],blocked:true,generator:"controlled-v1",generatedAt:new Date(now).toISOString(),revision:p.revision});
 if(post.property_id!==p.id||p.status!=="ACTIVE"||post.property_revision!==p.revision)return stop("PROPERTY_CHANGED");
 if(post.workflow_state!=="PENDIENTE"||["BLOQUEADO","LISTO","VALIDANDO"].includes(post.editorial_state))return stop("POST_NOT_EDITABLE");
 if(!Number.isFinite(Date.parse(post.planned_at)))return stop("INVALID_DATE");
 if(!post.angle||!Object.hasOwn(angles,post.angle))return stop("STRATEGY_MISSING");
 if(!p.address.trim()||!p.locality.trim()||/[\r\n<>]/.test(p.address+p.locality))return stop("PROPERTY_IDENTITY_REVIEW");
 const permitted=angles[post.angle];
 if(new Set(input.factIds).size!==input.factIds.length)return stop("DUPLICATE_EVIDENCE");
 const selected:Fact[]=[];
 for(const id of input.factIds){
  const matches=input.facts.filter(f=>f.id===id);
  const f=matches[0];
  if(matches.length!==1||!f||f.propertyId!==p.id||input.facts.filter(x=>x.propertyId===p.id&&x.key===f.key).length!==1||!isFactCurrent(f,now)||parseFact(f.key,f.value)===null)return stop("FACT_INVALID:"+id);
  const sources=input.sources.filter(s=>s.id===f.sourceId);
  if(sources.length!==1||sources[0].property_id!==p.id||sources[0].authorization_status!=="APPROVED")return stop("SOURCE_INVALID:"+id);
  if(f.key!=="status"&&!permitted.includes(f.key))return stop("FACT_OUTSIDE_STRATEGY:"+id);
  selected.push(f);
 }
 const status=selected.find(f=>f.key==="status"&&f.value==="ACTIVE");
 if(!status||permitted.length&&!selected.some(f=>permitted.includes(f.key)))return stop("EVIDENCE_MISSING");
 const claims:Claim[]=[{factId:status.id,key:"status",value:status.value,sourceId:status.sourceId,text:"Active listing (eligibility)"}];
 const details:string[]=[];
 let family:keyof typeof phrases="general";
 if(post.angle==="Distribución y superficie")family="distribution";
 if(post.angle==="Terreno y dimensiones")family="land";
 if(post.angle==="Precio confirmado")family="price";
 if(post.angle==="Disponibilidad del alquiler")family="rental";
 if(post.angle==="Presentación del listing"&&p.transaction_type==="LEASE")family="rental";
 if(post.angle==="Descripción oficial por revisar")return stop("DESCRIPTION_REQUIRES_STRUCTURED_FACTS");
 try{
  for(const key of permitted){
   const f=selected.find(x=>x.key===key);if(!f)continue;
   let text:string;
   if(key==="availability"){
    if(p.transaction_type!=="LEASE")return stop("INVALID_RENTAL_ANGLE");
    const day=isoAvailability(f.value);if(!day)return stop("AVAILABILITY_REQUIRES_ISO_DATE");
    text="Available from "+day;
   }else{
    const n=f.value as number;const v=numeric(n);
    text=key==="price"?"Asking price: $"+v+(p.transaction_type==="LEASE"?"/month":""):key==="bedrooms"?v+(n===1?" bedroom":" bedrooms"):key==="bathrooms"?v+(n===1?" bath":" baths"):key==="living_sqft"?v+" sq. ft. of living space":v+(n===1?" acre":" acres");
   }
   details.push(text);claims.push({factId:f.id,key:f.key,value:f.value,sourceId:f.sourceId,text});
  }
 }catch{return stop("NUMERIC_PRECISION_REVIEW");}
 let eventId:string|undefined;
 if(post.angle==="Open House confirmado"){
  const matches=input.events.filter(e=>e.id===post.eventId);
  const e=matches[0];
  if(matches.length!==1||!e||e.property_id!==p.id||e.confirmation_status!=="CONFIRMED"||e.type.toUpperCase().replace(/[ _-]/g,"")!=="OPENHOUSE"||!(Date.parse(e.start_at)>Math.max(now,Date.parse(post.planned_at)))||!(Date.parse(e.end_at)>Date.parse(e.start_at)))return stop("EVENT_NOT_CURRENT");
  eventId=e.id;details.push("Open house: "+eventLabel(e));family="event";
 }else if(post.eventId)return stop("UNEXPECTED_EVENT");
 const assets:PlanAsset[]=[];
 if(new Set(input.assetIds).size!==input.assetIds.length)return stop("DUPLICATE_MEDIA");
 for(const id of input.assetIds){
  const matches=input.assets.filter(a=>a.id===id);const a=matches[0];
  if(matches.length!==1||!a||a.property_id!==p.id||a.rights_status!=="APPROVED"||!["ORIGINAL","VIRTUAL"].includes(a.staging_status)||!a.approved_at||!(Date.parse(a.approved_at)<=now))return stop("MEDIA_INVALID:"+id);
  assets.push(a);
 }
 if(!assets.length)issues.push("MEDIA_MISSING");
 if(post.format==="carousel"&&(assets.length<2||assets.some(a=>a.media_type!=="image")))issues.push("CAROUSEL_INCOMPLETE");
 if(post.format==="photo"&&(assets.length!==1||assets[0].media_type!=="image"))issues.push("PHOTO_INCOMPLETE");
 if(post.format==="reel"&&(assets.length!==1||assets[0].media_type!=="video"))issues.push("FINAL_VIDEO_REQUIRED");
 if(post.format==="story")issues.push("STORY_ASSET_REVIEW");
 const address=norm(p.address)+" | "+norm(p.locality);
 const history=input.history??[];
 const select=(group:string,choices:readonly string[],offset:number,avoid?:string)=>{
  const options=choices.map((text,i)=>({text,id:group+":"+i,index:i})).filter(x=>x.id!==avoid);
  options.sort((a,b)=>{
   const ai=history.indexOf(a.id),bi=history.indexOf(b.id);
   return (ai<0?0:1)-(bi<0?0:1)||(bi-ai)||((a.index-offset+choices.length)%choices.length)-((b.index-offset+choices.length)%choices.length);
  });
  return options[0];
 };
 const offset=hash(post.id)%4;
 const hook=select("hook:"+family,phrases[family],offset);
 const igHook=select("hook:"+family,phrases[family],(offset+1)%4,hook.id);
 const actionFamily=family==="event"?"event":p.transaction_type==="LEASE"?"rental":"sale";
 const fbAction=select("cta:facebook:"+actionFamily,actions[actionFamily],offset);
 const igAction=select("cta:instagram:"+actionFamily,instagramActions[actionFamily],offset);
 const cta=fbAction.text,igCta=igAction.text;
 const disclosure=assets.some(a=>a.staging_status==="VIRTUAL")?"Some images include virtual staging.":"";
 const facebook=[hook.text,address,details.length?details.join("\n"):null,cta,disclosure].filter(Boolean).join("\n\n");
 const instagram=[address,details.length?details.join(" • "):igHook.text,igCta,disclosure].filter(Boolean).join("\n\n");
 const recipeIds=[hook.id,...(details.length?[]:[igHook.id]),fbAction.id,igAction.id];
 issues.push("BROKER_SIGNATURE_PENDING","FACT_REVALIDATION_REQUIRED","FINAL_EDITORIAL_REVIEW","MEDIA_OBJECT_CHECK_PENDING");
 return {variants:[{channel:"facebook",body:facebook,cta,claimIds:claims.map(c=>c.factId)},{channel:"instagram",body:instagram,cta:igCta,claimIds:claims.map(c=>c.factId)}],claims,eventId,assetIds:assets.map(a=>a.id),issues,recipeIds,blocked:false,generator:"controlled-v1",generatedAt:new Date(now).toISOString(),revision:p.revision};
}
