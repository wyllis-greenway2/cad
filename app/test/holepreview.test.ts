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

// ---- the path the holes follow, and a line alone ----
import { guideLines } from "../src/interaction/holepreview.ts";
import { drawChain } from "../src/operation/build.ts";
import { selectedFace } from "../src/interaction/addpart.ts";

test("holes along the outline carry the path they follow: the outline moved in by the inset, as a closed line on the face, and the spacing", () => {
  const p = plan(block(), vals({ place: "outline", by: "distance", value: "30", corners: "each", offset: "10" }));
  assert.ok(p.guide.length > 20);
  assert.ok(p.guide.every((q) => Math.abs(q[2] - 8) < 1e-6), "on the face");
  const xs = p.guide.map((q) => q[0]), ys = p.guide.map((q) => q[1]);
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((x) => Math.round(x * 1e6) / 1e6), [10, 90, 10, 50]);
  assert.ok(p.spacing !== null && p.spacing <= 30 + 1e-9 && p.spacing >= 20 - 1e-9);
  assert.deepEqual(plan(block(), vals()).guide, [], "no path for a hole in the middle");
  assert.equal(plan(block(), vals()).spacing, null);
});
test("a different inset moves the guide with it, and the preview draws it dashed and pale next to the holes", () => {
  const at = (inset: string) => { const g = plan(block(), vals({ place: "outline", by: "count", value: "4", corners: "ignore", offset: inset })).guide.map((q) => q[0]); return Math.min(...g); };
  assert.ok(Math.abs(at("5") - 5) < 1e-6 && Math.abs(at("15") - 15) < 1e-6);
  const view = holesView(plan(block(), vals({ place: "outline", by: "count", value: "4", corners: "ignore", offset: "10" })))!;
  assert.ok(view.done.travel!.length > 0 && view.done.cut!.length > 0);
  assert.equal(holesView(plan(block(), vals()))!.done.travel, undefined);
});
test("a dashed line: dashes and gaps by turns along the polyline, a dash a fifth of the way when the dash is 4 and the gap 3 and the line 20 long", () => {
  const d = guideLines([[0, 0, 0], [20, 0, 0]], 4, 3);
  assert.deepEqual(d.map((x) => Math.round(x * 1e6) / 1e6), [0, 0, 0, 4, 0, 0, 7, 0, 0, 11, 0, 0, 14, 0, 0, 18, 0, 0]);
  assert.deepEqual(guideLines([[0, 0, 0]]), []);
});
test("a line drawn on a face is enough: it stands for the face, and the holes follow it", () => {
  const s0 = block();
  const top = (s0.click.selection as readonly string[])[0]!;
  const l = drawChain(scene(s0), top as never, [[10, 30, 8], [90, 30, 8]]);
  const s = select(run(s0, l.command), [l.lines[0]!]); // the line alone, no face selected
  const f = selectedFace(s);
  assert.ok(f.ok, f.ok ? "" : f.error);
  assert.equal(f.value.lines.length, 1);
  const p = plan(s, vals({ place: "lines", by: "count", value: "5", corners: "ignore" }));
  assert.equal(p.places.length, 5);
  assert.deepEqual(p.places.map((q) => Math.round(q[0])), [10, 30, 50, 70, 90]);
});

test("a nut pocket on the far side adds its hexagon at the far face and at its floor, and its corners, for each hole: 18 more lines", () => {
  const s = block();
  const one = holeLines(plan(s, vals())).length / 6;
  const far = holeLines(plan(s, vals({ far: "nut" })));
  assert.equal(far.length / 6, one + 18);
  const z = points(far).map((q) => q[2]);
  assert.ok(Math.min(...z) >= -1e-6 && Math.max(...z) <= 8 + 1e-6, "all within the body");
  assert.ok(points(far).some((q) => Math.abs(q[2] - 3.2 * 0) < 1e-6), "the hexagon is at the far face (z = 0)");
});
