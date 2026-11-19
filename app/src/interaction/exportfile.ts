// Export in the formats the app writes (`dec_export_stl`, `dec_export_formats`): STL and 3MF from the kernel's fine mesh, STEP from the kernel's exact solid. One place that says what each is called and what it says when done.
import type { Kernel, StepSchema } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";
import { stlBytes, openEdges } from "../compiler/stl.ts";
import { objBytes } from "../compiler/obj.ts";
import { threeMfBytes, threeMfObjects, zipStored } from "../compiler/threemf.ts";
import type { Session } from "./session.ts";
import { EXPORT_QUALITY, EXPORT_NOTHING, canExport } from "./exportstl.ts";

export type ExportFormat = "stl" | "3mf" | "obj" | "step" | "iges" | "brep";
export const FORMATS: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  stl: { ext: "stl", mime: "model/stl", label: "STL" },
  "3mf": { ext: "3mf", mime: "model/3mf", label: "3MF" },
  obj: { ext: "obj", mime: "model/obj", label: "OBJ" },
  iges: { ext: "igs", mime: "model/iges", label: "IGES" },
  brep: { ext: "brep", mime: "application/octet-stream", label: "BREP" },
  step: { ext: "step", mime: "model/step", label: "STEP" },
};
/** The choices every export has (`dec_import_export_menu`): the units the numbers are in and, for the meshes, how fine they are. */
export type Units = "mm" | "in";
export type Quality = "fine" | "medium" | "coarse";
const QUALITY: Record<Quality, { tolerance: number; angular: number }> = { fine: EXPORT_QUALITY, medium: { tolerance: 0.05, angular: 0.25 }, coarse: { tolerance: 0.2, angular: 0.5 } };
export interface ExportChoices { units?: Units; quality?: Quality; /** an IGES file: the faces as trimmed surfaces (the usual: nearly every program reads them), or the solids as B-rep solids (the better programs only) */ iges?: "surfaces" | "solids"; /** a STEP file's schema (`dec_export_more`) */ schema?: StepSchema }
export type FileOutcome = { ok: true; name: string; bytes: Uint8Array; mime: string; message: string } | { ok: false; error: string };

const kb = (n: number) => (n < 1e6 ? `${(n / 1e3).toFixed(1)} KB` : `${(n / 1e6).toFixed(1)} MB`);

/** The file name for a format: `name` (or `model`, or `model-<bodies>`) with the format's own ending. */
export const fileName = (format: ExportFormat, only?: string[], base = "model"): string => `${only ? `${base}-${only.join("-")}` : base}.${FORMATS[format].ext}`;

/** Make the file of the final body (or only the bodies named) in `format`; the message says what was made. */
export async function exportFile(s: Session, kernel: Kernel, format: ExportFormat, only?: string[], name = fileName(format, only), choices: ExportChoices = {}): Promise<FileOutcome> {
  const units = choices.units ?? "mm";
  const k = units === "in" ? 1 / 25.4 : 1;
  if (!canExport(s)) return { ok: false, error: EXPORT_NOTHING };
  const label = FORMATS[format].label;
  if (format === "step" || format === "brep" || format === "iges") {
    const exact = format === "brep" ? "brep" : format === "iges" ? (choices.iges === "solids" ? "iges-solids" : "iges") : choices.schema;
    const r = await kernel.exportStep(graphOf(s.history.scene), only, format === "brep" ? undefined : units === "in" ? "in" : undefined, exact);
    if (!r.ok) return { ok: false, error: r.error };
    const kk = format === "brep" ? 1 : k; // (a BREP has no unit: millimetres)
    const dims = [0, 1, 2].map((i) => +((r.bbox.max[i]! - r.bbox.min[i]!) * kk).toFixed(units === "in" && format !== "brep" ? 3 : 2)).join(" × ");
    return { ok: true, name, bytes: r.bytes, mime: FORMATS[format].mime, message: `exported ${name}: the exact body (not a mesh), ${dims} ${format === "brep" ? "mm (a BREP has no unit)" : units}, ${format === "brep" ? "OpenCASCADE BREP" : format === "iges" ? (choices.iges === "solids" ? "IGES, B-rep solids" : "IGES, trimmed surfaces") : (choices.schema ?? "ap214").toUpperCase()}, ${kb(r.bytes.length)}` };
  }
  const q = QUALITY[choices.quality ?? "fine"];
  const ids = only ?? Object.values(s.history.scene.parts).flatMap((p) => (p.kind === "body" && p.id ? [p.id] : []));
  if (format === "3mf" && ids.length > 1) return exportObjects3mf(s, kernel, ids, q, name, units, k);
  const m = await kernel.exportMesh(graphOf(s.history.scene), only ? { ...q, bodies: only } : q);
  if (!m.ok) return { ok: false, error: m.error };
  const triangles = m.triangles.length / 3;
  if (!triangles) return { ok: false, error: EXPORT_NOTHING };
  const title = name.replace(/\.[^.]*$/, "");
  const open = openEdges(m.vertices, m.triangles);
  const vertices = k === 1 ? m.vertices : m.vertices.map((x) => x * k); // (in inches the numbers are the millimetres over 25.4)
  const bytes = format === "stl" ? stlBytes(vertices, m.triangles, title, units) : format === "obj" ? objBytes(vertices, m.triangles, title, units) : threeMfBytes(vertices, m.triangles, title, units);
  const dims = [0, 1, 2].map((i) => +((m.bbox.max[i]! - m.bbox.min[i]!) * k).toFixed(units === "in" ? 3 : 2)).join(" × ");
  return { ok: true, name, bytes, mime: FORMATS[format].mime, message: `exported ${name} (${label}): ${triangles.toLocaleString("en-US")} triangles, ${dims} ${units}, ${kb(bytes.length)}${open ? `; the mesh has ${open} open edge${open === 1 ? "" : "s"}: check it in the slicer` : ""}` };
}

/** A 3MF of several bodies: an object for each, named for the body (`dec_export_more_3mf`), so a slicer lists them apart; the mesh of each is made on its own and they stand where they are in the model. */
async function exportObjects3mf(s: Session, kernel: Kernel, ids: string[], q: { tolerance: number; angular: number }, name: string, units: Units, k: number): Promise<FileOutcome> {
  const objects: { name: string; vertices: ArrayLike<number>; triangles: ArrayLike<number> }[] = [];
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let triangles = 0, open = 0;
  for (const id of ids) {
    const m = await kernel.exportMesh(graphOf(s.history.scene), { ...q, bodies: [id] });
    if (!m.ok) return { ok: false, error: `${id}: ${m.error}` };
    if (!m.triangles.length) continue; // (a body with nothing to show: left out)
    objects.push({ name: id, vertices: k === 1 ? m.vertices : m.vertices.map((x) => x * k), triangles: m.triangles });
    triangles += m.triangles.length / 3;
    open += openEdges(m.vertices, m.triangles);
    for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i]!, m.bbox.min[i]!); box.max[i] = Math.max(box.max[i]!, m.bbox.max[i]!); }
  }
  if (!objects.length) return { ok: false, error: EXPORT_NOTHING };
  const bytes = threeMfObjects(objects, name.replace(/\.[^.]*$/, ""), units);
  const dims = [0, 1, 2].map((i) => +((box.max[i]! - box.min[i]!) * k).toFixed(units === "in" ? 3 : 2)).join(" × ");
  return { ok: true, name, bytes, mime: FORMATS["3mf"].mime, message: `exported ${name} (3MF): ${objects.length} objects (${objects.map((o) => o.name).join(", ")}), ${triangles.toLocaleString("en-US")} triangles, ${dims} ${units}, ${kb(bytes.length)}${open ? `; ${open} open edge${open === 1 ? "" : "s"} in the meshes: check them in the slicer` : ""}` };
}
