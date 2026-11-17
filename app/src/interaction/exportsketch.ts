// Export a flat drawing as SVG or DXF (`dec_export_flat`): the lines, arcs and circles of a sketch, or the outline of a flat face of the body, as they lie on their plane (x along the plane's first direction, y along its second), millimetres.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import type { Part, Plane, Line } from "../operation/part.ts";
import { pointOf, localOf, curveMid } from "../operation/part.ts";
import { bodyOutline, bodyOutlines } from "./offsetbody.ts";
import { svgText, dxfText, boundsOf } from "../compiler/flatfile.ts";
import type { Piece, V2 } from "../compiler/flatfile.ts";
import type { FileOutcome } from "./exportfile.ts";
import type { Session } from "./session.ts";

export type FlatFormat = "svg" | "dxf";
const FLAT: Record<FlatFormat, { ext: string; mime: string; label: string }> = {
  svg: { ext: "svg", mime: "image/svg+xml", label: "SVG" },
  dxf: { ext: "dxf", mime: "application/dxf", label: "DXF" },
};
const FLAT_NOTHING = "nothing to export yet: draw something, or select a sketch or a flat face of a body";

type Pieces = { ok: true; pieces: Piece[]; what: string; /** the plane the pieces lie on: their x and y are along its u and v (`in_569`) */ plane: Plane } | { ok: false; error: string };

/** The circle through three points (centre and radius), or null when they are in a line. */
function circleThrough(a: V2, m: V2, b: V2): { c: V2; r: number } | null {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-12) return null;
  const [a2, m2, b2] = [a[0] * a[0] + a[1] * a[1], m[0] * m[0] + m[1] * m[1], b[0] * b[0] + b[1] * b[1]];
  const c: V2 = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
  return { c, r: Math.hypot(a[0] - c[0], a[1] - c[1]) };
}

/** What is drawn of one line or circle of a sketch, in its plane's own coordinates (an arc by its centre or by its bulge); null when it has no size. */
function pieceOf(scene: Scene, pl: Plane, part: Part): Piece | null {
  const get = (r: Ref) => scene.parts[r];
  const at = (r: Ref): V2 | null => { const p = pointOf(get, r); return p ? localOf(pl, p) : null; };
  if (part.kind === "circle") { const c = at(part.center); return c && part.radius > 1e-9 ? { k: "circle", c, r: part.radius } : null; }
  if (part.kind !== "line") return null;
  const [p, q] = [at(part.a), at(part.b)];
  if (!p || !q) return null;
  if (part.center) {
    const c = at(part.center);
    return c ? { k: "arc", c, r: Math.hypot(p[0] - c[0], p[1] - c[1]), p, q, ccw: part.ccw !== false } : null;
  }
  if (part.bulge) {
    const mid = curveMid(get, part as Line);
    const m = mid ? localOf(pl, mid) : null;
    const circ = m ? circleThrough(p, m, q) : null;
    return m && circ ? { k: "arc", c: circ.c, r: circ.r, p, q, ccw: (m[0] - p[0]) * (q[1] - m[1]) - (m[1] - p[1]) * (q[0] - m[0]) > 0 } : { k: "seg", p, q };
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9 ? { k: "seg", p, q } : null;
}

/** The drawn lines and circles a selection stands for: those selected, a figure's lines and holes, everything drawn on a selected plane; with nothing selected, all that is drawn. (Also what a layer is marked on, `in_563`.) */
export function drawnOf(scene: Scene, sel: readonly Part[]): Set<Ref> {
  const drawn = new Set<Ref>();
  const take = (p: Part | undefined, seen = new Set<Ref>()): void => {
    if (!p || seen.has(p.ref)) return;
    seen.add(p.ref);
    if (p.origin !== "drawn") return;
    if (p.kind === "line" && !p.derived) drawn.add(p.ref);
    else if (p.kind === "circle") drawn.add(p.ref);
    else if (p.kind === "face") { for (const r of [...p.loop, ...(p.disk ? [p.disk] : [])]) take(scene.parts[r], seen); for (const h of p.holes ?? []) take(scene.parts[h], seen); }
    else if (p.kind === "plane") for (const q of Object.values(scene.parts)) if (q.plane === p.ref && (q.kind === "line" || q.kind === "circle" || q.kind === "face")) take(q, seen);
  };
  if (sel.length) for (const p of sel) take(p);
  else for (const p of Object.values(scene.parts)) if (p.origin === "drawn" && (p.kind === "line" || p.kind === "circle")) take(p);
  return drawn;
}

/** The pieces a selection stands for: a flat face of the body (its outline, the holes too), or the drawn lines and circles of what is selected (a figure with the figures inside it, lines, circles, a drawn plane); with nothing selected, everything drawn when it all lies on one plane. */
export function sketchPieces(scene: Scene, selection: readonly Ref[]): Pieces {
  const sel = selection.map((r) => scene.parts[r]).filter((p): p is Part => !!p);
  const face = sel.find((p): p is Plane => p.kind === "plane" && p.origin === "body");
  if (face) {
    if (sel.length !== 1) return { ok: false, error: "select one flat face of the body, or a sketch, not both" };
    const multi = bodyOutlines(scene, sel);
    const loops = multi ? multi.loops : [bodyOutline(scene, sel)];
    if (!loops.length || loops.some((o) => !o)) return { ok: false, error: "this face cannot be exported: it must be flat, with edges that are lines and arcs" };
    const pieces = loops.flatMap((o) => o!.edges.map((e): Piece => (e.k === "seg" ? { k: "seg", p: e.p, q: e.q } : { k: "arc", c: e.c, r: e.r, p: e.p, q: e.q, ccw: e.ccw })));
    return { ok: true, pieces, what: "the face", plane: face };
  }
  const drawn = drawnOf(scene, sel);
  if (!drawn.size) return { ok: false, error: FLAT_NOTHING };
  const planes = new Set([...drawn].map((r) => (scene.parts[r] as { plane: Ref | null }).plane));
  if (planes.size > 1 || planes.has(null)) return { ok: false, error: `the drawing is on ${planes.size} planes: select the sketch to export (a figure, its lines, or its plane)` };
  const pl = scene.parts[[...planes][0]!];
  if (!pl || pl.kind !== "plane") return { ok: false, error: FLAT_NOTHING };
  const pieces = [...drawn].flatMap((r) => { const q = pieceOf(scene, pl, scene.parts[r]!); return q ? [{ ...q, ref: r } as Piece] : []; }); // (each piece knows the line it is of, so a route's marks can name it, `in_603`)
  return pieces.length ? { ok: true, pieces, what: (sel.length ? "the selected sketch" : "the drawing"), plane: pl } : { ok: false, error: FLAT_NOTHING };
}

/** Is there a flat drawing to export (for the menu items). */
export const canExportFlat = (s: Session): boolean => sketchPieces(s.history.scene, s.click.selection).ok;

/** The file of the selection (or the whole drawing) in `format`; the message says what was made. */
export function exportFlat(s: Session, format: FlatFormat, name = `sketch.${FLAT[format].ext}`, units: "mm" | "in" = "mm"): FileOutcome {
  const r = sketchPieces(s.history.scene, s.click.selection);
  if (!r.ok) return { ok: false, error: r.error };
  const text = format === "svg" ? svgText(r.pieces, name.replace(/\.[^.]*$/, ""), units) : dxfText(r.pieces, units);
  const b = boundsOf(r.pieces)!;
  const dims = [b.max[0] - b.min[0], b.max[1] - b.min[1]].map((v) => +(units === "in" ? v / 25.4 : v).toFixed(units === "in" ? 3 : 2)).join(" × ");
  const bytes = new TextEncoder().encode(text);
  return { ok: true, name, bytes, mime: FLAT[format].mime, message: `exported ${name} (${FLAT[format].label}): ${r.what}, ${r.pieces.length} piece${r.pieces.length === 1 ? "" : "s"}, ${dims} ${units}` };
}
