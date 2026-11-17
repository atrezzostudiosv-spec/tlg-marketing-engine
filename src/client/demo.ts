import type { Snapshot } from "./data.ts";
import { shiftDay } from "./calendar.ts";
// Deliberately fictional, no real address, price, copy, or media.
export function demoSnapshot(today:string):Snapshot {
 const properties=[
  {id:"demo-a",address:"Residencia A",locality:"Propiedad ficticia",status:"ACTIVE",priority:90,transaction_type:"SALE",revision:2},
  {id:"demo-b",address:"Residencia B",locality:"Propiedad ficticia",status:"ACTIVE",priority:60,transaction_type:"SALE",revision:1},
  {id:"demo-c",address:"Residencia C",locality:"Propiedad ficticia",status:"ACTIVE",priority:40,transaction_type:"LEASE",revision:1}
 ] as const;
 const at=(n:number)=>shiftDay(today,n)+"T18:00:00Z";
 return {properties:properties.map(p=>({...p})),posts:[
  {id:"demo-1",property_id:"demo-a",planned_at:at(0),format:"carousel",editorial_state:"REQUIERE_ATENCION",workflow_state:"PENDIENTE",property_revision:2,angle:"Distribución y superficie",goal:"Solicitar visita privada",factIds:["demo-status-demo-a","demo-bedrooms-demo-a","demo-sqft-demo-a"],assetIds:[]},
  {id:"demo-2",property_id:"demo-b",planned_at:at(1),format:"photo",editorial_state:"BORRADOR",workflow_state:"PENDIENTE",property_revision:1,angle:"Presentación del listing",factIds:["demo-status-demo-b"],assetIds:[]},
  {id:"demo-3",property_id:"demo-c",planned_at:at(2),format:"reel",editorial_state:"BORRADOR",workflow_state:"PENDIENTE",property_revision:1},
  {id:"demo-4",property_id:"demo-a",planned_at:at(3),format:"story",editorial_state:"BLOQUEADO",workflow_state:"PROGRAMADO",property_revision:1}
 ],alerts:[{id:"demo-alert",post_id:"demo-4",kind:"EXTERNAL_SCHEDULE_REVIEW",created_at:at(0)}]};
}
