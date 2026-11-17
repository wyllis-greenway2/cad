// Builds model.json: the Geneva drive as a 3D model (three bodies, `layout: "model"`), its triangles split by body, and the numbers the motion needs.
// Run from app/: node ../prototypes/mechanism-play/build.ts   (a prototype: `in_801`; nothing in the app imports it)
import { writeFileSync } from "node:fs";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { worldRef } from "../../app/src/shared/ref.ts";
import { createSession, run } from "../../app/src/interaction/session.ts";
import { genevaCentres } from "../../app/src/operation/geneva.ts";

await kernel.init();
const [n, a] = [5, 20];
const cam = { kind: "geneva", teeth: n, diameter: 2 * a, crank: a, pin: a / 4, clearance: 0.3, hole: -1, lift: 0, layout: "model", layer: 6, plate: 3 };
const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec: { teeth: 1, module: 1, cam } } as never);
const k = (s as unknown as { outcome: { kernel: { mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array }; bodies: { id: string; volume: number; min: number[]; max: number[] }[]; faces: { body: number; start: number; count: number; ranges?: { start: number; count: number }[] }[] } } }).outcome.kernel;
// each body: its triangles (ranges of the index list), copied out with their own vertices
const bodies = k.bodies.map((b, bi) => {
  const idx: number[] = [];
  for (const f of k.faces) if (f.body === bi) for (const r of f.ranges ?? [{ start: f.start, count: f.count }]) for (let i = r.start; i < r.start + r.count; i++) idx.push(k.mesh.triangles[i]!); // (the ranges count entries of the index list, three to a triangle)
  const map = new Map<number, number>();
  const verts: number[] = [], norms: number[] = [], index: number[] = [];
  for (const v of idx) { let m = map.get(v); if (m === undefined) { m = map.size; map.set(v, m); verts.push(k.mesh.vertices[3 * v]!, k.mesh.vertices[3 * v + 1]!, k.mesh.vertices[3 * v + 2]!); norms.push(k.mesh.normals[3 * v]!, k.mesh.normals[3 * v + 1]!, k.mesh.normals[3 * v + 2]!); } index.push(m); }
  return { id: b.id, volume: b.volume, min: b.min, max: b.max, vertices: verts, normals: norms, index };
});
// which is which: the wheel is the biggest; the disc is the one whose centre is at the second shaft with no pin; the crank has the pin (z down to -plate)
const wheel = bodies.reduce((m, b) => (b.volume > m.volume ? b : m));
const crank = bodies.find((b) => b.min[2]! < -1e-6)!;
const disc = bodies.find((b) => b !== wheel && b !== crank)!;
const model = { n, a, c: genevaCentres(n, a), roles: { wheel: wheel.id, disc: disc.id, crank: crank.id }, bodies };
writeFileSync(new URL("./model.json", import.meta.url), JSON.stringify(model));
console.log("bodies", bodies.map((b) => `${b.id}:${b.index.length / 3} tris`).join(" "), "roles", JSON.stringify(model.roles));
