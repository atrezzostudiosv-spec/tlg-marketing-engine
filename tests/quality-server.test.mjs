import test from "node:test";
import assert from "node:assert/strict";
import {composeDraft} from "../src/domain/content.ts";
import {qualityGate} from "../src/server/quality.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",png))).map(x=>x.toString(16).padStart(2,"0")).join("");
const body={workspaceId:id(1),postId:id(2),signature:"Synthetic Broker",policyReference:"Synthetic approval",action:"review"};
const request=b=>new Request("https://example.invalid/api/quality",{method:"POST",headers:{authorization:"Bearer synthetic"},body:JSON.stringify(b)});
const response=(x,status=200)=>new Response(JSON.stringify(x),{status});
function context(){
 const now=Date.now(),property={id:id(3),address:"Synthetic address",locality:"Demo",status:"ACTIVE",revision:1,transaction_type:"SALE"};
 const input={property,post:{id:id(2),property_id:id(3),property_revision:1,planned_at:new Date(now+86400000).toISOString(),format:"photo",workflow_state:"PENDIENTE",editorial_state:"BORRADOR",angle:"Presentación del listing"},facts:[{id:id(4),propertyId:id(3),key:"status",value:"ACTIVE",sourceId:id(5),verifiedAt:new Date(now-1000).toISOString(),expiresAt:null,status:"CONFIRMED"}],sources:[{id:id(5),property_id:id(3),authorization_status:"APPROVED"}],factIds:[id(4)],assets:[{id:id(6),property_id:id(3),media_type:"image",rights_status:"APPROVED",staging_status:"ORIGINAL",approved_at:new Date(now-1000).toISOString()}],assetIds:[id(6)],events:[],history:[]};
 const draft=composeDraft({...input,now});
 return {input,draftId:id(7),draft,original:input,variants:draft.variants,media:[{id:id(6),hash,size:png.length,mime:"image/png",exists:true}],canApprove:true};
}
function backend(ctx,calls,corrupt=false){return async(url,opt)=>{
 calls.push(url);
 if(url.endsWith("/auth/v1/user"))return response({id:id(8)});
 if(url.endsWith("/quality_context"))return response(ctx);
 if(url.endsWith("/media_preview_context"))return response({key:id(1)+"/"+id(3)+"/"+id(6)+".png",mime:"image/png",size:png.length,hash});
 if(url.includes("/storage/v1/object/authenticated/"))return new Response(corrupt?Uint8Array.from(png,x=>x^1):png);
 if(url.endsWith("/approve_package")){const args=JSON.parse(opt.body);assert.equal(args.p_actor,id(8));assert.equal(args.p_review.attested,true);assert.match(args.p_package.facebook,/Synthetic Broker/);assert.doesNotMatch(args.p_package.facebook,/invented pool/);return response(id(9));}
 throw Error("Unexpected call");
};}
test("review verifies actual bytes; approval recomputes same package before RPC",async()=>{
 const ctx=context(),calls=[],send=backend(ctx,calls);
 const r=await qualityGate(request(body),env,send);assert.equal(r.status,200);const v=await r.json();assert.ok(v.fingerprint);assert.equal(v.canApprove,true);assert.ok(!calls.some(x=>x.endsWith("/approve_package")));
 const approved=await qualityGate(request({...body,action:"approve",attested:true,fingerprint:v.fingerprint,actor:id(99),package:{facebook:"invented pool"}}),env,send);
 assert.equal(approved.status,200);assert.equal((await approved.json()).approvalId,id(9));assert.ok(calls.at(-1).endsWith("/approve_package"));
});
test("corrupt storage and missing owner never authorize",async()=>{
 const ctx=context(),calls=[];
 const r=await qualityGate(request(body),env,backend(ctx,calls,true));assert.deepEqual((await r.json()).report.issues,["MEDIA_INTEGRITY_FAILED"]);
 const denied=await qualityGate(request({...body,action:"approve",attested:true,fingerprint:"bad"}),env,backend({...ctx,canApprove:false},calls));assert.equal(denied.status,403);assert.ok(!calls.some(x=>x.endsWith("/approve_package")));
});
test("changed review invalidates fingerprint",async()=>{
 const ctx=context(),calls=[],send=backend(ctx,calls);const result=await (await qualityGate(request(body),env,send)).json();
 const r=await qualityGate(request({...body,signature:"Different signature",action:"approve",attested:true,fingerprint:result.fingerprint}),env,send);assert.equal(r.status,409);assert.ok(!calls.some(x=>x.endsWith("/approve_package")));
});
