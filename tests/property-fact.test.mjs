import test from "node:test";
import assert from "node:assert/strict";
import { confirmPropertyFact } from "../src/server/property-fact.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const body={workspaceId:id(1),propertyId:id(2),sourceId:id(3),expectedRevision:1,key:"price",value:1000,actor:id(99)};
const req=(b=body,token="Bearer synthetic")=>new Request("https://example.invalid/api/property-fact",{method:"POST",headers:{authorization:token},body:JSON.stringify(b)});
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
test("unauthenticated request never touches backend",async()=>{
 const r=await confirmPropertyFact(req(body,""),env,()=>{throw Error("unexpected call")});
 assert.equal(r.status,401);
});
test("invalid or unsupported data fails before mutation",async()=>{
 for(const b of [{...body,value:-1},{...body,key:"unknown"},{...body,workspaceId:"bad"},{...body,expectedRevision:0}]){
  const r=await confirmPropertyFact(req(b),env,()=>{throw Error("unexpected call")});assert.equal(r.status,400);
 }
});
test("verified identity is used instead of supplied actor",async()=>{
 let calls=0;
 const r=await confirmPropertyFact(req(),env,async(url,options)=>{
  calls++;
  if(calls===1){assert.match(url,/auth\/v1\/user$/);assert.equal(options.headers.apikey,"fake-public");return response({id:id(4)});}
  assert.equal(JSON.parse(options.body).p_actor,id(4));
  assert.equal(options.headers.apikey,"fake-server");
  return response({revision:2,changed:true,pending_invalidated:1,external_review:1});
 });
 assert.equal(calls,2);assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{revision:2,changed:true,pendingInvalidated:1,externalReview:1});
});
test("invalid session cannot call mutation",async()=>{
 let calls=0;const r=await confirmPropertyFact(req(),env,async()=>{calls++;return response({},401);});
 assert.equal(calls,1);assert.equal(r.status,401);
});
test("conflict and forbidden errors mapped without exposing details",async()=>{
 for(const [code,status] of [["40001",409],["42501",403]]){
  let calls=0;const r=await confirmPropertyFact(req(),env,async()=>++calls===1?response({id:id(4)}):response({code,message:"private"},400));
  assert.equal(r.status,status);assert.equal((await r.text()).includes("private"),false);
 }
});
test("bad configuration never sends credentials",async()=>{
 const r=await confirmPropertyFact(req(),{...env,SUPABASE_URL:"http://example.invalid"},()=>{throw Error("unexpected call")});
 assert.equal(r.status,503);
});
