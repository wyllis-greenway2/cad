// Fastener holes along a path (`dec_path_repeat`, step (d)): along the outline of the face, or along the lines selected, by the path repeat's rules.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawChain, drawCircle, drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { cutReceiver, receiverContext, receiverDialog, receiverStart, receiverStartFor, selectedFace } from "../src/interaction/addpart.ts";
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
test("an edge of the body selected with the face is a path: holes along it, taken onto the face", () => {
  const { s, top, V } = block();
  const sc = scene(s);
  const edge = Object.values(sc.parts).find((p) => p.kind === "line" && p.origin === "body" && !p.circle && p.ref.includes("e@0,0,8~100,0,8"))!.ref;
  const sel = select(s, [top, edge]);
  const f = selectedFace(sel);
  assert.ok(f.ok && f.value.lines.length === 1);
  const r = cutReceiver(sel, vals({ place: "lines", by: "count", value: "3", offset: "10", corners: "ignore" }));
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(total(r.value), V - 3 * cyl(4.5, 8)); // (the edge runs along +x, so its left is +y: 10 in from the edge)
});
test("rules that make no hole, or too many, are refused with the reason", () => {
  const { s } = block();
  assert.ok(!cutReceiver(s, vals({ place: "outline", by: "distance", value: "0" })).ok);
  const many = cutReceiver(s, vals({ place: "outline", by: "distance", value: "1", corners: "ignore", offset: "5" }));
  assert.ok(!many.ok && many.error.includes("200"), many.ok ? "" : many.error);
  const e = cutReceiver(s, vals({ place: "outline", by: "count", value: "4", corners: "each" }));
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
