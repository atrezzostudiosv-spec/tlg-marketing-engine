import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { client, workspaces, loadSnapshot } from "../client/data.ts";
import type { Snapshot, Workspace, CalendarPost, MasterData } from "../client/data.ts";
import { dateKey, weekDays, weekStart, shiftDay, labelDay, clock } from "../client/calendar.ts";
import { demoSnapshot } from "../client/demo.ts";
import { PropertyMaster, CreateProperty, demoMaster } from "./PropertyMaster.tsx";
import type { PropertyStatus } from "../domain/contracts.ts";
import { Planner } from "./Planner.tsx";
import { ContentPreview } from "./ContentPreview.tsx";

const tabs=["Hoy","Calendario","Propiedades","Excepciones"] as const;
type Tab=typeof tabs[number];
const formatNames={carousel:"Carrusel",photo:"Fotografía",reel:"Reel",story:"Historia"};
const stateNames={BORRADOR:"Borrador",VALIDANDO:"Validando",LISTO:"Revalidación pendiente",REQUIERE_ATENCION:"Requiere atención",BLOQUEADO:"Bloqueado"};
const glyphs=["◷","▦","⌂","!"];
const empty:Snapshot={properties:[],posts:[],alerts:[]};

function Brand(){return <div className="brand"><span className="monogram">TLG<span>.</span></span><div>MARKETING<br/>ENGINE <small> / 01</small></div></div>}
function Login({onDemo}:{onDemo:()=>void}){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(e:FormEvent){e.preventDefault();if(!client||busy)return;setBusy(true);setError("");
 try{const {error}=await client.auth.signInWithPassword({email,password});if(error)setError("No se pudo iniciar sesión. Comprueba tus credenciales.");}
 catch{setError("Servicio de acceso no disponible.");}finally{setPassword("");setBusy(false);}}
 return <main className="login"><Brand/><div className="login-card"><p className="eyebrow">WORKSPACE PRIVADO</p><h1>Tu marketing,<br/>organizado.</h1><p className="muted">Un espacio para planificar, producir y verificar cada publicación.</p>
 {client?<form onSubmit={submit}><label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p role="alert" className="warning">{error}</p>}<button className="primary" disabled={busy}>{busy?"Accediendo…":"Acceder"}</button></form>:<p className="notice">Supabase aún no está configurado. No se puede acceder a datos reales.</p>}
 <button className="secondary" onClick={onDemo}>Explorar demostración</button><small className="muted">La demostración utiliza exclusivamente datos ficticios.</small></div><footer>THE LEGACY GROUP · MARKETING OPERATIONS</footer></main>;
}

export function App(){
 const [session,setSession]=useState<Session|null>(null),[demo,setDemo]=useState(false),[checking,setChecking]=useState(Boolean(client)),[authError,setAuthError]=useState("");
 useEffect(()=>{if(!client)return;const {data:{subscription}}=client.auth.onAuthStateChange((_event,next)=>{setSession(next);setChecking(false);if(next)setDemo(false);});return()=>subscription.unsubscribe();},[]);
 if(checking)return <main className="login"><Brand/><p role="status">Comprobando acceso…</p></main>;
 if(!session&&!demo)return <Login onDemo={()=>setDemo(true)}/>;
 return <WorkspaceView key={demo?"demo":session?.user.id} demo={demo} authError={authError} onExit={async()=>{setAuthError("");if(demo){setDemo(false);return;}try{const r=await client?.auth.signOut({scope:"local"});if(r?.error)throw r.error;setSession(null);}catch{setAuthError("No se pudo cerrar la sesión. Cierra esta pestaña.");}}}/>;
}

function WorkspaceView({demo,onExit,authError}:{demo:boolean;onExit:()=>void;authError:string}){
 const [tab,setTab]=useState<Tab>("Hoy"),[today]=useState(()=>dateKey(new Date())),[week,setWeek]=useState(()=>weekStart(today));
 const [snapshot,setSnapshot]=useState<Snapshot>(()=>demo?demoSnapshot(today):empty);
 const [spaces,setSpaces]=useState<Workspace[]>([]),[workspace,setWorkspace]=useState(""),[selected,setSelected]=useState<string|null>(null),[loading,setLoading]=useState(!demo),[error,setError]=useState(""),[reload,setReload]=useState(0);
 useEffect(()=>{if(demo)return;let active=true;setLoading(true);workspaces().then(rows=>{if(!active)return;setSpaces(rows);setWorkspace(rows[0]?.id??"");if(!rows.length)setLoading(false);}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false};},[demo]);
 useEffect(()=>{if(demo||!workspace)return;let active=true;setSnapshot(empty);setSelected(null);setError("");setLoading(true);
 loadSnapshot(workspace).then(rows=>{if(active)setSnapshot(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false};},[demo,workspace,reload]);
 const [propertyId,setPropertyId]=useState<string|null>(null),[creating,setCreating]=useState(false),[demoMasters,setDemoMasters]=useState<Record<string,MasterData>>({}),[savedNotice,setSavedNotice]=useState("");
 const property=snapshot.properties.find(p=>p.id===propertyId);
 function localSave(key:string,value:string|number,sourceId:string){
  if(!demo||!property)throw Error("Simulación no disponible");
  const m=demoMasters[property.id]??demoMaster(property),prior=m.facts.find(f=>f.key===key);
  const changed=!prior||prior.typed_value!==value||prior.source_id!==sourceId;
  const revision=property.revision+(changed?1:0),now=new Date().toISOString();
  const status=key==="status"?value as PropertyStatus:property.status;
  const next={id:prior?.id??"demo-"+property.id+"-"+key,key,typed_value:value,unit:key==="price"?(property.transaction_type==="LEASE"?"USD/month":"USD"):key==="living_sqft"?"sqft":key==="lot_acres"?"acres":null,source_id:sourceId,verified_at:now,expires_at:["status","price","availability"].includes(key)?new Date(Date.now()+86400000).toISOString():null,verification_status:"CONFIRMED" as const};
  setDemoMasters(old=>({...old,[property.id]:{...m,facts:[...m.facts.filter(f=>f.key!==key),next]}}));
  const affected=changed?snapshot.posts.filter(p=>p.property_id===property.id&&["PENDIENTE","PROGRAMADO"].includes(p.workflow_state)):[];
  const external=affected.filter(p=>p.workflow_state==="PROGRAMADO");
  setSnapshot(old=>({...old,properties:old.properties.map(p=>p.id===property.id?{...p,revision,status}:p),posts:old.posts.map(p=>affected.some(a=>a.id===p.id)?{...p,editorial_state:"BLOQUEADO",workflow_state:p.workflow_state==="PENDIENTE"&&status!=="ACTIVE"?"CANCELADO":p.workflow_state}:p),alerts:[...old.alerts,...external.map(p=>({id:"demo-"+p.id+"-"+revision,post_id:p.id,kind:"EXTERNAL_SCHEDULE_REVIEW",created_at:now}))]}));
  return {revision,changed,pendingInvalidated:affected.filter(p=>p.workflow_state==="PENDIENTE").length,externalReview:external.length};
 }
 const listings=new Map(snapshot.properties.map(p=>[p.id,p]));
 const openPosts=snapshot.posts.filter(p=>p.workflow_state!=="CANCELADO"&&p.workflow_state!=="PUBLICADO");
 const todayPosts=openPosts.filter(p=>dateKey(p.planned_at)===today);
 const exceptions=openPosts.filter(p=>p.editorial_state==="BLOQUEADO"||p.editorial_state==="REQUIERE_ATENCION"||snapshot.alerts.some(a=>a.post_id===p.id));
 const current=snapshot.posts.find(p=>p.id===selected);
 function postRow(p:CalendarPost){return <button className="post-row" key={p.id} onClick={()=>setSelected(p.id)}><span className="date-box">{clock(p.planned_at,"America/Chicago")}<small>TX</small></span><span className="post-name"><strong>{listings.get(p.property_id)?.address??"Propiedad no disponible"}</strong><small>{formatNames[p.format]} · Facebook / Instagram</small></span><span className={"status "+(p.editorial_state==="BLOQUEADO"?"blocked":"")}>{stateNames[p.editorial_state]}</span><span aria-hidden="true">›</span></button>}
 return <div className="shell"><aside><Brand/><p className="eyebrow nav-label">OPERACIONES</p><nav aria-label="Navegación principal">{tabs.map((t,i)=><button key={t} aria-current={tab===t?"page":undefined} className={tab===t?"active":""} onClick={()=>{setTab(t);setSelected(null);setPropertyId(null);setCreating(false)}}><span aria-hidden="true">{glyphs[i]}</span>{t}</button>)}</nav><div className="sidebar-bottom"><p className="eyebrow">ESTADO DEL SISTEMA</p><p>{demo?"Demostración":"Acceso autenticado"}</p><button className="secondary" onClick={onExit}>{demo?"Salir de demo":"Cerrar sesión"}</button>{authError&&<p role="alert">{authError}</p>}</div></aside>
 <main className="workspace"><header className="topbar"><span>TLG / {tab}</span><div>{!demo&&spaces.length>0&&<label className="sr-only" htmlFor="space">Espacio de trabajo</label>}{!demo&&spaces.length>0&&<select id="space" value={workspace} onChange={e=>{setSnapshot(empty);setSavedNotice("");setSelected(null);setPropertyId(null);setCreating(false);setLoading(true);setWorkspace(e.target.value)}}>{spaces.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>}<span className="mode">{demo?"DEMO · DATOS FICTICIOS":"ACCESO SEGURO"}</span></div></header>
 <section className="content"><div className="page-title"><div><p className="eyebrow">MARKETING OPERATIONS / 01</p><h1>{tab==="Hoy"?"Tu centro de trabajo":tab}</h1><p className="muted">{tab==="Hoy"?labelDay(today,{weekday:"long",day:"numeric",month:"long",year:"numeric"}):"Planificación y control editorial"}</p></div>{!demo&&<button className="secondary" disabled={loading||!workspace} onClick={()=>setReload(n=>n+1)}>Actualizar</button>}</div>
 {savedNotice&&<p className="notice" role="status">{savedNotice}</p>}
 <div className="notice">{demo?"Vista de demostración: no hay publicaciones reales ni medios autorizados.":"Los textos generados son borradores. La exportación está deshabilitada hasta completar la validación editorial."}</div>
 {loading?<p role="status">Cargando espacio de trabajo…</p>:error?<p role="alert" className="warning">{error}</p>:!demo&&!workspace?<p>No tienes un espacio de trabajo asignado.</p>:<>
 {tab==="Hoy"&&<><div className="metrics">{[["Propiedades activas",snapshot.properties.filter(p=>p.status==="ACTIVE").length],["Publicaciones de hoy",todayPosts.length],["Excepciones",exceptions.length]].map(([name,num])=><div className="metric" key={name}><span>{name}</span><strong>{String(num).padStart(2,"0")}</strong></div>)}</div><section className="panel"><div className="panel-title"><h2>Publicaciones de hoy</h2><button className="link" onClick={()=>setTab("Calendario")}>Ver calendario →</button></div>{todayPosts.length?todayPosts.map(postRow):<p className="empty">No hay publicaciones pendientes para hoy.</p>}</section><section className="panel"><div className="panel-title"><h2>Requieren atención</h2><button className="link" onClick={()=>setTab("Excepciones")}>Ver todas →</button></div>{exceptions.length?exceptions.map(postRow):<p className="empty">No hay excepciones registradas.</p>}</section></>}
 {tab==="Calendario"&&<><section className="panel"><div className="panel-title"><h2>{labelDay(week,{day:"numeric",month:"long"})} — {labelDay(shiftDay(week,6),{day:"numeric",month:"long"})}</h2><div className="week-controls"><button aria-label="Semana anterior" onClick={()=>setWeek(w=>shiftDay(w,-7))}>‹</button><button onClick={()=>setWeek(weekStart(today))}>Hoy</button><button aria-label="Semana siguiente" onClick={()=>setWeek(w=>shiftDay(w,7))}>›</button></div></div><div className="week">{weekDays(week).map(day=><div className={"day "+(day===today?"today":"")} key={day}><span>{labelDay(day,{weekday:"short"})}</span><strong>{labelDay(day,{day:"numeric"})}</strong>{snapshot.posts.filter(p=>dateKey(p.planned_at)===day&&p.workflow_state!=="CANCELADO").map(p=><button key={p.id} onClick={()=>setSelected(p.id)}><b>{listings.get(p.property_id)?.address??"Sin ficha"}</b><small>{formatNames[p.format]} · {stateNames[p.editorial_state]}</small></button>)}</div>)}</div><p className="muted footnote">Las fechas del calendario corresponden a Texas (America/Chicago).</p></section><Planner key={workspace||"demo"} snapshot={snapshot} workspace={workspace} demo={demo} masters={demoMasters} onSaved={n=>{setSavedNotice(n+" borradores registrados. El contenido aún debe producirse y validarse.");setReload(v=>v+1)}} onApply={items=>{if(!demo)return;setSnapshot(old=>({...old,posts:[...old.posts,...items.filter(i=>!old.posts.some(p=>p.id===i.id||p.workflow_state!=="CANCELADO"&&p.format!=="story"&&dateKey(p.planned_at)===i.day)).map(i=>({id:i.id,property_id:i.propertyId,planned_at:i.plannedAt,format:i.format,editorial_state:"BORRADOR" as const,workflow_state:"PENDIENTE" as const,property_revision:i.revision,angle:i.angle,goal:i.goal,eventId:i.eventId,factIds:i.factIds,assetIds:i.assetIds}))]}));}}/></>}
 {tab==="Propiedades"&&<>{!demo&&<div className="property-toolbar"><button className="primary" onClick={()=>setCreating(true)}>Nueva propiedad</button></div>}<section className="property-grid">{snapshot.properties.length?snapshot.properties.map(p=><article className="panel property" key={p.id}><div className="property-placeholder"><span>TLG / INVENTARIO</span><span>⌂</span></div><p className="eyebrow">{p.transaction_type==="LEASE"?"ALQUILER":"VENTA"} · {p.status}</p><h2>{p.address}</h2><p className="muted">{p.locality}</p><div className="property-meta"><span>Prioridad {p.priority}</span><span>Rev. {p.revision}</span></div><button className="secondary" onClick={()=>{setSavedNotice("");setPropertyId(p.id)}}>Abrir ficha</button></article>):<p className="empty">No hay propiedades registradas.</p>}</section></>}
 {tab==="Excepciones"&&<section className="panel"><div className="panel-title"><h2>Publicaciones por revisar</h2></div>{exceptions.length?exceptions.map(postRow):<p className="empty">No hay excepciones registradas.</p>}{snapshot.alerts.length>0&&<p className="notice">{snapshot.alerts.length} alerta(s) de programación externa. Meta no se ha actualizado automáticamente.</p>}</section>}
 </>}
 </section></main>
 {property&&!loading&&!error&&<PropertyMaster key={property.id} property={property} workspace={workspace} demo={demo} lastNotice={savedNotice} local={demoMasters[property.id]} onLocalSave={localSave} onClose={()=>setPropertyId(null)} onUpdated={r=>{setSavedNotice("Dato confirmado. "+r.pendingInvalidated+" pendiente(s) afectada(s); "+r.externalReview+" programación(es) externa(s) requieren revisión.");setReload(n=>n+1)}}/>}
 {creating&&!demo&&<CreateProperty workspace={workspace} onClose={()=>setCreating(false)} onCreated={id=>{setSavedNotice("Ficha pendiente creada. Confirma sus datos y fuentes antes de promocionarla.");setCreating(false);setPropertyId(id);setReload(n=>n+1)}}/>}
 {current&&!loading&&!error&&<div className="overlay" onClick={()=>setSelected(null)}><section className="drawer" role="dialog" aria-modal="true" aria-label="Detalle de publicación" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Escape")setSelected(null)}}><button autoFocus className="close" aria-label="Cerrar detalle" onClick={()=>setSelected(null)}>×</button><p className="eyebrow">PAQUETE EDITORIAL</p><h2>{listings.get(current.property_id)?.address??"Propiedad no disponible"}</h2><span className="status">{stateNames[current.editorial_state]}</span><dl><dt>Formato</dt><dd>{formatNames[current.format]}</dd>{current.angle&&<><dt>Argumento</dt><dd>{current.angle}</dd></>}{current.goal&&<><dt>Objetivo</dt><dd>{current.goal}</dd></>}<dt>Fecha Texas</dt><dd>{labelDay(dateKey(current.planned_at),{day:"numeric",month:"long"})} · {clock(current.planned_at,"America/Chicago")}</dd><dt>Hora Barcelona</dt><dd>{clock(current.planned_at,"Europe/Madrid")}</dd><dt>Estado operativo</dt><dd>{current.workflow_state}</dd></dl>{listings.get(current.property_id)&&<ContentPreview key={current.id} property={listings.get(current.property_id)!} post={current} workspace={workspace} demo={demo} master={demoMasters[current.property_id]}/>}<p className="notice">Paquete no exportable hasta completar los controles de autorización.</p><button className="primary" disabled>Copiar publicación</button><button className="secondary" disabled>Descargar medios</button><a className="link" href="https://business.facebook.com/" target="_blank" rel="noreferrer">Abrir Meta Business Suite ↗</a></section></div>}
 </div>;
}
