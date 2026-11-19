// The about block and the Import / Export dialogs (`dec_import_export_menu`, `in_528`).
import test from "node:test";
import assert from "node:assert/strict";
import { setOC } from "replicad";
import { loadOC } from "../src/compiler/kernel/occt/oc.mjs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { aboutOf } from "../src/operation/file.ts";
import { drawSquaredRectangle, drawCircle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { exportDialog, exportWith, fitExport, importDialog, importWith, EXPORT_DEFAULTS, IMPORT_DEFAULTS, KIND_OF } from "../src/interaction/transfer.ts";
import type { ExportOptions } from "../src/interaction/transfer.ts";
import { importAny } from "../src/interaction/importfile.ts";
import { exportFile } from "../src/interaction/exportfile.ts";
import { unzip, parseStl } from "../src/compiler/meshfile.ts";
import { svgText, dxfText } from "../src/compiler/flatfile.ts";
import { parseSvg, parseDxf } from "../src/compiler/flatparse.ts";
import { boundsOf } from "../src/compiler/flatfile.ts";

await kernel.init();
setOC((await loadOC()) as never);
const XY = worldRef("XY");
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const extrude = (s: Session, lines: string[], depth: number): Session => run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: lines as never, params: { depth } } });
const block = (): Session => { let s = createSession(kernel); const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, r.command); return extrude(s, r.lines, 20); };
const post = (): Session => { let s = createSession(kernel); const c = drawCircle(scene(s), XY, [0, 0, 0], 10); s = run(s, c.command); return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 30 } } }); };
/** two blocks apart: two bodies */
const two = (): Session => {
  let s = createSession(kernel);
  const a = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command); s = extrude(s, a.lines, 20);
  const b = drawSquaredRectangle(scene(s), XY, [100, 0, 0], [110, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: b.lines as never, params: { depth: 10, mode: "new" } } });
};
const bodyRefs = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => p.ref);
const opts = (o: Partial<ExportOptions> = {}): ExportOptions => ({ ...EXPORT_DEFAULTS, ...o });
const field = (d: ReturnType<typeof exportDialog>, id: string) => d.fields.find((f) => f.id === id);
const volume = (s: Session) => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);

// ---------- the about block ----------
test("a project file says at its top what made it and when; a file saved before opens as it did and has none; a damaged block is not an about", () => {
  const s = block();
  const text = saveText(s, { app: "CAD", build: "abc123", saved: "2026-11-16T09:30:00.000Z" });
  assert.ok(text.startsWith('{"format":"cad-project","version":1,"about":{"app":"CAD","build":"abc123","saved":"2026-11-16T09:30:00.000Z"},"base"'), text.slice(0, 120));
  assert.deepEqual(aboutOf(text), { app: "CAD", build: "abc123", saved: "2026-11-16T09:30:00.000Z" });
  const back = openSession(kernel, text);
  assert.ok(back.ok, back.ok ? "" : back.error);
  if (back.ok) assert.ok(Math.abs(volume(back.value) - 16000) < 1e-3);
  const old = saveText(s);
  assert.equal(aboutOf(old), null);
  assert.ok(openSession(kernel, old).ok, "a file with no about block opens");
  for (const bad of ["not json", "{}", '{"about":{"app":1}}', "null", '{"about":"x"}']) assert.equal(aboutOf(bad), null, bad);
});

// ---------- the Export dialog ----------
test("with nothing to export every format is greyed out with its reason; with a body the 3D ones are on and the quality is asked only for the meshes", () => {
  const empty = exportDialog(createSession(kernel), opts());
  assert.ok(field(empty, "format")!.choices!.filter((c) => c.value !== "project").every((c) => /nothing to export yet/.test(c.disabled ?? "")), "every format but a project (which is always there, `in_1077`)");
  const s = block();
  const stl = exportDialog(s, opts({ format: "stl" }));
  assert.deepEqual(field(stl, "format")!.choices!.map((c) => [c.value, !c.disabled]), [["project", true], ["stl", true], ["3mf", true], ["obj", true], ["step", true], ["iges", true], ["brep", true], ["svg", true], ["dxf", true]]);
  assert.ok(field(stl, "quality"), "an STL has a quality");
  assert.ok(field(exportDialog(s, opts({ format: "3mf" })), "quality"));
  assert.equal(field(exportDialog(s, opts({ format: "step" })), "quality"), undefined, "an exact solid has none");
  const svg = exportDialog(s, opts({ format: "svg" }));
  assert.equal(field(svg, "quality"), undefined);
  assert.equal(field(svg, "about")!.readonly, true);
  assert.match(String(field(svg, "about")!.value), /4 pieces/);
  assert.equal(field(svg, "perBody"), undefined, "a flat file is one file");
  assert.deepEqual(field(stl, "units")!.choices!.map((c) => c.value), ["mm", "in"]);
});

test("only the selected bodies is offered with a selection of several bodies; a file for each body with more than one body", () => {
  const s = two();
  assert.equal(bodyRefs(s).length, 2);
  const none = exportDialog(s, opts({ format: "stl" }));
  const what = field(none, "what")!;
  assert.equal(what.choices!.find((c) => c.value === "selected")!.disabled, "select a body first");
  assert.match(field(none, "perBody")!.note ?? "", /a file for each of the 2 bodies/);
  const sel = select(s, [bodyRefs(s)[0]!]);
  const d = exportDialog(sel, opts({ format: "stl", what: "selected" }));
  assert.equal(field(d, "what")!.value, "selected");
  assert.match(field(d, "what")!.choices![1]!.label, /Only the selected body \(1\)/);
  assert.equal(field(d, "perBody"), undefined, "one body: nothing to choose");
  assert.equal(fitExport(s, opts({ format: "stl", what: "selected" })).what, "all", "nothing selected: everything");
  const one = exportDialog(block(), opts({ format: "stl" }));
  assert.equal(field(one, "what")!.choices![1]!.disabled, "there is only one body");
});

test("the options are made to fit: a format with nothing to export gives way to one that has, the file name loses its path and its ending", () => {
  assert.equal(fitExport(block(), opts({ format: "stl" })).format, "stl");
  let drawn = createSession(kernel);
  drawn = run(drawn, drawSquaredRectangle(scene(drawn), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]).command);
  assert.equal(fitExport(drawn, opts({ format: "stl" })).format, "svg", "a drawing and no body: a flat format");
  assert.equal(fitExport(block(), opts({ name: " a/b:c.stl " })).name, "a-b-c");
  assert.equal(fitExport(block(), opts({ name: "plain" })).name, "plain");
  assert.equal(fitExport(createSession(kernel), {}).format, "project", "the project is what is exported first: it needs nothing to be there (`in_1077`)");
  // options that are not all there (nothing kept yet, or only some of it) are the usual for what is missing: the dialog opens with them
  assert.deepEqual(fitExport(block(), {}), { ...EXPORT_DEFAULTS, format: "project", name: "" });
  assert.doesNotThrow(() => exportDialog(block(), { format: "3mf" }));
  assert.doesNotThrow(() => importDialog("a.stl", {}));
});

// ---------- what the options do to the files ----------
test("in inches: an STL has the numbers over 25.4 and says so; a 3MF says inch; a STEP says inch and reads back as the same body", async () => {
  const s = block();
  const stl = await exportWith(s, kernel, opts({ format: "stl", units: "in" }));
  assert.ok(stl.ok, stl.ok ? "" : stl.error);
  if (stl.ok) {
    assert.equal(stl.name, "model.stl");
    assert.match(new TextDecoder().decode(stl.bytes.subarray(0, 40)), /, in, Z up/);
    const t = parseStl(stl.bytes);
    assert.ok(t.ok);
    if (t.ok) { const xs = Array.from({ length: t.value.length / 3 }, (_, i) => t.value[3 * i]!); assert.ok(Math.abs(Math.max(...xs) - 40 / 25.4) < 1e-4, `${Math.max(...xs)}`); }
    assert.match(stl.message, /1\.575 × 0\.787 × 0\.787 in/);
  }
  const mf = await exportWith(s, kernel, opts({ format: "3mf", units: "in" }));
  assert.ok(mf.ok);
  if (mf.ok) { const z = await unzip(mf.bytes); assert.ok(z.ok); if (z.ok) assert.match(new TextDecoder().decode(z.value.get("3D/3dmodel.model")!), /unit="inch"/); }
  const step = await exportWith(s, kernel, opts({ format: "step", units: "in" }));
  assert.ok(step.ok, step.ok ? "" : step.error);
  if (step.ok) {
    assert.match(new TextDecoder().decode(step.bytes), /CONVERSION_BASED_UNIT\('INCH'/);
    const back = await importAny(createSession(kernel), "x.step", step.bytes);
    assert.ok(back.ok, back.ok ? "" : back.error);
    if (back.ok) assert.ok(Math.abs(volume(back.session) - 16000) < 1e-2, `the same body: ${volume(back.session)}`);
  }
});

test("the unit of a STEP export does not stay: after one in inches the next in millimetres is in millimetres (the kernel keeps the setting)", async () => {
  const s = block();
  const text = async (units: "mm" | "in") => { const r = await exportWith(s, kernel, opts({ format: "step", units })); assert.ok(r.ok); return new TextDecoder().decode((r as { bytes: Uint8Array }).bytes); };
  const [a, b, c] = [await text("in"), await text("mm"), await text("in")];
  assert.ok(/CONVERSION_BASED_UNIT\('INCH'/.test(a) && !/CONVERSION_BASED_UNIT\('INCH'/.test(b) && /CONVERSION_BASED_UNIT\('INCH'/.test(c));
  assert.match(b, /CARTESIAN_POINT\('',\(40\.,/, "millimetres: 40 along x");
});

test("the mesh quality changes the number of triangles: coarse is fewer than fine", async () => {
  const fine = await exportWith(post(), kernel, opts({ format: "stl", quality: "fine" }));
  const coarse = await exportWith(post(), kernel, opts({ format: "stl", quality: "coarse" }));
  assert.ok(fine.ok && coarse.ok);
  if (fine.ok && coarse.ok) assert.ok(coarse.bytes.length < fine.bytes.length / 2, `${coarse.bytes.length} against ${fine.bytes.length}`);
});

test("only the selected body, and a file for each body in one zip", async () => {
  const s = two();
  const [a, b] = bodyRefs(s);
  const whole = await exportWith(s, kernel, opts({ format: "stl" }));
  const onlyA = await exportWith(select(s, [a!]), kernel, opts({ format: "stl", what: "selected" }));
  assert.ok(whole.ok && onlyA.ok);
  if (whole.ok && onlyA.ok) assert.ok(onlyA.bytes.length < whole.bytes.length, "one body is fewer triangles than two");
  const zip = await exportWith(s, kernel, opts({ format: "step", perBody: true, name: "parts" }));
  assert.ok(zip.ok, zip.ok ? "" : zip.error);
  if (zip.ok) {
    assert.equal(zip.name, "parts.zip");
    assert.equal(zip.mime, "application/zip");
    const z = await unzip(zip.bytes);
    assert.ok(z.ok);
    if (z.ok) { assert.equal(z.value.size, 2); assert.ok([...z.value.keys()].every((k) => /^parts-.+\.step$/.test(k)), [...z.value.keys()].join()); for (const f of z.value.values()) assert.match(new TextDecoder().decode(f), /^ISO-10303-21/); }
    assert.match(zip.message, /exported 2 files \(STEP, mm\) in parts\.zip/);
  }
  void b;
});

test("a flat drawing in inches: the SVG says in and has the numbers over 25.4, the DXF says inches in its header; both come back the same size", () => {
  const pieces = [{ k: "seg", p: [0, 0], q: [50.8, 0] }, { k: "seg", p: [50.8, 0], q: [50.8, 25.4] }, { k: "circle", c: [10, 10], r: 5 }] as never;
  const svg = svgText(pieces, "t", "in");
  assert.match(svg, /width="2\.07874in" height="1\.07874in"/);
  const back = parseSvg(svg, { unitMm: 25.4 });
  assert.ok(back.ok);
  if (back.ok) { const b = boundsOf(back.pieces)!; assert.ok(Math.abs(b.max[0] - 50.8) < 1e-3 && Math.abs(b.max[1] - 25.4) < 1e-3, JSON.stringify(b)); }
  const dxf = dxfText(pieces, "in");
  assert.match(dxf, /\$INSUNITS\n70\n1\n/);
  const d = parseDxf(dxf);
  assert.ok(d.ok);
  if (d.ok) { const b = boundsOf(d.pieces)!; assert.ok(Math.abs(b.max[0] - 50.8) < 1e-3, `a file in inches comes back in millimetres: ${b.max[0]}`); }
});

// ---------- the Import dialog ----------
test("what the import asks depends on the kind of file: units only where they are not already known, where a drawing goes only for drawings", () => {
  assert.equal(KIND_OF("a.STP"), "step");
  assert.equal(KIND_OF("a.txt"), null);
  const ids = (n: string) => importDialog(n, IMPORT_DEFAULTS).fields.map((f) => f.id);
  assert.deepEqual(ids("a.step"), ["file", "scale", "place"], "a STEP says its units itself");
  assert.deepEqual(ids("a.stl"), ["file", "units", "scale", "place", "repair", "reduce"]);
  assert.deepEqual(ids("a.3mf"), ["file", "units", "scale", "place", "repair", "reduce"]);
  assert.deepEqual(ids("a.svg"), ["file", "units", "scale", "place", "plane"]);
  assert.deepEqual(ids("a.dxf"), ["file", "units", "scale", "place", "plane"]);
  const stl = importDialog("a.stl", IMPORT_DEFAULTS).fields.find((f) => f.id === "units")!;
  assert.ok(!stl.choices!.some((c) => c.value === "file") && stl.value === "mm", "an STL has no units of its own: millimetres");
  assert.deepEqual(importDialog("a.svg", IMPORT_DEFAULTS).fields.find((f) => f.id === "place")!.choices!.map((c) => c.value), ["file", "center"], "a drawing has no floor");
  assert.deepEqual(importDialog("a.stl", IMPORT_DEFAULTS).fields.find((f) => f.id === "place")!.choices!.map((c) => c.value), ["file", "center", "floor"]);
});

const cubeStl = (e: number, at = [0, 0, 0]): Uint8Array => {
  const p = (i: number) => [at[0]! + (i & 1) * e, at[1]! + ((i >> 1) & 1) * e, at[2]! + ((i >> 2) & 1) * e];
  const quad = (a: number, b: number, c: number, d: number) => [...p(a), ...p(b), ...p(c), ...p(a), ...p(c), ...p(d)];
  const corners = [...quad(0, 2, 3, 1), ...quad(4, 5, 7, 6), ...quad(0, 1, 5, 4), ...quad(2, 6, 7, 3), ...quad(0, 4, 6, 2), ...quad(1, 3, 7, 5)];
  const out = new Uint8Array(84 + 50 * 12); const v = new DataView(out.buffer); v.setUint32(80, 12, true);
  for (let t = 0; t < 12; t++) for (let k = 0; k < 9; k++) v.setFloat32(84 + 50 * t + 12 + 4 * k, corners[t * 9 + k]!, true);
  return out;
};
const boxOf = (s: Session) => (Object.values(scene(s).parts).find((p) => p.kind === "body") as unknown as { bbox: { min: number[]; max: number[] } }).bbox;

test("an STL read as inches and scaled, and put on the XY plane or at the origin", async () => {
  const base = { ...IMPORT_DEFAULTS };
  const inches = await importWith(createSession(kernel), "c.stl", cubeStl(10), { ...base, units: "in" });
  assert.ok(inches.ok, inches.ok ? "" : inches.error);
  if (inches.ok) { assert.ok(Math.abs(volume(inches.session) - 254 ** 3) / 254 ** 3 < 1e-6, `${volume(inches.session)}`); assert.match(inches.message, /read as in/); }
  const twice = await importWith(createSession(kernel), "c.stl", cubeStl(10), { ...base, scale: 2 });
  assert.ok(twice.ok);
  if (twice.ok) { assert.ok(Math.abs(volume(twice.session) - 8000) < 1e-6); assert.match(twice.message, /scaled by 2/); }
  const centred = await importWith(createSession(kernel), "c.stl", cubeStl(10, [100, 50, 30]), { ...base, place: "center" });
  assert.ok(centred.ok);
  if (centred.ok) { const b = boxOf(centred.session); assert.ok([0, 1, 2].every((i) => Math.abs(b.min[i]! + 5) < 1e-6 && Math.abs(b.max[i]! - 5) < 1e-6), JSON.stringify(b)); }
  const floor = await importWith(createSession(kernel), "c.stl", cubeStl(10, [100, 50, 30]), { ...base, place: "floor" });
  assert.ok(floor.ok);
  if (floor.ok) { const b = boxOf(floor.session); assert.ok(Math.abs(b.min[2]!) < 1e-6 && Math.abs(b.max[2]! - 10) < 1e-6 && Math.abs(b.min[0]! + 5) < 1e-6, JSON.stringify(b)); }
  const silly = await importWith(createSession(kernel), "c.stl", cubeStl(10), { ...base, scale: Number.NaN });
  assert.ok(silly.ok && Math.abs(volume(silly.session) - 1000) < 1e-6, "a scale that is not a number is one");
});

test("a STEP scaled and put on the floor by the kernel, in one step", async () => {
  const step = await exportFile(block(), kernel, "step");
  assert.ok(step.ok);
  if (!step.ok) return;
  const r = await importWith(createSession(kernel), "b.step", step.bytes, { ...IMPORT_DEFAULTS, scale: 0.5, place: "floor" });
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (r.ok) {
    assert.ok(Math.abs(volume(r.session) - 2000) < 1e-3, `${volume(r.session)}`);
    const b = boxOf(r.session);
    assert.ok(Math.abs(b.min[2]!) < 1e-6 && Math.abs(b.min[0]! + 10) < 1e-6 && Math.abs(b.max[0]! - 10) < 1e-6, JSON.stringify(b));
    assert.equal(scene(r.session).steps.length, 1, "one step");
    assert.match(r.message, /scaled by 0\.5, put on the XY plane, centred/);
  }
});

test("a drawing read in inches, scaled, centred, and put on the XZ plane", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2in" height="1in" viewBox="0 0 2 1"><rect x="10" y="20" width="2" height="1"/></svg>`;
  const bytes = new TextEncoder().encode(svg);
  const asFile = await importWith(createSession(kernel), "r.svg", bytes, { ...IMPORT_DEFAULTS, plane: "XZ" });
  assert.ok(asFile.ok, asFile.ok ? "" : asFile.error);
  const corners = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => (p as unknown as { at: number[] }).at);
  if (asFile.ok) { assert.ok(corners(asFile.session).every((c) => c[1] === 0), "on the XZ plane: y is 0"); assert.ok(corners(asFile.session).some((c) => Math.abs(c[0]! - 25.4 * 10) < 1e-6 && Math.abs(c[2]! + 25.4 * 20) < 1e-6), "the file's inches: 1 unit is 25.4 mm"); }
  const centred = await importWith(createSession(kernel), "r.svg", bytes, { ...IMPORT_DEFAULTS, units: "mm", scale: 2, place: "center" });
  assert.ok(centred.ok);
  if (centred.ok) { const xs = corners(centred.session).map((c) => c[0]!); assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 1e-6 && Math.abs(Math.max(...xs) - Math.min(...xs) - 4) < 1e-6, `${xs}`); assert.match(centred.message, /read as mm; scaled by 2; its middle put at the origin/); }
});
