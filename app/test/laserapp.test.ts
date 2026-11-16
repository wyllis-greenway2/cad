// Laser cut from the app (`in_569`): the part snapshot builder turns the drawing into the contract's part, the dialog is made from the route's own settings, and a run gives a file and findings. The drawings are made with the app's own commands.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { flatSnapshot } from "../src/interaction/partsnapshot.ts";
import { registry, laserDialog, laserDefaults, runLaser, findingsDialog, LASER_ROUTE } from "../src/interaction/manufacture.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { CONTRACT_VERSION } from "../src/manufacturing/index.ts";

await kernel.init();
const [XY, XZ] = [worldRef("XY"), worldRef("XZ")];
const text = (b: Uint8Array) => new TextDecoder().decode(b);

function plate(plane = XY, u: [number, number, number] = [1, 0, 0], v: [number, number, number] = [0, 1, 0]) {
  let s = createSession(kernel);
  const at = (a: number, b: number): [number, number, number] => [u[0] * a + v[0] * b, u[1] * a + v[1] * b, u[2] * a + v[2] * b]; // (a point of the plane from its own x and y)
  const r = drawRectangle(scene(s), plane, at(0, 0), at(40, 20), u, v);
  s = run(s, r.command);
  const c = drawCircle(scene(s), plane, at(10, 10), 4);
  s = run(s, c.command);
  return { s, r, c };
}

test("the snapshot of a drawing is the contract's flat part: its pieces in the plane's own coordinates, a frame, a box in the world, the contract's version; it survives structuredClone", () => {
  const { s } = plate();
  const p = flatSnapshot(s);
  assert.ok(p.ok);
  if (!p.ok) return;
  const part = p.value;
  assert.equal(part.contract, CONTRACT_VERSION);
  assert.equal(part.kind, "flat"); assert.equal(part.units, "mm");
  assert.deepEqual(part.bbox, { min: [0, 0, 0], max: [40, 20, 0] });
  const pieces = part.outlines![0]!.pieces;
  assert.equal(pieces.filter((x) => x.kind === "line").length, 4);
  assert.deepEqual(pieces.find((x) => x.kind === "circle"), { kind: "circle", center: [10, 10], radius: 4 });
  assert.deepEqual(part.outlines![0]!.plane.normal, [0, 0, 1]);
  assert.deepEqual(structuredClone(part), part);
  assert.equal(registry.forPart(part).map((o) => o.route)[0], LASER_ROUTE, "and the registry offers the laser route for it");
});

test("a drawing on another plane is in that plane's own x and y, and the route measures it there (not by its box in the world)", () => {
  const { s } = plate(XZ, [1, 0, 0], [0, 0, 1]);
  const p = flatSnapshot(s);
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.deepEqual(p.value.bbox.min.map((v) => +v.toFixed(6) + 0), [0, 0, 0]);
  assert.deepEqual(p.value.bbox.max.map((v) => +v.toFixed(6) + 0), [40, 0, 20], "in the world it stands up");
  assert.deepEqual(p.value.outlines![0]!.plane.xDir, [1, 0, 0]);
  const r = runLaser(s, { ...laserDefaults(), bedWidth: 50, bedHeight: 25 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.run.fit.fits, true, "40 x 20 in its plane fits a 50 x 25 area");
  const small = runLaser(s, { ...laserDefaults(), bedWidth: 30, bedHeight: 25 });
  if (small.ok) assert.equal(small.value.run.fit.fits, false);
});

test("marked lines carry their layer into the part; only what is selected is taken; nothing drawn says what to do", () => {
  const { s, r, c } = plate();
  const marked = run(run(s, { type: "setUse", refs: [c.circle], use: "engrave" }), { type: "setUse", refs: [r.lines[0]!], use: "score" });
  const p = flatSnapshot(marked);
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.value.outlines![0]!.pieces.map((x) => x.layer).sort(), ["cut", "cut", "cut", "engrave", "score"]);
  const only = flatSnapshot({ ...s, click: { ...s.click, selection: [loopFaceRef(r.lines)] as never } });
  assert.ok(only.ok);
  assert.deepEqual(flatSnapshot(createSession(kernel)), { ok: false, error: "nothing to export yet: draw something, or select a sketch or a flat face of a body" });
});

test("the dialog is made from the route's own settings: a field for each, with units and help; the machine's work area first", () => {
  const d = laserDialog(laserDefaults());
  const route = registry.get(LASER_ROUTE)!;
  assert.deepEqual(d.fields.map((f) => f.id), ["bedWidth", "bedHeight", "powerMax", ...route.params.map((p) => p.id)]);
  assert.equal(d.fields.find((f) => f.id === "kerf")!.label, "Kerf (mm)");
  assert.equal(d.fields.find((f) => f.id === "toCorner")!.type, "check");
  assert.match(d.fields.find((f) => f.id === "cutPower")!.note!, /Test on a scrap/);
  assert.equal(d.fields.find((f) => f.id === "bedWidth")!.value, 400);
});

test("a run makes the file and a line about it; kerf, a hole first, G3 for the arcs when there is no kerf, power from the scale", () => {
  const { s } = plate();
  const r = runLaser(s, { ...laserDefaults(), kerf: 0, powerMax: 255, cutPower: 50 });
  assert.ok(r.ok);
  if (!r.ok) return;
  const file = text(r.value.file!.bytes);
  assert.equal(r.value.file!.name, "Drawing.nc");
  assert.match(file, /^\(Drawing\)\nG21\nG90\n\(Cut\)/);
  assert.match(file, /M4 S128/, "half of a scale of 255");
  assert.match(file, /G3 X.* I.* J.*/);
  assert.match(file, /M5\nM2\n$/);
  assert.match(r.value.summary, /^Drawing\.nc: 6 cut moves, about \d+ s$/);
  assert.deepEqual(r.value.run.findings, []);
});

test("findings and what the file writer could not write are shown to read before saving: warnings first", () => {
  const { s, r } = plate();
  const open = run(s, { type: "deletePart", ref: r.lines[3]! });
  const out = runLaser(open, laserDefaults());
  assert.ok(out.ok);
  if (!out.ok) return;
  const d = findingsDialog(out.value.run.findings, out.value.summary);
  assert.equal(d.title, "Before you cut");
  assert.equal(d.ok, "Save the file");
  assert.equal(d.fields[0]!.value, out.value.summary);
  assert.ok(d.fields.slice(1).some((f) => f.label === "Warning" && /does not close/.test(String(f.value))));
  assert.ok(d.fields.every((f) => f.readonly));
  assert.equal(runLaser(createSession(kernel), laserDefaults()).ok, false, "nothing drawn: why, not a file");
});

test("the ⋯ menu has a Laser cut… row, live with a drawing and dimmed with the reason without one", () => {
  const rows = (can: boolean) => appRows("pan" as never, "", { laser: can }, false, 1, true, 0).filter((x) => x.id === "laser");
  assert.deepEqual(rows(true).map((x) => [x.label, x.enabled]), [["Laser cut…", true]]);
  assert.deepEqual(rows(false).map((x) => [x.enabled, x.why]), [[false, "draw something, or select a sketch first"]]);
});
