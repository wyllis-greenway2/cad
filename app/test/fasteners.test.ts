// The hex nut and the countersunk screw (`dec_parts_fastener_pilot`): the tables as read from the sources, what is calculated from them, the volumes the kernel makes, and the dialog.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { undoLast as undoOnce } from "../src/interaction/session.ts";
import { addPart, addPartDialog, addPartStart, addPartSteps } from "../src/interaction/addpart.ts";
import { FASTENER_SIZES, clearanceHole, tapDrill, countersink, nutTrap, nutDims, countersunkDims, countersunkProfile, hexagon, lengthProblem, receiversText } from "../src/operation/fasteners.ts";

await kernel.init();
const volumes = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => (p as { volume?: number }).volume ?? 0);
const near = (a: number, b: number, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} against ${b}`);

test("the clearance holes are the ISO 273 values (fine, medium, coarse), M3 included", () => {
  assert.deepEqual(FASTENER_SIZES.map((s) => [clearanceHole(s, "fine"), clearanceHole(s, "medium"), clearanceHole(s, "coarse")]), [[3.2, 3.4, 3.6], [4.3, 4.5, 4.8], [5.3, 5.5, 5.8], [6.4, 6.6, 7], [8.4, 9, 10]]);
});
test("the tap drill is the nominal diameter less the pitch, as the chart gives it", () => {
  assert.deepEqual(FASTENER_SIZES.map(tapDrill), [2.5, 3.3, 4.2, 5, 6.75]);
});
test("the nut's numbers are those of ISO 4032, and its pocket is the nut itself", () => {
  assert.deepEqual([nutDims("M3").acrossFlats.max, nutDims("M3").thickness.max, nutDims("M3").acrossCorners.min], [5.5, 2.4, 6.01]);
  assert.deepEqual([nutDims("M5").thickness.max, nutDims("M5").thickness.min], [4.7, 4.4]); // (not the 4.0 of DIN 934)
  assert.deepEqual([nutDims("M8").acrossFlats.max, nutDims("M8").thickness.max, nutDims("M8").acrossFlats.min], [13, 6.8, 12.73]);
  const t = nutTrap("M8");
  assert.deepEqual([t.acrossFlats, t.depth], [13, 6.8]);
  assert.ok(Math.abs(t.acrossCorners - 15.011) < 0.001);
  assert.ok(t.acrossCorners > nutDims("M8").acrossCorners.min, "the pocket's corners are at the nominal flats, a little past the nut's smallest corner width");
});
test("a countersunk head is a 90 degree cone whose height is the table's: (head - shank) / 2", () => {
  for (const s of FASTENER_SIZES) {
    const d = countersunkDims(s);
    near((d.head.theoretical - d.shank.max) / 2, d.headHeight, 0.001);
    assert.equal(countersink(s).angle, 90);
    assert.equal(countersink(s).depth, d.headHeight);
  }
  assert.deepEqual([countersunkDims("M4").head.theoretical, countersunkDims("M4").headHeight, countersunkDims("M6").socket.depthMin], [8.96, 2.48, 2.2]);
});
test("the hexagon has the width across flats it was asked for", () => {
  const h = hexagon(13);
  assert.equal(h.length, 6);
  const flat = Math.hypot(h[1]![0] - h[0]![0], h[1]![1] - h[0]![1]); // (a side is as long as the corner circle's radius)
  near(flat, 13 / Math.sqrt(3), 1e-9);
  near(Math.max(...h.map((p) => p[0])) - Math.min(...h.map((p) => p[0])), 13, 1e-9); // (across flats, along the first axis)
  near(Math.max(...h.map((p) => p[1])) - Math.min(...h.map((p) => p[1])), 15.011, 0.0001); // (across corners, along the second)
});
test("a screw too short for its head is refused, and says why", () => {
  assert.ok(lengthProblem("M8", 3)?.includes("more than 5.46"));
  assert.equal(lengthProblem("M8", 20), null);
  assert.equal(lengthProblem("M8", NaN), "the length is not a number");
  const r = addPartSteps({ family: "countersunk", size: "M8", length: "3" });
  assert.ok(!r.ok);
  assert.ok(!addPartSteps({ family: "nut", size: "M9", length: "" }).ok);
  assert.ok(!addPartSteps({ family: "countersunk", size: "M8", length: "abc" }).ok);
});
test("a nut made by the kernel has the volume of the hexagon less the hole, times its thickness", () => {
  for (const size of FASTENER_SIZES) {
    const r = addPart(createSession(kernel), { family: "nut", size, length: "" });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const d = nutDims(size);
    near(volumes(r.value)[0]!, ((Math.sqrt(3) / 2) * d.acrossFlats.max ** 2 - Math.PI * (Number(size.slice(1)) / 2) ** 2) * d.thickness.max);
    assert.equal(volumes(r.value).length, 1);
  }
});
test("a countersunk screw made by the kernel is the cone and the shank less the hexagon socket", () => {
  for (const [size, length] of [["M3", 8], ["M6", 20], ["M8", 25]] as const) {
    const r = addPart(createSession(kernel), { family: "countersunk", size, length: String(length) });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const d = countersunkDims(size);
    const [R, rr, k] = [d.head.theoretical / 2, d.shank.max / 2, d.headHeight];
    const solid = (Math.PI * k / 3) * (R * R + R * rr + rr * rr) + Math.PI * rr * rr * (length - k);
    near(volumes(r.value)[0]!, solid - (Math.sqrt(3) / 2) * d.socket.acrossFlats ** 2 * d.socket.depthMin);
    assert.equal(volumes(r.value).length, 1);
  }
});
test("the outline of the screw starts on the axis at the top of the head and ends on the axis at the point", () => {
  const p = countersunkProfile("M5", 16);
  assert.deepEqual([p[0], p[p.length - 1]], [[0, 0], [0, -16]]);
  assert.deepEqual(p[1], [5.6, 0]);
});
test("a part is one command, so it is one step to undo and the kernel is asked once", () => {
  const r = addPart(createSession(kernel), { family: "countersunk", size: "M5", length: "12" });
  assert.ok(r.ok);
  assert.equal(r.value.history.scene.steps.length, 2, "a revolve and a cut");
  const back = undoOnce(r.value);
  assert.equal(back.history.scene.steps.length, 0);
});
test("the dialog offers the families and sizes, shows the matching holes and its source, and asks the length only for a screw", () => {
  const nut = addPartDialog(addPartStart());
  assert.deepEqual(nut.fields.map((f) => f.id), ["family", "size"]);
  assert.ok(nut.fields[1]!.note?.includes("clearance hole 3.2 / 3.4 / 3.6") && nut.fields[1]!.note?.includes("nut pocket 5.5"));
  const screw = addPartDialog({ family: "countersunk", size: "M6", length: "12" });
  assert.deepEqual(screw.fields.map((f) => f.id), ["family", "size", "length"]);
  assert.ok(screw.fields[1]!.note?.includes("countersink 13.44 mm across at 90°"));
  assert.ok(screw.fields[0]!.note?.includes("1997") && !nut.fields[0]!.note?.includes("1997"), "the source shown follows the family");
  assert.ok(!screw.fields[2]!.note?.includes("0000000"), "a length shown without rounding noise");
  assert.equal(receiversText("M3", "nut").includes("tap drill 2.5"), true);
});

// ---- the receivers cut into a body ----
import { worldRef } from "../src/shared/ref.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { cutReceiver, receiverDialog, receiverStart, selectedFace, whyNoReceiver } from "../src/interaction/addpart.ts";
import { receiverProblem, receiverProfile } from "../src/operation/fasteners.ts";

const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
/** a 20 x 10 x 8 block, with its top face selected */
const block = (): { s: Session; top: string } => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 8 } } });
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,8"))!.ref;
  return { s: select(s, [top]), top };
};
const V = 20 * 10 * 8;
const cyl = (d: number, h: number) => Math.PI * (d / 2) ** 2 * h;
const base = receiverStart();

test("a face must be selected, one flat face of a body, for a receiver to be cut", () => {
  assert.equal(whyNoReceiver(select(block().s, [])), "select one flat face of a body first");
  const { s, top } = block();
  const f = selectedFace(s);
  assert.ok(f.ok);
  assert.deepEqual(f.value.spot.centre, [10, 5, 8], "the middle of the face");
  assert.ok(f.value.through > 20, "through is the whole reach of the body");
  assert.equal(whyNoReceiver(s), null);
  assert.equal(top.includes("0,0,1,8"), true);
});
test("a clearance hole takes out a cylinder of the ISO 273 diameter, through the body", () => {
  for (const [size, fit, d] of [["M4", "medium", 4.5], ["M3", "fine", 3.2], ["M8", "coarse", 10]] as const) {
    const r = cutReceiver(block().s, { ...base, kind: "clearance", size, fit });
    assert.ok(r.ok, r.ok ? "" : r.error);
    near(volumes(r.value).reduce((a, b) => a + b, 0), V - cyl(d, 8)); // (the M8 coarse hole is as wide as the block and parts it in two: all the pieces are counted)
  }
});
test("a hole to tap is the tap drill, to the depth typed", () => {
  const r = cutReceiver(block().s, { ...base, kind: "tapped", size: "M5", depth: "6" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(volumes(r.value)[0]!, V - cyl(4.2, 6));
});
test("a countersunk clearance hole is a hole with a 90 degree cone at its mouth", () => {
  const r = cutReceiver(block().s, { ...base, kind: "countersunk", size: "M4", fit: "medium" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const [big, small] = [8.96 / 2, 4.5 / 2];
  const cone = big - small;
  near(volumes(r.value)[0]!, V - ((Math.PI * cone) / 3) * (big * big + big * small + small * small) - cyl(4.5, 8 - cone));
});
test("a nut pocket is the hexagon of the nut, its depth the nut's thickness, with the hole through", () => {
  const r = cutReceiver(block().s, { ...base, kind: "nutPocket", size: "M4", fit: "medium" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const hex = (Math.sqrt(3) / 2) * 49 - Math.PI * 2.25 ** 2;
  near(volumes(r.value)[0]!, V - cyl(4.5, 8) - hex * 3.2);
});
test("a hole is put as far from the middle as typed, and the same hole off the face is refused only by the kernel's rules", () => {
  const r = cutReceiver(block().s, { ...base, kind: "clearance", size: "M3", fit: "fine", dx: "5", dy: "-2" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(volumes(r.value)[0]!, V - cyl(3.2, 8));
});
test("numbers that make no receiver are refused with a reason", () => {
  assert.ok(receiverProblem("countersunk", "M8", "fine", 2)?.includes("deeper"));
  assert.ok(receiverProblem("nutPocket", "M8", "medium", 6)?.includes("through"));
  assert.ok(receiverProblem("clearance", "M3", "fine", 0)?.includes("above zero"));
  const bad = cutReceiver(block().s, { ...base, kind: "clearance", depth: "abc" });
  assert.ok(!bad.ok && bad.error.includes("numbers"));
  assert.ok(!cutReceiver(select(block().s, []), base).ok);
  assert.ok(!cutReceiver(block().s, { ...base, size: "M9" }).ok);
});
test("the receiver's outline starts and ends on the axis and its countersink is 45 degrees to it", () => {
  const p = receiverProfile("countersunk", "M6", "medium", 10);
  assert.deepEqual([p[0]![0], p[p.length - 1]![0]], [0, 0]);
  const [flat, cone] = [p[2]!, p[3]!]; // (the mouth, then where the cone meets the hole)
  assert.ok(Math.abs((flat[0] - cone[0]) - (flat[1] - cone[1])) < 1e-9);
});
test("the dialog lists the receivers, sizes and clearances, and takes the clearance away for a hole to tap", () => {
  const d = receiverDialog(receiverStart());
  assert.deepEqual(d.fields.map((f) => f.id), ["kind", "size", "fit", "depth", "dx", "dy"]);
  assert.ok(d.fields[2]!.choices!.some((c) => c.label === "medium (3.4 mm)"));
  assert.deepEqual(receiverDialog({ ...receiverStart(), kind: "tapped" }).fields.map((f) => f.id), ["kind", "size", "depth", "dx", "dy"]);
});

// ---- the washer and the socket head cap screw ----
import { washerDims, socketHeadDims, socketHeadProfile, socketLengthProblem, counterbore, COUNTERBORE_EXTRA } from "../src/operation/fasteners.ts";

test("the washer's numbers are those of ISO 7089 as the two sources give them", () => {
  assert.deepEqual([washerDims("M3").inside.nom, washerDims("M3").outside.nom, washerDims("M3").thickness.nom], [3.2, 7, 0.5]);
  assert.deepEqual([washerDims("M8").inside.nom, washerDims("M8").outside.nom, washerDims("M8").thickness.nom, washerDims("M8").outside.min], [8.4, 16, 1.6, 15.57]);
  for (const s of FASTENER_SIZES) {
    const w = washerDims(s);
    assert.equal(w.inside.nom, clearanceHole(s, "fine"), "the washer's hole is the fine clearance hole");
    near(w.thickness.nom, (w.thickness.max + w.thickness.min) / 2, 1e-9);
  }
});
test("the socket head screw's numbers are those of ISO 4762 as CDE and omdl give them", () => {
  const m4 = socketHeadDims("M4");
  assert.deepEqual([m4.head.max, m4.head.min, m4.headHeight.max, m4.socket.acrossFlats, m4.socket.depthMin], [7.22, 6.78, 4, 3, 2]);
  assert.deepEqual(FASTENER_SIZES.map((s) => socketHeadDims(s).socket.depthMin), [1.3, 2, 2.5, 3, 4]);
  assert.deepEqual(FASTENER_SIZES.map((s) => socketHeadDims(s).head.max), [5.68, 7.22, 8.72, 10.22, 13.27]);
  for (const s of FASTENER_SIZES) assert.equal(socketHeadDims(s).headHeight.max, Number(s.slice(1)), "the head is as high as the screw is wide");
});
test("a washer made by the kernel is the ring: the outside disc less the hole, times the thickness", () => {
  for (const size of FASTENER_SIZES) {
    const r = addPart(createSession(kernel), { family: "washer", size, length: "" });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const w = washerDims(size);
    near(volumes(r.value)[0]!, Math.PI * ((w.outside.nom / 2) ** 2 - (w.inside.nom / 2) ** 2) * w.thickness.nom);
    assert.equal(volumes(r.value).length, 1);
  }
});
test("a socket head screw made by the kernel is the head and the shank less the hexagon socket, in one step", () => {
  for (const [size, length] of [["M3", 10], ["M5", 16], ["M8", 30]] as const) {
    const r = addPart(createSession(kernel), { family: "socketHead", size, length: String(length) });
    assert.ok(r.ok, r.ok ? "" : r.error);
    const d = socketHeadDims(size);
    const solid = Math.PI * (d.head.max / 2) ** 2 * d.headHeight.max + Math.PI * (d.shank.max / 2) ** 2 * length;
    near(volumes(r.value)[0]!, solid - (Math.sqrt(3) / 2) * d.socket.acrossFlats ** 2 * d.socket.depthMin);
    assert.equal(r.value.history.scene.steps.length, 2);
  }
  assert.deepEqual([socketHeadProfile("M3", 10)[0], socketHeadProfile("M3", 10)[5]], [[0, 0], [0, -13]]);
  assert.equal(socketLengthProblem("M3", 0.2)?.includes("0.5"), true);
  assert.ok(!addPartSteps({ family: "socketHead", size: "M3", length: "0" }).ok);
});
test("a counterbore for a socket head screw is the head's width plus the rule's extra, as deep as the head is high", () => {
  assert.equal(COUNTERBORE_EXTRA, 0.5);
  assert.deepEqual([counterbore("M4").diameter, counterbore("M4").depth], [7.72, 4]);
  const r = cutReceiver(block().s, { ...base, kind: "counterbore", size: "M4", fit: "medium" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(volumes(r.value)[0]!, V - cyl(7.72, 4) - cyl(4.5, 4));
  assert.ok(receiverProblem("counterbore", "M8", "medium", 6)?.includes("deeper"));
  assert.ok(receiversText("M4", "socketHead").includes("counterbore 7.72 mm across and 4 mm deep (our rule"));
});
test("the dialog offers four families, asks the length for both screws only, and shows each family's own source", () => {
  const f = (family: string) => addPartDialog({ family, size: "M5", length: "12" });
  assert.deepEqual(f("nut").fields[0]!.choices!.map((c) => c.value), ["nut", "countersunk", "socketHead", "washer"]);
  assert.deepEqual(f("socketHead").fields.map((x) => x.id), ["family", "size", "length", "head"]);
  assert.deepEqual(f("washer").fields.map((x) => x.id), ["family", "size"]);
  assert.ok(f("socketHead").fields[0]!.note?.includes("CDE Fasteners") && f("washer").fields[0]!.note?.includes("Westfield"));
  assert.ok(f("socketHead").fields[1]!.note?.includes("counterbore"));
  assert.ok(receiverDialog({ ...receiverStart(), kind: "counterbore" }).fields[1]!.note?.includes("counterbore"));
});
test("a message names the family as the person chose it", async () => {
  const { familyName } = await import("../src/interaction/addpart.ts");
  assert.deepEqual(["nut", "countersunk", "socketHead", "washer"].map(familyName), ["hex nut", "countersunk socket screw", "socket head cap screw", "flat washer"]);
});

test("the smooth head is the narrower head of ISO 4762: its own largest diameters, and a screw drawn with it has the narrower head", () => {
  assert.deepEqual(FASTENER_SIZES.map((s) => socketHeadDims(s).head.smooth), [5.5, 7, 8.5, 10, 13]);
  assert.deepEqual(FASTENER_SIZES.map((s) => socketHeadDims(s).head.max), [5.68, 7.22, 8.72, 10.22, 13.27]);
  for (const s of FASTENER_SIZES) assert.ok(socketHeadDims(s).head.smooth < socketHeadDims(s).head.max && socketHeadDims(s).head.smooth > socketHeadDims(s).head.min);
  assert.equal(socketHeadProfile("M3", 10, true)[1]![0], 2.75);
  assert.equal(socketHeadProfile("M3", 10)[1]![0], 2.84);
  const [size, length] = ["M5", 16] as const;
  const mk = (head: string) => { const r = addPart(createSession(kernel), { family: "socketHead", size, length: String(length), head }); assert.ok(r.ok, r.ok ? "" : r.error); return volumes(r.value)[0]!; };
  const d = socketHeadDims(size);
  const solid = (dia: number) => Math.PI * (dia / 2) ** 2 * d.headHeight.max + Math.PI * (d.shank.max / 2) ** 2 * length - (Math.sqrt(3) / 2) * d.socket.acrossFlats ** 2 * d.socket.depthMin;
  near(mk("smooth"), solid(d.head.smooth));
  near(mk("knurled"), solid(d.head.max));
  assert.ok(mk("smooth") < mk("knurled"));
  const dlg = addPartDialog({ family: "socketHead", size: "M3", length: "8", head: "smooth" }).fields.find((x) => x.id === "head")!;
  assert.equal(dlg.value, "smooth");
  assert.deepEqual(dlg.choices!.map((c) => c.label), ["knurled, largest 5.68 mm across", "smooth, largest 5.5 mm across"]);
  assert.equal(addPartDialog({ family: "socketHead", size: "M3", length: "8" }).fields.find((x) => x.id === "head")!.value, "knurled", "knurled unless asked");
});
