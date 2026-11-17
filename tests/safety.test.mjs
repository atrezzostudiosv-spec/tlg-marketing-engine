import test from "node:test";
import assert from "node:assert/strict";
import { validateInputs, projectRevisionChange } from "../src/domain/safety.ts";
const now = Date.parse("2026-11-17T18:00:00Z");
const property = {id:"synthetic",status:"ACTIVE",revision:1,priority:1};
const post = {id:"p",propertyId:property.id,propertyRevision:1,plannedAt:"2026-11-18T18:00:00Z",format:"photo",editorialState:"BORRADOR",workflowState:"PENDIENTE"};
const fact = {id:"status",propertyId:property.id,key:"status",value:"ACTIVE",sourceId:"source",verifiedAt:"2026-11-17T17:00:00Z",expiresAt:null,status:"CONFIRMED"};
const price = {...fact,id:"price",key:"price",value:100};
const asset = {id:"a",propertyId:property.id,storageKey:"synthetic/a",mediaType:"image",rights:"APPROVED",staging:"ORIGINAL"};
const base = {property,post,facts:[fact,price],sources:[{id:"source",authorization:"APPROVED"}],requiredFactIds:["price"],assets:[asset],now};
test("necessary input checks pass without approving draft",()=>{
 assert.deepEqual(validateInputs(base),[]); assert.equal(post.editorialState,"BORRADOR");
});
test("denied or missing source blocks even current status",()=>{
 for (const sources of [[],[{id:"source",authorization:"DENIED"}]]) {
  assert.ok(validateInputs({...base,sources}).includes("SOURCE_NOT_APPROVED:status"));
 }
});
test("foreign, expired and missing claims block",()=>{
 for (const facts of [[fact],[fact,{...price,propertyId:"other"}],[fact,{...price,verifiedAt:"2026-11-16T18:00:00Z"}]])
  assert.ok(validateInputs({...base,facts}).includes("FACT_UNAVAILABLE:price"));
});
test("wrong image, unknown rights or staging block",()=>{
 for (const a of [{...asset,propertyId:"other"},{...asset,rights:"UNKNOWN"},{...asset,staging:"UNKNOWN"}])
  assert.ok(validateInputs({...base,assets:[a]}).includes("ASSET_NOT_APPROVED:a"));
});
test("missing media and unfinished reel are blocked",()=>{
 assert.ok(validateInputs({...base,assets:[]}).includes("ASSETS_MISSING"));
 assert.ok(validateInputs({...base,post:{...post,format:"reel"}}).includes("FINAL_VIDEO_REQUIRED"));
 assert.ok(validateInputs({...base,post:{...post,format:"carousel"}}).includes("CAROUSEL_IMAGES_REQUIRED"));
});
test("revision change blocks drafts and alerts scheduled posts, preserving history",()=>{
 const scheduled={...post,id:"scheduled",workflowState:"PROGRAMADO"};
 const published={...post,id:"published",workflowState:"PUBLICADO"};
 const other={...post,id:"other",propertyId:"other"};
 const r=projectRevisionChange({...property,revision:2},[post,scheduled,published,other]);
 assert.equal(r[0].post.editorialState,"BLOQUEADO");
 assert.equal(r[1].externalActionRequired,true);
 assert.equal(r[1].post.workflowState,"PROGRAMADO");
 assert.equal(r[2].post,published); assert.equal(r[3].post,other);
});
test("sold property cancels pending posts but not external schedules",()=>{
 const r=projectRevisionChange({...property,status:"SOLD",revision:2},[post,{...post,workflowState:"PROGRAMADO"}]);
 assert.equal(r[0].post.workflowState,"CANCELADO"); assert.equal(r[1].post.workflowState,"PROGRAMADO");
 assert.equal(r[1].externalActionRequired,true);
});
