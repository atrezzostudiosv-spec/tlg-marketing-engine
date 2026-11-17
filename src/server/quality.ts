import {assessQuality,canonical} from "../domain/quality.ts";
import type {QualityContext} from "../domain/quality.ts";
import {handleMedia} from "./media.ts";
type Env=Parameters<typeof handleMedia>[1];
const id=(x:unknown):x is string=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
async function fingerprint(x:unknown){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(x))))).map(v=>v.toString(16).padStart(2,"0")).join("");}
export async function qualityGate(req:Request,env:Env,send:typeof fetch=fetch):Promise<Response>{
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=req.headers.get("authorization")??"";if(!/^Bearer [^\s]+$/i.test(token))return json({error:"UNAUTHENTICATED"},401);
 let base:string;try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();base=u.origin;}catch{return json({error:"SERVER_NOT_CONFIGURED"},503);}
 let b:Record<string,unknown>;try{const raw=await req.text();if(raw.length>4096)return json({error:"PAYLOAD_TOO_LARGE"},413);b=JSON.parse(raw);}catch{return json({error:"INVALID_INPUT"},400);}
 if(!b||!id(b.workspaceId)||!id(b.postId)||!["review","approve"].includes(String(b.action))||typeof b.signature!=="string"||b.signature.length>300||typeof b.policyReference!=="string"||b.policyReference.length>500||(b.action==="approve"&&(b.attested!==true||typeof b.fingerprint!=="string")))return json({error:"INVALID_INPUT"},400);
 try{
  const auth=await send(base+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token},redirect:"error"});
  if(!auth.ok)return json({error:"AUTH_FAILED"},auth.status===401||auth.status===403?401:502);
  const user=await auth.json() as {id?:string};if(!id(user.id))return json({error:"UNAUTHENTICATED"},401);
  const args={p_actor:user.id,p_workspace:b.workspaceId,p_post:b.postId};
  const rpc=(name:string,extra:Record<string,unknown>={})=>send(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({...args,...extra}),redirect:"error"});
  const fail=async(r:Response)=>{const e=await r.json().catch(()=>({})) as {code?:string};return json({error:"QUALITY_CHECK_FAILED"},e.code==="42501"?403:e.code==="P0002"?404:e.code==="40001"?409:e.code==="22023"?400:502);};
  const res=await rpc("quality_context");if(!res.ok)return fail(res);
  const ctx=await res.json() as QualityContext;
  const review={signature:b.signature.trim(),policyReference:b.policyReference.trim()};
  if(b.action==="approve"&&!ctx.canApprove)return json({error:"OWNER_REQUIRED"},403);
  const report=assessQuality(ctx,review,Date.now());
  if(!report.package)return json({report,canApprove:false});
  const key=await fingerprint({ctx,review,package:report.package});
  if(b.action==="approve"&&key!==b.fingerprint)return json({error:"REVIEW_CHANGED"},409);
  // Fetch and verify actual bytes, not only metadata. Sequential and bounded by media.ts.
  for(const asset of report.package.assetIds){
   const check=await handleMedia(new Request("https://internal.invalid/api/media?"+new URLSearchParams({action:"preview",workspace:b.workspaceId,asset}),{method:"POST",headers:{authorization:token}}),env,send);
   if(!check.ok)return json({report:{issues:["MEDIA_INTEGRITY_FAILED"],package:null,expiresAt:null},canApprove:false});
   await check.body?.cancel();
  }
  if(b.action==="review")return json({report,fingerprint:key,canApprove:ctx.canApprove});
  // Recompute expiry after verifying storage, and compare the same reviewed package in SQL.
  const final=assessQuality(ctx,review,Date.now());
  if(!final.package||!final.expiresAt)return json({report:final,canApprove:false});
  const saved=await rpc("approve_package",{p_context:ctx,p_package:final.package,p_review:{...review,attested:true},p_expires:final.expiresAt});
  if(!saved.ok)return fail(saved);
  const approvalId=await saved.json();if(!id(approvalId))return json({error:"INVALID_SERVER_RESPONSE"},502);
  return json({report:final,approvalId,canApprove:true});
 }catch{return json({error:"SERVICE_UNAVAILABLE"},502);}
}
