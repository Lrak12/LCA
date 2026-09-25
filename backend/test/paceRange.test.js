import test from "node:test";
import assert from "node:assert/strict";
import {
  PACE_MAX,
  PACE_MIN,
  boundedPaceCount,
  isPaceInRange,
  requirePaceInRange,
} from "../src/helpers/paceRange.js";

test("PACE choices are limited to 1001 through 1144", () => {
  assert.equal(PACE_MIN, 1001);
  assert.equal(PACE_MAX, 1144);
  assert.equal(isPaceInRange(1001), true);
  assert.equal(isPaceInRange("1144"), true);
  assert.equal(isPaceInRange(1000), false);
  assert.equal(isPaceInRange(1145), false);
});

test("projection counts stop at PACE 1144", () => {
  assert.equal(boundedPaceCount(1141, 3), 3);
  assert.equal(boundedPaceCount(1143, 3), 2);
  assert.equal(boundedPaceCount(1144, 3), 1);
  assert.equal(boundedPaceCount(1145, 3), 0);
});

test("new out-of-range PACE values are rejected", () => {
  assert.equal(requirePaceInRange("1001"), 1001);
  assert.throws(() => requirePaceInRange(1145), /between 1001 and 1144/);
});
