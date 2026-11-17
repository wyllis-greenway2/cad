// 3MF and STEP export (`dec_export_formats`, `in_524`): the zip of a mesh, the kernel's exact solid, and what the menu offers.
import test from "node:test";
import assert from "node:assert/strict";
import { setOC, importSTEP, measureVolume } from "replicad";
import { loadOC } from "../src/compiler/kernel/occt/oc.mjs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile, fileName } from "../src/interaction/exportfile.ts";
import { threeMfBytes, zipStored, crc32 } from "../src/compiler/threemf.ts";
import { appRows } from "../src/interaction/appmenu.ts";
import { createAsyncKernel } from "../src/kernel-async.ts";

await kernel.init();
setOC((await loadOC()) as never);
const XY = worldRef("XY");
const box = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
/** a minimal zip reader for the test: the entries with their bytes, each checked against its CRC and sizes */
function unzip(b: Uint8Array): Record<string, string> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const end = b.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50, "the end of the central directory is where it should be");
  const [count, dirAt] = [v.getUint16(end + 10, true), v.getUint32(end + 16, true)];
  const out: Record<string, string> = {};
  let at = dirAt;
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const [crc, size, nameLen, local] = [v.getUint32(at + 16, true), v.getUint32(at + 24, true), v.getUint16(at + 28, true), v.getUint32(at + 42, true)];
    const name = new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50);
    assert.equal(v.getUint16(local + 8, true), 0, "stored");
    const data = b.subarray(local + 30 + v.getUint16(local + 26, true), local + 30 + v.getUint16(local + 26, true) + size);
    assert.equal(crc32(data), crc, `the checksum of ${name}`);
    out[name] = new TextDecoder().decode(data);
    at += 46 + nameLen;
  }
  return out;
}

test("the zip writer: entries come back as written, with their checksums (the standard check value of CRC-32 for '123456789' is cbf43926)", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")).toString(16), "cbf43926");
  const z = unzip(zipStored([{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "d/b.txt", data: new TextEncoder().encode("world") }]));
  assert.deepEqual(z, { "a.txt": "hello", "d/b.txt": "world" });
});

test("a 3MF of a block: the three files, millimetres, 8 vertices and 12 triangles, and the volume of the triangles is the block's", async () => {
  const r = await exportFile(box(), kernel, "3mf");
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(r.name, "model.3mf");
  const z = unzip(r.bytes);
  assert.deepEqual(Object.keys(z), ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]);
  const model = z["3D/3dmodel.model"]!;
  assert.match(model, /unit="millimeter"/);
  const verts = [...model.matchAll(/<vertex x="([-\d.e]+)" y="([-\d.e]+)" z="([-\d.e]+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  const tris = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  assert.equal(verts.length, 8);
  assert.equal(tris.length, 12);
  // the signed volume of a closed mesh turned outwards is the volume
  let vol = 0;
  for (const [a, b, c] of tris) { const [p, q, s] = [verts[a!]!, verts[b!]!, verts[c!]!]; vol += (p[0]! * (q[1]! * s[2]! - q[2]! * s[1]!) - p[1]! * (q[0]! * s[2]! - q[2]! * s[0]!) + p[2]! * (q[0]! * s[1]! - q[1]! * s[0]!)) / 6; }
  assert.ok(Math.abs(vol - 16000) < 1e-3, `volume ${vol}`);
  assert.match(r.message, /3MF.*12 triangles.*40 × 20 × 20 mm/);
});

test("the title of a 3MF is escaped", () => {
  const z = unzip(threeMfBytes(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), 'a<b>&"c'));
  assert.match(z["3D/3dmodel.model"]!, /<metadata name="Title">a&lt;b&gt;&amp;&quot;c<\/metadata>/);
});

test("a STEP of a block is the exact solid: a STEP file with 6 faces that the kernel reads back with the same volume", async () => {
  const r = await exportFile(box(), kernel, "step");
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  assert.equal(r.name, "model.step");
  const text = new TextDecoder().decode(r.bytes);
  assert.match(text, /^ISO-10303-21;/);
  assert.equal((text.match(/ADVANCED_FACE/g) ?? []).length, 6);
  const back = await importSTEP(new Blob([r.bytes as BlobPart]));
  assert.ok(Math.abs(measureVolume(back as never) - 16000) < 1e-3, `volume ${measureVolume(back as never)}`);
  assert.match(r.message, /the exact body.*40 × 20 × 20 mm/);
});

test("a round post in STEP keeps its cylinder (the wall in two halves, a top and a bottom), not facets", async () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10);
  s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
  const r = await exportFile(s, kernel, "step");
  assert.ok(r.ok);
  if (!r.ok) return;
  const text = new TextDecoder().decode(r.bytes);
  assert.equal((text.match(/ADVANCED_FACE/g) ?? []).length, 4);
  assert.ok(/CYLINDRICAL_SURFACE/.test(text));
});

test("nothing to export is said, for every format; the file names follow the format and the bodies", async () => {
  for (const f of ["stl", "3mf", "step"] as const) {
    const r = await exportFile(createSession(kernel), kernel, f);
    assert.deepEqual(r, { ok: false, error: "nothing to export yet: make a body" });
  }
  assert.equal(fileName("3mf"), "model.3mf");
  assert.equal(fileName("step", ["x_s_1"]), "model-x_s_1.step");
});

test("the menu has one Export… (greyed out with the reason when there is nothing to export) and one Import…", () => {
  const rows = (can: Parameters<typeof appRows>[1]) => appRows("", can, false, 0);
  const ids = rows({ export: true }).map((r) => r.id);
  assert.ok(["save", "open", "import", "export"].every((i) => ids.includes(i)));
  assert.ok(!ids.some((i) => /^export.+/.test(i)), "no row for each format any more");
  const none = rows({ export: false }).find((r) => r.id === "export")!;
  assert.equal(none.enabled, false);
  assert.match(none.why ?? "", /nothing to export yet/);
});

test("a STEP export goes through the worker's queue like a mesh, and is answered as bytes (`dec_export_formats`)", async () => {
  const sent: { id: number; export?: { step?: boolean; bodies?: string[] } }[] = [];
  let listener: (e: { data: unknown }) => void = () => {};
  const w = { postMessage: (m: unknown) => { sent.push(m as never); }, addEventListener: (t: string, f: never) => { if (t === "message") listener = f; }, terminate: () => {} };
  const k = createAsyncKernel(() => {}, w as never);
  listener({ data: { ready: true } });
  await k.init();
  const p = k.exportStep({ params: {}, ops: [] }, ["x_s_1"]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0]!.export, { tolerance: 0, angular: 0, step: true, bodies: ["x_s_1"] });
  const answer = { ok: true, bytes: new Uint8Array([1]), volume: 1, bbox: { min: [0, 0, 0], max: [1, 1, 1] } };
  listener({ data: { id: sent[0]!.id, exported: answer } });
  assert.equal(await p, answer);
});
