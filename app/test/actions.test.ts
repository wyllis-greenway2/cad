import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { newHistory, exec, undo } from "../src/operation/history.ts";
import type { History } from "../src/operation/history.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import { actionsFor, dimensionalFor } from "../src/interaction/actions.ts";

const XY = worldRef("XY");
const must = (r: ReturnType<typeof exec>): History => {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.value;
};
const labels = (h: History, sel: Ref[]) => actionsFor(h.scene, sel).filter((a) => a.group === "relation").map((a) => a.label);

function world() {
  let h = newHistory();
  const a = drawChain(h.scene, XY, [[0, 0, 0], [10, 0, 0]]);
  h = must(exec(h, a.command));
  const b = drawChain(h.scene, XY, [[3, 4, 0], [13, 4, 0]]);
  h = must(exec(h, b.command));
  const c = drawChain(h.scene, XY, [[0, 0, 0], [10, 3, 0]]);
  h = must(exec(h, c.command));
  const k1 = drawCircle(h.scene, XY, [30, 0, 0], 2);
  h = must(exec(h, k1.command));
  const k2 = drawCircle(h.scene, XY, [40, 0, 0], 3);
  h = must(exec(h, k2.command));
  return { h, a, b, c, k1, k2 };
}

test("the table: which relations exist for which kinds of parts (the whole matrix)", () => {
  const { h, a, b, k1, k2 } = world();
  const [a0, b0] = [a.corners[0]!, b.corners[0]!];
  const [la, lb] = [a.lines[0]!, b.lines[0]!];
  assert.deepEqual(labels(h, [la]), ["Horizontal", "Vertical", "Length"]);
  assert.deepEqual(labels(h, [k1.circle]), ["Diameter"]);
  assert.deepEqual(labels(h, [a0]), ["Fix in place"]);
  assert.deepEqual(labels(h, [a0, b0]), ["Coincident", "Same height", "Same position across", "Distance"]);
  assert.deepEqual(labels(h, [la, lb]), ["Equal length", "Parallel", "Perpendicular", "Distance", "Angle"]);
  assert.deepEqual(labels(h, [a0, lb]), ["On line", "Distance"]);
  assert.deepEqual(labels(h, [lb, a0]), ["On line", "Distance"], "a corner and a line in either order");
  assert.deepEqual(labels(h, [k1.circle, k2.circle]), ["Equal radius"]);
  assert.deepEqual(labels(h, [la, k1.circle]), ["Tangent"]);
  assert.deepEqual(labels(h, []), []);
});

test("distance: two corners, a corner and a line, two parallel lines: measured and made", () => {
  const { h, a, b, c } = world();
  const cc = dimensionalFor(h.scene, [a.corners[0]!, b.corners[0]!])!;
  assert.equal(cc.measure(), 5);
  assert.equal(cc.unit, "mm");
  const cmd = cc.run(12);
  assert.equal(cmd.type, "addRelation");
  if (cmd.type === "addRelation") assert.deepEqual([cmd.relation.kind, cmd.relation.value, cmd.relation.locked, cmd.relation.parts], ["distance", 12, true, [a.corners[0], b.corners[0]]]);

  const cl = dimensionalFor(h.scene, [b.corners[0]!, a.lines[0]!])!;
  assert.equal(cl.measure(), 4, "the corner to the infinite line the other lies on");

  const gap = dimensionalFor(h.scene, [a.lines[0]!, b.lines[0]!])!;
  assert.equal(gap.enabled, true);
  assert.equal(gap.measure(), 4);
  const tilted = dimensionalFor(h.scene, [a.lines[0]!, c.lines[0]!])!;
  assert.equal(tilted.enabled, false);
  assert.match(tilted.why ?? "", /make them parallel first/);
});

test("angle between lines that share a corner; not available for lines that do not", () => {
  let h = newHistory();
  const r = drawChain(h.scene, XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0]]);
  h = must(exec(h, r.command));
  const ang = actionsFor(h.scene, r.lines).find((a) => a.id === "angle")!;
  assert.equal(ang.enabled, true);
  assert.ok(Math.abs(ang.measure()! - 90) < 1e-9);
  assert.equal(ang.unit, "deg");
  const w = world();
  const none = actionsFor(w.h.scene, [w.a.lines[0]!, w.b.lines[0]!]).find((a) => a.id === "angle")!;
  assert.equal(none.enabled, false);
  assert.match(none.why ?? "", /share a corner/);
});

test("the first picked is the mover and the second the reference; a body or world part is always second", () => {
  const { h, a, b } = world();
  const ab = actionsFor(h.scene, [a.corners[0]!, b.corners[0]!]).find((x) => x.id === "coincident")!;
  assert.deepEqual(ab.parts, [a.corners[0], b.corners[0]]);
  const ba = actionsFor(h.scene, [b.corners[0]!, a.corners[0]!]).find((x) => x.id === "coincident")!;
  assert.deepEqual(ba.parts, [b.corners[0], a.corners[0]]);
  const wo = actionsFor(h.scene, [worldRef("O"), a.corners[0]!]).find((x) => x.id === "coincident")!;
  assert.deepEqual(wo.parts, [a.corners[0], worldRef("O")], "the drawn corner moves to the origin, not the other way");
  const refsOnly = actionsFor(h.scene, [worldRef("O"), worldRef("O")]);
  assert.ok(refsOnly.every((x) => !x.enabled || x.group !== "relation"));
});

test("running a relation adds it; the number chip changes it; deleting a part takes its relations and undo brings both back", () => {
  const { h: h0, a, b } = world();
  const dist = dimensionalFor(h0.scene, [a.corners[0]!, b.corners[0]!])!;
  let h = must(exec(h0, dist.run()));
  assert.equal(h.scene.relations.length, 1);
  assert.equal(h.scene.relations[0]!.value, 5);
  const del = actionsFor(h.scene, [a.corners[0]!]).find((x) => x.id === "delete")!;
  h = must(exec(h, del.run()));
  assert.equal(h.scene.relations.length, 0);
  h = undo(h);
  assert.equal(h.scene.relations.length, 1);
});

test("deleting several selected parts is one step", () => {
  const { h: h0, a, b } = world();
  const del = actionsFor(h0.scene, [a.lines[0]!, b.lines[0]!]).find((x) => x.id === "delete")!;
  const h = must(exec(h0, del.run()));
  assert.equal(h.commands.length, h0.commands.length + 1);
  assert.equal(h.scene.parts[a.lines[0]!], undefined);
  assert.equal(h.scene.parts[b.lines[0]!], undefined);
  assert.ok(h.scene.parts[a.corners[0]!], "the corners stay");
});

test("a side is remembered so a gap does not flip over", () => {
  const { h, a, b } = world();
  const cmd = dimensionalFor(h.scene, [a.lines[0]!, b.lines[0]!])!.run();
  const flipped = dimensionalFor(h.scene, [b.lines[0]!, a.lines[0]!])!.run();
  if (cmd.type === "addRelation" && flipped.type === "addRelation") {
    assert.equal(cmd.relation.params?.side, 1);
    assert.equal(flipped.relation.params?.side, -1);
  }
});
