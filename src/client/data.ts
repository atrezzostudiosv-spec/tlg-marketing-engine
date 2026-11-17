import { createClient } from "@supabase/supabase-js";
import type { EditorialState, WorkflowState, PropertyStatus, Format } from "../domain/contracts.ts";

export type Listing = {id:string;address:string;locality:string;status:PropertyStatus;priority:number;transaction_type:"SALE"|"LEASE";revision:number};
export type CalendarPost = {id:string;property_id:string;planned_at:string;format:Format;editorial_state:EditorialState;workflow_state:WorkflowState;property_revision:number};
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
  client.from("posts").select("id,property_id,planned_at,format,editorial_state,workflow_state,property_revision").eq("workspace_id",workspace).order("planned_at").limit(1000),
  client.from("post_alerts").select("id,post_id,kind,created_at").eq("workspace_id",workspace).is("resolved_at",null).order("created_at",{ascending:false}).limit(1000)
 ]);
 if(p.error||s.error||a.error||[p.data,s.data,a.data].some(x=>!x||x.length===1000)) throw Error("No se pudo cargar el inventario completo. No se mostrarán datos parciales.");
 return {properties:p.data as Listing[],posts:s.data as CalendarPost[],alerts:a.data as Alert[]};
}
