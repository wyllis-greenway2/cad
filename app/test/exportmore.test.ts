// DXF with the outlines joined into paths, and a 3MF with an object for each body (`dec_export_more`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { exportDialog, exportWith, fitExport, EXPORT_DEFAULTS } from "../src/interaction/transfer.ts";
import { dxfText, runsOf, boundsOf, sweepOf } from "../src/compiler/flatfile.ts";
import type { Piece } from "../src/compiler/flatfile.ts";
import { parseDxf } from "../src/compiler/flatparse.ts";
import { parse3mf, unzip } from "../src/compiler/meshfile.ts";
import { threeMfObjects } from "../src/compiler/threemf.ts";
import { importAny } from "../src/interaction/importfile.ts";

await kernel.init();
const XY = worldRef("XY");
const text = (b: Uint8Array) => new TextDecoder().decode(b);
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body");
const volume = (s: Session): number => bodies(s).reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
const block = (): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
};
const twoBodies = (): Session => {
  let s = block();
  const c = drawCircle(scene(s), XY, [100, 0, 0], 10);
  s = run(s, c.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } });
};
const seg = (p: [number, number], q: [number, number]): Piece => ({ k: "seg", p, q });
const rect: Piece[] = [seg([0, 0], [40, 0]), seg([40, 0], [40, 20]), seg([40, 20], [0, 20]), seg([0, 20], [0, 0])];
const length = (ps: readonly Piece[]): number => ps.reduce((t, p) => t + (p.k === "seg" ? Math.hypot(p.q[0] - p.p[0], p.q[1] - p.p[1]) : p.k === "arc" ? p.r * Math.abs(sweepOf(p)) : 2 * Math.PI * p.r), 0);

test("DXF joined: a rectangle is one closed POLYLINE of four vertices, not four LINEs, and reads back as the same four sides", () => {
  const d = dxfText(rect, "mm", true);
  assert.equal((d.match(/^POLYLINE$/gm) ?? []).length, 1);
  assert.equal((d.match(/^VERTEX$/gm) ?? []).length, 4);
  assert.equal((d.match(/^LINE$/gm) ?? []).length, 0);
  assert.match(d, /^SEQEND$/m);
  const back = parseDxf(d);
  assert.ok(back.ok);
  assert.equal(back.pieces.length, 4);
  assert.deepEqual(boundsOf(back.pieces), { min: [0, 0], max: [40, 20] });
  assert.ok(Math.abs(length(back.pieces) - 120) < 1e-6);
});

test("DXF joined: a rounded rectangle keeps its arcs as bulges and comes back with them; an open run is an open POLYLINE; a lone line stays a LINE; a circle stays a CIRCLE", () => {
  const r = 5;
  const arc = (c: [number, number], p: [number, number], q: [number, number]): Piece => ({ k: "arc", c, r, p, q, ccw: true });
  const rounded: Piece[] = [seg([5, 0], [35, 0]), arc([35, 5], [35, 0], [40, 5]), seg([40, 5], [40, 15]), arc([35, 15], [40, 15], [35, 20]), seg([35, 20], [5, 20]), arc([5, 15], [5, 20], [0, 15]), seg([0, 15], [0, 5]), arc([5, 5], [0, 5], [5, 0])];
  const d = dxfText([...rounded, seg([100, 0], [110, 0]), seg([200, 0], [210, 0]), seg([210, 0], [210, 10]), { k: "circle", c: [300, 0], r: 4 }], "mm", true);
  assert.equal((d.match(/^POLYLINE$/gm) ?? []).length, 2);
  assert.equal((d.match(/^LINE$/gm) ?? []).length, 1);
  assert.equal((d.match(/^CIRCLE$/gm) ?? []).length, 1);
  assert.equal((d.match(/^ 42$|^42$/gm) ?? []).length, 4, "four bulges");
  const back = parseDxf(d);
  assert.ok(back.ok);
  assert.equal(back.pieces.filter((p) => p.k === "arc").length, 4);
  assert.ok(Math.abs(length(back.pieces) - (length(rounded) + 10 + 20 + 2 * Math.PI * 4)) < 1e-6);
  const runs = runsOf(back.pieces.filter((p) => p.k !== "circle"));
  assert.deepEqual(runs.map((x) => [x.items.length, x.closed]).sort(), [[1, false], [2, false], [8, true]]);
});

test("DXF joined: pieces of a layer are joined with their own layer's, in that layer", () => {
  const cut = rect.map((p) => ({ ...p, layer: "cut" }) as Piece);
  const score = [{ ...seg([5, 5], [35, 5]), layer: "score" } as Piece, { ...seg([35, 5], [35, 15]), layer: "score" } as Piece];
  const d = dxfText([...cut, ...score], "mm", true).split("\n");
  const at = d.findIndex((l, i) => l === "POLYLINE" && d[i + 2] === "CUT");
  assert.ok(at >= 0, "the cut outline is a POLYLINE on layer CUT");
  assert.ok(d.some((l, i) => l === "POLYLINE" && d[i + 2] === "SCORE"), "the score marks are a POLYLINE on layer SCORE");
});

test("DXF joined: the default of the dialog is joined, and the option is only offered for DXF", () => {
  assert.equal(EXPORT_DEFAULTS.joined, true);
  const s = block();
  assert.ok(!exportDialog(s, { format: "stl" }).fields.some((f) => f.id === "joined"));
  assert.ok(!exportDialog(s, { format: "3mf" }).fields.some((f) => f.id === "joined"));
  assert.equal(fitExport(s, {}).joined, true);
});

test("3MF of two bodies: an object for each, named for its body, both built; reading it back gives two bodies of the right volume", async () => {
  const s = twoBodies();
  assert.equal(bodies(s).length, 2);
  const r = await exportFile(s, kernel, "3mf");
  assert.ok(r.ok, r.ok ? "" : r.error);
  assert.match(r.message, /2 objects/);
  const z = await unzip(r.bytes);
  assert.ok(z.ok);
  const xml = text(z.value.get("3D/3dmodel.model")!);
  assert.equal((xml.match(/<object /g) ?? []).length, 2);
  assert.equal((xml.match(/<item objectid=/g) ?? []).length, 2);
  const names = [...xml.matchAll(/<object id="\d+" name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), bodies(s).map((b) => (b as { id: string }).id).sort());
  const p = await parse3mf(r.bytes);
  assert.ok(p.ok);
  assert.equal(p.value.length, 2);
  const back = await importAny(createSession(kernel), "two.3mf", r.bytes);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.equal(bodies(back.session).length, 2);
  assert.ok(Math.abs(volume(back.session) - volume(s)) / volume(s) < 0.01, `${volume(back.session)} against ${volume(s)}`);
});

test("3MF of one body is one object with no name attribute, as before; of only the bodies chosen, only those", async () => {
  const one = await exportFile(block(), kernel, "3mf");
  assert.ok(one.ok);
  const z1 = await unzip(one.bytes);
  assert.ok(z1.ok);
  const xml1 = text(z1.value.get("3D/3dmodel.model")!);
  assert.equal((xml1.match(/<object /g) ?? []).length, 1);
  assert.ok(!/<object [^>]*name=/.test(xml1));
  const s = twoBodies();
  const id = (bodies(s)[0] as { id: string }).id;
  const some = await exportFile(s, kernel, "3mf", [id]);
  assert.ok(some.ok);
  const z2 = await unzip(some.bytes);
  assert.ok(z2.ok);
  assert.equal((text(z2.value.get("3D/3dmodel.model")!).match(/<object /g) ?? []).length, 1);
});

test("3MF objects: names are escaped, units say inch, and with a file for each body (the zip) each file is one object", async () => {
  const z = await unzip(threeMfObjects([{ name: 'a<"b">', vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] }, { name: "c", vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] }], "t", "in"));
  assert.ok(z.ok);
  const xml = text(z.value.get("3D/3dmodel.model")!);
  assert.match(xml, /unit="inch"/);
  assert.match(xml, /name="a&lt;&quot;b&quot;&gt;"/);
  const s = twoBodies();
  const per = await exportWith(s, kernel, { format: "3mf", perBody: true, what: "all", name: "p" });
  assert.ok(per.ok, per.ok ? "" : per.error);
  assert.equal(per.name, "p.zip");
});

test("DXF export through the dialog's options: joined gives POLYLINEs, not joined gives LINEs", async () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const j = await exportWith(s, kernel, { format: "dxf", joined: true });
  const n = await exportWith(s, kernel, { format: "dxf", joined: false });
  assert.ok(j.ok && n.ok);
  assert.equal((text(j.bytes).match(/^POLYLINE$/gm) ?? []).length, 1);
  assert.equal((text(n.bytes).match(/^LINE$/gm) ?? []).length, 4);
  assert.match(j.message, /joined into paths/);
});
