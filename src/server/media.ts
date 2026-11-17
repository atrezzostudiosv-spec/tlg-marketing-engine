const MAX=6*1024*1024;
const formats:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","video/mp4":"mp4"};
const roles=["exterior","living","kitchen","bedroom","bathroom","outdoor","other"];
type Env={SUPABASE_URL:string;SUPABASE_PUBLISHABLE_KEY:string;SUPABASE_SERVICE_ROLE_KEY:string};
const id=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
export function validMedia(b:Uint8Array,mime:string){
 const ascii=(start:number,end:number)=>String.fromCharCode(...b.slice(start,end));
 return b.length>=12&&(mime==="image/jpeg"?b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217:mime==="image/png"?[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x):mime==="image/webp"?ascii(0,4)==="RIFF"&&ascii(8,12)==="WEBP":mime==="video/mp4"?ascii(4,8)==="ftyp":false);
}
async function bounded(body:ReadableStream<Uint8Array>|null,limit:number){
 if(!body)throw Error("empty");
 const reader=body.getReader();const chunks:Uint8Array[]=[];let count=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>limit){await reader.cancel();throw Error("too large");}chunks.push(value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(count);let pos=0;for(const c of chunks){result.set(c,pos);pos+=c.length;}return result;
}
async function digest(bytes:Uint8Array<ArrayBuffer>){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");}
export async function handleMedia(req:Request,env:Env,send:typeof fetch=fetch):Promise<Response>{
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 const token=req.headers.get("authorization")??"";if(!/^Bearer [^\s]+$/i.test(token))return json({error:"UNAUTHENTICATED"},401);
 let base:string;try{const u=new URL(env.SUPABASE_URL);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error();base=u.origin;}catch{return json({error:"SERVER_NOT_CONFIGURED"},503);}
 const q=new URL(req.url).searchParams,action=q.get("action"),workspace=q.get("workspace");
 if(!id(workspace)||!["upload","preview","select"].includes(action??""))return json({error:"INVALID_INPUT"},400);
 try{
  const auth=await send(base+"/auth/v1/user",{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:token},redirect:"error"});
  if(!auth.ok)return json({error:"AUTH_FAILED"},auth.status===401||auth.status===403?401:502);
  const user=await auth.json() as {id?:string};if(!id(user.id))return json({error:"UNAUTHENTICATED"},401);
  const headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY};
  const args={p_actor:user.id,p_workspace:workspace};
  const rpc=(name:string,b:Record<string,unknown>)=>send(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({...args,...b}),redirect:"error"});
  const fail=async(r:Response)=>{const e=await r.json().catch(()=>({})) as {code?:string};return json({error:"MEDIA_OPERATION_FAILED"},e.code==="42501"?403:e.code==="P0002"?404:e.code==="40001"?409:e.code==="22023"?400:502);};
  if(action==="upload"){
   const property=q.get("property"),mime=req.headers.get("content-type")??"",name=q.get("name"),staging=q.get("staging"),role=q.get("role");
   if(!id(property)||!Object.hasOwn(formats,mime)||!name||name.length>200||/[\x00-\x1f\/\\]/.test(name)||!["ORIGINAL","VIRTUAL"].includes(staging??"")||!roles.includes(role??"")||q.get("attested")!=="true")return json({error:"INVALID_INPUT"},400);
   const permission=await rpc("media_permission",{p_property:property});if(!permission.ok)return fail(permission);
   let bytes;try{bytes=await bounded(req.body,MAX);}catch{return json({error:"FILE_TOO_LARGE_OR_INVALID"},413);}
   if(!validMedia(bytes,mime))return json({error:"INVALID_FILE_SIGNATURE"},400);
   const asset=crypto.randomUUID(),key=workspace+"/"+property+"/"+asset+"."+formats[mime],hash=await digest(bytes);
   const uploaded=await send(base+"/storage/v1/object/tlg-private-media/"+key,{method:"POST",headers:{...headers,"Content-Type":mime,"x-upsert":"false","cache-control":"no-store"},body:bytes,redirect:"error"});
   if(!uploaded.ok)return json({error:"STORAGE_UPLOAD_FAILED"},502);
   const registered=await rpc("register_media",{p_property:property,p_id:asset,p_filename:name,p_mime:mime,p_size:bytes.length,p_hash:hash,p_staging:staging,p_role:role});
   // On uncertain registration do not delete a potentially committed object. Reconcile orphan objects before pilot.
   if(!registered.ok)return fail(registered);
   if(await registered.json()!==asset)return json({error:"REGISTRATION_UNCONFIRMED"},502);
   return json({id:asset},201);
  }
  if(action==="preview"){
   const asset=q.get("asset");if(!id(asset))return json({error:"INVALID_INPUT"},400);
   const r=await rpc("media_preview_context",{p_asset:asset});if(!r.ok)return fail(r);
   const a=await r.json() as {key:string;mime:string;size:number;hash:string};
   if(!Object.hasOwn(formats,a.mime)||!a.key?.startsWith(workspace+"/")||!a.key.endsWith("/"+asset+"."+formats[a.mime])||!/^[-a-f0-9/]+\.[a-z0-9]+$/.test(a.key)||!Number.isInteger(a.size)||a.size<1||a.size>MAX)return json({error:"INVALID_ASSET"},502);
   const object=await send(base+"/storage/v1/object/authenticated/tlg-private-media/"+a.key,{headers,redirect:"error"});
   if(!object.ok)return json({error:"OBJECT_UNAVAILABLE"},404);
   const bytes=await bounded(object.body,MAX);
   if(bytes.length!==a.size||await digest(bytes)!==a.hash||!validMedia(bytes,a.mime))return json({error:"OBJECT_INTEGRITY_FAILED"},409);
   return new Response(bytes,{headers:{"Content-Type":a.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}});
  }
  let b:Record<string,unknown>;try{b=JSON.parse(new TextDecoder().decode(await bounded(req.body,4096)));}catch{return json({error:"INVALID_INPUT"},400);}
  if(!b||!id(b.postId)||!Number.isInteger(b.revision)||Number(b.revision)<1||!Array.isArray(b.expected)||b.expected.length>5||!b.expected.every(id)||!Array.isArray(b.assets)||b.assets.length<1||b.assets.length>5||!b.assets.every(id)||new Set(b.assets).size!==b.assets.length)return json({error:"INVALID_INPUT"},400);
  const r=await rpc("select_post_media",{p_post:b.postId,p_revision:b.revision,p_expected:b.expected,p_assets:b.assets});if(!r.ok)return fail(r);return json(await r.json());
 }catch{return json({error:"SERVICE_UNAVAILABLE"},502);}
}
