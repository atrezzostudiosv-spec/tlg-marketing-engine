import { parseFact } from "../domain/facts.ts";
// Trusted server only. No service credential may be sent to a browser.
type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SUPABASE_PUBLISHABLE_KEY: string };
type Fetcher = typeof fetch;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown,status=200) => new Response(JSON.stringify(value),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
export async function confirmPropertyFact(request: Request, env: Env, send: Fetcher = fetch): Promise<Response> {
 if(request.method!=="POST") return json({error:"METHOD_NOT_ALLOWED"},405);
 const auth=request.headers.get("authorization") ?? "";
 if(!/^Bearer [^\s]+$/i.test(auth)) return json({error:"UNAUTHENTICATED"},401);
 if(!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)
   return json({error:"SERVER_NOT_CONFIGURED"},503);
 let base: string;
 try {
  const url=new URL(env.SUPABASE_URL);
  if(url.protocol!=="https:" || url.username || url.password || url.search || url.hash || url.pathname!=="/")
   return json({error:"SERVER_NOT_CONFIGURED"},503);
  base=url.origin;
 } catch { return json({error:"SERVER_NOT_CONFIGURED"},503); }
 let body: Record<string, unknown>;
 try {
  const raw=await request.text();
  if(raw.length>8192) return json({error:"PAYLOAD_TOO_LARGE"},413);
  const parsed=JSON.parse(raw);
  if(!parsed || typeof parsed!=="object" || Array.isArray(parsed)) return json({error:"INVALID_INPUT"},400);
  body=parsed;
 } catch {return json({error:"INVALID_INPUT"},400);}
 const {workspaceId,propertyId,sourceId,expectedRevision,key,value}=body;
 if(![workspaceId,propertyId,sourceId].every(x=>typeof x==="string" && uuid.test(x)) ||
  typeof expectedRevision!=="number" || !Number.isInteger(expectedRevision) || expectedRevision<1 || expectedRevision>2147483647 ||
  (typeof key!=="string" || parseFact(key,value)===null))
  return json({error:"INVALID_INPUT"},400);
 try {
  const identity=await send(base+"/auth/v1/user",{
   headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,authorization:auth},redirect:"error"
  });
  if(!identity.ok) return json({error:identity.status===401||identity.status===403?"UNAUTHENTICATED":"AUTH_UNAVAILABLE"},identity.status===401||identity.status===403?401:502);
  const user=await identity.json() as {id?:string};
  if(typeof user.id!=="string" || !uuid.test(user.id)) return json({error:"UNAUTHENTICATED"},401);
  const result=await send(base+"/rest/v1/rpc/confirm_property_fact",{
   method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,
    authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY,"Content-Type":"application/json"},
   body:JSON.stringify({p_actor:user.id,p_workspace:workspaceId,p_property:propertyId,
    p_source:sourceId,p_expected_revision:expectedRevision,p_key:key,p_value:parseFact(key as string,value)}),
   redirect:"error"
  });
  if(!result.ok) {
   const err=await result.json().catch(()=>({})) as {code?:string};
   const map: Record<string,[string,number]>={"42501":["FORBIDDEN",403],"P0002":["NOT_FOUND",404],
    "40001":["REVISION_CONFLICT",409],"22023":["INVALID_FACT",400]};
   const [label,status]=map[err.code??""]??["MUTATION_FAILED",502];
   return json({error:label},status);
  }
  const outcome=await result.json() as {revision?:unknown;changed?:unknown;pending_invalidated?:unknown;external_review?:unknown};
  if(!Number.isInteger(outcome.revision)||typeof outcome.changed!=="boolean"||
     !Number.isInteger(outcome.pending_invalidated)||!Number.isInteger(outcome.external_review))
   return json({error:"INVALID_SERVER_RESPONSE"},502);
  return json({revision:outcome.revision,changed:outcome.changed,
   pendingInvalidated:outcome.pending_invalidated,externalReview:outcome.external_review});
 } catch { return json({error:"SERVICE_UNAVAILABLE"},502); }
}
