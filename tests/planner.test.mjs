import test from "node:test";
import assert from "node:assert/strict";
import {buildPlan,texasNoon} from "../src/domain/planner.ts";
const now=Date.parse("2026-11-17T09:00:00Z");
const properties=Array.from({length:7},(_,i)=>({id:"p"+i,status:"ACTIVE",revision:1,priority:100-i*10,transaction_type:"SALE"}));
const sources=properties.map(p=>({id:"s"+p.id,property_id:p.id,authorization_status:"APPROVED"}));
const facts=properties.flatMap(p=>[{id:"f"+p.id,propertyId:p.id,key:"status",value:"ACTIVE",sourceId:"s"+p.id,verifiedAt:"2026-11-17T08:00:00Z",expiresAt:null,status:"CONFIRMED"},{id:"b"+p.id,propertyId:p.id,key:"bedrooms",value:4,sourceId:"s"+p.id,verifiedAt:"2026-11-17T08:00:00Z",expiresAt:null,status:"CONFIRMED"}]);
const base={properties,sources,facts,assets:[],events:[],history:[],now,start:"2026-11-17",perWeek:5};
test("14 days cover seven properties with ten unique feed slots",()=>{
 const r=buildPlan(base);assert.equal(r.items.length,10);assert.equal(new Set(r.items.map(p=>p.propertyId)).size,7);assert.equal(new Set(r.items.map(p=>p.day)).size,10);assert.equal(r.end,"2026-11-30");assert.ok(r.items.every(p=>p.needsMedia));
});
test("ineligible, stale or foreign source excluded",()=>{
 const r=buildPlan({...base,properties:properties.map(p=>p.id==="p0"?{...p,status:"EXCLUDED"}:p),facts:facts.map(f=>f.propertyId==="p1"?{...f,verifiedAt:"2026-11-15T08:00:00Z"}:f),sources:sources.map(s=>s.id==="sp2"?{...s,property_id:"p3"}:s)});
 assert.deepEqual(r.excluded.map(e=>e.propertyId),["p0","p1","p2"]);assert.ok(r.items.every(p=>!["p0","p1","p2"].includes(p.propertyId)));
});
test("existing feed slots preserved, story does not consume feed capacity",()=>{
 const history=[{id:"existing",property_id:"p0",planned_at:texasNoon(base.start),format:"photo",workflow_state:"PROGRAMADO"},{id:"story",property_id:"p1",planned_at:texasNoon("2026-11-18"),format:"story",workflow_state:"PENDIENTE"}];
 const r=buildPlan({...base,history});assert.equal(r.items.length,9);assert.equal(r.existing.length,2);assert.ok(!r.items.some(x=>x.day===base.start));
});
test("confirmed event receives one slot before event, unconfirmed never promoted",()=>{
 const events=[{id:"e1",property_id:"p5",type:"OPEN_HOUSE",start_at:"2026-11-21T20:00:00Z",end_at:"2026-11-21T22:00:00Z",confirmation_status:"CONFIRMED"},{id:"e2",property_id:"p6",type:"OPEN_HOUSE",start_at:"2026-11-22T20:00:00Z",end_at:"2026-11-22T22:00:00Z",confirmation_status:"UNCONFIRMED"}];
 const r=buildPlan({...base,events});assert.equal(r.items.filter(x=>x.eventId==="e1").length,1);assert.ok(r.items.find(x=>x.eventId==="e1").day<"2026-11-21");assert.ok(!r.items.some(x=>x.eventId==="e2"));
});
test("facts and media are property specific; no final reel invented",()=>{
 const assets=[{id:"a",property_id:"p0",media_type:"image",rights_status:"APPROVED",staging_status:"ORIGINAL",approved_at:"2026-11-17T08:00:00Z"},{id:"b",property_id:"p0",media_type:"image",rights_status:"UNKNOWN",staging_status:"ORIGINAL",approved_at:"2026-11-17T08:00:00Z"}];
 const r=buildPlan({...base,assets});assert.ok(r.items.filter(p=>p.propertyId==="p0").every(p=>p.assetIds.join()==="a"&&p.format==="photo"));assert.ok(r.items.filter(p=>p.propertyId!=="p0").every(p=>p.assetIds.length===0));
 assert.ok(r.items.every(p=>p.factIds.every(id=>facts.find(f=>f.id===id).propertyId===p.propertyId)));
});
test("regeneration deterministic; applying proposals as existing does not duplicate",()=>{
 const r=buildPlan(base);assert.deepEqual(buildPlan(base),r);
 const history=r.items.map(i=>({id:i.id,property_id:i.propertyId,planned_at:i.plannedAt,format:i.format,workflow_state:"PENDIENTE",angle:i.angle,eventId:i.eventId}));
 assert.equal(buildPlan({...base,history}).items.length,0);
});
test("empty eligible inventory does not fabricate content",()=>{const r=buildPlan({...base,properties:[]});assert.equal(r.items.length,0);assert.equal(r.unfilled,10);});
test("Texas noon follows DST",()=>{assert.equal(texasNoon("2026-03-15"),"2026-03-15T17:00:00.000Z");assert.equal(texasNoon("2026-11-17"),"2026-11-17T18:00:00.000Z");});
