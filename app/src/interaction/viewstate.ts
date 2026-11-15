// What of the view is kept in a saved file (`in_395`): the cross section plane, beside the history. The file is the history's JSON with a `view` key; a file without it opens as before, and a reader that does not know it ignores it.
import type { Vec3 } from "../math/vec.ts";

export interface SavedSection { at: Vec3; n: Vec3; mode: "move" | "rotate" }
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/** The saved text with the cross section put in it (or left out when there is none). */
export function withView(text: string, section: SavedSection | null): string {
  if (!section) return text;
  try {
    const doc = JSON.parse(text) as Record<string, unknown>;
    return JSON.stringify({ ...doc, view: { section } });
  } catch { return text; }
}

/** The cross section a saved text carries, if it has a good one. */
export function sectionOf(text: string): SavedSection | null {
  try {
    const s = (JSON.parse(text) as { view?: { section?: SavedSection } }).view?.section;
    return s && isVec3(s.at) && isVec3(s.n) && (s.mode === "move" || s.mode === "rotate") ? { at: s.at, n: s.n, mode: s.mode } : null;
  } catch { return null; }
}
