import {useEffect,useState} from "react";
import type {FormEvent} from "react";
import {fields,statuses,parseFact} from "../domain/facts.ts";
import {isFactCurrent} from "../domain/eligibility.ts";
import {loadMaster,masterMutation} from "../client/data.ts";
import type {Listing,MasterData,MasterFact} from "../client/data.ts";
export type SaveOutcome={revision:number;changed:boolean;pendingInvalidated:number;externalReview:number};
export const demoSource={id:"demo-source",reference:"Fuente ficticia de prueba",authorization_status:"APPROVED",obtained_at:"2026-01-01T00:00:00Z"} as const;
export function demoMaster(property:Listing):MasterData{
 const now=new Date().toISOString();
 return {facts:[{id:"demo-status-"+property.id,key:"status",typed_value:property.status,unit:null,source_id:demoSource.id,verified_at:now,expires_at:null,verification_status:"CONFIRMED"}],sources:[demoSource],canEdit:true};
}
function valid(f:MasterFact,master:MasterData,p:Listing){
 return master.sources.some(s=>s.id===f.source_id&&s.authorization_status==="APPROVED")&&isFactCurrent({id:f.id,propertyId:p.id,key:f.key,value:f.typed_value,sourceId:f.source_id,verifiedAt:f.verified_at,expiresAt:f.expires_at,status:f.verification_status},Date.now());
}
const statusLabels:Record<string,string>={ACTIVE:"Activa",PENDING:"Pendiente",SOLD:"Vendida",LEASED:"Alquilada",WITHDRAWN:"Retirada",EXCLUDED:"Excluida"};
function factText(f:MasterFact){return f.key==="status"?statusLabels[String(f.typed_value)]??String(f.typed_value):typeof f.typed_value==="number"?f.typed_value.toLocaleString("en-US")+(f.unit?" "+f.unit:""):String(f.typed_value)}
export function PropertyMaster({property,workspace,demo,onClose,onUpdated,local,onLocalSave}:{property:Listing;workspace:string;demo:boolean;onClose:()=>void;onUpdated:()=>void;local?:MasterData;onLocalSave:(key:string,value:string|number,sourceId:string)=>SaveOutcome}){
 const [master,setMaster]=useState<MasterData|null>(demo?local??demoMaster(property):null),[loading,setLoading]=useState(!demo),[error,setError]=useState(""),[message,setMessage]=useState(""),[key,setKey]=useState<string>("price"),[raw,setRaw]=useState(""),[source,setSource]=useState(""),[reference,setReference]=useState(""),[attested,setAttested]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[stale,setStale]=useState(false);
 useEffect(()=>{if(demo){setMaster(local??demoMaster(property));return;}let alive=true;setLoading(true);setMaster(null);setError("");loadMaster(workspace,property.id).then(m=>{if(alive){setMaster(m);setSource(s=>m.sources.some(x=>x.id===s)?s:m.sources.find(x=>x.authorization_status==="APPROVED")?.id??"");}}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false};},[workspace,property.id,demo,local,refresh]);
 const field=fields.find(f=>f.key===key)!;
 const approved=master?.sources.filter(s=>s.authorization_status==="APPROVED")??[];
 const sourceId=source||approved[0]?.id||"";
 function choose(k:string){setKey(k);const existing=master?.facts.find(f=>f.key===k);setRaw(existing?String(existing.typed_value):k==="status"?property.status:"");setConfirmed(false);setMessage("");}
 async function register(e:FormEvent){e.preventDefault();if(busy||!attested||demo)return;setBusy(true);setError("");setMessage("");
 try{const r=await masterMutation<{id:string}>("property-master",{action:"source",workspaceId:workspace,propertyId:property.id,reference,attested:true});setSource(r.id);setReference("");setAttested(false);setRefresh(n=>n+1);setMessage("Fuente registrada mediante tu confirmación.");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();if(busy||!confirmed||!sourceId||stale)return;setError("");setMessage("");
 const value=parseFact(key,field.kind==="number"?(raw.trim()?Number(raw):null):raw);
 if(value===null){setError("El valor no es válido.");return;}
 setBusy(true);
 try{const r=demo?onLocalSave(key,value,sourceId):await masterMutation<SaveOutcome>("property-fact",{workspaceId:workspace,propertyId:property.id,sourceId,expectedRevision:property.revision,key,value});
 setConfirmed(false);setMessage((demo?"Simulación: ":"")+"Dato confirmado. "+r.pendingInvalidated+" pendiente(s) afectada(s); "+r.externalReview+" programación(es) externa(s) requieren revisión.");
 if(!demo){setStale(true);onUpdated();} 
 }catch(e){setError((e as Error).message);if(!demo)setStale(true);}finally{setBusy(false);}}
 return <div className="overlay" onClick={()=>{if(!busy)onClose()}}><section className="drawer master-drawer" role="dialog" aria-modal="true" aria-label="Ficha maestra" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape"&&!busy)onClose()}}>
 <button autoFocus className="close" aria-label="Cerrar ficha" onClick={onClose} disabled={busy}>×</button><p className="eyebrow">PROPERTY INTELLIGENCE / FICHA MAESTRA</p><h2>{property.address}</h2><p className="muted">{property.locality} · {property.transaction_type==="LEASE"?"Alquiler":"Venta"} · Revisión {property.revision}</p>
 <p className="notice">{demo?"Simulación local: ningún dato se guarda en el servidor.":"Los datos se confirman mediante una fuente autorizada. Una confirmación del operador no constituye una comprobación independiente."}</p>
 {loading?<p role="status">Consultando ficha…</p>:master&&<>
 <div className="master-summary"><div><span>Datos registrados</span><strong>{master.facts.length}/{fields.length}</strong></div><div><span>Datos vigentes</span><strong>{master.facts.filter(f=>valid(f,master,property)).length}</strong></div></div>
 <h3>Datos de la propiedad</h3><div className="fact-list">{fields.map(f=>{const existing=master.facts.find(x=>x.key===f.key);return <button className={"fact-row "+(key===f.key?"chosen":"")} key={f.key} onClick={()=>choose(f.key)}><span><b>{f.label}</b><small>{existing?factText(existing):"Sin confirmar"}</small>{existing&&<small>Fuente: {master.sources.find(s=>s.id===existing.source_id)?.reference??"No disponible"} · {new Date(existing.verified_at).toLocaleDateString("es-ES")}</small>}</span><span className="status">{existing&&valid(existing,master,property)?"Vigente":"Pendiente"}</span></button>})}</div>
 {master.canEdit&&<><h3>Confirmar un dato</h3><form className="master-form" onSubmit={save}><label>Campo<select value={key} onChange={e=>choose(e.target.value)}>{fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select></label><label>Valor{field.kind==="status"?<select value={raw||property.status} onChange={e=>{setRaw(e.target.value);setConfirmed(false)}}>{statuses.map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select>:field.kind==="text"?<textarea value={raw} maxLength={4000} onChange={e=>{setRaw(e.target.value);setConfirmed(false)}} required/>:<input type="number" value={raw} min="0" step="any" onChange={e=>{setRaw(e.target.value);setConfirmed(false)}} required/>}</label>
 <label>Fuente autorizada<select value={sourceId} onChange={e=>{setSource(e.target.value);setConfirmed(false)}} required>{!approved.length&&<option value="">Sin fuente registrada</option>}{approved.map(s=><option key={s.id} value={s.id}>{s.reference}</option>)}</select></label>
 <label className="checkline"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que el dato coincide con la fuente seleccionada.</label>
 <button className="primary" disabled={busy||!confirmed||!sourceId||stale||!raw.trim()}>{busy?"Guardando…":"Confirmar dato"}</button></form>
 {!demo&&<><h3>Registrar fuente</h3><form className="master-form" onSubmit={register}><label>Referencia verificable<input value={reference} maxLength={500} minLength={3} required placeholder="Referencia del listing o confirmación del broker" onChange={e=>{setReference(e.target.value);setAttested(false)}}/></label><label className="checkline"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>He consultado la fuente y tengo autorización para utilizarla.</label><button className="secondary" disabled={busy||!attested}>Registrar fuente</button></form></>}
 </>}
 {!master.canEdit&&<p className="notice">Tu rol solo permite consultar datos.</p>}</>}
 {message&&<p className="notice" role="status">{message}</p>}{error&&<p className="warning" role="alert">{error}</p>}
 {stale&&!demo&&<p className="notice">Actualiza la ficha antes de confirmar otro dato.</p>}
 </section></div>
}
export function CreateProperty({workspace,onClose,onCreated}:{workspace:string;onClose:()=>void;onCreated:()=>void}){
 const [address,setAddress]=useState(""),[locality,setLocality]=useState(""),[transaction,setTransaction]=useState("SALE"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");try{await masterMutation("property-master",{action:"create",workspaceId:workspace,address,locality,transaction});onCreated();}catch(e){setError((e as Error).message);setBusy(false);}}
 return <div className="overlay" onClick={()=>{if(!busy)onClose()}}><section className="drawer" role="dialog" aria-modal="true" aria-label="Nueva propiedad" onClick={e=>e.stopPropagation()}><button autoFocus className="close" aria-label="Cerrar" onClick={onClose} disabled={busy}>×</button><h2>Nueva propiedad</h2><p className="notice">Se creará como pendiente, sin autorización para generar publicaciones.</p><form className="master-form" onSubmit={submit}><label>Dirección<input required maxLength={200} value={address} onChange={e=>setAddress(e.target.value)}/></label><label>Localidad<input required maxLength={200} value={locality} onChange={e=>setLocality(e.target.value)}/></label><label>Operación<select value={transaction} onChange={e=>setTransaction(e.target.value)}><option value="SALE">Venta</option><option value="LEASE">Alquiler</option></select></label><button className="primary" disabled={busy}>Crear ficha pendiente</button>{error&&<p role="alert" className="warning">{error}</p>}</form></section></div>
}
