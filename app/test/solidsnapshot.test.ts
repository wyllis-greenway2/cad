// The part snapshot of a solid body (`in_574`, `dec_manufacturing_contract` point 6): the kernel's fine mesh of that body, its box, the name it keeps, its label, its material tag, and with a flag the exact solid as STEP text. Plain data: it survives
// structuredClone, and a route given it needs nothing of the app or the kernel.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { solidSnapshot, solidSnapshots, normalsOf } from "../src/interaction/partsnapshot.ts";
import { selectedBodies, materialCommand } from "../src/interaction/material.ts";
import { createRegistry, runRoute, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { PartSnapshot, Route, MachineDefinition } from "../src/manufacturing/index.ts";

await kernel.init();
const XY = worldRef("XY");
/** blocks at x0 of 40 x 20 and the given height */
function blocks(...specs: [number, number][]): Session {
  let s = createSession(kernel);
  for (const [x0, h] of specs) {
    const r = drawRectangle(scene(s), XY, [x0, 0, 0], [x0 + 40, 20, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
  }
  return s;
}
const bodyIds = (s: Session): string[] => Object.values(scene(s).parts).flatMap((p) => (p.kind === "body" && p.id ? [p.id] : []));
/** the volume of a closed mesh (the divergence theorem) */
const volumeOf = (v: Float32Array, t: Uint32Array): number => { let sum = 0; for (let i = 0; i < t.length; i += 3) { const [a, b, c] = [t[i]! * 3, t[i + 1]! * 3, t[i + 2]! * 3]; sum += (v[a]! * (v[b + 1]! * v[c + 2]! - v[b + 2]! * v[c + 1]!) - v[a + 1]! * (v[b]! * v[c + 2]! - v[b + 2]! * v[c]!) + v[a + 2]! * (v[b]! * v[c + 1]! - v[b + 1]! * v[c]!)) / 6; } return Math.abs(sum); };
const ok = async (s: Session, id: string, opts = {}) => { const r = await solidSnapshot(s, kernel, id, opts); assert.ok(r.ok, r.ok ? "" : r.error); return (r as { ok: true; value: PartSnapshot }).value; };

test("a block's snapshot is a solid part: its mesh as typed arrays, its box, its name and label, units in mm, the contract's version", async () => {
  const s = blocks([0, 5]);
  const [id] = bodyIds(s) as [string];
  const p = await ok(s, id);
  assert.equal(p.contract, CONTRACT_VERSION); assert.equal(p.kind, "solid"); assert.equal(p.units, "mm");
  assert.equal(p.id, id); assert.equal(p.name, "Body 1");
  assert.deepEqual(p.bbox, { min: [0, 0, 0], max: [40, 20, 5] });
  assert.ok(p.mesh!.vertices instanceof Float32Array && p.mesh!.triangles instanceof Uint32Array && p.mesh!.normals instanceof Float32Array);
  assert.equal(p.mesh!.normals.length, p.mesh!.vertices.length);
  assert.ok(Math.abs(volumeOf(p.mesh!.vertices, p.mesh!.triangles) - 4000) < 1e-3, "the mesh is a closed block of 40 x 20 x 5");
  assert.equal(p.step, undefined, "no STEP unless asked");
  assert.equal(p.material, undefined);
  assert.equal(p.outlines, undefined);
});

test("the normals are unit length and point out of the body", async () => {
  const s = blocks([0, 5]);
  const p = await ok(s, bodyIds(s)[0]!);
  const { vertices: v, normals: n } = p.mesh!;
  for (let i = 0; i < v.length; i += 3) {
    assert.ok(Math.abs(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) - 1) < 1e-5, "unit length");
    assert.ok(n[i]! * (v[i]! - 20) + n[i + 1]! * (v[i + 1]! - 10) + n[i + 2]! * (v[i + 2]! - 2.5) > 0, "out of the block, from its middle");
  }
  assert.deepEqual(Array.from(normalsOf(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]), new Uint32Array([0, 1, 2]))), [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], "a triangle's corners all face its way; a vertex no triangle has faces up");
});

test("the material tag comes with the part; STEP is the exact solid as text, only when asked", async () => {
  let s = blocks([0, 5]);
  const [ref] = Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => p.ref);
  s = { ...s, click: { ...s.click, selection: [ref!] as never } };
  const c = materialCommand(s, "PETG");
  assert.ok(c.ok);
  if (c.ok) s = run(s, c.value);
  const id = selectedBodies(s)[0]!.id;
  const p = await ok(s, id, { step: true });
  assert.equal(p.material, "PETG");
  assert.match(p.step!, /^ISO-10303-21;/);
  assert.match(p.step!, /END-ISO-10303-21;\s*$/);
  assert.ok(p.step!.length > 1000);
});

test("the name a body keeps survives an edit that changes its shape; its mesh and box follow", async () => {
  const s0 = blocks([0, 5]);
  const [id] = bodyIds(s0) as [string];
  const stepId = scene(s0).steps.find((st) => st.type === "extrude")!.id;
  const s1 = run(s0, { type: "setStepParams", id: stepId, params: { depth: 8 } });
  const p1 = await ok(s1, id);
  assert.deepEqual(p1.bbox.max, [40, 20, 8], "the same body, taller");
  assert.ok(Math.abs(volumeOf(p1.mesh!.vertices, p1.mesh!.triangles) - 6400) < 1e-3);
});

test("several bodies are several parts, each with its own mesh, in the order of the Bodies list; some can be asked for by name", async () => {
  const s = blocks([0, 5], [100, 10]);
  const ids = bodyIds(s);
  assert.equal(ids.length, 2);
  const all = await solidSnapshots(s, kernel);
  assert.ok(all.ok);
  if (!all.ok) return;
  assert.deepEqual(all.value.map((p) => p.name), ["Body 1", "Body 2"]);
  assert.deepEqual(all.value.map((p) => p.bbox.max), [[40, 20, 5], [140, 20, 10]]);
  assert.deepEqual(all.value.map((p) => Math.round(volumeOf(p.mesh!.vertices, p.mesh!.triangles))), [4000, 8000], "each mesh is its own body only");
  const second = await solidSnapshots(s, kernel, [ids[1]!]);
  assert.ok(second.ok);
  if (second.ok) assert.deepEqual(second.value.map((p) => p.id), [ids[1]]);
});

test("a body that is not there, or no body at all, says so", async () => {
  const s = blocks([0, 5]);
  assert.deepEqual(await solidSnapshot(s, kernel, "nope"), { ok: false, error: "that body is not there any more" });
  assert.deepEqual(await solidSnapshots(createSession(kernel), kernel), { ok: false, error: "nothing to make: there is no body" });
  assert.deepEqual(await solidSnapshots(s, kernel, ["nope"]), { ok: false, error: "nothing to make: there is no body" });
});

test("the part is plain data (structuredClone keeps it) and a route that takes a solid gets it through the registry with nothing of the app or kernel", async () => {
  const s = blocks([0, 5]);
  const p = await ok(s, bodyIds(s)[0]!, { step: true });
  assert.deepEqual(structuredClone(p), p);
  const machine = { process: "fdm", name: "Printer", envelope: { min: [0, 0, 0], max: [220, 220, 250] }, limits: { feed: 6000 } } as unknown as MachineDefinition;
  const printable: Route = { contract: CONTRACT_VERSION, id: "print-ready", name: "Print readiness", process: "fdm", family: "toolpath", accepts: ["solid"], uses: ["machine"], params: [],
    fit: (part, ctx) => { const w = part.bbox.max[0] - part.bbox.min[0]; const bed = ctx ? ctx.machine.envelope.max[0] : 1e9; return { fits: w <= bed, reasons: w <= bed ? [] : [`${w} mm is wider than the bed`] }; },
    check: (part) => [{ id: "tri", severity: "info", message: `${part.name}: ${(part.mesh!.triangles.length / 3)} triangles`, refs: [] }] };
  const r = createRegistry();
  assert.deepEqual(r.register(printable), { ok: true });
  assert.deepEqual(r.forPart(p).map((o) => [o.route, o.fit.fits]), [["print-ready", true]]);
  const out = runRoute(printable, p, { machine, settings: {} });
  assert.match(out.findings[0]!.message, /^Body 1: \d+ triangles$/);
  assert.equal(runRoute(printable, { ...p, bbox: { min: [0, 0, 0], max: [500, 1, 1] } }, { machine, settings: {} }).fit.fits, false);
});
