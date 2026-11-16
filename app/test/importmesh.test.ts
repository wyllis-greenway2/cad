// STL and 3MF import as bodies (`dec_import_mesh`, `in_493`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, undoLast, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { importAny } from "../src/interaction/importfile.ts";
import { parseStl, parse3mf, weld, shellsOf, unzip, MAX_MESH_TRIANGLES } from "../src/compiler/meshfile.ts";
import { zipStored } from "../src/compiler/threemf.ts";
import { encodeMesh, decodeMesh } from "../src/compiler/kernel/occt/meshdata.mjs";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { panelOf } from "../src/interaction/panels.ts";

await kernel.init();
const XY = worldRef("XY");
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const bodyFaces = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body").length;
const block = (): Session => {
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
const bytesOf = async (s: Session, f: "stl" | "3mf"): Promise<Uint8Array> => { const r = await exportFile(s, kernel, f); assert.ok(r.ok); return (r as { bytes: Uint8Array }).bytes; };
/** the 12 triangles of a cube (outward, counter-clockwise) as corners */
const cube = (x: number, y: number, z: number, e: number): number[] => {
  const p = (i: number) => [x + (i & 1) * e, y + ((i >> 1) & 1) * e, z + ((i >> 2) & 1) * e];
  const quad = (a: number, b: number, c: number, d: number) => [...p(a), ...p(b), ...p(c), ...p(a), ...p(c), ...p(d)];
  return [...quad(0, 2, 3, 1), ...quad(4, 5, 7, 6), ...quad(0, 1, 5, 4), ...quad(2, 6, 7, 3), ...quad(0, 4, 6, 2), ...quad(1, 3, 7, 5)];
};
const binaryStl = (corners: number[]): Uint8Array => {
  const n = corners.length / 9;
  const out = new Uint8Array(84 + 50 * n);
  const v = new DataView(out.buffer);
  v.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) v.setFloat32(84 + 50 * t + 12 + 4 * k, corners[t * 9 + k]!, true);
  return out;
};
const asciiStl = (corners: number[]): Uint8Array => {
  let s = "solid cube\n";
  for (let t = 0; t < corners.length / 9; t++) s += `facet normal 0 0 0\n outer loop\n${[0, 1, 2].map((k) => `  vertex ${corners.slice(t * 9 + 3 * k, t * 9 + 3 * k + 3).join(" ")}\n`).join("")} endloop\nendfacet\n`;
  return new TextEncoder().encode(s + "endsolid cube\n");
};
const turnTriangles = (corners: number[], which: number[]): number[] => { const o = [...corners]; for (const t of which) { for (let c = 0; c < 3; c++) { const a = o[t * 9 + 3 + c]!; o[t * 9 + 3 + c] = o[t * 9 + 6 + c]!; o[t * 9 + 6 + c] = a; } } return o; };

test("the mesh format round trips, and a damaged one is refused", () => {
  const w = weld(cube(0, 0, 0, 10)).mesh;
  const back = decodeMesh(encodeMesh(w));
  assert.deepEqual([...back.vertices], [...w.vertices]);
  assert.deepEqual([...back.triangles], [...w.triangles]);
  assert.throws(() => decodeMesh(btoa("short")), /damaged/);
});

test("a block exported as STL or as 3MF comes back as one body: the same volume, six faces (the twelve triangles joined), one undo to take it away", async () => {
  for (const f of ["stl", "3mf"] as const) {
    const r = await importAny(createSession(kernel), `block.${f}`, await bytesOf(block(), f));
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) continue;
    assert.ok(Math.abs(volume(r.session) - 16000) < 1e-3, `${f} volume ${volume(r.session)}`);
    assert.equal(bodies(r.session).length, 1);
    assert.equal(bodyFaces(r.session), 6, "flat areas are single faces");
    assert.match(r.message, new RegExp(`imported block\\.${f}: a body made of 12 triangles`));
    assert.equal(scene(r.session).steps.at(-1)!.type, "importMesh");
    assert.ok(panelOf("history", scene(r.session), [], r.session.outcome.errors)!.rows.at(-1)!.label.includes(`Import block.${f} (mesh)`));
    assert.equal(bodies(undoLast(r.session)).length, 0);
  }
});

test("a round post comes back with its flat caps joined and the wall as small flat faces, with the volume of the mesh", async () => {
  const src = post();
  const r = await importAny(createSession(kernel), "post.stl", await bytesOf(src, "stl"));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.ok(Math.abs(volume(r.session) - volume(src)) / volume(src) < 0.001, `${volume(r.session)} against ${volume(src)}`);
  assert.ok(bodyFaces(r.session) > 100 && bodyFaces(r.session) < 200, `${bodyFaces(r.session)} faces`);
});

test("an imported mesh body is a body like another: its top face is pushed and pulled, it is saved and opened, and exported again", async () => {
  const r = await importAny(createSession(kernel), "block.stl", await bytesOf(block(), "stl"));
  assert.ok(r.ok);
  if (!r.ok) return;
  const top = Object.values(scene(r.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && Math.abs(p.at[2] - 20) < 1e-6 && !p.curved)!;
  const op = startOp(scene(r.session), [top.ref], "pushpull");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const pulled = runOp(r.session, { ...(op as { op: Op }).op, value: 5 })!;
  assert.equal(pulled.session.message, null);
  assert.ok(Math.abs(volume(pulled.session) - 20000) < 1e-3, `${volume(pulled.session)}`);
  const reopened = openSession(kernel, saveText(pulled.session));
  assert.ok(reopened.ok);
  if (reopened.ok) assert.ok(Math.abs(volume(reopened.value) - 20000) < 1e-3);
  const again = await exportFile(r.session, kernel, "stl");
  assert.ok(again.ok);
});

test("a text STL is read as well as a binary one", async () => {
  const r = await importAny(createSession(kernel), "cube.stl", asciiStl(cube(5, 5, 5, 10)));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (r.ok) { assert.ok(Math.abs(volume(r.session) - 1000) < 1e-6); assert.equal(bodyFaces(r.session), 6); }
});

test("triangles that run the wrong way are turned to agree with their neighbours, a whole body that is inside out is turned right way round, and both are said", async () => {
  const some = await importAny(createSession(kernel), "x.stl", binaryStl(turnTriangles(cube(0, 0, 0, 10), [0, 5, 7])));
  assert.ok(some.ok, some.ok ? "" : some.error);
  if (some.ok) { assert.ok(Math.abs(volume(some.session) - 1000) < 1e-6); assert.match(some.message, /\d+ triangles? turned to face the same way/); }
  const all = await importAny(createSession(kernel), "x.stl", binaryStl(turnTriangles(cube(0, 0, 0, 10), [...Array(12).keys()])));
  assert.ok(all.ok, all.ok ? "" : all.error);
  if (all.ok) { assert.ok(Math.abs(volume(all.session) - 1000) < 1e-6); assert.match(all.message, /inside out turned the right way/); }
});

test("a mesh with a hole in it, one with an edge of three triangles, and one that is not a mesh are refused with the reason, and nothing changes", async () => {
  const s = block();
  const steps = scene(s).steps.length;
  const holed = cube(0, 0, 0, 10).slice(9);
  const open = await importAny(s, "open.stl", binaryStl(holed));
  assert.ok(!open.ok && /not a closed solid: 3 edges are open/.test(open.error) && /Repair it/.test(open.error), open.ok ? "" : open.error);
  const three = await importAny(s, "three.stl", binaryStl([...cube(0, 0, 0, 10), ...cube(0, 0, 0, 10).slice(0, 9)]));
  assert.ok(!three.ok && /shared by more than two triangles/.test(three.error), three.ok ? "" : three.error);
  for (const [name, bytes] of [["x.stl", new TextEncoder().encode("hello world")], ["x.3mf", new TextEncoder().encode("hello")], ["x.stl", new Uint8Array(100)]] as const) assert.ok(!(await importAny(s, name, bytes)).ok, name);
  assert.equal(scene(s).steps.length, steps);
});

test("two shells in one file are two bodies; a mesh over the size limit is refused before anything is built", async () => {
  const two = await importAny(createSession(kernel), "two.stl", binaryStl([...cube(0, 0, 0, 10), ...cube(30, 0, 0, 5)]));
  assert.ok(two.ok, two.ok ? "" : two.error);
  if (two.ok) { assert.equal(bodies(two.session).length, 2); assert.ok(Math.abs(volume(two.session) - 1125) < 1e-6); assert.match(two.message, /2 bodies/); }
  const big = new Uint8Array(84 + 50 * (MAX_MESH_TRIANGLES + 1));
  new DataView(big.buffer).setUint32(80, MAX_MESH_TRIANGLES + 1, true);
  const r = await importAny(createSession(kernel), "big.stl", big);
  assert.ok(!r.ok && /12,001 triangles: the app imports up to 12,000/.test(r.error) && /Decimate|Simplify/.test(r.error), r.ok ? "" : r.error);
});

test("an STL from another program (trimesh): a block, and three shells in one file as three bodies of the right volumes", async () => {
  const one = await importAny(createSession(kernel), "box.stl", new Uint8Array(readFileSync(new URL("./fixtures/trimesh-box.stl", import.meta.url))));
  assert.ok(one.ok, one.ok ? "" : one.error);
  if (one.ok) { assert.ok(Math.abs(volume(one.session) - 8000) < 1e-3); assert.equal(bodyFaces(one.session), 6); }
  const three = await importAny(createSession(kernel), "three.stl", new Uint8Array(readFileSync(new URL("./fixtures/trimesh-three.stl", import.meta.url))));
  assert.ok(three.ok, three.ok ? "" : three.error);
  if (three.ok) { assert.equal(bodies(three.session).length, 3); assert.ok(Math.abs(volume(three.session) - (8000 + 2072.0869 + 1691.6195)) < 0.05, `${volume(three.session)}`); }
});

test("a 3MF from another program (trimesh, deflated, with name spaces): three objects, three bodies, with their names kept out of the way and the volumes right", async () => {
  const r = await importAny(createSession(kernel), "three.3mf", new Uint8Array(readFileSync(new URL("./fixtures/trimesh-three.3mf", import.meta.url))));
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (r.ok) { assert.equal(bodies(r.session).length, 3); assert.ok(Math.abs(volume(r.session) - (8000 + 2072.0869 + 1691.6195)) < 0.05, `${volume(r.session)}`); }
});

const model = (unit: string, body: string): string => `<?xml version="1.0" encoding="UTF-8"?><model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">${body}</model>`;
const meshXml = (e: number): string => { const c = cube(0, 0, 0, e); const w = weld(c).mesh; return `<mesh><vertices>${[...Array(w.vertices.length / 3).keys()].map((i) => `<vertex x="${w.vertices[3 * i]}" y="${w.vertices[3 * i + 1]}" z="${w.vertices[3 * i + 2]}"/>`).join("")}</vertices><triangles>${[...Array(w.triangles.length / 3).keys()].map((i) => `<triangle v1="${w.triangles[3 * i]}" v2="${w.triangles[3 * i + 1]}" v3="${w.triangles[3 * i + 2]}"/>`).join("")}</triangles></mesh>`; };
const pack = (files: Record<string, string>, deflate: boolean): Uint8Array => {
  if (!deflate) return zipStored(Object.entries(files).map(([name, text]) => ({ name, data: new TextEncoder().encode(text) })));
  // a zip with deflated entries, written here by hand
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [], dir: Uint8Array[] = [];
  let at = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = enc.encode(text), packed = new Uint8Array(deflateRawSync(raw));
    const nm = enc.encode(name);
    const crc = (() => { let c = ~0; for (const b of raw) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; })();
    const h = new Uint8Array(30 + nm.length); const hv = new DataView(h.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(8, 8, true); hv.setUint32(14, crc, true); hv.setUint32(18, packed.length, true); hv.setUint32(22, raw.length, true); hv.setUint16(26, nm.length, true); h.set(nm, 30);
    const d = new Uint8Array(46 + nm.length); const dv = new DataView(d.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(10, 8, true); dv.setUint32(16, crc, true); dv.setUint32(20, packed.length, true); dv.setUint32(24, raw.length, true); dv.setUint16(28, nm.length, true); dv.setUint32(42, at, true); d.set(nm, 46);
    parts.push(h, packed); dir.push(d); at += h.length + packed.length;
  }
  const size = dir.reduce((a, x) => a + x.length, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, dir.length, true); ev.setUint16(10, dir.length, true); ev.setUint32(12, size, true); ev.setUint32(16, at, true);
  const out = new Uint8Array(at + size + 22); let o = 0;
  for (const p of [...parts, ...dir, end]) { out.set(p, o); o += p.length; }
  return out;
};

test("a 3MF in inches with a build transform, an assembly of components in another file of the package, and an object that is not a part: sizes, places and notes", async () => {
  const files = {
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="r0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    "3D/Objects/cube.model": model("inch", `<resources><object id="1" type="model">${meshXml(2)}</object></resources>`),
    "3D/3dmodel.model": model("inch", `<resources>
      <object id="7" type="model"><components><component objectid="1" p:path="/3D/Objects/cube.model" transform="1 0 0 0 1 0 0 0 1 0 0 0"/><component objectid="1" p:path="/3D/Objects/cube.model" transform="1 0 0 0 1 0 0 0 1 5 0 0"/></components></object>
      <object id="8" type="support">${meshXml(1)}</object></resources>
      <build><item objectid="7" transform="1 0 0 0 1 0 0 0 1 10 0 0"/><item objectid="8"/></build>`),
  };
  for (const deflate of [false, true]) {
    const r = await importAny(createSession(kernel), "asm.3mf", pack(files, deflate));
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) continue;
    assert.equal(bodies(r.session).length, 2, "the two components are two bodies");
    // each cube is 2 inches = 50.8 mm: a volume of 50.8^3 each; the item moves them 10 inches along x, the second component 5 inches more
    assert.ok(Math.abs(volume(r.session) - 2 * 50.8 ** 3) / (2 * 50.8 ** 3) < 1e-6, `${volume(r.session)}`);
    const boxes = bodies(r.session).map((b) => (b as unknown as { bbox: { min: number[]; max: number[] } }).bbox.min[0]!).sort((a, b) => a - b);
    assert.ok(Math.abs(boxes[0]! - 254) < 1e-3 && Math.abs(boxes[1]! - 381) < 1e-3, `at ${boxes}`);
    assert.match(r.message, /1 object that is not a part \(supports, surfaces\) left out/);
  }
});

test("a 3MF that is not a zip, one with no model, and one whose item points at nothing are refused with the reason", async () => {
  const bad = (bytes: Uint8Array) => importAny(createSession(kernel), "x.3mf", bytes);
  const a = await bad(new TextEncoder().encode("not a zip at all, long enough to look for a directory at its end............"));
  assert.ok(!a.ok && /not a zip/.test(a.error));
  const b = await bad(zipStored([{ name: "readme.txt", data: new TextEncoder().encode("x") }]));
  assert.ok(!b.ok && /no model/.test(b.error));
  const c = await bad(zipStored([{ name: "3D/3dmodel.model", data: new TextEncoder().encode(model("millimeter", `<resources/><build><item objectid="9"/></build>`)) }]));
  assert.ok(!c.ok && /not in it/.test(c.error), c.ok ? "" : c.error);
  const z = await unzip(pack({ "a.txt": "hello" }, true));
  assert.ok(z.ok && new TextDecoder().decode(z.value.get("a.txt")) === "hello", "deflated entries are unpacked");
});

test("a mesh body is moved with the rest of the model's tools: the whole body goes 10 along X", async () => {
  const r = await importAny(createSession(kernel), "block.stl", await bytesOf(block(), "stl"));
  assert.ok(r.ok);
  if (!r.ok) return;
  const body = bodies(r.session)[0]!;
  const op = startOp(scene(r.session), [body.ref], "move");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const moved = runOp(r.session, { ...(op as { op: Op }).op, axis: 0, value: 10 })!;
  assert.equal(moved.session.message, null);
  assert.ok(Math.abs((bodies(moved.session)[0] as unknown as { bbox: { min: number[] } }).bbox.min[0]! - 10) < 1e-6);
  void parseStl; void parse3mf; void shellsOf;
});

test("a mesh that is still more than six thousand faces with its flat areas joined is refused after it is built, with the reason, and nothing is added", async () => {
  // a sphere of 60 rings of 60 segments: 7,080 triangles, all of them curved
  const [rings, segs] = [60, 60];
  const p = (i: number, j: number): number[] => { const [a, b] = [(Math.PI * i) / rings, (2 * Math.PI * j) / segs]; return [20 * Math.sin(a) * Math.cos(b), 20 * Math.sin(a) * Math.sin(b), 20 * Math.cos(a)]; };
  const corners: number[] = [];
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const [a, b, c, d] = [p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)];
    if (i > 0) corners.push(...a, ...d, ...b); // (outward: counter-clockwise seen from outside)
    if (i < rings - 1) corners.push(...b, ...d, ...c);
  }
  const s = createSession(kernel);
  const r = await importAny(s, "ball.stl", binaryStl(corners));
  assert.ok(!r.ok && /faces even with its flat areas joined: over the 6,000/.test(r.error) && /Decimate|Simplify/.test(r.error), r.ok ? `${bodyFaces(r.session)} faces` : r.error);
  assert.equal(scene(s).steps.length, 0);
});
