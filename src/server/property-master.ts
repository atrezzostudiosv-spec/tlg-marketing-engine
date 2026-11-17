// Trusted backend: actor comes from Supabase Auth, never from request body.
type Env={SUPABASE_URL:string;SUPABASE_PUBLISHABLE_KEY:string;SUPABASE_SERVICE_ROLE_KEY:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=(v:unknown):v is string=>typeof v==="string"&&uuid.test(v);
const str=(v:unknown,min:number,max:number):v is string=>typeof v==="string"&&v.trim().length>=min&&v.trim().length<=max;
const res=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export async function mutateMaster(request:Request,env:Env,send:typeof fetch=fetch):Promise<Response>{
 if(request.method!=="POST")return res({error:"METHOD_NOT_ALLOWED"},405);
 const token=request.headers.get("authorization")??"";if(!/^Bearer [^\s]+$/i.test(token))return res({error:"UNAUTHENTICATED"},401);
 let base:string;
 try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();base=u.origin;}catch{return res({error:"SERVER_NOT_CONFIGURED"},503);}
 let b:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>8192)return res({error:"PAYLOAD_TOO_LARGE"},413);const v=JSON.parse(raw);if(!v||typeof v!=="object"||Array.isArray(v))throw Error();b=v;}catch{return res({error:"INVALID_INPUT"},400);}
 if(!id(b.workspaceId))return res({error:"INVALID_INPUT"},400);
 let rpc:string,args:Record<string,unknown>;
 if(b.action==="create"&&str(b.address,1,200)&&str(b.locality,1,200)&&(b.transaction==="SALE"||b.transaction==="LEASE")){
  rpc="create_property_draft";args={p_address:b.address.trim(),p_locality:b.locality.trim(),p_transaction:b.transaction};
 }else if(b.action==="source"&&id(b.propertyId)&&str(b.reference,3,500)&&b.attested===true){
  rpc="register_property_source";args={p_property:b.propertyId,p_reference:b.reference.trim()};
 }else return res({error:"INVALID_INPUT"},400);
 try{
  const auth=await send(base+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token},redirect:"error"});
  if(!auth.ok)return res({error:"AUTH_FAILED"},auth.status===401||auth.status===403?401:502);
  const user=await auth.json() as {id?:string};if(!id(user.id))return res({error:"UNAUTHENTICATED"},401);
  const r=await send(base+"/rest/v1/rpc/"+rpc,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({...args,p_actor:user.id,p_workspace:b.workspaceId}),redirect:"error"});
  if(!r.ok){const e=await r.json().catch(()=>({})) as {code?:string};return res({error:"MUTATION_FAILED"},e.code==="42501"?403:e.code==="P0002"?404:e.code==="22023"?400:502);}
  const value=await r.json();return id(value)?res({id:value},201):res({error:"INVALID_SERVER_RESPONSE"},502);
 }catch{return res({error:"SERVICE_UNAVAILABLE"},502);}
}
