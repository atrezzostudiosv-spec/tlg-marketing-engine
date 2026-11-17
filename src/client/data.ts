import { createClient } from "@supabase/supabase-js";
import type { EditorialState, WorkflowState, PropertyStatus, Format } from "../domain/contracts.ts";

export type Listing = {id:string;address:string;locality:string;status:PropertyStatus;priority:number;transaction_type:"SALE"|"LEASE";revision:number};
export type CalendarPost = {id:string;property_id:string;planned_at:string;format:Format;editorial_state:EditorialState;workflow_state:WorkflowState;property_revision:number;angle?:string;goal?:string;eventId?:string;factIds?:string[];assetIds?:string[]};
export type Alert = {id:string;post_id:string;kind:string;created_at:string};
export type Workspace = {id:string;name:string};
export type Snapshot = {properties:Listing[];posts:CalendarPost[];alerts:Alert[]};

const url=import.meta.env.VITE_SUPABASE_URL?.trim();
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
// Reject server/legacy service-role credentials, not merely an absent key.
export function validPublicConfig(url:string|undefined,key:string|undefined): boolean {
 if(!url || !key?.startsWith("sb_publishable_")) return false;
 try {const u=new URL(url);return u.protocol==="https:" && !u.username && !u.password && u.pathname==="/" && !u.search && !u.hash;}catch{return false;}
}
export const client=validPublicConfig(url,key)?createClient(url!,key!,{
 auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}
}):null;
export async function workspaces():Promise<Workspace[]> {
 if(!client) throw Error("Sin conexión");
 const {data,error}=await client.from("workspaces").select("id,name").order("name").limit(100);
 if(error) throw Error("No se pudieron consultar los espacios de trabajo.");
 return data as Workspace[];
}
export async function loadSnapshot(workspace:string):Promise<Snapshot> {
 if(!client) throw Error("Sin conexión");
 const [p,s,a]=await Promise.all([
  client.from("properties").select("id,address,locality,status,priority,transaction_type,revision").eq("workspace_id",workspace).order("priority",{ascending:false}).limit(1000),
  client.from("calendar_history").select("id,property_id,planned_at,format,editorial_state,workflow_state,property_revision,angle,goal,event_id").eq("workspace_id",workspace).order("planned_at").limit(1000),
  client.from("post_alerts").select("id,post_id,kind,created_at").eq("workspace_id",workspace).is("resolved_at",null).order("created_at",{ascending:false}).limit(1000)
 ]);
 if(p.error||s.error||a.error||[p.data,s.data,a.data].some(x=>!x||x.length===1000)) throw Error("No se pudo cargar el inventario completo. No se mostrarán datos parciales.");
 return {properties:p.data as Listing[],posts:s.data!.map(p=>({...p,angle:p.angle??undefined,eventId:p.event_id??undefined})) as CalendarPost[],alerts:a.data as Alert[]};
}

export type MasterFact={id:string;key:string;typed_value:unknown;unit:string|null;source_id:string;verified_at:string;expires_at:string|null;verification_status:"CONFIRMED"|"UNCONFIRMED"|"CONFLICT"};
export type MasterSource={id:string;reference:string;authorization_status:"APPROVED"|"UNKNOWN"|"DENIED";obtained_at:string};
export type MasterData={facts:MasterFact[];sources:MasterSource[];canEdit:boolean};
export async function loadMaster(workspace:string,property:string):Promise<MasterData>{
 if(!client)throw Error("Sin conexión");
 const [facts,sources,members]=await Promise.all([
 client.from("property_facts").select("id,key,typed_value,unit,source_id,verified_at,expires_at,verification_status").eq("workspace_id",workspace).eq("property_id",property).limit(1000),
 client.from("sources").select("id,reference,authorization_status,obtained_at").eq("workspace_id",workspace).eq("property_id",property).order("obtained_at",{ascending:false}).limit(1000),
 client.from("workspace_members").select("role").eq("workspace_id",workspace).limit(2)
 ]);
 if(facts.error||sources.error||members.error||[facts.data,sources.data].some(x=>!x||x.length===1000)||members.data?.length!==1)throw Error("No se pudo consultar la ficha completa.");
 return {facts:facts.data as MasterFact[],sources:sources.data as MasterSource[],canEdit:["owner","editor"].includes(members.data[0].role)};
}
export async function masterMutation<T>(path:"property-master"|"property-fact"|"planner",body:Record<string,unknown>):Promise<T>{
 if(!client)throw Error("Sin conexión");
 const {data:{session}}=await client.auth.getSession();
 if(!session)throw Error("La sesión ha expirado.");
 const response=await fetch("/api/"+path,{method:"POST",headers:{authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:JSON.stringify(body),redirect:"error"});
 if(!response.ok){if(response.status===409)throw Error("La información o el calendario cambió. Actualiza antes de guardar.");if(response.status===403)throw Error("No tienes permiso de edición.");throw Error("No se confirmó el guardado. Actualiza la ficha antes de reintentar.");}
 return await response.json() as T;
}

export async function loadPlanningInputs(workspace:string):Promise<Pick<import("../domain/planner.ts").PlanInput,"facts"|"sources"|"assets"|"events">>{
 if(!client)throw Error("Sin conexión");
 const [f,s,a,e]=await Promise.all([
  client.from("property_facts").select("id,property_id,key,typed_value,source_id,verified_at,expires_at,verification_status").eq("workspace_id",workspace).limit(1000),
  client.from("sources").select("id,property_id,authorization_status").eq("workspace_id",workspace).limit(1000),
  client.from("assets").select("id,property_id,media_type,rights_status,staging_status,approved_at").eq("workspace_id",workspace).limit(1000),
  client.from("events").select("id,property_id,type,start_at,end_at,confirmation_status").eq("workspace_id",workspace).limit(1000)
 ]);
 if([f,s,a,e].some(r=>r.error||!r.data||r.data.length>=1000))throw Error("No se pudo consultar la información completa de planificación.");
 return {facts:f.data!.map(x=>({id:x.id,propertyId:x.property_id,key:x.key,value:x.typed_value,sourceId:x.source_id,verifiedAt:x.verified_at,expiresAt:x.expires_at,status:x.verification_status})),sources:s.data!,assets:a.data!,events:e.data!};
}

export async function saveEditorialPlan(workspaceId:string,batchId:string,result:import("../domain/planner.ts").PlanResult,perWeek:number){
 return masterMutation<{created:number;postIds:string[]}>("planner",{workspaceId,batchId,start:result.start,perWeek,items:result.items});
}

export async function loadContentInput(workspace:string,postId:string):Promise<import("../domain/content.ts").ContentInput>{
 if(!client)throw Error("Sin conexión");
 const postResult=await client.from("posts").select("id,property_id,property_revision,planned_at,format,workflow_state,editorial_state,strategy_id,event_id").eq("workspace_id",workspace).eq("id",postId).single();
 if(postResult.error||!postResult.data)throw Error("No se pudo consultar la publicación.");
 const post=postResult.data;
 if(!post.strategy_id)throw Error("La publicación no tiene una estrategia registrada.");
 const [property,strategy,refs,media,input]=await Promise.all([
  client.from("properties").select("id,address,locality,status,revision,transaction_type").eq("workspace_id",workspace).eq("id",post.property_id).single(),
  client.from("strategies").select("id,property_id,angle,revision").eq("workspace_id",workspace).eq("id",post.strategy_id).eq("property_id",post.property_id).single(),
  client.from("strategy_facts").select("fact_id").eq("workspace_id",workspace).eq("property_id",post.property_id).eq("strategy_id",post.strategy_id).limit(1000),
  client.from("post_assets").select("asset_id,ordinal").eq("workspace_id",workspace).eq("post_id",post.id).eq("property_id",post.property_id).order("ordinal").limit(1000),
  loadPlanningInputs(workspace)
 ]);
 if(property.error||strategy.error||refs.error||media.error||!property.data||!strategy.data||!refs.data||!media.data||refs.data.length>=1000||media.data.length>=1000||strategy.data.revision!==post.property_revision)throw Error("La estrategia o la evidencia no están completas.");
 // Preview only. These reads are not an atomic export authorization.
 return {...input,property:property.data,post:{...post,angle:strategy.data.angle,eventId:post.event_id??undefined},factIds:refs.data.map(x=>x.fact_id),assetIds:media.data.map(x=>x.asset_id),now:Date.now()};
}
