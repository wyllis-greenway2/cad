// The preview of the holes in the model view (`dec_parts_tool`): lines made from the plan, with no kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { receiverPlan, receiverStart, receiverStartFor } from "../src/interaction/addpart.ts";
import type { ReceiverValues } from "../src/interaction/addpart.ts";
import { holeLines, holesView } from "../src/interaction/holepreview.ts";

await kernel.init();
const XY = worldRef("XY");
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const vals = (o: Partial<ReceiverValues> = {}): ReceiverValues => ({ ...receiverStart(), kind: "clearance", size: "M4", fit: "medium", ...o });
/** a 100 x 60 x 8 block with its top face selected */
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [100, 60, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 8 } } });
  return select(s, [Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,8"))!.ref]);
};
const points = (lines: number[]): [number, number, number][] => Array.from({ length: lines.length / 3 }, (_, i) => [lines[3 * i]!, lines[3 * i + 1]!, lines[3 * i + 2]!]);
const plan = (s: Session, v: ReceiverValues) => { const p = receiverPlan(s, v); assert.ok(p.ok, p.ok ? "" : p.error); return p.value; };

test("a clearance hole is drawn as two rings and its section on four sides: 76 short lines for the one hole", () => {
  const lines = holeLines(plan(block(), vals()));
  assert.equal(lines.length / 6, 2 * 32 + 4 * 3, "two rings of 32 and 3 lines on each of 4 sides");
  const centre = [50, 30];
  const rings = points(lines).filter((p) => Math.abs(Math.hypot(p[0] - centre[0]!, p[1] - centre[1]!) - 2.25) < 1e-6);
  assert.ok(rings.length >= 128, "the points of the rings are on the hole's circle (M4 medium, 4.5 across)");
});
test("a hole right through is drawn to the far side of the body, a typed depth to that depth, never beyond the body", () => {
  const z = (s: Session, v: ReceiverValues) => { const p = points(holeLines(plan(s, v))).map((q) => q[2]); return [Math.min(...p), Math.max(...p)]; };
  assert.deepEqual(z(block(), vals()).map((x) => Math.round(x * 1e6) / 1e6), [0, 8]);
  assert.deepEqual(z(block(), vals({ depth: "3" })).map((x) => Math.round(x * 1e6) / 1e6), [5, 8]);
  assert.deepEqual(z(block(), vals({ depth: "50" })).map((x) => Math.round(x * 1e6) / 1e6), [0, 8], "a depth past the body is drawn to the far side");
});
test("a countersunk hole has a ring more (the cone's mouth) than a plain one, a counterbored hole too, a nut pocket its hexagons", () => {
  const count = (v: ReceiverValues) => holeLines(plan(block(), v)).length / 6;
  const plain = count(vals());
  assert.ok(count(vals({ kind: "countersunk" })) > plain);
  assert.ok(count(vals({ kind: "counterbore" })) > plain);
  assert.equal(count(vals({ kind: "nutPocket" })), count(vals({ kind: "nutPocket" })));
  assert.ok(count(vals({ kind: "nutPocket" })) > plain + 12, "the hexagon at the face and at the floor and its six corners");
});
test("a row of holes along the outline is one set of lines for each hole", () => {
  const one = holeLines(plan(block(), vals())).length;
  const row = holeLines(plan(block(), vals({ place: "outline", by: "distance", value: "30", corners: "each", offset: "10" })));
  assert.equal(row.length, 10 * one);
});
test("the preview follows the settings: a bigger size is a bigger ring, and with no place there is no preview", () => {
  const radius = (size: string) => { const p = points(holeLines(plan(block(), vals({ size })))); return Math.max(...p.map((q) => Math.hypot(q[0] - 50, q[1] - 30))); };
  assert.ok(radius("M8") > radius("M4"));
  assert.ok(holesView(plan(block(), vals())) !== null);
  const empty = { ...plan(block(), vals()), places: [] };
  assert.equal(holesView(empty), null);
});
test("the plan says why when the settings make no hole, and the panel starts at the place the selection names", () => {
  const s = block();
  const bad = receiverPlan(s, vals({ depth: "abc" }));
  assert.ok(!bad.ok && bad.error.includes("numbers"));
  assert.ok(!receiverPlan(select(s, []), vals()).ok);
  assert.equal(receiverStartFor(s).place, "centre");
});
