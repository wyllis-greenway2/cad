// Holes filled and big meshes reduced on import (`dec_exchange_gaps`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { importAny, IMPORT_DEFAULTS } from "../src/interaction/importfile.ts";
import { importDialog } from "../src/interaction/transfer.ts";
import { parseStl, weld, shellsOf } from "../src/compiler/meshfile.ts";
import { fillHoles, decimate, meshVolume } from "../src/compiler/meshrepair.ts";
import { stlBytes } from "../src/compiler/stl.ts";

await kernel.init();
const fixture = (n: string): Uint8Array => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const meshOf = (n: string) => { const p = parseStl(fixture(n)); assert.ok(p.ok); return weld(p.value).mesh; };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const faces = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body").length;
/** a cube of 40 by 20 by 10 whose faces are grids of small triangles (a boxy part from a program that tessellates finely): n by n squares on each face */
function fineBox(n: number): Uint8Array {
  const [W, D, H] = [40, 20, 10];
  const v: number[] = [], t: number[] = [];
  const face = (o: number[], a: number[], b: number[]) => { // origin, the two edge vectors, counter-clockwise seen from outside
    const base = v.length / 3;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) v.push(o[0]! + (a[0]! * i) / n + (b[0]! * j) / n, o[1]! + (a[1]! * i) / n + (b[1]! * j) / n, o[2]! + (a[2]! * i) / n + (b[2]! * j) / n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const p = base + j * (n + 1) + i; t.push(p, p + 1, p + n + 2, p, p + n + 2, p + n + 1); }
  };
  face([0, 0, 0], [0, D, 0], [W, 0, 0]); face([0, 0, H], [W, 0, 0], [0, D, 0]);
  face([0, 0, 0], [W, 0, 0], [0, 0, H]); face([0, D, 0], [0, 0, H], [W, 0, 0]);
  face([0, 0, 0], [0, 0, H], [0, D, 0]); face([W, 0, 0], [0, D, 0], [0, 0, H]);
  return stlBytes(v, t, "fine box");
}

test("holes: a sphere with four triangles missing (one hole, written by trimesh) is filled and comes in as one body of about the whole sphere's volume", async () => {
  const r = await importAny(createSession(kernel), "holey.stl", fixture("trimesh-holey-sphere.stl"));
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.match(r.message, /1 hole in the surface filled/);
  assert.equal(bodies(r.session).length, 1);
  assert.ok(Math.abs(volume(r.session) - 112124.0) / 112124.0 < 0.005, `${volume(r.session)} against trimesh's 112124`); // (trimesh: the whole mesh's volume)
});

test("holes: with Repair off the same file is refused as open, and a hole bigger than 64 edges stays and is said", async () => {
  const off = await importAny(createSession(kernel), "holey.stl", fixture("trimesh-holey-sphere.stl"), { ...IMPORT_DEFAULTS, repair: false });
  assert.ok(!off.ok);
  assert.match(off.error, /open \(holes in the surface\)/);
  const m = meshOf("trimesh-holey-sphere.stl");
  assert.equal(fillHoles(m, 3).filled, 0, "a loop of more than the largest allowed is left");
  assert.equal(fillHoles(m, 3).left, 1);
  assert.equal(fillHoles(m).filled, 1);
  assert.ok(shellsOf(fillHoles(m).mesh).ok, "closed and consistent after");
});

test("reduce: a sphere of 20,480 triangles (trimesh) comes in reduced to fit, within 1 % of its volume, with the reduction said; with Reduce off it is refused and told how", async () => {
  const r = await importAny(createSession(kernel), "ico.stl", fixture("trimesh-ico-20480.stl"));
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.match(r.message, /reduced from 20,480 to \d[\d,]* triangles/);
  assert.ok(faces(r.session) <= 6000, `${faces(r.session)} faces`);
  assert.ok(Math.abs(volume(r.session) - 113036.17) / 113036.17 < 0.01, `${volume(r.session)} against trimesh's 113036`);
  const off = await importAny(createSession(kernel), "ico.stl", fixture("trimesh-ico-20480.stl"), { ...IMPORT_DEFAULTS, reduce: false });
  assert.ok(!off.ok);
  assert.match(off.error, /Reduce big meshes/);
});

test("reduce: a boxy part tessellated in 19,200 small triangles is reduced to a block: its volume is exact and its faces are six", async () => {
  const r = await importAny(createSession(kernel), "box.stl", fineBox(40));
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.ok(Math.abs(volume(r.session) - 8000) < 1e-3, `${volume(r.session)}`);
  assert.ok(faces(r.session) <= 12, `${faces(r.session)} faces`);
});

test("reduce: the reduced mesh stays closed and turned one way, at every target, and keeps a sphere's volume to a few percent down to 500 triangles", () => {
  const m = meshOf("trimesh-ico-20480.stl");
  const whole = meshVolume(m);
  for (const [target, within] of [[5000, 0.005], [1000, 0.01], [500, 0.02]] as const) {
    const d = decimate(m, target);
    assert.equal(d.triangles.length / 3, target);
    assert.ok(shellsOf(d).ok, `closed at ${target}`);
    assert.ok(Math.abs(meshVolume(d) - whole) / whole < within, `${target}: ${meshVolume(d)} against ${whole}`);
  }
  assert.equal(decimate(m, 100000), m, "a mesh already small enough is left as it is");
});

test("the import dialog offers Repair and Reduce for a mesh, and not for a drawing", () => {
  for (const f of ["a.stl", "a.3mf", "a.obj"]) assert.ok(importDialog(f, {}).fields.some((x) => x.id === "repair") && importDialog(f, {}).fields.some((x) => x.id === "reduce"), f);
  assert.ok(!importDialog("a.dxf", {}).fields.some((x) => x.id === "reduce"));
  assert.ok(!importDialog("a.step", {}).fields.some((x) => x.id === "repair"));
});
