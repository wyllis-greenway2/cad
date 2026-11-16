// The one notification description (`in_558`, `q_ui_unification`).
import test from "node:test";
import assert from "node:assert/strict";
import { noticesOf } from "../src/interaction/notice.ts";

const base = { message: "", refusal: null, helper: null, busy: false };

test("nothing to say, nothing listed", () => { assert.deepEqual(noticesOf(base), []); });

test("a message is a status notice; a refusal replaces it (its words are the message) and carries the button and the way to hold it", () => {
  assert.deepEqual(noticesOf({ ...base, message: "saved" }), [{ kind: "status", text: "saved" }]);
  const [r, ...rest] = noticesOf({ ...base, message: "that cannot be done", refusal: { text: "that cannot be done", button: "Delete constraint to proceed", beside: "r_001" } });
  assert.equal(rest.length, 0, "not said twice");
  assert.equal(r!.kind, "refusal");
  assert.equal(r!.beside, "r_001");
  assert.deepEqual(r!.action!.intent, { type: "overrideRefusal" });
  assert.deepEqual(r!.action!.hold, { type: "holdFlash" });
});

test("help stands on its arrow and the working sign is last", () => {
  const list = noticesOf({ ...base, message: "x", helper: { at: [1, 2, 3], text: "pull to copy" }, busy: true });
  assert.deepEqual(list.map((n) => n.kind), ["status", "help", "busy"]);
  assert.deepEqual(list[1]!.at, [1, 2, 3]);
});
