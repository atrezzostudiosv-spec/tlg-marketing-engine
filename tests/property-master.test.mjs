import test from "node:test";
import assert from "node:assert/strict";
import {parseFact} from "../src/domain/facts.ts";
import {mutateMaster} from "../src/server/property-master.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const req=b=>new Request("https://example.invalid/api/property-master",{method:"POST",headers:{authorization:"Bearer synthetic"},body:JSON.stringify(b)});
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
test("facts reject missing, negative, fractional bedroom and non-HTTPS links",()=>{
 for(const [key,value] of [["price",0],["bedrooms",1.5],["living_sqft",2.1],["listing_url","http://example.invalid"],["listing_url","https://a:b@example.invalid"],["description"," "],["invented","value"]])assert.equal(parseFact(key,value),null);
 assert.equal(parseFact("bedrooms",0),0);assert.equal(parseFact("bathrooms",4.5),4.5);assert.equal(parseFact("lot_acres",0.27),0.27);
});
test("source registration requires explicit attestation",async()=>{
 const r=await mutateMaster(req({action:"source",workspaceId:id(1),propertyId:id(2),reference:"demo",attested:false}),env,()=>{throw Error("unexpected call")});
 assert.equal(r.status,400);
});
test("create draft uses verified actor, not supplied actor",async()=>{
 let n=0;const r=await mutateMaster(req({action:"create",workspaceId:id(1),address:"Synthetic",locality:"Demo",transaction:"SALE",actor:id(99)}),env,async(url,opt)=>{
 if(++n===1)return response({id:id(3)});
 assert.match(url,/create_property_draft$/);assert.equal(JSON.parse(opt.body).p_actor,id(3));return response(id(4));
 });
 assert.equal(r.status,201);assert.deepEqual(await r.json(),{id:id(4)});
});
test("unauthorized source request is rejected by backend response",async()=>{
 let n=0;const r=await mutateMaster(req({action:"source",workspaceId:id(1),propertyId:id(2),reference:"demo",attested:true}),env,async()=>++n===1?response({id:id(3)}):response({code:"42501"},400));assert.equal(r.status,403);
});
