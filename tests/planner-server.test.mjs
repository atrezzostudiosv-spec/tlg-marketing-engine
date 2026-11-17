import test from "node:test";
import assert from "node:assert/strict";
import {savePlan} from "../src/server/planner.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const item={propertyId:id(4),day:"2026-11-18",revision:1,format:"photo",angle:"Presentación del listing",factIds:[id(5)],assetIds:[],goal:"untrusted",plannedAt:"bad",editorial_state:"LISTO"};
const body={workspaceId:id(1),batchId:id(2),start:"2026-11-17",perWeek:5,items:[item],actor:id(99)};
const req=b=>new Request("https://example.invalid/api/planner",{method:"POST",headers:{authorization:"Bearer synthetic"},body:JSON.stringify(b)});
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
test("planner strips untrusted actor, goal, time and approval",async()=>{
 let calls=0;const r=await savePlan(req(body),env,async(url,opt)=>{
 if(++calls===1)return response({id:id(3)});
 const b=JSON.parse(opt.body);assert.equal(b.p_actor,id(3));assert.equal(b.p_batch,id(2));assert.equal(b.p_items[0].goal,undefined);assert.equal(b.p_items[0].plannedAt,undefined);assert.equal(b.p_items[0].editorial_state,undefined);
 return response({created:1,postIds:[id(6)]});
 });assert.equal(r.status,200);assert.equal(calls,2);
});
test("invalid proposals never contact backend",async()=>{
 for(const b of [{...body,items:[]},{...body,start:"2026-02-30"},{...body,items:[{...item,factIds:[]}]},{...body,items:[{...item,format:"reel"}]}]){
 const r=await savePlan(req(b),env,()=>{throw Error("unexpected call")});assert.equal(r.status,400);
 }
});
test("conflict and permissions returned safely",async()=>{
 for(const [code,status] of [["40001",409],["42501",403]]){
 let n=0;const r=await savePlan(req(body),env,async()=>++n===1?response({id:id(3)}):response({code,message:"private"},400));
 assert.equal(r.status,status);assert.ok(!(await r.text()).includes("private"));
 }
});
