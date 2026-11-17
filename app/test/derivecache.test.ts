// What the page works out of the scene at an edit is kept while the parts it was made from are the same objects, and never longer (`in_726`): a gear's parts, a loop's points, the parts of the body for a kernel answer, the faces derived from the drawn parts.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopPoints, loopSteps } from "../src/operation/part.ts";
import type { Part } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Command } from "../src/operation/commands.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");
const gear = (s: Session, id = "g_001", teeth = 24): Session => run(s, { type: "gear", id, plane: XY, at: [0, 0, 0], spec: { teeth, module: 1 } });
const rect = (s: Session): { s: Session; corners: Ref[]; lines: Ref[] } => {
  const sc = scene(s);
  const plane = sc.parts[XY]!;
  const r = drawRectangle(sc, XY, [10, 10, 0], [20, 20, 0], (plane as unknown as { u: [number, number, number] }).u, (plane as unknown as { v: [number, number, number] }).v);
  return { s: run(s, r.command as Command), corners: r.corners, lines: r.lines };
};
const gearParts = (s: Session, id = "g_001"): Part[] => Object.values(scene(s).parts).filter((p) => p.ref.startsWith(`d/${id}.`));

test("a gear's parts are the same objects after an edit that is not to the gear, and new ones after one that is", () => {
  const a = gear(createSession(kernel));
  const before = gearParts(a);
  assert.ok(before.length > 400, `${before.length} parts`);
  const b = rect(a).s; // (a figure drawn beside it)
  const same = gearParts(b);
  assert.equal(same.length, before.length);
  assert.ok(same.every((p, i) => p === before[i]), "the very same objects");
  const c = run(b, { type: "setGear", id: "g_001", spec: { teeth: 26, module: 1 } });
  assert.notEqual(gearParts(c).length, before.length);
  assert.ok(!gearParts(c).some((p) => before.includes(p)), "a gear with other numbers has other parts");
});

test("the points of a loop are the same as working them out again, and follow a corner that moves", () => {
  const { s, corners, lines } = rect(createSession(kernel));
  const sc = scene(s);
  const face = Object.values(sc.parts).find((p) => p.kind === "face" && p.loop.length === 4)!;
  assert.equal(face.kind, "face");
  const f = face as Extract<Part, { kind: "face" }>;
  const first = loopPoints(lookup(sc), f.loop, f.corners);
  const again = loopPoints(lookup(sc), f.loop, f.corners);
  assert.deepEqual(again, first);
  assert.notEqual(again, first, "a copy of the list, not the kept one");
  // the same numbers in other objects: worked out again, the same
  const copy = lookup({ ...sc, parts: Object.fromEntries(Object.entries(sc.parts).map(([k, p]) => [k, { ...p }])) });
  assert.deepEqual(loopPoints(copy, f.loop, f.corners), first);
  assert.deepEqual(loopSteps(copy, f.loop, f.corners).map((x) => x.at), loopSteps(lookup(sc), f.loop, f.corners).map((x) => x.at));
  // a corner that moves: the points follow
  const moved = run(s, { type: "movePart", ref: corners[2]!, to: [25, 25, 0] });
  const mf = Object.values(scene(moved).parts).find((p) => p.kind === "face" && p.loop.length === 4) as Extract<Part, { kind: "face" }>;
  const after = loopPoints(lookup(scene(moved)), mf.loop, mf.corners);
  assert.notDeepEqual(after, first);
  assert.ok(after.some((p) => Math.abs(p[0] - 25) < 1e-9 && Math.abs(p[1] - 25) < 1e-9), "the moved corner is in the new loop");
  assert.ok(lines.length === 4);
});

test("the parts of the body for a kernel answer are the same objects while the answer is the same one, and new when it is not", () => {
  const memo = new Map<string, unknown>();
  const same = { ...kernel, evaluate: (g: Parameters<typeof kernel.evaluate>[0], t?: Parameters<typeof kernel.evaluate>[1]) => { const k = JSON.stringify(g) + JSON.stringify(t ?? null); if (!memo.has(k)) memo.set(k, kernel.evaluate(g, t)); return memo.get(k) as ReturnType<typeof kernel.evaluate>; } };
  const spec = { teeth: 12, module: 1 };
  let s = run(createSession(same), { type: "gear", id: "g_001", plane: XY, at: [0, 0, 0], spec });
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: XY, at: [0, 0, 0], spec }).lines);
  s = runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as { op: Op }).op, value: 5 })!.session;
  const bodyParts = (q: Session) => Object.values(scene(q).parts).filter((p) => p.origin === "body");
  const one = bodyParts(s);
  assert.ok(one.length > 0);
  const two = bodyParts(rect(s).s); // (a figure drawn: the kernel's graph is the same)
  assert.equal(two.length, one.length);
  assert.ok(two.every((p, i) => p === one[i]), "the same body parts");
  const step = scene(s).steps.at(-1)!;
  const thicker = run(s, { type: "setStepParams", id: step.id, params: { depth: 9 } });
  const other = bodyParts(thicker);
  assert.ok(other.length > 0 && other.every((p) => !one.includes(p)), "another answer, other parts");
  assert.ok(other.some((p) => p.ref.includes(",9") || (p.kind === "plane" && p.at[2] === 9)), "and they are the thicker body's");
});

test("the faces derived from the drawn parts follow a change (a figure drawn, a corner moved, a figure taken away)", () => {
  const { s, corners } = rect(createSession(kernel));
  const faces = (q: Session) => Object.values(scene(q).parts).filter((p) => p.kind === "face").length;
  assert.equal(faces(s), 1);
  const two = rect(run(s, { type: "movePart", ref: corners[0]!, to: [9, 9, 0] })).s; // (a second figure on the same corners' places: other refs)
  assert.ok(faces(two) >= 1);
  const gone = run(s, { type: "deletePart", ref: corners[0]! });
  assert.equal(faces(gone), 0, "a figure that lost a corner is no face");
});
