import test from "node:test";
import assert from "node:assert/strict";
import {generateContent} from "../src/server/content.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const body={workspaceId:id(1),postId:id(2),requestId:id(3),actor:id(99),draft:{body:"invented pool",editorial_state:"LISTO"}};
const req=b=>new Request("https://example.invalid/api/content",{method:"POST",headers:{authorization:"Bearer synthetic"},body:JSON.stringify(b)});
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
function snapshot(){return {property:{id:id(5),address:"Synthetic Residence",locality:"Demo, TX",status:"ACTIVE",revision:1,transaction_type:"SALE"},post:{id:id(2),property_id:id(5),property_revision:1,planned_at:new Date(Date.now()+86400000).toISOString(),format:"photo",workflow_state:"PENDIENTE",editorial_state:"BORRADOR",angle:"Presentación del listing"},facts:[{id:id(6),propertyId:id(5),key:"status",value:"ACTIVE",sourceId:id(7),verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:null,status:"CONFIRMED"}],sources:[{id:id(7),property_id:id(5),authorization_status:"APPROVED"}],factIds:[id(6)],assets:[],assetIds:[],events:[],history:[]};}
test("server ignores client text and approval and persists its own draft",async()=>{
 let calls=0;const s=snapshot();const r=await generateContent(req(body),env,async(url,opt)=>{
 if(++calls===1)return response({id:id(4)});
 const args=JSON.parse(opt.body);assert.equal(args.p_actor,id(4));assert.equal(args.p_post,id(2));
 if(calls===2){assert.match(url,/content_context$/);return response(s);}
 assert.match(url,/save_content_draft$/);assert.deepEqual(args.p_snapshot,s);assert.equal(args.p_id,id(3));assert.equal(args.p_draft.blocked,false);
 assert.ok(args.p_draft.variants.every(x=>!x.body.includes("invented pool")));return response(args.p_draft);
 });assert.equal(r.status,200);assert.equal(calls,3);assert.equal((await r.json()).saved,true);
});
test("blocked evidence never reaches storage",async()=>{
 let calls=0;const s=snapshot();s.property.status="SOLD";
 const r=await generateContent(req(body),env,async()=>++calls===1?response({id:id(4)}):response(s));
 assert.equal(calls,2);assert.equal((await r.json()).saved,false);
});
test("forbidden and concurrent changes fail safely",async()=>{
 for(const [code,status] of [["42501",403],["40001",409]]){let calls=0;const r=await generateContent(req(body),env,async()=>++calls===1?response({id:id(4)}):response({code,message:"private"},400));assert.equal(r.status,status);assert.doesNotMatch(await r.text(),/private/);}
});

test("AI integration reserves before provider call and saves only controlled output",async()=>{
 const calls=[];const s=snapshot();
 const r=await generateContent(req(body),{...env,OPENAI_EDITORIAL_ENABLED:"true",OPENAI_API_KEY:"fake",OPENAI_MODEL:"configured"},async(url,opt)=>{
 calls.push(url);
 if(url.endsWith("/auth/v1/user"))return response({id:id(4)});
 if(url.endsWith("/content_context"))return response(s);
 if(url.endsWith("/reserve_editorial_request")){assert.equal(JSON.parse(opt.body).p_id,id(3));return response({allowed:true});}
 if(url==="https://api.openai.com/v1/responses")return response({status:"completed",output:[{type:"message",content:[{type:"output_text",text:'{"index":1}'}]}]});
 assert.match(url,/save_content_draft$/);
 const draft=JSON.parse(opt.body).p_draft;assert.equal(draft.editorialMode,"assisted");assert.equal(draft.blocked,false);return response(draft);
 });
 assert.equal(r.status,200);assert.equal(calls.length,5);assert.equal((await r.json()).draft.editorialMode,"assisted");
});
test("exhausted or already reserved request avoids provider call",async()=>{
 const s=snapshot();let n=0;
 const r=await generateContent(req(body),{...env,OPENAI_EDITORIAL_ENABLED:"true",OPENAI_API_KEY:"fake",OPENAI_MODEL:"configured"},async(url,opt)=>{
 n++;if(n===1)return response({id:id(4)});if(n===2)return response(s);if(n===3)return response({allowed:false});
 assert.match(url,/save_content_draft$/);return response(JSON.parse(opt.body).p_draft);
 });
 assert.equal(n,4);assert.equal((await r.json()).draft.editorialMode,"fallback");
});
