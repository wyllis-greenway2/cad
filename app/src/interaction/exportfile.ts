// Export in the formats the app writes (`dec_export_stl`, `dec_export_formats`): STL and 3MF from the kernel's fine mesh, STEP from the kernel's exact solid. One place that says what each is called and what it says when done.
import type { Kernel } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";
import { stlBytes, openEdges } from "../compiler/stl.ts";
import { threeMfBytes, zipStored } from "../compiler/threemf.ts";
import type { Session } from "./session.ts";
import { EXPORT_QUALITY, EXPORT_NOTHING, canExport } from "./exportstl.ts";

export type ExportFormat = "stl" | "3mf" | "step";
export const FORMATS: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  stl: { ext: "stl", mime: "model/stl", label: "STL" },
  "3mf": { ext: "3mf", mime: "model/3mf", label: "3MF" },
  step: { ext: "step", mime: "model/step", label: "STEP" },
};
/** The choices every export has (`dec_import_export_menu`): the units the numbers are in and, for the meshes, how fine they are. */
export type Units = "mm" | "in";
export type Quality = "fine" | "medium" | "coarse";
const QUALITY: Record<Quality, { tolerance: number; angular: number }> = { fine: EXPORT_QUALITY, medium: { tolerance: 0.05, angular: 0.25 }, coarse: { tolerance: 0.2, angular: 0.5 } };
export interface ExportChoices { units?: Units; quality?: Quality }
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
  if (format === "step") {
    const r = await kernel.exportStep(graphOf(s.history.scene), only, units === "in" ? "in" : undefined);
    if (!r.ok) return { ok: false, error: r.error };
    const dims = [0, 1, 2].map((i) => +((r.bbox.max[i]! - r.bbox.min[i]!) * k).toFixed(units === "in" ? 3 : 2)).join(" × ");
    return { ok: true, name, bytes: r.bytes, mime: FORMATS.step.mime, message: `exported ${name}: the exact body (not a mesh), ${dims} ${units}, ${kb(r.bytes.length)}` };
  }
  const q = QUALITY[choices.quality ?? "fine"];
  const m = await kernel.exportMesh(graphOf(s.history.scene), only ? { ...q, bodies: only } : q);
  if (!m.ok) return { ok: false, error: m.error };
  const triangles = m.triangles.length / 3;
  if (!triangles) return { ok: false, error: EXPORT_NOTHING };
  const title = name.replace(/\.[^.]*$/, "");
  const open = openEdges(m.vertices, m.triangles);
  const vertices = k === 1 ? m.vertices : m.vertices.map((x) => x * k); // (in inches the numbers are the millimetres over 25.4)
  const bytes = format === "stl" ? stlBytes(vertices, m.triangles, title, units) : threeMfBytes(vertices, m.triangles, title, units);
  const dims = [0, 1, 2].map((i) => +((m.bbox.max[i]! - m.bbox.min[i]!) * k).toFixed(units === "in" ? 3 : 2)).join(" × ");
  return { ok: true, name, bytes, mime: FORMATS[format].mime, message: `exported ${name} (${label}): ${triangles.toLocaleString("en-US")} triangles, ${dims} ${units}, ${kb(bytes.length)}${open ? `; the mesh has ${open} open edge${open === 1 ? "" : "s"}: check it in the slicer` : ""}` };
}
