import {useState} from "react";
import {composeDraft} from "../domain/content.ts";
import type {ContentDraft,ContentInput} from "../domain/content.ts";
import type {Listing,CalendarPost,MasterData} from "../client/data.ts";
import {loadContentInput} from "../client/data.ts";
import {demoMaster} from "./PropertyMaster.tsx";
const labels:Record<string,string>={
 PROPERTY_CHANGED:"La propiedad o su revisión cambió.",
 POST_NOT_EDITABLE:"Esta publicación no admite generación de borradores.",
 STRATEGY_MISSING:"No hay un argumento comercial registrado.",
 PROPERTY_IDENTITY_REVIEW:"La identidad de la propiedad requiere revisión.",
 FACT_INVALID:"Dato caducado, inválido o de otra propiedad.",
 SOURCE_INVALID:"Fuente no autorizada o de otra propiedad.",
 FACT_OUTSIDE_STRATEGY:"Dato ajeno al argumento comercial.",
 EVIDENCE_MISSING:"Falta evidencia necesaria para el argumento.",
 DESCRIPTION_REQUIRES_STRUCTURED_FACTS:"La descripción necesita convertirse en características concretas verificadas.",
 AVAILABILITY_REQUIRES_ISO_DATE:"Confirma la disponibilidad con una fecha AAAA-MM-DD.",
 EVENT_NOT_CURRENT:"El evento ya no está confirmado o su fecha es inválida.",
 MEDIA_INVALID:"Medio no autorizado, no vigente o de otra propiedad.",
 MEDIA_MISSING:"Faltan medios autorizados.",
 CAROUSEL_INCOMPLETE:"El carrusel requiere al menos dos imágenes.",
 PHOTO_INCOMPLETE:"Falta la fotografía final.",
 FINAL_VIDEO_REQUIRED:"Falta el video final.",
 STORY_ASSET_REVIEW:"Falta validar el medio de historia.",
 BROKER_SIGNATURE_PENDING:"Falta configurar la firma comercial aprobada.",
 FACT_REVALIDATION_REQUIRED:"Revalidar hechos en el momento de exportar.",
 FINAL_EDITORIAL_REVIEW:"Pendiente de control editorial y normativo final.",
 MEDIA_OBJECT_CHECK_PENDING:"Pendiente de verificar la existencia y descarga de los medios."
};
export function ContentPreview({property,post,workspace,demo,master}:{property:Listing;post:CalendarPost;workspace:string;demo:boolean;master?:MasterData}){
 const [draft,setDraft]=useState<ContentDraft|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function generate(){
  setBusy(true);setDraft(null);setError("");
  try{
   let input:ContentInput;
   if(demo){
    const m=master??demoMaster(property);
    input={property,post,facts:m.facts.map(f=>({id:f.id,propertyId:property.id,key:f.key,value:f.typed_value,sourceId:property.id+"-"+f.source_id,verifiedAt:f.verified_at,expiresAt:f.expires_at,status:f.verification_status})),sources:m.sources.map(s=>({id:property.id+"-"+s.id,property_id:property.id,authorization_status:s.authorization_status})),factIds:post.factIds??[],assetIds:post.assetIds??[],assets:[],events:[],now:Date.now()};
   }else input=await loadContentInput(workspace,post.id);
   setDraft(composeDraft(input));
  }catch(e){setError((e as Error).message||"No se pudo preparar el contenido.");}finally{setBusy(false);}
 }
 const eligible=post.workflow_state==="PENDIENTE"&&["BORRADOR","REQUIERE_ATENCION"].includes(post.editorial_state);
 return <section className="content-preview"><p className="eyebrow">CONTENT INTELLIGENCE / BORRADOR</p><h3>Preparar contenido</h3><p className="muted">Composición controlada en inglés, basada en los datos del argumento. No autoriza la publicación.</p>
 <button className="primary" disabled={busy||!eligible} onClick={generate}>{busy?"Comprobando hechos…":"Preparar copies"}</button>
 {!eligible&&<p className="muted">Solo se generan textos para borradores pendientes y editables.</p>}
 {error&&<p className="warning" role="alert">{error}</p>}
 {draft&&<div className="draft-preview">
 <p className={draft.blocked?"warning":"notice"} role="status">{draft.blocked?"Generación bloqueada.":"Borradores preparados · No autorizados para publicar."}{demo?" Datos ficticios.":""}</p>
 {draft.variants.map(v=><article className="draft-variant" key={v.channel}><h4>{v.channel==="facebook"?"Facebook copy":"Instagram copy"}</h4><p lang="en">{v.body}</p></article>)}
 {draft.claims.length>0&&<div><h4>Evidencia utilizada</h4><div className="draft-evidence">{draft.claims.map(c=><div key={c.factId}><strong>{c.text}</strong><small>Dato: {c.factId} · Fuente: {c.sourceId}</small></div>)}</div></div>}
 <div><h4>{draft.blocked?"Motivo del bloqueo":"Controles pendientes"}</h4><ul>{draft.issues.map(i=><li key={i}>{labels[i.split(":")[0]]??i}</li>)}</ul></div>
 </div>}
 </section>;
}
