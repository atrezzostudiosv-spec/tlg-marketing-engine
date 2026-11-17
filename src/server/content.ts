import {selectEditorial,aiEnabled} from "./editorial-ai.ts";
import {composeDraft} from "../domain/content.ts";
import type {ContentInput} from "../domain/content.ts";
type Env={SUPABASE_URL:string;SUPABASE_PUBLISHABLE_KEY:string;SUPABASE_SERVICE_ROLE_KEY:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string;OPENAI_EDITORIAL_ENABLED?:string};
const id=(x:unknown):x is string=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function generateContent(request:Request,env:Env,send:typeof fetch=fetch):Promise<Response>{
 if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=request.headers.get("authorization")??"";if(!/^Bearer [^\s]+$/i.test(token))return json({error:"UNAUTHENTICATED"},401);
 let base:string;try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();base=u.origin;}catch{return json({error:"SERVER_NOT_CONFIGURED"},503);}
 let b:Record<string,unknown>;try{const raw=await request.text();if(raw.length>2048)return json({error:"PAYLOAD_TOO_LARGE"},413);b=JSON.parse(raw);if(!b||typeof b!=="object"||Array.isArray(b))throw Error();}catch{return json({error:"INVALID_INPUT"},400);}
 if(!id(b.workspaceId)||!id(b.postId)||!id(b.requestId))return json({error:"INVALID_INPUT"},400);
 try{
  const auth=await send(base+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token},redirect:"error"});
  if(!auth.ok)return json({error:"AUTH_FAILED"},auth.status===401||auth.status===403?401:502);
  const user=await auth.json() as {id?:string};if(!id(user.id))return json({error:"UNAUTHENTICATED"},401);
  const rpc=(name:string,args:Record<string,unknown>)=>send(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify(args),redirect:"error"});
  const args={p_actor:user.id,p_workspace:b.workspaceId,p_post:b.postId};
  const fail=async(r:Response)=>{const e=await r.json().catch(()=>({})) as {code?:string};return json({error:"CONTENT_NOT_SAVED"},e.code==="42501"?403:e.code==="P0002"?404:e.code==="40001"?409:e.code==="22023"?400:502);};
  const context=await rpc("content_context",args);if(!context.ok)return fail(context);
  const snapshot=await context.json() as Omit<ContentInput,"now">;
  const input={...snapshot,now:Date.now()};
  const baseline=composeDraft(input);
  if(baseline.blocked)return json({saved:false,draft:baseline});
  let draft=baseline;
  if(aiEnabled(env)){
   const reservation=await rpc("reserve_editorial_request",{...args,p_id:b.requestId});
   if(!reservation.ok)return fail(reservation);
   const reserved=await reservation.json();
   if(reserved?.draft)return json({saved:true,draft:reserved.draft});
   draft=reserved?.allowed===true?await selectEditorial(input,env,send):{...baseline,editorialMode:"fallback"};
  }else draft={...baseline,editorialMode:"controlled"};
  if(draft.blocked)return json({saved:false,draft});
  const saved=await rpc("save_content_draft",{...args,p_id:b.requestId,p_snapshot:snapshot,p_draft:draft});
  if(!saved.ok)return fail(saved);
  const result=await saved.json();
  if(!result||result.blocked!==false||!Array.isArray(result.variants)||result.variants.length!==2)return json({error:"INVALID_SERVER_RESPONSE"},502);
  return json({saved:true,draft:result});
 }catch{return json({error:"SERVICE_UNAVAILABLE"},502);}
}
