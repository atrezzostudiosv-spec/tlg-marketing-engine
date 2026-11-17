import test from "node:test";
import assert from "node:assert/strict";
import {selectEditorial,candidates,editorialRequest,parseChoice} from "../src/server/editorial-ai.ts";
const now=Date.parse("2026-11-17T09:00:00Z");
const p={id:"secret-property",address:"Private Address",locality:"Private City",status:"ACTIVE",revision:1,transaction_type:"SALE"};
const f=(key,value)=>({id:key,propertyId:p.id,key,value,sourceId:"secret-source",verifiedAt:"2026-11-17T08:00:00Z",expiresAt:null,status:"CONFIRMED"});
const input={property:p,post:{id:"private-post",property_id:p.id,property_revision:1,planned_at:"2026-11-18T18:00:00Z",format:"photo",workflow_state:"PENDIENTE",editorial_state:"BORRADOR",angle:"Distribución y superficie"},facts:[f("status","ACTIVE"),f("bedrooms",7),f("living_sqft",9876)],factIds:["status","bedrooms","living_sqft"],sources:[{id:"secret-source",property_id:p.id,authorization_status:"APPROVED"}],assets:[],assetIds:[],events:[],now,history:[]};
const env={OPENAI_API_KEY:"fake-key",OPENAI_MODEL:"configured-model",OPENAI_EDITORIAL_ENABLED:"true"};
const response=index=>new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({index})}]}]}));
test("AI only selects existing compositions, never writes facts",async()=>{
 const options=candidates(input);assert.ok(options.length>=2);
 const draft=await selectEditorial(input,env,async(url,opt)=>{
 assert.equal(url,"https://api.openai.com/v1/responses");
 const b=JSON.parse(opt.body);assert.equal(b.store,false);assert.equal(b.max_output_tokens,256);
 for(const privateValue of ["Private Address","Private City","secret-source","secret-property","9876","private-post"])assert.ok(!opt.body.includes(privateValue));
 return response(1);
 });
 assert.equal(draft.editorialMode,"assisted");assert.deepEqual(draft.variants,options[1].variants);assert.deepEqual(draft.claims,options[0].claims);
});
test("bad response or outage falls back without accepting arbitrary claims",async()=>{
 for(const send of [async()=>response(999),async()=>new Response("bad",{status:429}),async()=>{throw Error("timeout")}]){const r=await selectEditorial(input,env,send);assert.equal(r.editorialMode,"fallback");assert.equal(r.blocked,false);}
 assert.equal(parseChoice({status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"index":0,"copy":"pool"}'}]}]},8),null);
});
test("no provider call without opt-in or with blocked evidence",async()=>{
 const noCall=()=>{throw Error("unexpected call")};
 assert.equal((await selectEditorial(input,{},noCall)).editorialMode,"controlled");
 assert.equal((await selectEditorial({...input,property:{...p,status:"SOLD"}},env,noCall)).blocked,true);
});
