// Fastener holes along a path (`dec_path_repeat`, step (d)): along the outline of the face, or along the lines selected, by the path repeat's rules.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawChain, drawCircle, drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId, figureParams } from "../src/operation/scene.ts";
import { cutReceiver, receiverContext, receiverDialog, receiverStart, receiverStartFor, selectedFace, receiverPlan } from "../src/interaction/addpart.ts";
import type { ReceiverValues } from "../src/interaction/addpart.ts";
import { readFaceOutline } from "../src/operation/pathmaps.ts";
import { faceEdges } from "../src/interaction/offsetbody.ts";
import { lengthOf, placeAlong } from "../src/operation/pathrepeat.ts";

await kernel.init();
const XY = worldRef("XY");
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const total = (s: Session): number => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const near = (a: number, b: number, tol = 0.003) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} against ${b}`);
const cyl = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h;
const vals = (o: Partial<ReceiverValues> = {}): ReceiverValues => ({ ...receiverStart(), kind: "clearance", size: "M4", fit: "medium", ...o });

/** a 100 x 60 x 8 block (optionally with a hole of diameter 10 at (30, 30)); the top face is returned */
const block = (hole = false): { s: Session; top: string; V: number } => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [100, 60, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = hole ? drawCircle(scene(s), XY, [30, 30, 0], 5) : null;
  if (c) s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 8, ...(c ? { holes: c.circle } : {}) } } });
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,8"))!.ref;
  return { s: select(s, [top]), top, V: 100 * 60 * 8 - (hole ? cyl(10, 8) : 0) };
};

test("the outline of a flat face is read as a closed path, counter-clockwise from outside, whatever order the edges are in", () => {
  const { s, top } = block();
  const sc = scene(s);
  const face = sc.parts[top as never] as never;
  const o = readFaceOutline(sc, face, faceEdges(sc, face));
  assert.ok(o.ok, o.ok ? "" : o.error);
  assert.equal(o.value.closed, true);
  assert.equal(o.value.segs.length, 4);
  near(lengthOf(o.value), 320, 1e-6);
  // the left of the path is the inside: moved by 10 in, the first place is 10 in from the corner
  const p = placeAlong(o.value, { spacing: { by: "count", count: 4 }, offset: 10 });
  assert.ok(p.ok);
  for (const f of p.value.frames) { assert.ok(f.at[0] >= 10 - 1e-6 && f.at[0] <= 90 + 1e-6 && f.at[1] >= 10 - 1e-6 && f.at[1] <= 50 + 1e-6, `${f.at}`); }
});
test("the outline of a face with a hole is the outer edge only", () => {
  const { s, top } = block(true);
  const sc = scene(s);
  const face = sc.parts[top as never] as never;
  const o = readFaceOutline(sc, face, faceEdges(sc, face));
  assert.ok(o.ok, o.ok ? "" : o.error);
  near(lengthOf(o.value), 320, 1e-6);
});
test("holes along the outline with a hole at every corner and the sides divided: 10 holes 10 mm in from the edge of a 100 x 60 face, spaced at most 30 apart", () => {
  const { s, V } = block();
  const r = cutReceiver(s, vals({ place: "outline", by: "distance", value: "30", corners: "each", offset: "10" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 10 * cyl(4.5, 8)); // (4 corners, 2 on each long side, 1 on each short side)
  assert.equal(scene(r.value).steps.length - scene(s).steps.length, 10, "a cut step for each hole");
});
test("a number equally divided round the outline: six holes, none touching the edge", () => {
  const { s, V } = block();
  const r = cutReceiver(s, vals({ place: "outline", by: "count", value: "6", corners: "ignore", offset: "10" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 6 * cyl(4.5, 8));
});
test("holes along a line drawn on the face: five, from one end to the other, equally divided", () => {
  const { s, top, V } = block();
  const l = drawChain(scene(s), top as never, [[10, 30, 8], [90, 30, 8]]);
  const withLine = select(run(s, l.command), [top, l.lines[0]!]);
  assert.equal(receiverStartFor(withLine).place, "lines");
  const r = cutReceiver(withLine, vals({ place: "lines", by: "count", value: "5", corners: "ignore", startInset: "0", endInset: "0" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 5 * cyl(4.5, 8));
});
test("a hole to tap in a row: every place gets the same receiver and the depth asked", () => {
  const { s, top, V } = block();
  const l = drawChain(scene(s), top as never, [[10, 30, 8], [90, 30, 8]]);
  const r = cutReceiver(select(run(s, l.command), [top, l.lines[0]!]), vals({ kind: "tapped", size: "M5", place: "lines", by: "distance", value: "20", ends: "fit", depth: "6" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 5 * cyl(4.2, 6)); // (80 / 20: five places)
});
test("an edge of the body selected with the face is one edge stepped in: holes along it, the inset in from it (`in_951`)", () => {
  const { s, top, V } = block();
  const sc = scene(s);
  const edge = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "body" && !p.circle && p.ref.includes("e@0,0,8~100,0,8"))!.ref;
  const sel = select(s, [top, edge]);
  const f = selectedFace(sel);
  assert.ok(f.ok && f.value.lines.length === 1);
  const p = receiverPlan(sel, vals({ place: "edge", by: "count", value: "3", offset: "10", corners: "ignore" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (p.ok) for (const c of p.value.places) near(c[1], 10, 1e-6); // (the edge runs along +x, so its left is +y: 10 in from the edge)
  const r = cutReceiver(sel, vals({ place: "edge", by: "count", value: "3", offset: "10", corners: "ignore" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 3 * cyl(4.5, 8));
});
test("rules that make no hole, or too many, are refused with the reason", () => {
  const { s } = block();
  assert.ok(!cutReceiver(s, vals({ place: "outline", by: "distance", value: "0" })).ok);
  const many = cutReceiver(s, vals({ place: "outline", by: "distance", value: "1", corners: "ignore", offset: "5" }));
  assert.ok(!many.ok && many.error.includes("200"), many.ok ? "" : many.error);
  const e = cutReceiver(s, vals({ place: "outline", by: "count", value: "4", corners: "inward" }));
  assert.ok(!e.ok && e.error.includes("distance"));
  const noLines = cutReceiver(s, vals({ place: "lines" }));
  assert.ok(noLines.ok, "with no line selected the holes fall back to the middle of the face");
  const off = cutReceiver(s, vals({ place: "outline", by: "count", value: "4", offset: "40" }));
  assert.ok(!off.ok && off.error.includes("inside out"), off.ok ? "" : off.error);
});
test("the dialog offers where the holes go, says why one cannot be chosen, and swaps the offsets for the path's rules", () => {
  const { s, top } = block();
  const ctx = receiverContext(s)!;
  const plain = receiverDialog(vals(), 0, ctx);
  const where = plain.fields.find((f) => f.id === "place")!;
  assert.deepEqual(where.choices!.map((c) => c.value), ["centre", "picked", "outline", "lines"]);
  assert.ok(where.choices!.find((c) => c.value === "picked")!.disabled?.includes("select corners"));
  assert.ok(where.choices!.find((c) => c.value === "lines")!.disabled?.includes("select lines"));
  assert.equal(where.choices!.find((c) => c.value === "outline")!.disabled, undefined);
  assert.ok(plain.fields.some((f) => f.id === "dx"));
  const row = receiverDialog(vals({ place: "outline" }), 0, ctx);
  assert.equal(row.title, "Fastener holes along a path");
  assert.ok(!row.fields.some((f) => f.id === "dx") && ["pathpicture", "by", "value", "corners", "offset"].every((id) => row.fields.some((f) => f.id === id)));
  const pic = row.fields.find((f) => f.id === "pathpicture")!;
  assert.ok(String(pic.value).includes("<circle") && pic.note?.includes("places") && !pic.note.includes("the first is the"));
  const noCtx = receiverDialog(vals(), 0);
  assert.ok(!noCtx.fields.some((f) => f.id === "place"), "the old call is unchanged");
  assert.equal(top.length > 0, true);
});
test("what was selected decides where the dialog starts: picked places, else lines, else the middle", () => {
  const { s, top } = block();
  assert.equal(receiverStartFor(s).place, "centre");
  const sc = scene(s);
  const corner = Object.values(sc.parts).find((p) => p.kind === "corner" && p.origin === "body" && p.ref.endsWith("v@100,60,8"))!.ref;
  assert.equal(receiverStartFor(select(s, [top, corner])).place, "picked");
});

// ---- a nut on the other side, and walking the row (`in_909`) ----
test("a nut pocket on the far side is cut with the hole: the same volume as the hole and a pocket at the far face", () => {
  const { s, V } = block();
  const hex = (Math.sqrt(3) / 2) * 49 - Math.PI * 2.25 ** 2; // (M4: 7 mm across flats, 3.2 thick; the hole's own circle is inside it)
  const r = cutReceiver(s, vals({ kind: "clearance", size: "M4", fit: "medium", far: "nut" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - cyl(4.5, 8) - hex * 3.2);
  // with a countersink on the near side as well: the head profile and the nut
  const both = cutReceiver(s, vals({ kind: "countersunk", size: "M4", fit: "medium", far: "nut" }));
  assert.ok(both.ok, both.ok ? "" : both.error);
  const cone = 4.48 - 2.25;
  near(total(both.value), V - ((Math.PI * cone) / 3) * (4.48 * 4.48 + 4.48 * 2.25 + 2.25 * 2.25) - cyl(4.5, 8 - cone) - hex * 3.2);
});
test("a row of holes with a nut pocket at each, on the other side", () => {
  const { s, V } = block();
  const r = cutReceiver(s, vals({ place: "outline", by: "distance", value: "30", corners: "each", offset: "10", far: "nut" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  const hex = (Math.sqrt(3) / 2) * 49 - Math.PI * 2.25 ** 2;
  near(total(r.value), V - 10 * (cyl(4.5, 8) + hex * 3.2));
});
test("a nut on the other side is refused with a hole to tap, a nut pocket on this side, or a depth short of the far side", () => {
  const { s } = block();
  assert.ok(!cutReceiver(s, vals({ kind: "tapped", far: "nut" })).ok);
  assert.ok(!cutReceiver(s, vals({ kind: "nutPocket", far: "nut" })).ok);
  const d = cutReceiver(s, vals({ kind: "clearance", far: "nut", depth: "5" }));
  assert.ok(!d.ok && d.error.includes("right through"));
});
test("a shift walks the whole row along the outline: a closed loop turns the holes round, the same number of holes and the same volume", () => {
  const { s, V } = block();
  const at = (shift: string) => { const r = cutReceiver(s, vals({ place: "outline", by: "count", value: "8", corners: "ignore", offset: "10", shift })); assert.ok(r.ok, r.ok ? "" : r.error); return total(r.value); };
  near(at("0"), V - 8 * cyl(4.5, 8));
  near(at("12.5"), V - 8 * cyl(4.5, 8));
  const plan0 = receiverPlan(s, vals({ place: "outline", by: "count", value: "8", corners: "ignore", offset: "10", shift: "0" }));
  const plan1 = receiverPlan(s, vals({ place: "outline", by: "count", value: "8", corners: "ignore", offset: "10", shift: "10" }));
  assert.ok(plan0.ok && plan1.ok);
  assert.notDeepEqual(plan0.value.places[0], plan1.value.places[0]);
  assert.equal(plan1.value.places.length, 8);
});

// ---- a hole drilled then tapped, and the hardware put in (`in_910`, `in_911`) ----
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { volume?: number }[];
test("drill then tap: a clearance part to a depth, the tap drill past it", () => {
  const { s, V } = block();
  const r = cutReceiver(s, vals({ kind: "drillTap", size: "M4", depth: "8", drill: "3" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const rc = 4.5 / 2, rt = 3.3 / 2; // (M4 medium clearance 4.5, tap drill 4 - 0.7)
  near(total(r.value), V - cyl(4.5, 3) - cyl(3.3, 5), 0.01);
  assert.ok(rc > rt);
});
test("drill then tap: the drilled part is less than the whole depth", () => {
  const { s } = block();
  assert.ok(!cutReceiver(s, vals({ kind: "drillTap", depth: "8", drill: "9" })).ok);
  assert.ok(!cutReceiver(s, vals({ kind: "drillTap", depth: "8", drill: "abc" })).ok);
});
test("insert: off by default, no new body; on, a screw as its own body in the hole", () => {
  const { s, V } = block();
  const off = cutReceiver(s, vals({ kind: "counterbore", size: "M4" }));
  assert.ok(off.ok);
  if (!off.ok) return;
  assert.equal(bodies(off.value).length, 1);
  const on = cutReceiver(s, vals({ kind: "counterbore", size: "M4", insert: "screw" }));
  assert.ok(on.ok, on.ok ? "" : on.error);
  if (!on.ok) return;
  assert.equal(bodies(on.value).length, 2);
  const host = Math.max(...bodies(on.value).map((b) => b.volume ?? 0));
  near(host, total(off.value), 0.001); // (the screw did not cut the block, nor join it)
  void V;
});
test("insert: the screw is the longest standard length that fits, or the one typed", () => {
  const { s } = block();
  const p = receiverPlan(s, vals({ kind: "clearance", size: "M4", insert: "screw" }));
  assert.ok(p.ok && p.value.insert?.screw?.length === 8);
  const t = receiverPlan(s, vals({ kind: "clearance", size: "M4", insert: "screw", length: "5" }));
  assert.ok(t.ok && t.value.insert?.screw?.length === 5);
  assert.ok(!receiverPlan(s, vals({ kind: "clearance", size: "M4", insert: "screw", length: "20" })).ok);
});
test("insert with a far nut puts a nut body in the far pocket; a nut pocket on this side gets its nut", () => {
  const { s } = block();
  const a = cutReceiver(s, vals({ kind: "clearance", size: "M4", far: "nut", insert: "screw" }));
  assert.ok(a.ok, a.ok ? "" : a.error);
  if (a.ok) assert.equal(bodies(a.value).length, 3);
  const b = cutReceiver(s, vals({ kind: "nutPocket", size: "M4", insert: "screw" }));
  assert.ok(b.ok, b.ok ? "" : b.error);
  if (b.ok) assert.equal(bodies(b.value).length, 2);
});

// ---- a curved surface (`in_929`): a round face, a line across it, the holes going in along the normal ----
const post = (): { s: Session; face: string; V: number } => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 40, ...figureParams([{ outer: [c.circle], holes: [] }]) } } });
  const face = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!(p.curved || p.round))!.ref;
  return { s, face, V: Math.PI * 100 * 40 };
};
const alongAxis = (s: Session, face: string, x = 12): Session => {
  const l = drawChain(scene(s), worldRef("XZ"), [[x, 0, 5], [x, 0, 35]], false);
  s = run(s, l.command);
  return select(s, [face, l.lines[0]!]);
};
// what one hole of diameter d takes from a post of radius R, straight through it across the axis
const through = (d: number, R: number): number => { let v = 0; const n = 400, a = d / 2, h = d / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const y = -a + (i + 0.5) * h, z = -a + (j + 0.5) * h; if (y * y + z * z <= a * a) v += 2 * Math.sqrt(R * R - y * y) * h * h; } return v; };
test("a line along a round post: holes in along the normal, through the post", () => {
  const { s: s0, face, V } = post();
  const s = alongAxis(s0, face);
  const p = receiverPlan(s, vals({ kind: "clearance", size: "M4", place: "lines", by: "count", value: "3", corners: "ignore" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (!p.ok) return;
  assert.equal(p.value.places.length, 3);
  assert.ok(p.value.curved);
  for (const c of p.value.places) near(Math.hypot(c[0], c[1]), 10, 1e-6); // (on the surface)
  const r = cutReceiver(s, vals({ kind: "clearance", size: "M4", fit: "medium", place: "lines", by: "count", value: "3", corners: "ignore" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (r.ok) near(total(r.value), V - 3 * through(4.5, 10), 0.003);
});
test("a line round a post: the holes stand round it, each looking at the axis", () => {
  const { s: s0, face } = post();
  const arc = drawChain(scene(s0), XY, [[12, 0, 20], [0, 12, 20]], false); // (a straight line across a corner of the plane: the places are projected onto the post)
  let s = run(s0, arc.command);
  s = select(s, [face, arc.lines[0]!]);
  const p = receiverPlan(s, vals({ kind: "clearance", size: "M4", place: "lines", by: "count", value: "3", corners: "ignore" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (!p.ok) return;
  for (const sp of p.value.spots) { const out = [sp.u[1] * sp.v[2] - sp.u[2] * sp.v[1], sp.u[2] * sp.v[0] - sp.u[0] * sp.v[2], sp.u[0] * sp.v[1] - sp.u[1] * sp.v[0]]; near(out[0]! * sp.centre[0] + out[1]! * sp.centre[1], 10, 1e-6); } // (the way out is straight out from the axis)
});
test("on a round face a nut on the far side and a screw without a depth are refused", () => {
  const { s: s0, face } = post();
  const t = alongAxis(s0, face);
  assert.ok(!receiverPlan(t, vals({ place: "lines", by: "count", value: "2", corners: "ignore", far: "nut" })).ok);
  assert.ok(!receiverPlan(t, vals({ place: "lines", by: "count", value: "2", corners: "ignore", insert: "screw" })).ok);
  assert.ok(receiverPlan(t, vals({ place: "lines", by: "count", value: "2", corners: "ignore", insert: "screw", depth: "20" })).ok);
});
test("hardware in a curved hole: a counterbore with its screw, a nut pocket with its nut", () => {
  const { s: s0, face } = post();
  const s = alongAxis(s0, face);
  const a = cutReceiver(s, vals({ kind: "counterbore", size: "M4", place: "lines", by: "count", value: "2", corners: "ignore", depth: "20", insert: "screw" }));
  assert.ok(a.ok, a.ok ? "" : a.error);
  if (a.ok) assert.equal(bodies(a.value).length, 3);
  const b = cutReceiver(s, vals({ kind: "nutPocket", size: "M4", place: "lines", by: "count", value: "2", corners: "ignore", insert: "screw" }));
  assert.ok(b.ok, b.ok ? "" : b.error);
  if (b.ok) assert.equal(bodies(b.value).length, 3);
});

test("the depth of a hole through is the thickness of the body the face is of, with other bodies about (not a huge number)", () => {
  let s = createSession(kernel);
  const a = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [100, 60, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: a.lines, params: { depth: 8 } } });
  const b = drawSquaredRectangle(scene(s), XY, [200, 0, 0], [220, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: b.lines, params: { depth: 30 } } });
  assert.ok(bodies(s).length >= 2);
  const tops = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,8"));
  assert.equal(tops.length, 1);
  const p = receiverPlan(select(s, [tops[0]!.ref]), vals({ place: "centre" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (p.ok) near(p.value.reach, 8, 1e-6);
});

test("holes along the outline counted with a hole at every corner: the count is all the holes, the corners among them", () => {
  const { s } = block();
  const p = receiverPlan(s, vals({ place: "outline", by: "count", value: "12", corners: "each", offset: "10" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (p.ok) assert.equal(p.value.places.length, 12);
  assert.ok(!receiverPlan(s, vals({ place: "outline", by: "count", value: "3", corners: "each", offset: "10" })).ok);
});

test("a round face alone: a row round it at the middle of its height, spaced along the surface, in from its ends", () => {
  const { s: s0, face } = post();
  const s = select(s0, [face]);
  const p = receiverPlan(s, vals({ kind: "clearance", size: "M4", by: "count", value: "6", corners: "ignore", place: "midline" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (!p.ok) return;
  assert.equal(p.value.places.length, 6); // (a whole post: six round it)
  for (const c of p.value.places) { near(Math.hypot(c[0], c[1]), 10, 1e-6); near(c[2], 20, 1e-6); }
  near(p.value.spacing!, (2 * Math.PI * 10) / 6, 1e-6);
  const r = cutReceiver(s, vals({ kind: "clearance", size: "M4", by: "count", value: "4", corners: "ignore", place: "midline" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
});

// ---- a lid on an object (`in_949`): the cut goes through everything, the body of the face gives the defaults ----
const lidOn = (): { s: Session; lid: string } => {
  let s = createSession(kernel);
  const a = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [100, 60, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: a.lines, params: { depth: 20 } } });
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,20"))!.ref;
  const b = drawSquaredRectangle(scene(s), top as never, [0, 0, 20], [100, 60, 20], [1, 0, 0], [0, 1, 0]);
  s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: b.lines, params: { depth: 5, mode: "new" } } });
  const lid = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,25"))!.ref;
  return { s: select(s, [lid]), lid };
};
test("a lid on an object: the plan reaches through both bodies and the body of the face is the default clearance depth", () => {
  const { s } = lidOn();
  assert.ok(bodies(s).length >= 2, `${bodies(s).length} bodies`);
  const p = receiverPlan(s, vals({ kind: "drillTap", size: "M4", place: "centre" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (!p.ok) return;
  near(p.value.reach, 5, 1e-6);
  near(p.value.stack, 25, 1e-6);
  near(p.value.drill!, 5, 1e-6); // (clearance through the lid)
  near(p.value.depth, 5 + 6, 1e-6); // (and a pilot of 1.5 diameters past it)
  const c = receiverPlan(s, vals({ kind: "clearance", size: "M4", place: "centre" }));
  assert.ok(c.ok && c.value.depth > 25); // (a plain hole goes right through everything)
});
test("a lid on an object cut as drill + tap: clearance in the lid, the pilot in the body below, and the screw spans both", () => {
  const { s } = lidOn();
  const before = total(s);
  const r = cutReceiver(s, vals({ kind: "drillTap", size: "M4", fit: "medium", place: "centre", insert: "screw" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const screw = Math.min(...bodies(r.value).map((b) => b.volume ?? 1e9));
  const hosts = total(r.value) - screw;
  near(before - hosts, cyl(4.5, 5) + cyl(3.3, 6), 0.01);
});

// ---- the lines a face's edges give, the same on a flat face and a round one (`in_951`) ----
test("one edge stepped in to the middle of a flat face, and rows either side of it", () => {
  const { s } = block();
  const mid = receiverPlan(s, vals({ place: "midline", by: "count", value: "3", corners: "ignore" }));
  assert.ok(mid.ok, mid.ok ? "" : mid.error);
  if (mid.ok) for (const c of mid.value.places) near(c[1], 30, 1e-6); // (the longest edge is 100 long, the face 60 across)
  const two = receiverPlan(s, vals({ place: "midline", by: "count", value: "3", corners: "ignore", rowCount: "2", rowGap: "10" }));
  assert.ok(two.ok, two.ok ? "" : two.error);
  if (two.ok) { assert.equal(two.value.places.length, 6); assert.deepEqual([...new Set(two.value.places.map((c) => Math.round(c[1])))].sort((a, b) => a - b), [25, 35]); assert.equal(two.value.guide.length, 2); }
});
test("one edge stepped in, repeated in rows going in", () => {
  const { s } = block();
  const p = receiverPlan(s, vals({ place: "edge", by: "count", value: "2", corners: "ignore", offset: "6", rowCount: "3", rowGap: "8" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (p.ok) assert.deepEqual([...new Set(p.value.places.map((c) => Math.round(c[1])))].sort((a, b) => a - b), [6, 14, 22]);
  assert.ok(!receiverPlan(s, vals({ place: "edge", by: "count", value: "2", corners: "ignore", rowCount: "2", rowGap: "0" })).ok);
});
test("a round face gives the same lines as a flat one: a whole post has the lowest and the highest line round it, each stepped in along the axis", () => {
  const { s: s0, face } = post();
  const post1 = select(s0, [face]);
  // a whole post: the lowest and the highest line round it, each stepped in along the axis
  const p = receiverPlan(post1, vals({ place: "outline", by: "count", value: "4", corners: "ignore", offset: "5" }));
  assert.ok(p.ok, p.ok ? "" : p.error);
  if (!p.ok) return;
  assert.deepEqual([...new Set(p.value.places.map((q) => Math.round(q[2])))].sort((a, b) => a - b), [5, 35]);
  assert.equal(p.value.places.length, 8);
  assert.equal(p.value.guide.length, 2);
  const e = receiverPlan(post1, vals({ place: "edge", by: "count", value: "4", corners: "ignore", offset: "5" }));
  assert.ok(e.ok && e.value.places.every((q) => Math.abs(q[2] - 5) < 1e-6));
  const m = receiverPlan(post1, vals({ place: "midline", by: "count", value: "4", corners: "ignore", rowCount: "2", rowGap: "6" }));
  assert.ok(m.ok && new Set(m.value.places.map((q) => Math.round(q[2]))).size === 2);
});
