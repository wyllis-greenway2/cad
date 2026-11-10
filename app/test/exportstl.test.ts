// The STL export (`dec_export_stl`, `in_256`): the kernel's fine mesh of the final body, written as a binary STL file.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportStl, canExport, EXPORT_QUALITY, EXPORT_NOTHING } from "../src/interaction/exportstl.ts";
import { stlBytes, openEdges } from "../src/compiler/stl.ts";
import { graphOf } from "../src/compiler/compile.ts";
import { appRows } from "../src/interaction/appmenu.ts";

await kernel.init();
const XY = worldRef("XY");

const box = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const post = (): Session => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
};

/** What a program reading the file gets: the triangles as three corners each. */
function read(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = v.getUint32(80, true);
  const tris: number[][][] = [];
  for (let t = 0; t < n; t++) {
    const at = 84 + 50 * t;
    tris.push([0, 1, 2].map((k) => [0, 1, 2].map((i) => v.getFloat32(at + 12 + 12 * k + 4 * i, true))));
  }
  return { n, tris };
}
/** Volume enclosed by the triangles (positive when they face outward). */
const volumeOf = (tris: number[][][]) => tris.reduce((sum, t) => {
  const [a, b, c] = t as [number[], number[], number[]];
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = [...a, ...b, ...c] as number[];
  return sum + (ax! * (by! * cz! - bz! * cy!) - ay! * (bx! * cz! - bz! * cx!) + az! * (bx! * cy! - by! * cx!)) / 6;
}, 0);

test("a finer quality gives more triangles", async () => {
  const g = graphOf(post().history.scene);
  const coarse = await kernel.exportMesh(g, { tolerance: 0.5, angular: 0.5 });
  const fine = await kernel.exportMesh(g, EXPORT_QUALITY);
  assert.ok(coarse.ok && fine.ok);
  if (coarse.ok && fine.ok) assert.ok(fine.triangles.length > 3 * coarse.triangles.length, `${fine.triangles.length} vs ${coarse.triangles.length}`);
});

test("a box is 12 triangles, closed, and the mesh holds the kernel's volume", async () => {
  const r = await exportStl(box(), kernel);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.triangles, 12);
  assert.equal(r.open, 0);
  const m = await kernel.exportMesh(graphOf(box().history.scene), EXPORT_QUALITY);
  assert.ok(m.ok);
  if (!m.ok) return;
  assert.ok(Math.abs(volumeOf(read(r.bytes).tris) - m.volume) < 1e-6 * m.volume, `${volumeOf(read(r.bytes).tris)} vs ${m.volume}`);
  assert.ok(Math.abs(m.volume - 40 * 20 * 20) < 1e-6);
  assert.deepEqual(r.size, [40, 20, 20]);
});

test("a cylinder deviates from the true surface by less than the deflection asked for", async () => {
  const m = await kernel.exportMesh(graphOf(post().history.scene), EXPORT_QUALITY);
  assert.ok(m.ok);
  if (!m.ok) return;
  let worst = 0;
  for (let t = 0; t < m.triangles.length; t += 3) {
    const zs = [0, 1, 2].map((k) => m.vertices[m.triangles[t + k]! * 3 + 2]!);
    if (zs[0] === zs[1] && zs[1] === zs[2]) continue; // (a triangle of a cap, not of the wall)
    for (let k = 0; k < 3; k++) {
      const a = m.triangles[t + k]! * 3, b = m.triangles[t + (k + 1) % 3]! * 3;
      const ra = Math.hypot(m.vertices[a]!, m.vertices[a + 1]!), rb = Math.hypot(m.vertices[b]!, m.vertices[b + 1]!);
      if (Math.abs(ra - 10) > 1e-3 || Math.abs(rb - 10) > 1e-3 || m.vertices[a + 2] !== m.vertices[b + 2]) continue; // (a chord along the rim, in a triangle of the wall)
      const mid = Math.hypot((m.vertices[a]! + m.vertices[b]!) / 2, (m.vertices[a + 1]! + m.vertices[b + 1]!) / 2);
      worst = Math.max(worst, 10 - mid); // (a chord lies inside the circle by this much)
    }
  }
  assert.ok(worst > 0, "the wall was found");
  assert.ok(worst <= EXPORT_QUALITY.tolerance * 1.001, `${worst}`);
  const a = Math.PI * 10 * 10 * 30;
  assert.ok(Math.abs(m.volume - a) / a < 1e-6);
});

test("the file is 84 + 50 bytes a triangle and reads back to the same triangles", async () => {
  const r = await exportStl(post(), kernel);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.bytes.length, 84 + 50 * r.triangles);
  const m = await kernel.exportMesh(graphOf(post().history.scene), EXPORT_QUALITY);
  assert.ok(m.ok);
  if (!m.ok) return;
  const back = read(r.bytes);
  assert.equal(back.n, m.triangles.length / 3);
  for (let t = 0; t < back.n; t++) for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) assert.equal(back.tris[t]![k]![i], m.vertices[m.triangles[3 * t + k]! * 3 + i]);
  assert.ok(!new TextDecoder().decode(r.bytes.slice(0, 5)).startsWith("solid"), "not read as a text file");
  assert.equal(openEdges(m.vertices, m.triangles), 0, "a cylinder is closed");
  assert.match(r.message, /exported model\.stl: .* triangles, 20 × 20 × 30 mm/);
});

test("the normal of each triangle points out of the body", () => {
  const v = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bytes = stlBytes(v, new Uint32Array([0, 1, 2]), "x");
  const dv = new DataView(bytes.buffer);
  assert.deepEqual([dv.getFloat32(84, true), dv.getFloat32(88, true), dv.getFloat32(92, true)], [0, 0, 1]);
  assert.equal(openEdges(v, new Uint32Array([0, 1, 2])), 3, "a lone triangle is open on all three edges");
});

test("with no body it says so and makes no file; the menu item is greyed out with the reason", async () => {
  const s = createSession(kernel);
  assert.equal(canExport(s), false);
  const r = await exportStl(s, kernel);
  assert.deepEqual(r, { ok: false, error: EXPORT_NOTHING });
  const row = appRows("auto", "", { undo: true, redo: true, exportStl: canExport(s) }).find((x) => x.id === "exportStl")!;
  assert.equal(row.enabled, false);
  assert.equal(row.why, EXPORT_NOTHING);
  assert.equal(appRows("auto", "", { undo: true, redo: true, exportStl: canExport(box()) }).find((x) => x.id === "exportStl")!.enabled, true);
  const empty = await kernel.exportMesh({ params: {}, ops: [] }, EXPORT_QUALITY);
  assert.deepEqual(empty, { ok: false, error: EXPORT_NOTHING });
});

test("a body that was moved and turned is exported where it is, not put back", async () => {
  const g = { params: {}, ops: [
    { id: "s_a", type: "sketch", plane: "XY", origin: 0, shape: "rect", w: 40, d: 20, at: [0, 0] },
    { id: "x_a", type: "extrude", profile: "s_a", distance: 20, mode: "add" },
    { id: "x_b", type: "transform", target: "x_a", mode: "move", axis: 0, value: 100 },
    { id: "x_c", type: "transform", target: "x_b", mode: "rotate", axis: 2, value: 90 },
  ] };
  const m = await kernel.exportMesh(g, EXPORT_QUALITY);
  assert.ok(m.ok);
  if (!m.ok) return;
  const xs = [0, 1, 2].map((i) => { const a = Array.from({ length: m.vertices.length / 3 }, (_, k) => m.vertices[3 * k + i]!); return [Math.min(...a), Math.max(...a)].map((x) => Math.round(x)); });
  assert.deepEqual(xs, [[90, 110], [-20, 20], [0, 20]], "moved 100 along x, then turned a quarter about its own centre: it is where it stands, not put back at the origin");
  assert.ok(Math.abs(volumeOf(read(stlBytes(m.vertices, m.triangles, "t")).tris) - 16000) < 0.01);
});
