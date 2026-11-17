// Unit tests for how weather nudges forecasts (no database needed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { clampLevel, weatherEffect, weatherIcon } from "../../src/features/crowd/plan/weather.ts";

const dry = { temp: 30, rainChance: 0, rain: 0, code: 0 };
const wet = { temp: 26, rainChance: 90, rain: 4, code: 63 };
const hot = { temp: 43, rainChance: 0, rain: 0, code: 0 };

test("no weather data, no change", () => {
  assert.deepEqual(weatherEffect("park", 10, null), { delta: 0, reason: null });
});

test("rain empties parks and fills malls", () => {
  assert.deepEqual(weatherEffect("park", 10, wet), { delta: -1, reason: "rain" });
  assert.deepEqual(weatherEffect("mall", 10, wet), { delta: 0.5, reason: "rain" });
  assert.deepEqual(weatherEffect("hospital", 10, wet), { delta: 0, reason: "rain" });
});

test("a high chance of rain counts even before it rains", () => {
  assert.equal(weatherEffect("market", 18, { ...dry, rainChance: 75 }).reason, "rain");
});

test("afternoon heat only affects outdoor places, only in the afternoon", () => {
  assert.deepEqual(weatherEffect("tourist", 14, hot), { delta: -0.5, reason: "heat" });
  assert.deepEqual(weatherEffect("tourist", 9, hot), { delta: 0, reason: null });
  assert.deepEqual(weatherEffect("mall", 14, hot), { delta: 0, reason: null });
});

test("dry, mild weather changes nothing", () => {
  assert.deepEqual(weatherEffect("park", 17, dry), { delta: 0, reason: null });
});

test("levels stay within 1-5 and icons map codes", () => {
  assert.equal(clampLevel(0.2), 1);
  assert.equal(clampLevel(6), 5);
  assert.equal(weatherIcon(0), "☀️");
  assert.equal(weatherIcon(63), "🌧️");
  assert.equal(weatherIcon(null), "");
});
