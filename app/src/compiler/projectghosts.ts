// A box for every part of a saved project, from its commands alone (`dec_progressive_open`, `in_1005`): the boxes are drawn while the commands are being replayed (which takes 0.8 s for 300 parts and 4 s for 1000), so that the model is on the screen
// at once. Pure: the text of a project in, the parts out; nothing is derived, solved or made. A project that is anything but pushes of sketches on the base plane, with fillets and holes (a move, a delete, a sketch on another plane, anything that may change where a part stands) has no boxes: they could be wrong.
import type { Vec } from "./kernel/adapter.ts";
import { MIN_PIECES } from "./kernel/pieces.ts";

export interface PartBox { id: string; box: { min: Vec; max: Vec } }
type Json = Record<string, unknown>;

/** The ghosts of the parts of the project (`x_<step>`, as the kernel names the body), or null when the project is not of the kind or has fewer than `MIN_PIECES` parts. */
export function ghostsFromProject(text: string): PartBox[] | null {
  let file: Json;
  try { file = JSON.parse(text) as Json; } catch { return null; }
  if (!file || file.format !== "cad-project" || !Array.isArray(file.commands)) return null;
  const base = file.base as { parts?: unknown[]; steps?: unknown[] } | undefined;
  if (base?.parts?.length || base?.steps?.length) return null;
  const corner = new Map<string, number[]>(), line = new Map<string, [string, string]>(), circle = new Map<string, { center: string; radius: number }>();
  const steps: { id: string; parts: string[]; depth: number }[] = [];
  let ok = true;
  const walk = (c: Json): void => {
    if (!ok) return;
    if (c.type === "batch" && Array.isArray(c.commands)) { for (const x of c.commands as Json[]) walk(x); return; }
    if (c.type === "addRelation") return;
    if (c.type === "addPart") {
      const p = c.part as Json;
      if (p.plane !== "w/XY") { ok = false; return; }
      if (p.kind === "corner" && Array.isArray(p.at)) corner.set(String(p.ref), p.at as number[]);
      else if (p.kind === "line") { if (p.bulge || p.spline) { ok = false; return; } line.set(String(p.ref), [String(p.a), String(p.b)]); }
      else if (p.kind === "circle") circle.set(String(p.ref), { center: String(p.center), radius: Number(p.radius) });
      return;
    }
    if (c.type === "addStep") {
      const st = c.step as Json, params = (st.params ?? {}) as Json;
      if (st.type === "edgeMod") return; // (a fillet or chamfer does not change where a part stands: its box stands)
      if (st.type !== "extrude" || typeof params.depth !== "number" || params.also) { ok = false; return; }
      if (params.cut || params.mode === "cut" || params.mode === "cutOrAdd") return; // (a hole: the part's box stands)
      if (steps.length > 0 && params.mode !== "new") { ok = false; return; } // (a push that may join is not a part of its own)
      steps.push({ id: String(st.id), parts: (st.parts as unknown[]).map(String), depth: params.depth });
      return;
    }
    ok = false; // (anything else may move or change a part)
  };
  for (const c of file.commands as Json[]) walk(c);
  if (!ok || steps.length < MIN_PIECES) return null;
  const out: PartBox[] = [];
  for (const st of steps) {
    const pts: number[][] = [];
    for (const r of st.parts) {
      const ln = line.get(r), ci = circle.get(r);
      if (ln) for (const c of ln) { const p = corner.get(c); if (p) pts.push(p); }
      else if (ci) { const c = corner.get(ci.center); if (c) pts.push([c[0]! - ci.radius, c[1]! - ci.radius, c[2]!], [c[0]! + ci.radius, c[1]! + ci.radius, c[2]!]); }
    }
    if (!pts.length || pts.some((p) => p.length < 3 || p.some((v) => !Number.isFinite(v)))) return null;
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]!))) as Vec, max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]!))) as Vec;
    const z0 = min[2]; // (the base plane's normal is up: a push of depth d goes from z to z + d, either way)
    min[2] = Math.min(z0, z0 + st.depth); max[2] = Math.max(z0, z0 + st.depth);
    out.push({ id: `x_${st.id}`, box: { min, max } });
  }
  return out;
}
