import test from "node:test";
import assert from "node:assert/strict";
import { isActiveSessionConflict } from "../src/helpers/activeSession.js";

const active = {
  activeSessionId: "old-session",
  activeExpiresAt: 2000,
  newSessionId: "new-session",
  nowSeconds: 1000,
};

test("a different browser cannot take over an active session", () => {
  assert.equal(isActiveSessionConflict(active), true);
});

test("the same browser can sign in again after closing its page", () => {
  assert.equal(isActiveSessionConflict({ ...active, sameBrowser: true }), false);
  assert.equal(isActiveSessionConflict({ ...active, ownsPreviousSession: true }), false);
});

test("expired or missing session markers do not block login", () => {
  assert.equal(isActiveSessionConflict({ ...active, activeExpiresAt: 999 }), false);
  assert.equal(isActiveSessionConflict({ ...active, activeSessionId: null }), false);
});
