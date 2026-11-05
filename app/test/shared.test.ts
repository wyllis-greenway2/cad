import test from "node:test";
import assert from "node:assert/strict";
import { ref, drawnRef, worldRef, bodyRef, originOf, formatId } from "../src/shared/ref.ts";
import { ok, err } from "../src/shared/result.ts";
import { createBus } from "../src/shared/events.ts";

test("refs name parts and say where they came from; bad names are refused", () => {
  assert.equal(originOf(drawnRef("e_001.p1")), "drawn");
  assert.equal(originOf(worldRef("XY")), "world");
  assert.equal(originOf(bodyRef("f_001", "corner@0,0,0")), "body");
  assert.throws(() => ref("e_001"));
  assert.equal(formatId("e", 7), "e_007");
});

test("result and bus", () => {
  assert.deepEqual(ok(1), { ok: true, value: 1 });
  assert.deepEqual(err("no"), { ok: false, error: "no" });
  const bus = createBus<{ hello: string }>();
  const seen: string[] = [];
  const off = bus.on("hello", (s) => seen.push(s));
  bus.emit("hello", "a");
  off();
  bus.emit("hello", "b");
  assert.deepEqual(seen, ["a"]);
});
