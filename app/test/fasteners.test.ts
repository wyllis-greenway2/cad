// The hex nut and the countersunk screw (`dec_parts_fastener_pilot`): the tables as read from the sources, what is calculated from them, the volumes the kernel makes, and the dialog.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import { undoLast as undoOnce } from "../src/interaction/session.ts";
const undoLastOnce = undoOnce;
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
  assert.deepEqual(nut.fields.map((f) => f.id), ["family", "size", "picture"]);
  assert.ok(nut.fields[1]!.note?.includes("clearance hole 3.2 / 3.4 / 3.6") && nut.fields[1]!.note?.includes("nut pocket 5.5"));
  const screw = addPartDialog({ family: "countersunk", size: "M6", length: "12" });
  assert.deepEqual(screw.fields.map((f) => f.id), ["family", "size", "picture", "length"]);
  assert.ok(screw.fields[1]!.note?.includes("countersink 13.44 mm across at 90°"));
  assert.ok(screw.fields[0]!.note?.includes("1997") && !nut.fields[0]!.note?.includes("1997"), "the source shown follows the family");
  assert.ok(!screw.fields.find((f) => f.id === "length")!.note?.includes("0000000"), "a length shown without rounding noise");
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
  assert.deepEqual(d.fields.map((f) => f.id), ["kind", "size", "picture", "fit", "depth", "dx", "dy"]);
  assert.ok(d.fields.find((f) => f.id === "fit")!.choices!.some((c) => c.label === "medium (3.4 mm)"));
  assert.deepEqual(receiverDialog({ ...receiverStart(), kind: "tapped" }).fields.map((f) => f.id), ["kind", "size", "picture", "engagement", "depth", "dx", "dy"]);
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
  assert.deepEqual(f("socketHead").fields.map((x) => x.id), ["family", "size", "picture", "length", "head"]);
  assert.deepEqual(f("washer").fields.map((x) => x.id), ["family", "size", "picture"]);
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

// ---- the tapped hole's engagement ----
import { tapHole, chartEngagement, ENGAGEMENT_RANGE } from "../src/operation/fasteners.ts";

test("with no engagement the hole is the chart's drill, which is about 92% of the ISO basic engaged height for every size", () => {
  assert.deepEqual(FASTENER_SIZES.map((s) => tapHole(s)), [2.5, 3.3, 4.2, 5, 6.75]);
  for (const s of FASTENER_SIZES) near(chartEngagement(s), 1 / 1.0825, 0.001);
  assert.deepEqual(ENGAGEMENT_RANGE, [0.4, 1]);
});
test("less engagement is a bigger hole, by 1.0825 pitches over the whole range from nothing to full", () => {
  for (const [size, pitch] of [["M3", 0.5], ["M6", 1], ["M8", 1.25]] as const) {
    const d = Number(size.slice(1));
    assert.ok(Math.abs(tapHole(size, 1) - (d - 1.0825 * pitch)) < 0.0015, `${size} full`);
    assert.ok(Math.abs(tapHole(size, 0.75) - (d - 1.0825 * pitch * 0.75)) < 0.0015, `${size} 75%`);
    assert.ok(tapHole(size, 0.5) > tapHole(size, 0.75) && tapHole(size, 0.75) > tapHole(size, 1));
  }
});
test("a hole to tap is cut at the engagement typed, and the chart's drill when it is empty", () => {
  const at = (engagement: string) => { const r = cutReceiver(block().s, { ...base, kind: "tapped", size: "M6", depth: "6", engagement }); assert.ok(r.ok, r.ok ? "" : r.error); return volumes(r.value)[0]!; };
  near(at(""), V - cyl(6 - 1, 6));
  near(at("75"), V - cyl(tapHole("M6", 0.75), 6));
  near(at("75%"), V - cyl(tapHole("M6", 0.75), 6));
  assert.ok(at("50") < at("75") && at("75") < at("100"), "more engagement, more material left");
});
test("an engagement out of range or not a number is refused with a reason", () => {
  assert.ok(receiverProblem("tapped", "M6", "medium", 6, 0.2)?.includes("between 40% and 100%"));
  assert.ok(receiverProblem("tapped", "M6", "medium", 6, 1.2)?.includes("between 40% and 100%"));
  assert.equal(receiverProblem("tapped", "M6", "medium", 6, 0.75), null);
  const bad = cutReceiver(block().s, { ...base, kind: "tapped", engagement: "abc" });
  assert.ok(!bad.ok && bad.error.includes("percent"));
  const low = cutReceiver(block().s, { ...base, kind: "tapped", engagement: "10" });
  assert.ok(!low.ok && low.error.includes("40%"));
});
test("the dialog has the engagement for a hole to tap only, and says what hole it makes", () => {
  const t = (engagement: string) => receiverDialog({ ...receiverStart(), kind: "tapped", size: "M6", engagement });
  assert.deepEqual(t("").fields.map((f) => f.id), ["kind", "size", "picture", "engagement", "depth", "dx", "dy"]);
  assert.ok(t("").fields.find((f) => f.id === "engagement")!.note?.includes("hole 5 mm (the chart's drill: 92.4%"));
  assert.ok(t("75").fields.find((f) => f.id === "engagement")!.note?.includes(`hole ${tapHole("M6", 0.75)} mm`));
  assert.ok(t("x").fields.find((f) => f.id === "engagement")!.note?.includes("number of percent"));
  assert.ok(!receiverDialog(receiverStart()).fields.some((f) => f.id === "engagement"));
});

// ---- the standard lengths ----
import { STANDARD_LENGTHS, AVOID_LENGTHS, lengthStatus, nearbyLengths, lengthAdvice } from "../src/operation/fasteners.ts";
import { lengthAdviceOf } from "../src/interaction/addpart.ts";

test("the standard lengths are ISO 888 Table 1 without the bracketed ones, in order", () => {
  assert.deepEqual(STANDARD_LENGTHS.slice(0, 22), [2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90]);
  assert.equal(STANDARD_LENGTHS.at(-1), 500);
  assert.deepEqual([...STANDARD_LENGTHS].sort((a, b) => a - b), [...STANDARD_LENGTHS]);
  assert.equal(AVOID_LENGTHS.length, 18);
  assert.ok(!AVOID_LENGTHS.some((l) => STANDARD_LENGTHS.includes(l)), "a length is one or the other");
  assert.deepEqual([lengthStatus(16), lengthStatus(14), lengthStatus(13), lengthStatus(125), lengthStatus(100)], ["standard", "avoid", "other", "avoid", "standard"]);
});
test("the advice names the status and the nearest standard lengths, and is advice only", () => {
  assert.equal(lengthAdvice(16), "16 mm is a standard length (ISO 888)");
  assert.ok(lengthAdvice(14).includes("in brackets"));
  assert.equal(lengthAdvice(13), "13 mm is not a standard length: the standard lengths nearest are 12 and 16 mm");
  assert.deepEqual(nearbyLengths(13), [12, 16]);
  assert.deepEqual(nearbyLengths(1), [2]);
  assert.deepEqual(nearbyLengths(600), [500]);
  assert.equal(lengthAdvice(NaN), "");
  const r = addPart(createSession(kernel), { family: "socketHead", size: "M4", length: "13" });
  assert.ok(r.ok, "a length that is not a standard one is still made");
  assert.equal(lengthAdviceOf({ family: "socketHead", size: "M4", length: "13" }), lengthAdvice(13));
  assert.equal(lengthAdviceOf({ family: "socketHead", size: "M4", length: "12" }), "");
  assert.equal(lengthAdviceOf({ family: "nut", size: "M4", length: "13" }), "");
});
test("the length note in the dialog says what the number typed is and lists the standard lengths", () => {
  const note = (length: string) => addPartDialog({ family: "countersunk", size: "M5", length }).fields.find((f) => f.id === "length")!.note!;
  assert.ok(note("13").startsWith("13 mm is not a standard length: the standard lengths nearest are 12 and 16 mm."));
  assert.ok(note("20").startsWith("20 mm is a standard length (ISO 888)."));
  assert.ok(note("").startsWith("Standard lengths (ISO 888): 2, 3, 4, 5, 6, 8, 10"), "no advice for an empty box");
  assert.ok(note("20").includes("100 mm and longer") && note("20").includes("were not read"));
});

// ---- the hole at a picked place ----
import { drawCircle } from "../src/operation/build.ts";
import { placesPicked } from "../src/interaction/addpart.ts";

/** a 30 x 20 x 8 block with a 6 mm hole at (8, 10); the selection is returned for the caller to choose from */
const blockWithHole = (): { s: Session; refs: string[]; top: string; corner: string; edge: string; wall: string } => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), worldRef("XY"), [8, 10, 0], 3);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 8, holes: c.circle } } });
  const parts = Object.values(scene(s).parts);
  const named = (pred: (p: (typeof parts)[number]) => boolean) => parts.find(pred)!.ref;
  return {
    s, refs: parts.map((p) => p.ref),
    top: named((p) => p.kind === "plane" && p.origin === "body" && p.ref.endsWith("0,0,1,8")),
    corner: named((p) => p.kind === "corner" && p.origin === "body" && p.ref.endsWith("v@30,20,8")),
    edge: named((p) => p.kind === "line" && p.origin === "body" && !!p.circle && p.ref.includes("e@11,10,8")),
    wall: named((p) => p.kind === "plane" && p.origin === "body" && p.ref.includes("/c@")),
  };
};
const V2 = 30 * 20 * 8 - cyl(6, 8);

test("a corner picked with the face is where the hole goes: a hole at the corner is cut away from the block's edge", () => {
  const b = blockWithHole();
  const r = cutReceiver(select(b.s, [b.top, b.corner]), { ...base, kind: "clearance", size: "M4", fit: "medium", dx: "-5", dy: "-5" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(volumes(r.value)[0]!, V2 - cyl(4.5, 8));
  assert.equal(placesPicked(select(b.s, [b.top, b.corner])), 1);
});
test("the centre of a hole's circular edge and of its round wall are the same place: one hole there, bigger than the old one", () => {
  const b = blockWithHole();
  const sel = select(b.s, [b.top, b.edge, b.wall]);
  assert.equal(placesPicked(sel), 1, "two parts at one place are one place");
  const r = cutReceiver(sel, { ...base, kind: "clearance", size: "M8", fit: "coarse" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  near(volumes(r.value)[0]!, 30 * 20 * 8 - cyl(10, 8), 0.003); // (the 10 mm hole takes the 6 mm one in)
});
test("several places picked are several holes, made as one step to undo", () => {
  const b = blockWithHole();
  const sel = select(b.s, [b.top, b.corner, b.edge]);
  assert.equal(placesPicked(sel), 2);
  const r = cutReceiver(sel, { ...base, kind: "clearance", size: "M3", fit: "fine", dx: "-4", dy: "-4" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  const before = sel.history.scene.steps.length;
  near(volumes(r.value)[0]!, V2 - 2 * cyl(3.2, 8)); // (the typed offset is from each place: (26, 16) and (4, 6), both in the solid)
  assert.ok(r.value.history.scene.steps.length > before);
  assert.equal(undoLastOnce(r.value).history.scene.steps.length, before, "one undo takes all the holes");
});
test("what cannot place a hole is refused with a reason, and with no place picked the face's middle is used", () => {
  const b = blockWithHole();
  const noFace = select(b.s, [b.corner]);
  assert.equal(whyNoReceiver(noFace), "select one flat face of a body first");
  const body = b.refs.find((r) => r === "b/body/o")!;
  assert.ok(whyNoReceiver(select(b.s, [b.top, body]))?.includes("only corners, circles or lines"));
  const two = b.refs.filter((r) => r.includes("0,0,1,8") || r.includes("0,0,-1,0"));
  assert.ok(whyNoReceiver(select(b.s, two))?.includes("one flat face"));
  assert.equal(placesPicked(select(b.s, [b.top])), 0);
  assert.ok(receiverDialog(receiverStart(), 2).title.includes("(2)"));
  assert.ok(receiverDialog(receiverStart(), 1).fields.find((f) => f.id === "dx")!.label.includes("place picked"));
  assert.ok(receiverDialog(receiverStart(), 0).fields.find((f) => f.id === "dx")!.label.includes("its middle"));
});

// ---- the drawings in the pickers ----
import { partDrawing, receiverDrawing } from "../src/interaction/partdrawing.ts";
import { RECEIVER_KINDS } from "../src/operation/fasteners.ts";
import type { FastenerFamily, ReceiverKind } from "../src/operation/fasteners.ts";

const FAMILIES: FastenerFamily[] = ["nut", "countersunk", "socketHead", "washer"];
const numbersIn = (svg: string): number[] => (svg.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
test("a part is drawn for every family and size: a closed SVG with outlines, and nothing not a number or a path", () => {
  for (const family of FAMILIES) for (const size of FASTENER_SIZES) {
    const svg = partDrawing(family, size, 12, false);
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${family} ${size}`);
    assert.ok((svg.match(/<(path|circle)/g) ?? []).length >= 2, "a side view and a top view");
    assert.ok(!svg.includes("NaN") && !svg.includes("undefined") && !svg.includes("Infinity"), `${family} ${size} has a bad number`);
    assert.ok(!/<script|onload|onclick|javascript:/i.test(svg));
  }
});
test("the drawing keeps the proportions: a longer screw is a taller drawing, and a smooth head is a narrower one than a knurled", () => {
  const height = (svg: string): number => Number(/viewBox="[-\d.]+ [-\d.]+ [\d.]+ ([\d.]+)"/.exec(svg)![1]);
  const width = (svg: string): number => Number(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) /.exec(svg)![1]);
  assert.ok(height(partDrawing("socketHead", "M5", 30, false)) > height(partDrawing("socketHead", "M5", 10, false)));
  assert.ok(width(partDrawing("socketHead", "M8", 10, false)) > width(partDrawing("socketHead", "M3", 10, false)), "a bigger size is a bigger drawing");
  const d = (smooth: boolean) => partDrawing("socketHead", "M5", 12, smooth);
  assert.notEqual(d(true), d(false));
  assert.ok(width(d(true)) < width(d(false)) + 1e-9);
});
test("a hole is drawn across, for every receiver and size, with the block and the hole as one path", () => {
  for (const kind of RECEIVER_KINDS.map((k) => k.id) as ReceiverKind[]) for (const size of FASTENER_SIZES) {
    const svg = receiverDrawing(kind, size, "medium");
    assert.ok(svg.startsWith("<svg") && svg.includes('fill-rule="evenodd"'), `${kind} ${size}`);
    assert.ok(!svg.includes("NaN") && !svg.includes("undefined"), `${kind} ${size}`);
  }
  assert.notEqual(receiverDrawing("clearance", "M6", "medium"), receiverDrawing("countersunk", "M6", "medium"));
  assert.notEqual(receiverDrawing("clearance", "M6", "fine"), receiverDrawing("clearance", "M6", "coarse"));
  assert.ok(numbersIn(receiverDrawing("nutPocket", "M8", "medium")).length > 20);
});
test("the pickers are visual: family and receiver cards carry a drawing each, sizes and fits are chips, and a picture shows the choice", () => {
  const add = addPartDialog(addPartStart());
  const family = add.fields.find((f) => f.id === "family")!;
  assert.equal(family.layout, "cards");
  assert.ok(family.choices!.length === 4 && family.choices!.every((c) => c.image?.startsWith("<svg")), "a drawing on every card");
  assert.equal(add.fields.find((f) => f.id === "size")!.layout, "chips");
  const pic = add.fields.find((f) => f.id === "picture")!;
  assert.equal(pic.type, "picture");
  assert.ok(String(pic.value).startsWith("<svg"));
  assert.notEqual(String(addPartDialog({ ...addPartStart(), size: "M8" }).fields.find((f) => f.id === "picture")!.value), String(pic.value), "the picture follows the size");
  const hole = receiverDialog(receiverStart());
  assert.equal(hole.fields.find((f) => f.id === "kind")!.layout, "cards");
  assert.ok(hole.fields.find((f) => f.id === "kind")!.choices!.every((c) => c.image?.startsWith("<svg")));
  assert.equal(hole.fields.find((f) => f.id === "fit")!.layout, "chips");
  assert.equal(hole.fields.find((f) => f.id === "picture")!.type, "picture");
  const halfTyped = addPartDialog({ family: "countersunk", size: "M5", length: "1" }).fields.find((f) => f.id === "picture")!;
  assert.ok(!String(halfTyped.value).includes("NaN"), "a length that cannot be made does not break the picture");
});

// ---- Shape, Models in the right-click ring ----
import { createState, reduce } from "../src/interaction/controller.ts";

type Item = { id: string; label: string; enabled: boolean; why: string | null; children?: Item[] };
const ringOf = (session: Session): Item[] => reduce({ ...createState(session) }, { type: "menu", x: 400, y: 300, button: true }, { w: 800, h: 600, now: 0 }).menu!.items as unknown as Item[];
const find = (items: Item[], id: string): Item | undefined => { for (const i of items) { if (i.id === id) return i; const f = i.children ? find(i.children, id) : undefined; if (f) return f; } return undefined; };

test("the right-click ring has Models under Shape, with Fasteners and Fastener Holes in it", () => {
  const items = ringOf(createSession(kernel));
  const shape = items.find((i) => i.id === "shape")!;
  const models = shape.children!.find((i) => i.id === "models")!;
  assert.equal(models.label, "Models");
  assert.deepEqual(models.children!.map((c) => [c.id, c.label]), [["models:fasteners", "Fasteners"], ["models:holes", "Fastener Holes"]]);
  assert.equal(find(items, "models:fasteners")!.enabled, true, "Fasteners is always there to use");
});
test("Fastener Holes is dimmed with its reason until one flat face is selected", () => {
  const none = find(ringOf(createSession(kernel)), "models:holes")!;
  assert.equal(none.enabled, false);
  assert.equal(none.why, "select one flat face of a body first");
  const { s } = block();
  const yes = find(ringOf(s), "models:holes")!;
  assert.equal(yes.enabled, true);
  assert.equal(yes.why, null);
});
test("the ⋯ list no longer holds Add part or Fastener hole: they are in the ring", async () => {
  const { appRows } = await import("../src/interaction/appmenu.ts");
  const ids = appRows().map((r) => r.id);
  assert.ok(!ids.includes("addPart") && !ids.includes("fastenerHole"));
});
