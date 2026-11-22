// A dev check (not a test, `in_1444`) for the mesh, STL, STEP and import (E21, E70, E71): the triangles by face id, a file that is what the body is, a STEP file that comes back as the same body with ids from its own order.
//   node --experimental-strip-types dev/exchange-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { exportBody, fromBase64, meshOf, stlAscii, stlBinary, toBase64 } from "../src/engine/exchange.ts";
import { idKey, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount, near } from "./lib.ts";
const body = (e: Engine, id: string) => e.result(id).value as Body;
// the volume a mesh encloses (divergence theorem), for a closed mesh
const enclosed = (m: { positions: number[]; indices: number[] }) => { let v = 0; for (let t = 0; t < m.indices.length; t += 3) { const P = (k: number) => m.indices[t + k]! * 3, a = P(0), b = P(1), c = P(2), p = m.positions; v += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6; } return v; };
const plate: Step[] = [{ id: "s", kind: "sketch", params: { ...rectangle(0, 0, 20, 10), circles: [{ id: "h", c: "H", r: 3 }], points: [...rectangle(0, 0, 20, 10).points, { id: "H", x: 10, y: 5 }], constraints: [...rectangle(0, 0, 20, 10).constraints!, { id: "hr", kind: "radius", parts: ["h"], value: 3 }, { id: "hc", kind: "fixed", parts: ["H"], at: [10, 5] }] }, inputs: [] }, { id: "E", kind: "extrude", params: { d: 4 }, inputs: ["s"] }];

console.log("1. the mesh, by face id");
{
  const e = new Engine(plate); e.build(); const b = body(e, "E"), m = meshOf(b);
  check("every face of the body has triangles, and the faces' triangles tile the whole mesh with no gap and no overlap", m.faces.length === b.faces.length && m.faces.reduce((s, f) => s + f.count, 0) === m.indices.length, `${m.faces.length} of ${b.faces.length} faces, ${m.triangles} triangles`);
  const starts = [...m.faces].sort((a, c) => a.start - c.start); check("the groups run one after another", starts.every((f, i) => i === 0 || f.start === starts[i - 1]!.start + starts[i - 1]!.count));
  const want = (20 * 10 - Math.PI * 9) * 4; check("the volume the mesh encloses is the body's, to the mesh's fineness (0.02 mm)", Math.abs(enclosed(m) - K.volume(b.solid)) / want < 2e-3, `${enclosed(m).toFixed(3)} against ${K.volume(b.solid).toFixed(3)}`);
  const hole = m.faces.find((f) => f.id.includes("circle"))!; check("the hole's wall is found by its id (the picking key), and it is in the one body", !!hole && hole.body === idKey(b.bodies[0]!.id), hole ? `${hole.id} in ${hole.body}` : "none");
  const fine = meshOf(b, { tolerance: 0.002 }); check("a finer tolerance gives more triangles on the curved wall and the same on the flat ones", fine.triangles > m.triangles, `${m.triangles} -> ${fine.triangles}`);
  check("edges come with their names (the two faces beside each); only the cylinder's seam, which has one face on both sides, has none", m.edges.length === b.edges().length && m.edges.filter((x) => x.key === null).length === 1, `${m.edges.length} edges, ${m.edges.filter((x) => x.key === null).length} unnamed`);
  e.release();
}
console.log("2. STL: binary and ASCII, from the mesh");
{
  const e = new Engine(plate); e.build(); const b = body(e, "E"), m = meshOf(b), bin = stlBinary(m), asc = stlAscii(m);
  check("a binary STL is 84 bytes and 50 per triangle", bin.length === 84 + 50 * m.triangles && new DataView(bin.buffer).getUint32(80, true) === m.triangles, String(bin.length));
  const parsed = (asc.match(/facet normal/g) ?? []).length; check("the ASCII one has the same triangles", parsed === m.triangles, `${parsed}`);
  const dv = new DataView(bin.buffer); let ok = true; for (let t = 0; t < m.triangles && ok; t++) { const nx = dv.getFloat32(84 + 50 * t, true), ny = dv.getFloat32(88 + 50 * t, true), nz = dv.getFloat32(92 + 50 * t, true); ok = Math.abs(Math.hypot(nx, ny, nz) - 1) < 1e-5; }
  check("every triangle's normal is a unit vector", ok);
  const viaApi = exportBody(b, "stl"); check("exportBody gives the same bytes", viaApi.length === bin.length);
  e.release();
}
console.log("3. STEP out and back in: the same body, ids from the file's own order");
{
  const e = new Engine(plate); e.build(); const b = body(e, "E"), file = exportBody(b, "step");
  check("a STEP file starts as one", new TextDecoder().decode(file.slice(0, 12)) === "ISO-10303-21", new TextDecoder().decode(file.slice(0, 12)));
  const b64 = toBase64(file), again = fromBase64(b64); check("base64 and back is the same bytes", again.length === file.length && again.every((x, i) => x === file[i]));
  const i = new Engine([{ id: "I", kind: "import", params: { format: "step", data: b64 }, inputs: [] }]); i.build(); const imp = body(i, "I");
  check("it comes back as one body with the same volume and the same number of faces", i.result("I").status.kind === "ok" && near(K.volume(imp.solid), K.volume(b.solid), 1e-9) && imp.faces.length === b.faces.length, `${i.result("I").status.kind} ${(i.result("I").status as { why?: string }).why ?? ""}`);
  check("its faces are `face n` of the import step, n in the file's order, and none is unnamed", imp.faces.every((f, k) => idKey(f.id) === idKey(mint("I", "face", k)) && !f.defect), imp.faces.map((f) => idKey(f.id)).slice(0, 2).join(" "));
  const next: Step[] = [{ id: "I", kind: "import", params: { format: "step", data: b64 }, inputs: [] }, { id: "top", kind: "push", params: { face: mint("I", "face", imp.faces.findIndex((f) => K.facts(f.h).type === "PLANE" && K.facts(f.h).ne[2] > 0.9)), dist: 3 }, inputs: ["I"] }];
  const p = new Engine(next); p.build(); check("a later step can refer to an imported face: pushing the top face by 3 adds 3 x the face's area", p.result("top").status.kind === "ok" && near(K.volume(body(p, "top").solid) - K.volume(imp.solid), 3 * (20 * 10 - Math.PI * 9), 1e-6), `${p.result("top").status.kind} ${(p.result("top").status as { why?: string }).why ?? ""}`);
  const again2 = new Engine(next); again2.build(); check("the same file twice gives the same ids and fingerprint", again2.result("I").fingerprint === p.result("I").fingerprint);
  const bad = new Engine([{ id: "I", kind: "import", params: { format: "step", data: toBase64(new TextEncoder().encode("not a file")) }, inputs: [] }]); bad.build(); check("a file that is not STEP is refused in words", bad.result("I").status.kind === "flagged", (bad.result("I").status as { why?: string }).why);
  const iges = new Engine([{ id: "I", kind: "import", params: { format: "iges", data: "AAAA" }, inputs: [] }]); iges.build(); check("IGES is not read yet, and says so", /iges/.test((iges.result("I").status as { why?: string }).why ?? ""), (iges.result("I").status as { why?: string }).why);
  for (const x of [e, i, p, again2, bad, iges]) x.release();
}
console.log("4. several bodies: all, or the ones named")
{
  const steps: Step[] = [{ id: "a", kind: "sketchPolygon", params: { points: [[0, 0], [10, 0], [10, 10], [0, 10]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 5 }, inputs: ["a"] }, { id: "P", kind: "pattern", params: { kind: "linear", by: [30, 0, 0], count: 2 }, inputs: ["A"] }];
  const e = new Engine(steps); e.build(); const sc = body(e, "P"), names = sc.bodies.map((r) => idKey(r.id));
  check("two bodies", names.length === 2, names.join(" "));
  const all = meshOf(sc), one = meshOf(sc, { bodies: [names[1]!] });
  check("all: the faces of both bodies, each face says which body; named: only that body's", all.faces.length === 12 && new Set(all.faces.map((f) => f.body)).size === 2 && one.faces.length === 6 && one.faces.every((f) => f.body === names[1]), `${all.faces.length} and ${one.faces.length}`);
  check("each body alone meshes to half the triangles of both", one.triangles * 2 === all.triangles, `${one.triangles} ${all.triangles}`);
  const step1 = exportBody(sc, "step", { bodies: [names[1]!] }), back = new Engine([{ id: "I", kind: "import", params: { format: "step", data: toBase64(step1) }, inputs: [] }]); back.build();
  check("a STEP of one body comes back as one body of 500", back.result("I").status.kind === "ok" && near(K.volume(body(back, "I").solid), 500) && body(back, "I").bodies.length === 1);
  const both = exportBody(sc, "step"), b2 = new Engine([{ id: "I", kind: "import", params: { format: "step", data: toBase64(both) }, inputs: [] }]); b2.build();
  check("a STEP of both comes back as two bodies, with ids from the file's order", b2.result("I").status.kind === "ok" && body(b2, "I").bodies.length === 2 && body(b2, "I").faces.length === 12, `${body(b2, "I").bodies.length} bodies`);
  let said = ""; try { meshOf(sc, { bodies: ["nothing"] }); } catch (x) { said = (x as Error).message; } check("a body that is not there is said", /no body called nothing/.test(said), said);
  for (const x of [e, back, b2]) x.release();
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
