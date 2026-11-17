import test from "node:test";
import assert from "node:assert/strict";
import {handleMedia,validMedia} from "../src/server/media.ts";
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const env={SUPABASE_URL:"https://example.invalid",SUPABASE_PUBLISHABLE_KEY:"fake-public",SUPABASE_SERVICE_ROLE_KEY:"fake-server"};
const png=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const resp=(v,status=200)=>new Response(JSON.stringify(v),{status});
const req=(q,body,mime="application/json")=>new Request("https://example.invalid/api/media?"+new URLSearchParams({workspace:id(1),...q}),{method:"POST",headers:{authorization:"Bearer synthetic","Content-Type":mime},body});
test("basic signatures reject unsupported and mismatched types",()=>{assert.equal(validMedia(png,"image/png"),true);assert.equal(validMedia(png,"image/jpeg"),false);assert.equal(validMedia(png,"image/svg+xml"),false);});
test("upload requires property permission before storing; registers immutable key",async()=>{
 let n=0,key,asset;
 const r=await handleMedia(req({action:"upload",property:id(2),name:"demo.png",staging:"VIRTUAL",role:"living",attested:"true"},png,"image/png"),env,async(url,opt)=>{
 if(++n===1)return resp({id:id(3)});
 if(n===2){assert.match(url,/media_permission$/);assert.equal(JSON.parse(opt.body).p_actor,id(3));return resp(true);}
 if(n===3){key=url.split("/tlg-private-media/")[1];assert.ok(key.startsWith(id(1)+"/"+id(2)+"/"));asset=key.split("/").at(-1).split(".")[0];assert.equal(opt.headers["x-upsert"],"false");return resp({});}
 assert.match(url,/register_media$/);const b=JSON.parse(opt.body);assert.equal(b.p_id,asset);assert.equal(b.p_staging,"VIRTUAL");assert.match(b.p_hash,/^[a-f0-9]{64}$/);return resp(asset);
 });assert.equal(r.status,201);assert.equal(n,4);
});
test("no upload when unauthorized or signature invalid",async()=>{
 for(const deny of [true,false]){let n=0;const r=await handleMedia(req({action:"upload",property:id(2),name:"demo.jpg",staging:"ORIGINAL",role:"other",attested:"true"},png,"image/jpeg"),env,async()=>++n===1?resp({id:id(3)}):deny?resp({code:"42501"},400):resp(true));assert.equal(n,2);assert.equal(r.status,deny?403:400);}
});
test("preview rejects changed object bytes",async()=>{
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",png))).map(x=>x.toString(16).padStart(2,"0")).join("");
 for(const corrupt of [true,false]){let n=0;const r=await handleMedia(req({action:"preview",asset:id(4)}),env,async()=>++n===1?resp({id:id(3)}):n===2?resp({key:id(1)+"/"+id(2)+"/"+id(4)+".png",mime:"image/png",size:png.length,hash}):new Response(corrupt?Uint8Array.from(png,x=>x^1):png));
 assert.equal(r.status,corrupt?409:200);if(!corrupt)assert.equal(r.headers.get("cache-control"),"private, no-store");}
});
test("selection rejects duplicates before RPC and ignores supplied actor",async()=>{
 let n=0;const q={action:"select"};const b={postId:id(2),revision:1,expected:[],assets:[id(4)],actor:id(99)};
 const send=async(url,opt)=>{if(++n===1)return resp({id:id(3)});assert.match(url,/select_post_media$/);assert.equal(JSON.parse(opt.body).p_actor,id(3));return resp({changed:true});};
 assert.equal((await handleMedia(req(q,JSON.stringify(b)),env,send)).status,200);
 n=0;assert.equal((await handleMedia(req(q,JSON.stringify({...b,assets:[id(4),id(4)]})),env,send)).status,400);assert.equal(n,1);
});
