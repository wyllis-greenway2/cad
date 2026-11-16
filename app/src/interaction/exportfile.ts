// Export in the formats the app writes (`dec_export_stl`, `dec_export_formats`): STL and 3MF from the kernel's fine mesh, STEP from the kernel's exact solid. One place that says what each is called and what it says when done.
import type { Kernel } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";
import { stlBytes, openEdges } from "../compiler/stl.ts";
import { threeMfBytes } from "../compiler/threemf.ts";
import type { Session } from "./session.ts";
import { EXPORT_QUALITY, EXPORT_NOTHING, canExport } from "./exportstl.ts";

export type ExportFormat = "stl" | "3mf" | "step";
const FORMATS: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  stl: { ext: "stl", mime: "model/stl", label: "STL" },
  "3mf": { ext: "3mf", mime: "model/3mf", label: "3MF" },
  step: { ext: "step", mime: "model/step", label: "STEP" },
};
export type FileOutcome = { ok: true; name: string; bytes: Uint8Array; mime: string; message: string } | { ok: false; error: string };

const kb = (n: number) => (n < 1e6 ? `${(n / 1e3).toFixed(1)} KB` : `${(n / 1e6).toFixed(1)} MB`);

/** The file name for a format: `name` (or `model`, or `model-<bodies>`) with the format's own ending. */
export const fileName = (format: ExportFormat, only?: string[], base = "model"): string => `${only ? `${base}-${only.join("-")}` : base}.${FORMATS[format].ext}`;

/** Make the file of the final body (or only the bodies named) in `format`; the message says what was made. */
export async function exportFile(s: Session, kernel: Kernel, format: ExportFormat, only?: string[], name = fileName(format, only)): Promise<FileOutcome> {
  if (!canExport(s)) return { ok: false, error: EXPORT_NOTHING };
  const label = FORMATS[format].label;
  if (format === "step") {
    const r = await kernel.exportStep(graphOf(s.history.scene), only);
    if (!r.ok) return { ok: false, error: r.error };
    const dims = [0, 1, 2].map((i) => +(r.bbox.max[i]! - r.bbox.min[i]!).toFixed(2)).join(" × ");
    return { ok: true, name, bytes: r.bytes, mime: FORMATS.step.mime, message: `exported ${name}: the exact body (not a mesh), ${dims} mm, ${kb(r.bytes.length)}` };
  }
  const m = await kernel.exportMesh(graphOf(s.history.scene), only ? { ...EXPORT_QUALITY, bodies: only } : EXPORT_QUALITY);
  if (!m.ok) return { ok: false, error: m.error };
  const triangles = m.triangles.length / 3;
  if (!triangles) return { ok: false, error: EXPORT_NOTHING };
  const title = name.replace(/\.[^.]*$/, "");
  const bytes = format === "stl" ? stlBytes(m.vertices, m.triangles, title) : threeMfBytes(m.vertices, m.triangles, title);
  const open = openEdges(m.vertices, m.triangles);
  const dims = [0, 1, 2].map((i) => +(m.bbox.max[i]! - m.bbox.min[i]!).toFixed(2)).join(" × ");
  return { ok: true, name, bytes, mime: FORMATS[format].mime, message: `exported ${name} (${label}): ${triangles.toLocaleString("en-US")} triangles, ${dims} mm, ${kb(bytes.length)}${open ? `; the mesh has ${open} open edge${open === 1 ? "" : "s"}: check it in the slicer` : ""}` };
}
