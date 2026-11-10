// A side that the constraints would shrink to nothing is a conflict, and a side already upright is not offered "horizontal" (`in_254`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { nextId } from "../src/operation/scene.ts";

await kernel.init();

function rectangle() {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return { s, lines: r.lines };
}

test("a side held upright is not offered \"horizontal\" (and the other way round), and says why", () => {
  const { s, lines } = rectangle();
  const vertical = lines.find((l) => scene(s).relations.some((r) => r.kind === "vertical" && r.parts.includes(l)))!;
  const a = actionsFor(scene(s), [vertical]).find((x) => x.id === "horizontal")!;
  assert.equal(a.enabled, false);
  assert.match(a.why ?? "", /upright already/);
  const level = lines.find((l) => scene(s).relations.some((r) => r.kind === "horizontal" && r.parts.includes(l)))!;
  assert.match(actionsFor(scene(s), [level]).find((x) => x.id === "vertical")!.why ?? "", /level already/);
});

test("level and upright put on one side by any route is refused, the rectangle stays as it was, and an extrusion of it is not left broken", () => {
  const { s: s0, lines } = rectangle();
  let s = run(s0, { type: "addStep", step: { id: nextId(scene(s0), "s"), type: "extrude", parts: lines, params: { depth: 10 } } });
  const vertical = lines.find((l) => scene(s).relations.some((r) => r.kind === "vertical" && r.parts.includes(l)))!;
  const before = JSON.stringify(Object.values(scene(s).parts).flatMap((p) => (p.kind === "corner" && p.origin === "drawn" ? [p.at] : [])));
  const refused = run(s, { type: "addRelation", relation: { id: nextId(scene(s), "r"), kind: "horizontal", parts: [vertical] } });
  assert.match(refused.message ?? "", /cannot be done without breaking/);
  assert.equal(scene(refused).relations.length, scene(s).relations.length, "the relation is not kept");
  assert.equal(JSON.stringify(Object.values(scene(refused).parts).flatMap((p) => (p.kind === "corner" && p.origin === "drawn" ? [p.at] : []))), before, "the corners did not move");
  assert.deepEqual(refused.outcome.errors, {}, "the extrusion is not broken");
  s = refused;
  assert.ok(s.outcome.kernel!.volume! > 5000);
});
