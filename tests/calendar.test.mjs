import test from "node:test";
import assert from "node:assert/strict";
import {dateKey,weekStart,weekDays,shiftDay,clock} from "../src/client/calendar.ts";
test("Texas date does not follow UTC midnight",()=>assert.equal(dateKey("2026-11-17T02:00:00Z"),"2026-11-16"));
test("weeks begin Monday across year boundary",()=>assert.deepEqual(weekDays("2027-01-01"),["2026-12-28","2026-12-29","2026-12-30","2026-12-31","2027-01-01","2027-01-02","2027-01-03"]));
test("calendar navigation keeps civil days across DST",()=>assert.equal(shiftDay(weekStart("2026-03-08"),7),"2026-03-09"));
test("clock handles Texas and Spain DST mismatch",()=>{assert.equal(clock("2026-03-15T17:00:00Z","America/Chicago"),"12:00");assert.equal(clock("2026-03-15T17:00:00Z","Europe/Madrid"),"18:00");});
test("invalid civil dates rejected",()=>assert.throws(()=>shiftDay("2026-02-30",1)));
