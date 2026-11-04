import test from "node:test";
import assert from "node:assert/strict";
import { settings } from "../src/settings.js";
import { SketchSession } from "../src/interaction.mjs";
import { snap, regionsOf, hitRegion, regionToSketchOp, zOnVerticalLineFromRay } from "../src/sketch.mjs";
import { loadOC } from "../src/oc.mjs";
import { compile, finalSolid, volume, bounds } from "../src/interpreter.mjs";

const session = () => {
  const s = new SketchSession(settings);
  s.scale = 4; // 4 px per mm -> 12 px snap threshold = 3 mm
  return s;
};
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

test("rectangle tool: two clicks make one rect and one region", () => {
  const s = session();
  s.setTool("rect");
  s.click([0, 0], { shift: true });
  assert.ok(s.draftShape());
  s.click([40, 25], { shift: true });
  assert.equal(s.entities.length, 1);
  const [r] = regionsOf(s.entities);
  close(r.area, 1000);
  assert.deepEqual(r.centroid, [20, 12.5]);
});

test("snapping: endpoint wins within the pixel threshold, shift disables it", () => {
  const s = session();
  s.setTool("rect");
  s.click([0, 0], { shift: true });
  s.click([40, 25], { shift: true });
  s.setTool("circle");
  assert.deepEqual(s.move([41.5, 24]).point, [40, 25]); // 1.8 mm away < 3 mm
  assert.equal(s.snapInfo.kind, "endpoint");
  assert.deepEqual(s.move([41.5, 24], { shift: true }).point, [41.5, 24]);
  assert.equal(s.snapInfo.kind, "free");
});

test("free-placed points are rounded to 0.01 mm so dimensions read cleanly", () => {
  const s = session();
  s.setTool("rect");
  s.click([-19.9999995, -15.0000007], { shift: true });
  s.click([19.999999, 15.0000004], { shift: true });
  const [r] = regionsOf(s.entities);
  assert.deepEqual([r.w, r.d], [40, 30]);
  assert.deepEqual(r.centroid, [0, 0]);
  assert.equal(s.move([12.3456, 0.004], { shift: true }).point[0], 12.35);
});

test("snapping threshold is in screen space: same pixels, different mm at other zooms", () => {
  const e = [{ id: "e_001", type: "circle", cx: 50, cy: 50, r: 10 }];
  const ctx = (scale) => ({ entities: e, extra: [], anchor: null, scale, settings });
  // 2 mm off the centre: inside 12 px at 4 px/mm (3 mm) but outside at 20 px/mm (0.6 mm)
  assert.equal(snap([52, 50], ctx(4)).kind, "center");
  assert.notEqual(snap([52, 50], ctx(20)).kind, "center");
});

test("inference aligns with an existing point's x and reports a guide", () => {
  const s = session();
  s.setTool("rect");
  s.click([0, 0], { shift: true });
  s.click([40, 25], { shift: true });
  s.setTool("circle");
  const info = s.move([39, 5]); // 1 mm off x=40, more than 3 mm from any corner or midpoint
  assert.equal(info.kind, "inference");
  assert.equal(info.point[0], 40);
  assert.equal(info.point[1], 5);
  assert.equal(info.guides[0].axis, "v");
});

test("polyline closes on the first point; Backspace and Escape work; open lines are not regions", () => {
  const s = session();
  s.setTool("poly");
  for (const p of [[0, 0], [30, 0], [30, 20]]) s.click(p, { shift: true });
  s.key("Backspace");
  assert.equal(s.draft.pts.length, 2);
  s.click([30, 20], { shift: true });
  s.click([0, 0]); // snaps to the first point -> closes
  assert.equal(s.entities.length, 1);
  assert.equal(s.entities[0].closed, true);
  close(regionsOf(s.entities)[0].area, 300);
  s.click([50, 50], { shift: true });
  s.key("Escape");
  assert.equal(s.draft, null);
  s.click([0, 0], { shift: true });
  s.click([5, 0], { shift: true });
  s.key("Enter"); // only 2 points: must not close
  assert.equal(s.entities.length, 1);
});

test("a circle inside a rectangle is picked first (smallest region under the cursor)", () => {
  const s = session();
  s.setTool("rect");
  s.click([0, 0], { shift: true });
  s.click([40, 40], { shift: true });
  s.setTool("circle");
  s.click([20, 20], { shift: true });
  s.click([25, 20], { shift: true });
  const regions = regionsOf(s.entities);
  assert.equal(hitRegion([21, 20], regions).kind, "circle");
  assert.equal(hitRegion([2, 2], regions).kind, "rect");
  assert.equal(hitRegion([60, 60], regions), null);
});

test("closest z on a vertical line from a camera ray", () => {
  const o = [100, 0, 50];
  const t = [0, 0, 20];
  const d = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
  const n = Math.hypot(...d);
  close(zOnVerticalLineFromRay({ o, v: d.map((x) => x / n) }, 0, 0), 20);
  assert.equal(zOnVerticalLineFromRay({ o: [0, 0, 5], v: [0, 0, 1] }, 0, 0), null);
});

await loadOC();
const feature = (region, id, z, distance, target, mode = "add") => [
  regionToSketchOp(region, `sk_${id}`, z),
  { id: `ex_${id}`, type: "extrude", profile: `sk_${id}`, distance, ...(target ? { target } : {}), mode },
];
const regionFor = (build) => {
  const s = session();
  build(s);
  return regionsOf(s.entities)[0];
};

test("graph from sketch regions: rect extrude, polygon extrude, circle cut from the top face", () => {
  const rect = regionFor((s) => (s.setTool("rect"), s.click([0, 0], { shift: true }), s.click([40, 30], { shift: true })));
  const tri = regionFor((s) => (s.setTool("poly"), [[0, 0], [20, 0], [0, 20]].forEach((p) => s.click(p, { shift: true })), s.click([0, 0])));
  const circ = regionFor((s) => (s.setTool("circle"), s.click([10, 10], { shift: true }), s.click([15, 10], { shift: true })));

  let ops = feature(rect, 1, 0, 20, null);
  let g = { params: {}, ops };
  let fin = finalSolid(g, compile(g));
  close(volume(fin.shape), 40 * 30 * 20, 1e-9);
  assert.deepEqual(bounds(fin.shape).min.map((v) => +v.toFixed(6)), [0, 0, 0]);

  ops = [...ops, ...feature(tri, 2, 20, 5, "ex_1")]; // boss on top
  g = { params: {}, ops };
  fin = finalSolid(g, compile(g));
  close(volume(fin.shape), 40 * 30 * 20 + 200 * 5, 1e-9);

  ops = [...ops, ...feature(circ, 3, 20, -8, "ex_2", "cut")]; // drag below the plane: cut
  g = { params: {}, ops };
  const res = compile(g);
  fin = finalSolid(g, res);
  assert.equal(fin.id, "ex_3", "cut op succeeded");
  close(volume(fin.shape), 40 * 30 * 20 + 200 * 5 - Math.PI * 25 * 8, 1e-9);
});
