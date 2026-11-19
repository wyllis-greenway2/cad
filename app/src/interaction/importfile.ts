// Import (`dec_import`): a STEP file becomes a body with no history (a step that holds the file's text), an SVG or a DXF becomes a sketch of lines, arcs and circles on a plane. One place that says what a file is, where it goes and what it said.
import type { Command } from "../operation/commands.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { worldRef, drawnRef, formatId } from "../shared/ref.ts";
import { liftOf } from "../operation/part.ts";
import type { Plane } from "../operation/part.ts";
import { parseSvg, parseDxf, binaryDxfText } from "../compiler/flatparse.ts";
import { parseFcstd } from "../compiler/fcstd.ts";
import { parseStl, parseObj, parse3mf, weld, shellsOf, MAX_MESH_TRIANGLES } from "../compiler/meshfile.ts";
import type { Mesh } from "../compiler/meshfile.ts";
import { encodeMesh } from "../compiler/kernel/occt/meshdata.mjs";
import type { Piece, V2 } from "../compiler/flatfile.ts";
import { scaledPieces, movedPieces, boundsOf } from "../compiler/flatfile.ts";
import { planeForDrawing } from "./tools.ts";
import { apply } from "../operation/commands.ts";
import type { Session } from "./session.ts";
import { run, scene as sceneOf } from "./session.ts";

/** The most of a STEP file kept in a project: its text travels with every save and every evaluation of the model. */
const MAX_STEP_BYTES = 25e6;
/** The most faces a mesh body may have once its flat areas are joined: the app lists and draws every face of a body on each change (about 0.7 ms a face). */
const MAX_MESH_FACES = 6000;
export const IMPORT_KINDS = ".step,.stp,.svg,.dxf,.stl,.3mf,.obj,.brep,.brp,.fcstd";

/** The choices an import has (`dec_import_export_menu`): the units the numbers in the file are in (`file`: what it says itself; an STL says nothing and is millimetres), a further scale, where it is put, and for a drawing the plane. */
export interface ImportOptions { units: "file" | "mm" | "cm" | "in" | "m"; scale: number; place: "file" | "center" | "floor"; plane: "selected" | "XY" | "XZ" | "YZ" }
export const IMPORT_DEFAULTS: ImportOptions = { units: "file", scale: 1, place: "file", plane: "selected" };
const UNIT_MM = { mm: 1, cm: 10, in: 25.4, m: 1000 } as const;
const unitMmOf = (o: ImportOptions): number | undefined => (o.units === "file" ? undefined : UNIT_MM[o.units]);
const optionNote = (o: ImportOptions): string[] => [...(o.units !== "file" ? [`read as ${o.units}`] : []), ...(o.scale !== 1 ? [`scaled by ${o.scale}`] : []), ...(o.place === "center" ? ["its middle put at the origin"] : o.place === "floor" ? ["put on the XY plane, centred"] : [])];
export type ImportOutcome = { ok: true; session: Session; message: string } | { ok: false; error: string };

/** The plane a flat drawing goes on: the plane (or the face of a body, or the figure's plane) that is selected, else the XY plane of the world. */
export function importPlane(scene: Scene, selection: readonly Ref[]): Ref {
  const first = selection.length === 1 ? scene.parts[selection[0]!] : undefined;
  if (first?.kind === "plane") return first.ref;
  if (first?.kind === "face" && first.plane) return first.plane;
  return worldRef("XY");
}

/** The commands that draw `pieces` as a sketch on `planeRef`: the corners (shared where pieces meet, so closed figures are figures), a line for each side, an arc about its centre for each arc, a circle for each circle. Null when there is nothing to draw. */
export function sketchCommand(scene: Scene, pieces: readonly Piece[], planeRef: Ref): Command | null {
  const pl0 = scene.parts[planeRef];
  if (!pl0 || pl0.kind !== "plane") return null;
  const draw = planeForDrawing(scene, planeRef); // (a face of the body is drawn on as a plane of its own that goes with the body)
  const withPlane = draw.command ? apply(scene, draw.command) : null;
  const sc = withPlane && withPlane.ok ? withPlane.value : scene;
  const pl = sc.parts[draw.plane] as Plane;
  if (!pl || pl.kind !== "plane") return null;
  const id = nextId(sc, "e");
  const base = { origin: "drawn" as const, plane: draw.plane, movable: true };
  const commands: Command[] = draw.command ? [draw.command] : [];
  const at = new Map<string, Ref>();
  let n = 0;
  const corner = (p: V2): Ref => {
    const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
    const known = at.get(key);
    if (known) return known;
    const ref = drawnRef(`${id}.p${n++}`);
    at.set(key, ref);
    commands.push({ type: "addPart", part: { ...base, ref, kind: "corner", at: liftOf(pl, p) } });
    return ref;
  };
  let rid = sc.counter;
  let k = 0;
  for (const p of pieces) {
    if (p.k === "seg") { const [a, b] = [corner(p.p), corner(p.q)]; if (a !== b) commands.push({ type: "addPart", part: { ...base, ref: drawnRef(`${id}.s${k++}`), kind: "line", a, b } }); }
    else if (p.k === "circle") commands.push({ type: "addPart", part: { ...base, ref: drawnRef(`${id}.k${k++}`), kind: "circle", center: corner(p.c), radius: p.r } });
    else {
      const [a, b, c] = [corner(p.p), corner(p.q), corner(p.c)];
      const line = drawnRef(`${id}.s${k++}`);
      commands.push({ type: "addPart", part: { ...base, ref: line, kind: "line", a, b, center: c, ccw: p.ccw } });
      commands.push({ type: "addRelation", relation: { id: formatId("r", ++rid), kind: "arcEnds", parts: [line, c] } });
    }
  }
  return commands.length > (draw.command ? 1 : 0) ? { type: "batch", commands } : null;
}

const extOf = (name: string): string => (/\.([^.]+)$/.exec(name)?.[1] ?? "").toLowerCase();

/** Bring a file into the model: the session with it added, and what it said (what was made, what was left out). */
export function importFile(s: Session, name: string, text: string, o: ImportOptions = IMPORT_DEFAULTS): ImportOutcome {
  const ext = extOf(name);
  const scene = sceneOf(s);
  if (ext === "step" || ext === "stp") {
    if (text.length > MAX_STEP_BYTES) return { ok: false, error: `this STEP file is ${(text.length / 1e6).toFixed(0)} MB: the app keeps the file inside the project and takes up to ${MAX_STEP_BYTES / 1e6} MB` };
    if (!/^\s*ISO-10303-21/.test(text)) return { ok: false, error: "this is not a STEP file (it does not start with ISO-10303-21)" };
    const done = run(s, { type: "addStep", step: { id: nextId(scene, "s"), type: "import", parts: [], params: { data: text, name, ...(o.scale !== 1 ? { scale: o.scale } : {}), ...(o.place !== "file" ? { place: o.place } : {}) } } });
    if (sceneOf(done).steps.length === scene.steps.length) return { ok: false, error: done.message ?? "the STEP file could not be imported" };
    const bodies = Object.values(sceneOf(done).parts).filter((p) => p.kind === "body").length - Object.values(scene.parts).filter((p) => p.kind === "body").length;
    return { ok: true, session: done, message: `imported ${name}: ${bodies > 1 ? `${bodies} bodies` : "a body"} with no history (push, pull, cut, fillet and mate it; it cannot be edited as a recipe)${optionNote({ ...o, units: "file" }).length ? `; ${optionNote({ ...o, units: "file" }).join(", ")}` : ""}` };
  }
  if (ext === "svg" || ext === "dxf") {
    const parsed = ext === "svg" ? parseSvg(text, { unitMm: unitMmOf(o) }) : parseDxf(text, { unitMm: unitMmOf(o) });
    if (!parsed.ok) return { ok: false, error: parsed.error };
    let pieces = o.scale !== 1 ? scaledPieces(parsed.pieces, o.scale) : parsed.pieces;
    if (o.place !== "file") { const b = boundsOf(pieces)!; pieces = movedPieces(pieces, [-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]); } // (a drawing has no floor: both put its middle at the origin)
    const planeRef = o.plane === "selected" ? importPlane(scene, s.click.selection) : worldRef(o.plane);
    const cmd = sketchCommand(scene, pieces, planeRef);
    if (!cmd) return { ok: false, error: "nothing could be drawn from this file" };
    const done = run(s, cmd);
    if (sceneOf(done) === scene || done.message) return { ok: false, error: done.message ?? "the drawing could not be made" };
    const n = parsed.pieces.length;
    const extra = [...parsed.notes, ...optionNote(o)];
    return { ok: true, session: done, message: `imported ${name}: ${n} piece${n === 1 ? "" : "s"} as a sketch${extra.length ? `; ${extra.join("; ")}` : ""}` };
  }
  return { ok: false, error: "the app imports STEP (.step, .stp), BREP (.brep), FreeCAD (.FCStd), STL, 3MF, OBJ, SVG and DXF files" };
}

/** The cleaned shells of some triangle corners (nine numbers a triangle): joined, closed, turned the right way; or why not. */
function shellsFrom(corners: ArrayLike<number>, label: string): { ok: true; shells: Mesh[]; notes: string[] } | { ok: false; error: string } {
  const w = weld(corners);
  const r = shellsOf(w.mesh);
  if (!r.ok) return { ok: false, error: label ? `${label}: ${r.error}` : r.error };
  const notes: string[] = [];
  if (w.dropped) notes.push(`${w.dropped} triangle${w.dropped === 1 ? "" : "s"} with no area left out`);
  if (r.value.turned) notes.push(`${r.value.turned} triangle${r.value.turned === 1 ? "" : "s"} turned to face the same way as their neighbours`);
  if (r.value.insideOut) notes.push(`${r.value.insideOut === 1 ? "a body that was" : `${r.value.insideOut} bodies that were`} inside out turned the right way`);
  return { ok: true, shells: r.value.shells, notes };
}

/** Bring an STL or a 3MF in as bodies (`dec_import_mesh`): each closed shell is a body made of faces that are its triangles (the flat areas joined), with no history. The mesh is cleaned here and kept in the step. */
async function importMeshFile(s: Session, name: string, bytes: Uint8Array, o: ImportOptions): Promise<ImportOutcome> {
  const ext = extOf(name);
  const scene = sceneOf(s);
  const shells: Mesh[] = [];
  const notes: string[] = [];
  // the objects' corners (nine numbers a triangle), turned into millimetres, scaled and placed together
  let objects: { name: string; corners: Float64Array }[];
  if (ext === "stl" || ext === "obj") {
    const p = ext === "stl" ? parseStl(bytes) : parseObj(new TextDecoder().decode(bytes));
    if (!p.ok) return { ok: false, error: p.error };
    notes.push(...p.notes);
    const k = o.units === "file" ? 1 : UNIT_MM[o.units]; // (an STL or an OBJ has no unit of its own: millimetres)
    objects = [{ name: "", corners: k === 1 ? p.value : p.value.map((x) => x * k) }];
  } else {
    const p = await parse3mf(bytes, { unitMm: unitMmOf(o) });
    if (!p.ok) return { ok: false, error: p.error };
    notes.push(...p.notes);
    objects = p.value;
  }
  if (o.scale !== 1) for (const ob of objects) ob.corners = ob.corners.map((x) => x * o.scale);
  if (o.place !== "file") {
    const [lo, hi] = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    for (const ob of objects) for (let i = 0; i < ob.corners.length; i++) { const c = i % 3; lo[c] = Math.min(lo[c]!, ob.corners[i]!); hi[c] = Math.max(hi[c]!, ob.corners[i]!); }
    const by = [-(lo[0]! + hi[0]!) / 2, -(lo[1]! + hi[1]!) / 2, o.place === "floor" ? -lo[2]! : -(lo[2]! + hi[2]!) / 2];
    for (const ob of objects) ob.corners = ob.corners.map((x, i) => x + by[i % 3]!);
  }
  for (const ob of objects) {
    const r = shellsFrom(ob.corners, ob.name);
    if (!r.ok) return r;
    shells.push(...r.shells); notes.push(...r.notes);
  }
  notes.push(...optionNote({ ...o, units: ext === "stl" || ext === "obj" ? o.units : "file" }));
  const triangles = shells.reduce((a, m) => a + m.triangles.length / 3, 0);
  if (triangles > MAX_MESH_TRIANGLES) return { ok: false, error: `this mesh has ${triangles.toLocaleString("en-US")} triangles: the app imports up to ${MAX_MESH_TRIANGLES.toLocaleString("en-US")}` };
  const done = run(s, { type: "addStep", step: { id: nextId(scene, "s"), type: "importMesh", parts: [], params: { data: shells.map(encodeMesh).join("|"), name } } });
  if (sceneOf(done).steps.length === scene.steps.length) return { ok: false, error: done.message ?? "the mesh could not be imported" };
  const made = Object.values(sceneOf(done).parts).filter((p) => p.kind === "body").length - Object.values(scene.parts).filter((p) => p.kind === "body").length;
  const faces = Object.values(sceneOf(done).parts).filter((p) => p.kind === "plane" && p.origin === "body").length - Object.values(scene.parts).filter((p) => p.kind === "plane" && p.origin === "body").length;
  if (faces > MAX_MESH_FACES) return { ok: false, error: `this mesh is ${faces.toLocaleString("en-US")} faces even with its flat areas joined: over the ${MAX_MESH_FACES.toLocaleString("en-US")} the app handles comfortably (every change would take seconds). Reduce it first in a mesh program (Decimate in Blender, Simplify in MeshLab or PrusaSlicer) and import that` };
  return { ok: true, session: done, message: `imported ${name}: ${made > 1 ? `${made} bodies` : "a body"} made of ${triangles.toLocaleString("en-US")} triangles (flat areas joined into single faces), with no history: it can be moved, cut, mated and exported; its curved parts are many small flat faces, so they cannot be filleted${notes.length ? `; ${[...new Set(notes)].join("; ")}` : ""}` };
}

/** Solids from BREP text (OpenCASCADE's own format, no unit: millimetres unless the person says otherwise), kept in the step like a STEP file's text; several BREP texts are joined by a NUL. */
function importBrepData(s: Session, name: string, data: string, o: ImportOptions, what: string, notes: string[] = []): ImportOutcome {
  const scene = sceneOf(s);
  if (data.length > MAX_STEP_BYTES) return { ok: false, error: `this file is ${(data.length / 1e6).toFixed(0)} MB of shape data: the app keeps it inside the project and takes up to ${MAX_STEP_BYTES / 1e6} MB` };
  const k = (o.units === "file" ? 1 : UNIT_MM[o.units]) * o.scale;
  const done = run(s, { type: "addStep", step: { id: nextId(scene, "s"), type: "import", parts: [], params: { data, name, format: "brep", ...(k !== 1 ? { scale: k } : {}), ...(o.place !== "file" ? { place: o.place } : {}) } } });
  if (sceneOf(done).steps.length === scene.steps.length) return { ok: false, error: done.message ?? `the ${what} could not be imported` };
  const bodies = Object.values(sceneOf(done).parts).filter((p) => p.kind === "body").length - Object.values(scene.parts).filter((p) => p.kind === "body").length;
  const extra = [...notes, ...optionNote(o)];
  return { ok: true, session: done, message: `imported ${name}: ${bodies > 1 ? `${bodies} bodies` : "a body"} with no history (push, pull, cut, fillet and mate it; it cannot be edited as a recipe)${extra.length ? `; ${extra.join("; ")}` : ""}` };
}

/** Import any kind of file the app reads, from its bytes. */
export async function importAny(s: Session, name: string, bytes: Uint8Array, o: ImportOptions = IMPORT_DEFAULTS): Promise<ImportOutcome> {
  const ext = extOf(name);
  if (ext === "stl" || ext === "3mf" || ext === "obj") return importMeshFile(s, name, bytes, o);
  if (ext === "brep" || ext === "brp") return importBrepData(s, name, new TextDecoder().decode(bytes), o, "BREP file");
  if (ext === "fcstd") {
    const p = await parseFcstd(bytes);
    if (!p.ok) return { ok: false, error: p.error };
    return importBrepData(s, name, p.value.map((x) => x.brep).join("\0"), o, "FreeCAD document", p.notes);
  }
  if (ext === "dxf" && new TextDecoder("latin1").decode(bytes.subarray(0, 18)) === "AutoCAD Binary DXF") {
    const t = binaryDxfText(bytes);
    if (!t.ok) return { ok: false, error: t.error };
    const r = importFile(s, name, t.text, o);
    return r.ok ? { ...r, message: `${r.message}; a binary DXF, read as it stands` } : r;
  }
  return importFile(s, name, new TextDecoder().decode(bytes), o);
}
