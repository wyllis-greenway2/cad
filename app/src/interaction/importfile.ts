// Import (`dec_import`): a STEP file becomes a body with no history (a step that holds the file's text), an SVG or a DXF becomes a sketch of lines, arcs and circles on a plane. One place that says what a file is, where it goes and what it said.
import type { Command } from "../operation/commands.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { worldRef, drawnRef, formatId } from "../shared/ref.ts";
import { liftOf } from "../operation/part.ts";
import type { Plane } from "../operation/part.ts";
import { parseSvg, parseDxf } from "../compiler/flatparse.ts";
import { parseStl, parse3mf, weld, shellsOf, MAX_MESH_TRIANGLES } from "../compiler/meshfile.ts";
import type { Mesh } from "../compiler/meshfile.ts";
import { encodeMesh } from "../compiler/kernel/occt/meshdata.mjs";
import type { Piece, V2 } from "../compiler/flatfile.ts";
import { planeForDrawing } from "./tools.ts";
import { apply } from "../operation/commands.ts";
import type { Session } from "./session.ts";
import { run, scene as sceneOf } from "./session.ts";

/** The most of a STEP file kept in a project: its text travels with every save and every evaluation of the model. */
const MAX_STEP_BYTES = 25e6;
/** The most faces a mesh body may have once its flat areas are joined: the app lists and draws every face of a body on each change (about 0.7 ms a face). */
const MAX_MESH_FACES = 6000;
export const IMPORT_KINDS = ".step,.stp,.svg,.dxf,.stl,.3mf";

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
export function importFile(s: Session, name: string, text: string): ImportOutcome {
  const ext = extOf(name);
  const scene = sceneOf(s);
  if (ext === "step" || ext === "stp") {
    if (text.length > MAX_STEP_BYTES) return { ok: false, error: `this STEP file is ${(text.length / 1e6).toFixed(0)} MB: the app keeps the file inside the project and takes up to ${MAX_STEP_BYTES / 1e6} MB` };
    if (!/^\s*ISO-10303-21/.test(text)) return { ok: false, error: "this is not a STEP file (it does not start with ISO-10303-21)" };
    const done = run(s, { type: "addStep", step: { id: nextId(scene, "s"), type: "import", parts: [], params: { data: text, name } } });
    if (sceneOf(done).steps.length === scene.steps.length) return { ok: false, error: done.message ?? "the STEP file could not be imported" };
    const bodies = Object.values(sceneOf(done).parts).filter((p) => p.kind === "body").length - Object.values(scene.parts).filter((p) => p.kind === "body").length;
    return { ok: true, session: done, message: `imported ${name}: ${bodies > 1 ? `${bodies} bodies` : "a body"} with no history (push, pull, cut, fillet and mate it; it cannot be edited as a recipe)` };
  }
  if (ext === "svg" || ext === "dxf") {
    const parsed = ext === "svg" ? parseSvg(text) : parseDxf(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const cmd = sketchCommand(scene, parsed.pieces, importPlane(scene, s.click.selection));
    if (!cmd) return { ok: false, error: "nothing could be drawn from this file" };
    const done = run(s, cmd);
    if (sceneOf(done) === scene || done.message) return { ok: false, error: done.message ?? "the drawing could not be made" };
    const n = parsed.pieces.length;
    return { ok: true, session: done, message: `imported ${name}: ${n} piece${n === 1 ? "" : "s"} as a sketch${parsed.notes.length ? `; ${parsed.notes.join("; ")}` : ""}` };
  }
  return { ok: false, error: "the app imports STEP (.step, .stp), STL, 3MF, SVG and DXF files" };
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
async function importMeshFile(s: Session, name: string, bytes: Uint8Array): Promise<ImportOutcome> {
  const ext = extOf(name);
  const scene = sceneOf(s);
  const shells: Mesh[] = [];
  const notes: string[] = [];
  if (ext === "stl") {
    const p = parseStl(bytes);
    if (!p.ok) return { ok: false, error: p.error };
    const r = shellsFrom(p.value, "");
    if (!r.ok) return r;
    shells.push(...r.shells); notes.push(...r.notes);
  } else {
    const p = await parse3mf(bytes);
    if (!p.ok) return { ok: false, error: p.error };
    notes.push(...p.notes);
    for (const o of p.value) {
      const r = shellsFrom(o.corners, o.name ? `${o.name}` : "");
      if (!r.ok) return r;
      shells.push(...r.shells); notes.push(...r.notes);
    }
  }
  const triangles = shells.reduce((a, m) => a + m.triangles.length / 3, 0);
  if (triangles > MAX_MESH_TRIANGLES) return { ok: false, error: `this mesh has ${triangles.toLocaleString("en-US")} triangles: the app imports up to ${MAX_MESH_TRIANGLES.toLocaleString("en-US")}` };
  const done = run(s, { type: "addStep", step: { id: nextId(scene, "s"), type: "importMesh", parts: [], params: { data: shells.map(encodeMesh).join("|"), name } } });
  if (sceneOf(done).steps.length === scene.steps.length) return { ok: false, error: done.message ?? "the mesh could not be imported" };
  const made = Object.values(sceneOf(done).parts).filter((p) => p.kind === "body").length - Object.values(scene.parts).filter((p) => p.kind === "body").length;
  const faces = Object.values(sceneOf(done).parts).filter((p) => p.kind === "plane" && p.origin === "body").length - Object.values(scene.parts).filter((p) => p.kind === "plane" && p.origin === "body").length;
  if (faces > MAX_MESH_FACES) return { ok: false, error: `this mesh is ${faces.toLocaleString("en-US")} faces even with its flat areas joined: over the ${MAX_MESH_FACES.toLocaleString("en-US")} the app handles comfortably (every change would take seconds). Reduce it first in a mesh program (Decimate in Blender, Simplify in MeshLab or PrusaSlicer) and import that` };
  return { ok: true, session: done, message: `imported ${name}: ${made > 1 ? `${made} bodies` : "a body"} made of ${triangles.toLocaleString("en-US")} triangles (flat areas joined into single faces), with no history: it can be moved, cut, mated and exported; its curved parts are many small flat faces, so they cannot be filleted${notes.length ? `; ${[...new Set(notes)].join("; ")}` : ""}` };
}

/** Import any kind of file the app reads, from its bytes. */
export async function importAny(s: Session, name: string, bytes: Uint8Array): Promise<ImportOutcome> {
  const ext = extOf(name);
  if (ext === "stl" || ext === "3mf") return importMeshFile(s, name, bytes);
  return importFile(s, name, new TextDecoder().decode(bytes));
}
