import test from "node:test";
import assert from "node:assert/strict";
import { basicEligibility, isFactCurrent } from "../src/domain/eligibility.ts";
import { displayTime, ZONES } from "../src/domain/time.ts";
const now = Date.parse("2026-11-17T18:00:00Z");
const property = { id:"demo-001", status:"ACTIVE", revision:1, priority:1 };
const fact = { id:"fact-demo-001", propertyId:property.id, key:"status", value:"ACTIVE", sourceId:"demo-source", verifiedAt:"2026-11-17T17:00:00Z", expiresAt:null, status:"CONFIRMED" };
const post = { id:"demo-post", propertyId:property.id, propertyRevision:1, plannedAt:"2026-11-18T18:00:00Z", format:"carousel", editorialState:"BORRADOR", workflowState:"PENDIENTE" };
test("fresh fact is current", () => assert.equal(isFactCurrent(fact, now), true));
test("stale, unconfirmed, future and expired facts fail", () => {
  for (const f of [
    {...fact,verifiedAt:"2026-11-16T18:00:00Z"},
    {...fact,status:"UNCONFIRMED"},
    {...fact,verifiedAt:"2026-11-18T18:00:00Z"},
    {...fact,expiresAt:"2026-11-17T18:00:00Z"},
    {...fact,sourceId:""}
  ]) assert.equal(isFactCurrent(f,now),false);
});
test("basic eligibility does not approve a draft", () => {
  assert.deepEqual(basicEligibility(property,post,[fact],now),[]);
  assert.equal(post.editorialState,"BORRADOR");
});
test("revision and inactive status invalidate", () => {
  assert.ok(basicEligibility({...property,revision:2},post,[fact],now).includes("REVISION_CHANGED"));
  assert.ok(basicEligibility({...property,status:"SOLD"},post,[fact],now).includes("PROPERTY_NOT_ACTIVE"));
});
test("missing and contradictory source status block", () => {
  for (const facts of [[],[{...fact,value:"SOLD"}],[fact,{...fact,id:"other"}]]) {
    assert.ok(basicEligibility(property,post,facts,now).includes("STATUS_NOT_CURRENT"));
  }
});
test("Texas and Barcelona display winter and DST gap", () => {
  assert.match(displayTime("2026-11-17T18:00:00Z",ZONES.texas),/12:00$/);
  assert.match(displayTime("2026-11-17T18:00:00Z",ZONES.barcelona),/19:00$/);
  assert.match(displayTime("2026-03-15T17:00:00Z",ZONES.texas),/12:00$/);
  assert.match(displayTime("2026-03-15T17:00:00Z",ZONES.barcelona),/18:00$/);
});
