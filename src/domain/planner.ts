import type { Fact, PropertyStatus, Format, WorkflowState } from "./contracts.ts";
import {isFactCurrent} from "./eligibility.ts";
import {parseFact} from "./facts.ts";
import {dateKey,shiftDay,clock} from "../client/calendar.ts";

export type PlanProperty={id:string;status:PropertyStatus;revision:number;priority:number;transaction_type:"SALE"|"LEASE"};
export type PlanSource={id:string;property_id:string|null;authorization_status:"APPROVED"|"UNKNOWN"|"DENIED"};
export type PlanAsset={id:string;property_id:string;media_type:"image"|"video";rights_status:string;staging_status:string;approved_at:string|null};
export type PlanEvent={id:string;property_id:string;type:string;start_at:string;end_at:string;confirmation_status:string};
export type History={id:string;property_id:string;planned_at:string;format:Format;workflow_state:WorkflowState;angle?:string;eventId?:string};
export type PlanInput={properties:PlanProperty[];facts:Fact[];sources:PlanSource[];assets:PlanAsset[];events:PlanEvent[];history:History[];now:number;start:string;perWeek:number};
export type PlanItem={id:string;propertyId:string;revision:number;day:string;plannedAt:string;format:"photo"|"carousel";angle:string;goal:string;factIds:string[];assetIds:string[];eventId?:string;reason:string;needsMedia:boolean};
export type PlanResult={items:PlanItem[];excluded:{propertyId:string;reason:string}[];existing:History[];start:string;end:string;unfilled:number;uncovered:string[]};
const dayDiff=(a:string,b:string)=>(Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000;
const unique=<T extends {id:string}>(arr:T[])=>new Set(arr.map(x=>x.id)).size===arr.length;
export function texasNoon(day:string):string {
 shiftDay(day,0);
 // Noon in Texas is always 17:00Z or 18:00Z, including DST transition dates.
 for(const h of [17,18]){
  const iso=day+"T"+h+":00:00Z";
  if(dateKey(iso)===day&&clock(iso,"America/Chicago")==="12:00")return new Date(iso).toISOString();
 }
 throw Error("Texas noon unavailable");
}
export function buildPlan(input:PlanInput):PlanResult{
 const {start,now,perWeek}=input;
 if(!Number.isFinite(now)||!Number.isInteger(perWeek)||perWeek<1||perWeek>7||shiftDay(start,0)!==start||start<dateKey(new Date(now)))throw Error("Invalid planning window");
 if(![input.properties,input.facts,input.sources,input.assets,input.events,input.history].every(x=>unique(x)))throw Error("Duplicate input identifiers");
 const end=shiftDay(start,13);
 const history=input.history.filter(p=>p.workflow_state!=="CANCELADO"&&Number.isFinite(Date.parse(p.planned_at)));
 const existing=history.filter(p=>dateKey(p.planned_at)>=start&&dateKey(p.planned_at)<=end);
 const excluded:PlanResult["excluded"]=[];
 const eligible=input.properties.flatMap(p=>{
  if(p.status!=="ACTIVE"){excluded.push({propertyId:p.id,reason:"Estado no activo"});return [];}
  const sourceOk=(f:Fact)=>input.sources.some(s=>s.id===f.sourceId&&s.property_id===p.id&&s.authorization_status==="APPROVED");
  const own=input.facts.filter(f=>f.propertyId===p.id);
  const valid=own.filter(f=>own.filter(x=>x.key===f.key).length===1&&sourceOk(f)&&isFactCurrent(f,now)&&parseFact(f.key,f.value)!==null);
  const status=valid.find(f=>f.key==="status"&&f.value==="ACTIVE");
  if(!status){excluded.push({propertyId:p.id,reason:"Estado activo sin fuente vigente"});return [];}
  const get=(k:string)=>valid.find(f=>f.key===k);
  const angles:{angle:string;goal:string;facts:Fact[]}[]=[];
  const add=(angle:string,goal:string,keys:string[])=>{
   const selected=keys.map(get).filter((f):f is Fact=>Boolean(f));if(selected.length)angles.push({angle,goal,facts:[status,...selected]});
  };
  add("Distribución y superficie","Solicitar visita privada",["bedrooms","bathrooms","living_sqft"]);
  add("Terreno y dimensiones","Solicitar información de la propiedad",["lot_acres"]);
  add("Precio confirmado","Solicitar información actualizada",["price"]);
  if(p.transaction_type==="LEASE")add("Disponibilidad del alquiler","Solicitar condiciones de alquiler",["availability"]);
  // Descriptions are untrusted text: plan a review, not specific inferred attributes.
  add("Descripción oficial por revisar","Identificar un argumento verificable",["description"]);
  angles.push({angle:"Presentación del listing",goal:p.transaction_type==="LEASE"?"Solicitar información del alquiler":"Solicitar detalles o visita privada",facts:[status]});
  const media=input.assets.filter(a=>a.property_id===p.id&&a.media_type==="image"&&a.rights_status==="APPROVED"&&["ORIGINAL","VIRTUAL"].includes(a.staging_status)&&a.approved_at&&Date.parse(a.approved_at)<=now).sort((a,b)=>a.id.localeCompare(b.id));
  const events=input.events.filter(e=>e.property_id===p.id&&e.type.toUpperCase().replace(/[ _-]/g,"")==="OPENHOUSE"&&e.confirmation_status==="CONFIRMED"&&Date.parse(e.start_at)>now&&Date.parse(e.end_at)>Date.parse(e.start_at));
  return [{p,angles,media,events,status}];
 });
 const items:PlanItem[]=[];
 const usedEvents=new Set(history.map(h=>h.eventId).filter(Boolean));
 const activeExisting=existing.filter(h=>h.format!=="story");
 const occupied=new Set(activeExisting.map(h=>dateKey(h.planned_at)));
 const allHistory=()=>[...history,...items.map(i=>({id:i.id,property_id:i.propertyId,planned_at:i.plannedAt,format:i.format,workflow_state:"PENDIENTE" as const,angle:i.angle,eventId:i.eventId}))];
 let unfilled=0;
 for(let block=0;block<2;block++){
  const begin=shiftDay(start,block*7),last=shiftDay(begin,6);
  const used=activeExisting.filter(h=>dateKey(h.planned_at)>=begin&&dateKey(h.planned_at)<=last).length;
  let left=Math.max(0,perWeek-used);
  // Reserve event promotion days first; a confirmed open house gets one slot 1–3 days before.
  const days=Array.from({length:7},(_,i)=>shiftDay(begin,i)).filter(d=>!occupied.has(d)&&Date.parse(texasNoon(d))>now);
  const eventDays=new Map<string,{propertyId:string;event:PlanEvent}>();
  for(const c of eligible)for(const e of c.events){
   if(usedEvents.has(e.id))continue;
   const eventDay=dateKey(e.start_at);
   const day=days.filter(d=>dayDiff(eventDay,d)>=1&&dayDiff(eventDay,d)<=3&&!eventDays.has(d)).at(-1);
   if(day)eventDays.set(day,{propertyId:c.p.id,event:e});
  }
  const eventPriority=[...eventDays.keys()].sort((a,b)=>a.localeCompare(b)).slice(0,left);
  const standard=days.filter(d=>!eventPriority.includes(d)).sort((a,b)=>{
   const weekend=(d:string)=>[0,6].includes(new Date(d+"T12:00:00Z").getUTCDay())?1:0;
   return weekend(a)-weekend(b)||a.localeCompare(b);
  }).slice(0,Math.max(0,left-eventPriority.length));
  const slots=[...eventPriority,...standard].sort();
  for(const day of slots){
   if(!left||!eligible.length)break;
   const forced=eventPriority.includes(day)?eventDays.get(day):undefined;
   const h=allHistory().filter(x=>x.format!=="story");
   const count=(id:string)=>h.filter(x=>x.property_id===id&&dateKey(x.planned_at)>=start&&dateKey(x.planned_at)<=end).length;
   const recent=(id:string)=>h.filter(x=>x.property_id===id&&dateKey(x.planned_at)<=day).map(x=>dateKey(x.planned_at)).sort().at(-1);
   const gap=(id:string)=>{const prev=recent(id);return prev?dayDiff(day,prev):30;};
   const near=(id:string)=>h.some(x=>x.property_id===id&&Math.abs(dayDiff(day,dateKey(x.planned_at)))<2);
   const candidates=eligible.filter(c=>!forced||c.p.id===forced.propertyId);
   const pool=!forced&&candidates.some(c=>!near(c.p.id))?candidates.filter(c=>!near(c.p.id)):candidates;
   pool.sort((a,b)=>count(a.p.id)-count(b.p.id)||(b.p.priority+Math.min(gap(b.p.id),14)*4)-(a.p.priority+Math.min(gap(a.p.id),14)*4)||a.p.id.localeCompare(b.p.id));
   const c=pool[0];if(!c)continue;
   const prevAngles=h.filter(x=>x.property_id===c.p.id&&x.angle).sort((a,b)=>b.planned_at.localeCompare(a.planned_at)).map(x=>x.angle);
   const angle=forced?{angle:"Open House confirmado",goal:"Promover asistencia al evento confirmado",facts:[c.status]}:c.angles.find(a=>!prevAngles.slice(0,2).includes(a.angle))??c.angles[0];
   const media=c.media.slice(0,5);const format=media.length>=2?"carousel":"photo";
   const reason=forced?"Evento confirmado próximo":count(c.p.id)===0?"Cobertura del inventario": "Rotación y prioridad comercial";
   items.push({id:"plan-"+day+"-"+c.p.id,propertyId:c.p.id,revision:c.p.revision,day,plannedAt:texasNoon(day),format,angle:angle.angle,goal:angle.goal,factIds:angle.facts.map(f=>f.id),assetIds:media.map(a=>a.id),eventId:forced?.event.id,reason,needsMedia:media.length===0});
   if(forced)usedEvents.add(forced.event.id);occupied.add(day);left--;
  }
  unfilled+=left;
 }
 return {items,excluded,existing,start,end,unfilled,uncovered:eligible.filter(c=>!existing.some(h=>h.property_id===c.p.id&&h.format!=="story")&&!items.some(i=>i.propertyId===c.p.id)).map(c=>c.p.id)};
}
