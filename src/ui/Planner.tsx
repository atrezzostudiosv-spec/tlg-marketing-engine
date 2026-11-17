import {useState,useEffect} from "react";
import {buildPlan} from "../domain/planner.ts";
import type {PlanResult,PlanInput,PlanItem} from "../domain/planner.ts";
import {dateKey,shiftDay,labelDay,clock} from "../client/calendar.ts";
import {loadPlanningInputs,saveEditorialPlan} from "../client/data.ts";
import type {Snapshot,MasterData} from "../client/data.ts";
import {demoMaster} from "./PropertyMaster.tsx";

export function Planner({snapshot,workspace,demo,masters,onApply,onSaved}:{snapshot:Snapshot;workspace:string;demo:boolean;masters:Record<string,MasterData>;onApply:(items:PlanItem[])=>void;onSaved:(created:number)=>void}){
 const [start,setStart]=useState(()=>dateKey(new Date())),[perWeek,setPerWeek]=useState(5),[result,setResult]=useState<PlanResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[applied,setApplied]=useState(false),[batchId,setBatchId]=useState("");
 useEffect(()=>{setResult(null);},[snapshot,workspace,masters]);
 const names=new Map(snapshot.properties.map(p=>[p.id,p.address]));
 async function generate(){
  setError("");setBusy(true);setResult(null);setApplied(false);
  try{
   const now=Date.now();
   let input:Pick<PlanInput,"facts"|"sources"|"assets"|"events">;
   if(demo){
    const rows=snapshot.properties.map(p=>({p,m:masters[p.id]??demoMaster(p)}));
    // Demo source IDs must be unique and scoped to the synthetic listing.
    input={facts:rows.flatMap(({p,m})=>m.facts.map(f=>({id:f.id,propertyId:p.id,key:f.key,value:f.typed_value,sourceId:p.id+"-"+f.source_id,verifiedAt:f.verified_at,expiresAt:f.expires_at,status:f.verification_status}))),sources:rows.flatMap(({p,m})=>m.sources.map(s=>({id:p.id+"-"+s.id,property_id:p.id,authorization_status:s.authorization_status}))),assets:[],events:[]};
   }else input=await loadPlanningInputs(workspace);
   setResult(buildPlan({...input,properties:snapshot.properties,history:snapshot.posts,now:Math.max(now,Date.now()),start,perWeek}));if(!demo)setBatchId(crypto.randomUUID());
  }catch(e){setError((e as Error).message||"No se pudo generar el plan.");}finally{setBusy(false);}
 }
 async function save(){
  if(!result||!batchId||busy||demo)return;
  setBusy(true);setError("");
  try{const saved=await saveEditorialPlan(workspace,batchId,result,perWeek);setResult(null);onSaved(saved.created);}
  catch(e){setError((e as Error).message+" Si se perdió la respuesta, puedes reintentar el mismo guardado sin duplicar el lote.");}
  finally{setBusy(false);}
 }
 return <section className="panel planner-panel"><div className="planner-heading"><div><p className="eyebrow">CONTENT PLANNER / 14 DÍAS</p><h2>Planificar las próximas publicaciones</h2><p className="muted">Rotación, prioridades y argumentos respaldados por la ficha maestra.</p></div><button className="primary" disabled={busy} onClick={generate}>{busy?"Analizando…":"Generar calendario"}</button></div>
 <div className="planner-settings"><label>Inicio en Texas<input type="date" value={start} min={dateKey(new Date())} onChange={e=>{setStart(e.target.value);setResult(null);setApplied(false)}} disabled={busy}/></label><label>Piezas de feed por semana<select value={perWeek} onChange={e=>{setPerWeek(Number(e.target.value));setResult(null);setApplied(false)}} disabled={busy}>{[3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>
 <p className="muted footnote">Horario inicial: 12:00 de Texas. Se conservan las publicaciones existentes. Las historias no consumen cupos de feed.</p>
 {error&&<p className="warning" role="alert">{error}</p>}
 {applied&&<p className="notice" role="status">Plan incorporado a la demostración. No se ha guardado en el servidor.</p>}
 {result&&<><div className="planner-summary"><span><strong>{result.items.length}</strong> propuestas nuevas</span><span><strong>{result.existing.length}</strong> existentes conservadas</span><span><strong>{result.unfilled}</strong> cupos sin cubrir</span></div>
 <p className="notice">Propuesta editorial, no contenido listo. Los datos volátiles y los medios deben revalidarse antes de publicar. {demo?"Simulación con datos ficticios.":"Vista previa. Guarda los borradores para conservar el calendario."}</p>
 <div className="planner-days">{Array.from({length:14},(_,i)=>shiftDay(result.start,i)).map(day=><div className="planner-day" key={day}><div className="planner-date"><b>{labelDay(day,{day:"numeric",month:"short"})}</b><small>{labelDay(day,{weekday:"long"})}</small></div><div className="planner-entries">{result.existing.filter(h=>dateKey(h.planned_at)===day).map(h=><div className="planner-entry existing" key={h.id}><b>{names.get(h.property_id)??"Propiedad no disponible"}</b><small>Existente · {h.workflow_state} · {clock(h.planned_at,"America/Chicago")} TX</small></div>)}{result.items.filter(p=>p.day===day).map(p=><div className="planner-entry" key={p.id}><b>{names.get(p.propertyId)}</b><small>{p.angle} · {p.format==="carousel"?"Carrusel":"Fotografía"} · {clock(p.plannedAt,"America/Chicago")} TX / {clock(p.plannedAt,"Europe/Madrid")} BCN</small><small>{p.reason} · {p.goal}</small><span className="status">{p.needsMedia?"Medios pendientes":"Medios por revalidar"} · Borrador</span></div>)}{!result.items.some(p=>p.day===day)&&!result.existing.some(h=>dateKey(h.planned_at)===day)&&<small className="muted">Sin pieza de feed propuesta</small>}</div></div>)}</div>
 {result.excluded.length>0&&<div><h3>Propiedades fuera de la planificación</h3>{result.excluded.map(p=><p className="muted" key={p.propertyId}>{names.get(p.propertyId)} — {p.reason}</p>)}</div>}
 {result.uncovered.length>0&&<p className="notice">Sin cobertura en este ciclo: {result.uncovered.map(id=>names.get(id)).join(", ")}.</p>}
 {demo?<button className="secondary" disabled={!result.items.length||busy} onClick={()=>{onApply(result.items);setResult(null);setApplied(true)}}>Incorporar borradores a la demo</button>:<button className="primary" disabled={!result.items.length||busy||!batchId} onClick={save}>{busy?"Guardando…":"Guardar calendario como borradores"}</button>}
 </>}
 </section>;
}
