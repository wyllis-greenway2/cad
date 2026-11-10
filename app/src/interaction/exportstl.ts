// Export the body as a binary STL file (`dec_export_stl`): the kernel meshes the final body of the model at the history's cursor, finely (not the screen's coarse mesh), and the mesh is written as bytes.
import type { Kernel, ExportQuality } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";
import { stlBytes, openEdges } from "../compiler/stl.ts";
import type { Session } from "./session.ts";

/** 0.01 mm from the true surface, and no curve turning more than 0.1 rad (about 6 degrees) across one facet: one quality, no setting. */
export const EXPORT_QUALITY: ExportQuality = { tolerance: 0.01, angular: 0.1 };
export const EXPORT_NOTHING = "nothing to export yet: make a body";
const EXPORT_NAME = "model.stl";

/** Is there a body to export (for the menu item: greyed out with `EXPORT_NOTHING` when not). */
export const canExport = (s: Session): boolean => !!s.outcome.kernel?.mesh;

export type ExportOutcome =
  | { ok: true; name: string; bytes: Uint8Array; triangles: number; size: [number, number, number]; open: number; message: string }
  | { ok: false; error: string };

const kb = (n: number) => (n < 1e6 ? `${(n / 1e3).toFixed(1)} KB` : `${(n / 1e6).toFixed(1)} MB`);

export async function exportStl(s: Session, kernel: Kernel, name = EXPORT_NAME): Promise<ExportOutcome> {
  if (!canExport(s)) return { ok: false, error: EXPORT_NOTHING };
  const m = await kernel.exportMesh(graphOf(s.history.scene), EXPORT_QUALITY);
  if (!m.ok) return { ok: false, error: m.error };
  const triangles = m.triangles.length / 3;
  if (!triangles) return { ok: false, error: EXPORT_NOTHING };
  const bytes = stlBytes(m.vertices, m.triangles, name.replace(/\.stl$/i, ""));
  const size = [0, 1, 2].map((i) => m.bbox.max[i]! - m.bbox.min[i]!) as [number, number, number];
  const open = openEdges(m.vertices, m.triangles);
  const dims = size.map((v) => +v.toFixed(2)).join(" × ");
  const message = `exported ${name}: ${triangles.toLocaleString("en-US")} triangles, ${dims} mm, ${kb(bytes.length)}${open ? `; the mesh has ${open} open edge${open === 1 ? "" : "s"}: check it in the slicer` : ""}`;
  return { ok: true, name, bytes, triangles, size, open, message };
}
