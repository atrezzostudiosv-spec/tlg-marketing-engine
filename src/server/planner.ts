type Env={SUPABASE_URL:string;SUPABASE_PUBLISHABLE_KEY:string;SUPABASE_SERVICE_ROLE_KEY:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(x:unknown):x is string=>typeof x==="string"&&uuid.test(x);
const day=(x:unknown):x is string=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+"T12:00:00Z"))&&new Date(x+"T12:00:00Z").toISOString().slice(0,10)===x;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function cleanItem(x:unknown){
 if(!x||typeof x!=="object")return null;
 const p=x as Record<string,unknown>;
 if(!id(p.propertyId)||!day(p.day)||typeof p.revision!=="number"||!Number.isInteger(p.revision)||p.revision<1||p.revision>2147483647||
  !["photo","carousel"].includes(String(p.format))||typeof p.angle!=="string"||p.angle.length>100||
  !Array.isArray(p.factIds)||p.factIds.length<1||p.factIds.length>4||!p.factIds.every(id)||
  !Array.isArray(p.assetIds)||p.assetIds.length>5||!p.assetIds.every(id)||
  (p.eventId!==undefined&&p.eventId!==null&&!id(p.eventId)))return null;
 return {propertyId:p.propertyId,day:p.day,revision:p.revision,format:p.format,angle:p.angle,factIds:p.factIds,assetIds:p.assetIds,eventId:p.eventId??null};
}
export async function savePlan(request:Request,env:Env,send:typeof fetch=fetch):Promise<Response>{
 if(request.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=request.headers.get("authorization")??"";if(!/^Bearer [^\s]+$/i.test(token))return json({error:"UNAUTHENTICATED"},401);
 let base:string;
 try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();base=u.origin;}catch{return json({error:"SERVER_NOT_CONFIGURED"},503);}
 let b:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>32000)return json({error:"PAYLOAD_TOO_LARGE"},413);const v=JSON.parse(raw);if(!v||typeof v!=="object"||Array.isArray(v))throw Error();b=v;}catch{return json({error:"INVALID_INPUT"},400);}
 if(!id(b.workspaceId)||!id(b.batchId)||!day(b.start)||typeof b.perWeek!=="number"||!Number.isInteger(b.perWeek)||b.perWeek<1||b.perWeek>7||!Array.isArray(b.items)||b.items.length<1||b.items.length>14)return json({error:"INVALID_INPUT"},400);
 const items=b.items.map(cleanItem);if(items.some(x=>x===null))return json({error:"INVALID_INPUT"},400);
 try{
  const auth=await send(base+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token},redirect:"error"});
  if(!auth.ok)return json({error:"AUTH_FAILED"},auth.status===401||auth.status===403?401:502);
  const user=await auth.json() as {id?:string};if(!id(user.id))return json({error:"UNAUTHENTICATED"},401);
  const r=await send(base+"/rest/v1/rpc/save_editorial_plan",{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_actor:user.id,p_workspace:b.workspaceId,p_batch:b.batchId,p_start:b.start,p_per_week:b.perWeek,p_items:items}),redirect:"error"});
  if(!r.ok){const e=await r.json().catch(()=>({})) as {code?:string};return json({error:"PLAN_NOT_SAVED"},e.code==="42501"?403:e.code==="40001"||e.code==="23505"?409:e.code==="22023"||e.code==="22P02"?400:502);}
  const result=await r.json() as {created?:number;postIds?:unknown[]};
  if(result.created!==items.length||!Array.isArray(result.postIds)||result.postIds.length!==items.length||!result.postIds.every(id))return json({error:"INVALID_SERVER_RESPONSE"},502);
  return json({created:result.created,postIds:result.postIds});
 }catch{return json({error:"SERVICE_UNAVAILABLE"},502);}
}
