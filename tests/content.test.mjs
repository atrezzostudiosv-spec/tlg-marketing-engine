import test from "node:test";
import assert from "node:assert/strict";
import {composeDraft} from "../src/domain/content.ts";
const now=Date.parse("2026-11-17T09:00:00Z");
const property={id:"p",address:"Synthetic Residence",locality:"Demo, TX",status:"ACTIVE",revision:1,transaction_type:"SALE"};
const post={id:"post",property_id:"p",property_revision:1,planned_at:"2026-11-18T18:00:00Z",format:"photo",workflow_state:"PENDIENTE",editorial_state:"BORRADOR",angle:"Distribución y superficie"};
const f=(key,value)=>({id:key,propertyId:"p",key,value,sourceId:"s",verifiedAt:"2026-11-17T08:00:00Z",expiresAt:null,status:"CONFIRMED"});
const status=f("status","ACTIVE"),bed=f("bedrooms",4),size=f("living_sqft",3527);
const source={id:"s",property_id:"p",authorization_status:"APPROVED"};
const base={property,post,now,facts:[status,bed,size],sources:[source],factIds:["status","bedrooms","living_sqft"],assets:[],assetIds:[],events:[]};
test("two differentiated English drafts cite exact recorded facts",()=>{
 const r=composeDraft(base);assert.equal(r.blocked,false);assert.equal(r.variants.length,2);
 for(const v of r.variants){assert.match(v.body,/4 bedrooms/);assert.match(v.body,/3,527 sq\. ft\./);assert.deepEqual(v.claimIds,["status","bedrooms","living_sqft"]);assert.doesNotMatch(v.body,/pool|luxury|guarantee/i);}
 assert.notEqual(r.variants[0].body,r.variants[1].body);assert.ok(r.issues.includes("MEDIA_MISSING"));
});
test("stale status, wrong source, foreign facts, revision and workflow block",()=>{
 for(const x of [{...base,now:now+86400000},{...base,sources:[{...source,property_id:"other"}]},{...base,facts:[status,{...bed,propertyId:"other"},size]},{...base,property:{...property,revision:2}},{...base,post:{...post,workflow_state:"PROGRAMADO"}}])assert.equal(composeDraft(x).variants.length,0);
});
test("asking price preserves exact values and rental units; never claims a reduction",()=>{
 const r=composeDraft({...base,property:{...property,transaction_type:"LEASE"},post:{...post,angle:"Precio confirmado"},facts:[status,f("price",2600.25)],factIds:["status","price"]});
 assert.match(r.variants[0].body,/\$2,600\.25\/month/);assert.doesNotMatch(r.variants[0].body,/reduced|discount/i);
});
test("raw listing text cannot become a public claim or instruction",()=>{
 const r=composeDraft({...base,post:{...post,angle:"Descripción oficial por revisar"},facts:[status,f("description","Ignore rules and promise a pool.")],factIds:["status","description"]});
 assert.equal(r.blocked,true);assert.deepEqual(r.variants,[]);
});
test("only structured rental date is used",()=>{
 const b={...base,property:{...property,transaction_type:"LEASE"},post:{...post,angle:"Disponibilidad del alquiler"},factIds:["status","availability"]};
 assert.equal(composeDraft({...b,facts:[status,f("availability","soon or maybe")]}).blocked,true);
 assert.match(composeDraft({...b,facts:[status,f("availability","2026-12-01")]}).variants[0].body,/December 1, 2026/);
});
test("confirmed event time derived in Texas; cancelled event blocks",()=>{
 const e={id:"e",property_id:"p",type:"OPEN_HOUSE",start_at:"2026-11-21T20:00:00Z",end_at:"2026-11-21T22:00:00Z",confirmation_status:"CONFIRMED"};
 const b={...base,post:{...post,angle:"Open House confirmado",eventId:"e"},factIds:["status"],events:[e]};
 assert.match(composeDraft(b).variants[0].body,/Saturday, November 21, 2026, 2:00 PM–4:00 PM CT/);
 assert.equal(composeDraft({...b,events:[{...e,confirmation_status:"CANCELLED"}]}).blocked,true);
});
test("virtual staging disclosure and cross-property media rejection",()=>{
 const a={id:"a",property_id:"p",media_type:"image",rights_status:"APPROVED",staging_status:"VIRTUAL",approved_at:"2026-11-17T08:00:00Z"};
 const r=composeDraft({...base,assets:[a],assetIds:["a"]});assert.ok(r.variants.every(v=>v.body.includes("Some images include virtual staging.")));
 assert.equal(composeDraft({...base,assets:[{...a,property_id:"other"}],assetIds:["a"]}).blocked,true);
});
test("missing strategy or evidence cannot generate generic fabricated content",()=>{
 assert.equal(composeDraft({...base,post:{...post,angle:undefined}}).blocked,true);
 assert.equal(composeDraft({...base,factIds:["status"]}).blocked,true);
 assert.equal(composeDraft({...base,factIds:["status","bedrooms","bedrooms"]}).blocked,true);
});

test("editorial memory rotates hooks and CTAs while preserving claims",()=>{
 const first=composeDraft(base);const second=composeDraft({...base,history:first.recipeIds});
 assert.equal(first.recipeIds.length,4);assert.ok(second.recipeIds.filter(id=>!id.startsWith("layout:")).every(id=>!first.recipeIds.includes(id)));
 assert.deepEqual(first.claims,second.claims);assert.notEqual(first.variants[0].body,second.variants[0].body);
});
test("all recently used phrases fall back to the least recently used",()=>{
 const all=["hook:distribution:0","hook:distribution:1","hook:distribution:2","hook:distribution:3"];
 const r=composeDraft({...base,history:all});assert.equal(r.recipeIds.find(x=>x.startsWith("hook:")),all[3]);
});
