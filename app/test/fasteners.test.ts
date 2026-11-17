// The hex nut and the countersunk screw (`dec_parts_fastener_pilot`): the tables as read from the sources, what is calculated from them, the volumes the kernel makes, and the dialog.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
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
test("the dialog offers the families and sizes, shows the matching holes and its source, and asks the length only for a screw", () => {
  const nut = addPartDialog(addPartStart());
  assert.deepEqual(nut.fields.map((f) => f.id), ["family", "size", "source"]);
  assert.ok(nut.fields[1]!.note?.includes("clearance hole 3.2 / 3.4 / 3.6") && nut.fields[1]!.note?.includes("nut pocket 5.5"));
  const screw = addPartDialog({ family: "countersunk", size: "M6", length: "12" });
  assert.deepEqual(screw.fields.map((f) => f.id), ["family", "size", "length", "source"]);
  assert.ok(screw.fields[1]!.note?.includes("countersink 13.44 mm across at 90°"));
  assert.ok(String(screw.fields.find((f) => f.id === "source")!.value).includes("1997"));
  assert.equal(receiversText("M3", "nut").includes("tap drill 2.5"), true);
});
