// Unit tests for map/list filtering and sorting (no database needed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyFilters, countActive, DEFAULT_FILTERS, distanceKm } from "../../src/features/search/filters.ts";

const centre = { lat: 22.7196, lng: 75.8577 }; // Indore
const at = (km) => ({ lat: centre.lat + km / 111.2, lng: centre.lng }); // ~km north of centre
const places = [
  { id: "a", name: "Khajrana Ganesh Mandir", name_hi: null, category: "temple", level: 4, source: "live", ...at(5) },
  { id: "b", name: "Sarafa Bazaar", name_hi: null, category: "street_food", level: 5, source: "estimated", ...at(0.5) },
  { id: "c", name: "Regional Park", name_hi: null, category: "park", level: 1, source: "estimated", ...at(8) },
  { id: "d", name: "Annapurna Mandir", name_hi: null, category: "temple", level: 2, source: "estimated", ...at(2) },
];
const ids = (list) => list.map((p) => p.id);
const f = (over) => ({ ...DEFAULT_FILTERS, ...over });

test("distance is about right", () => {
  assert.ok(Math.abs(distanceKm(centre, at(5)) - 5) < 0.05);
});

test("default: everything, quietest first", () => {
  assert.deepEqual(ids(applyFilters(places, DEFAULT_FILTERS, centre)), ["c", "d", "a", "b"]);
});

test("category groups", () => {
  assert.deepEqual(ids(applyFilters(places, f({ groups: ["worship"] }), centre)), ["d", "a"]);
  assert.deepEqual(ids(applyFilters(places, f({ groups: ["worship", "food"] }), centre)), ["d", "a", "b"]);
});

test("only quiet places (level 2 or less)", () => {
  assert.deepEqual(ids(applyFilters(places, f({ maxLevel: 2 }), centre)), ["c", "d"]);
});

test("radius needs a location, and keeps places within it", () => {
  assert.deepEqual(ids(applyFilters(places, f({ radiusKm: 3 }), centre)), ["d", "b"]);
  assert.deepEqual(ids(applyFilters(places, f({ radiusKm: 3 }), null)), []);
});

test("live only", () => {
  assert.deepEqual(ids(applyFilters(places, f({ liveOnly: true }), centre)), ["a"]);
});

test("sorting", () => {
  assert.deepEqual(ids(applyFilters(places, f({ sort: "nearest" }), centre)), ["b", "d", "a", "c"]);
  assert.deepEqual(ids(applyFilters(places, f({ sort: "busiest" }), centre)), ["b", "a", "d", "c"]);
  assert.deepEqual(ids(applyFilters(places, f({ sort: "name" }), centre)), ["d", "a", "c", "b"]);
});

test("distances are attached, and counting active filters", () => {
  const out = applyFilters(places, DEFAULT_FILTERS, centre);
  assert.ok(out.every((p) => typeof p.distanceKm === "number"));
  assert.equal(countActive(DEFAULT_FILTERS), 0);
  assert.equal(countActive(f({ groups: ["food"], maxLevel: 2, radiusKm: 1, liveOnly: true })), 4);
});
