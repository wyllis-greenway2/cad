// A step that adds to or cuts into the body works on the bodies it meets and leaves the others as they are (`dec_per_body_checks`, `in_764`): the answer is the one a boolean on the whole shape gives.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { kernelStats } from "../src/compiler/kernel/occt/interpreter.mjs";

await kernel.init();
const wormSpec = { teeth: 1, module: 2, worm: { diameter: 24, length: 24 } };
const worms = (n: number, gap = 50): Session => Array.from({ length: n }, (_, i) => i).reduce((s, i) => run(s, { type: "gear", id: `g_00${i}`, plane: worldRef("XY"), at: [i * gap, 0, 0], spec: wormSpec }), createSession(kernel));
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { volume?: number }[];

test("the threads of a worm are added to its own core and to no other body: three worms are three bodies, each the volume of one", () => {
  const one = bodies(worms(1));
  assert.equal(one.length, 1);
  const before = kernelStats.partialBooleans;
  const three = bodies(worms(3));
  assert.equal(three.length, 3, "three bodies");
  for (const b of three) assert.ok(Math.abs(b.volume! - one[0]!.volume!) < 1e-3 * one[0]!.volume!, `${b.volume} against ${one[0]!.volume}`);
  assert.ok(kernelStats.partialBooleans - before > 0, "the steps of the second and third worm worked on the body they meet only");
});

test("worms that run into each other give what a boolean on the whole shape gave: the same bodies, with the same volumes", () => {
  const bs = bodies(worms(2, 10)); // (centres 10 mm apart: their threads run into each other)
  assert.deepEqual(bs.map((b) => Math.round(b.volume! * 10) / 10).sort((a, b) => a - b), [828.6, 1268.9, 5976.1], "found with the boolean on the whole shape before it was made on the bodies met");
});

test("an edit to the first of three worms finds the booleans of the others kept: their threads are not fused to their cores again", () => {
  const spec = { ...wormSpec, module: 2.03 }; // (its own numbers: not an answer kept by an earlier test)
  const s = Array.from({ length: 3 }, (_, i) => i).reduce((q: Session, i) => run(q, { type: "gear", id: `g_00${i}`, plane: worldRef("XY"), at: [i * 50, 0, 0], spec }), createSession(kernel));
  const before = kernelStats.booleansKept;
  const edited = run(s, { type: "setGear", id: "g_000", spec, turn: 0.05 });
  assert.ok(kernelStats.booleansKept - before >= 2, `${kernelStats.booleansKept - before} kept booleans found again`);
  assert.equal(bodies(edited).length, 3);
});
