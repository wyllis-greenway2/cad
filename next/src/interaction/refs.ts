// The reference set of a sketch plane (E57): every point, line, circle and axis the person can hold to, from one place, each with a stable name that a constraint can use. The old project had six places each deciding what was
// under the pointer (`q_unified_snapping`); this is the one list. It reads engine data (the solved sketch, the body's edges) and changes nothing.
import * as K from "../engine/kernel.ts";
import { type EdgeRef, edgeKey } from "../engine/id.ts";
import type { Body } from "../engine/lineage.ts";
import type { Sketch } from "../engine/steps.ts";
import { type SketchParams, sketchFrame } from "../engine/sketch.ts";

export type Pt = [number, number];
export type RefKind = "point" | "line" | "circle" | "axis";
export interface Ref {
  /** stable: the same in every build of the same recipe (a drawn part by its name, a body's edge by the faces beside it) */ key: string;
  kind: RefKind;
  /** the name a constraint uses for it; for a body's edge that is not in the sketch yet, the name its anchor will have */ name: string;
  /** a drawn part of this sketch, a body's edge in the plane, a body's edge off the plane (seen through its projection), a world axis */ origin: "drawn" | "anchor" | "projection" | "world";
  p?: Pt; a?: Pt; b?: Pt; c?: Pt; r?: number;
  /** how far the part is from the plane (projections), along the plane's normal */ offset?: number;
  /** a body's edge: the anchor to add to the sketch before a constraint can name it; `held`: it is in the sketch already */ anchor?: { id: string; edge: EdgeRef; held: boolean };
  /** the screen says whether the part can be seen (a body's edge behind a face); a hidden one is not offered unless asked for */ visible: boolean;
}
export interface RefInput {
  sketch?: Sketch | null; body?: Body | null;
  /** the sketch's definition when it is not on the solved sketch */ params?: SketchParams;
  /** which parts cannot be seen from the camera: a screen matter, so the screen says */ hidden?: (key: string) => boolean;
  /** the plane of a sketch that has not been made yet (a tool is open on a plane, nothing drawn): where it lies */ plane?: { plane?: string; offset?: number; frame?: unknown; face?: import("../engine/id.ts").Id };
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export function referenceSet(input: RefInput): Ref[] {
  const out: Ref[] = [], def = (input.params ?? (input.sketch?.definition as SketchParams | undefined)) ?? null, planeSpec = (def ?? input.plane ?? { plane: "XY" }) as SketchParams;
  const body = input.body ?? null, fr = sketchFrame({ ...planeSpec, points: [] } as SketchParams, body), vis = (k: string) => !(input.hidden?.(k) ?? false);
  // the sketch's own parts, at the places the solve put them
  const solved = new Map<string, { a: Pt; b: Pt }>();
  for (const l of input.sketch?.lines ?? []) { const nm = l.id.of[0]; if (typeof nm === "string") solved.set(nm, { a: fr.local(l.a), b: fr.local(l.b) }); }
  const at = new Map<string, Pt>();
  for (const l of def?.lines ?? []) { const s = solved.get(l.id); if (s) { at.set(l.a, s.a); at.set(l.b, s.b); } }
  for (const q of def?.points ?? []) if (!at.has(q.id)) at.set(q.id, [q.x, q.y]);
  const anchorIds = new Set((def?.anchors ?? []).map((a) => a.id));
  for (const q of def?.points ?? []) out.push({ key: `sketch:${q.id}`, kind: "point", name: q.id, origin: "drawn", p: at.get(q.id)!, visible: vis(`sketch:${q.id}`) });
  for (const l of def?.lines ?? []) { const a = at.get(l.a), b = at.get(l.b); if (a && b) out.push({ key: `sketch:${l.id}`, kind: "line", name: l.id, origin: "drawn", a, b, visible: vis(`sketch:${l.id}`) }); }
  const circ = input.sketch?.circle;
  for (const c of def?.circles ?? []) { const ctr = at.get(c.c) ?? [0, 0], r = circ && (circ.id.of[0] === c.id) ? circ.r : c.r; out.push({ key: `sketch:${c.id}`, kind: "circle", name: c.id, origin: "drawn", c: ctr, r, visible: vis(`sketch:${c.id}`) }); }
  // the body's edges, seen in the plane: straight ones only; in the plane they are anchors, off it they are held through their projection (E53, E54)
  if (body) for (const e of body.edges()) {
    if (!e.ref) continue;
    const [e0, e1] = K.edgeEnds(e.h), m = K.edgeMid(e.h), chord: [number, number, number] = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2, (e0[2] + e1[2]) / 2];
    const off = (p: K.V3) => (p[0] - fr.F.O[0]) * fr.normal[0] + (p[1] - fr.F.O[1]) * fr.normal[1] + (p[2] - fr.F.O[2]) * fr.normal[2];
    const key = `edge:${edgeKey(e.ref)}`, name = `e${out.filter((r) => r.origin !== "drawn" && r.origin !== "world").length + 1}`;
    const held = (def?.anchors ?? []).find((an) => edgeKey(an.edge) === edgeKey(e.ref!)), nm = held ? held.id : name;
    const base = (inPlane: boolean, offset: number) => ({ key, name: nm, origin: (inPlane ? "anchor" : "projection") as Ref["origin"], offset, anchor: { id: nm, edge: e.ref!, held: !!held && anchorIds.has(held.id) }, visible: vis(key) });
    if (Math.hypot(m[0] - chord[0], m[1] - chord[1], m[2] - chord[2]) > 1e-7 || (Math.hypot(e0[0] - e1[0], e0[1] - e1[1], e0[2] - e1[2]) < 1e-9 && K.edgeCircle(e.h))) {
      // a curve: a circle (or an arc of one) is held whole when the sketch faces it, as a line when seen edge-on; at an angle it is an ellipse, which is not offered (E65)
      const circ = K.edgeCircle(e.h); if (!circ) continue;
      const along = Math.abs(circ.normal[0] * fr.normal[0] + circ.normal[1] * fr.normal[1] + circ.normal[2] * fr.normal[2]);
      if (along > 1 - 1e-9) out.push({ ...base(Math.abs(off(circ.c)) < 1e-9, off(circ.c)), kind: "circle", c: fr.local(circ.c), r: circ.r });
      else if (along < 1e-9 && circ.closed) { const w = [fr.normal[1] * circ.normal[2] - fr.normal[2] * circ.normal[1], fr.normal[2] * circ.normal[0] - fr.normal[0] * circ.normal[2], fr.normal[0] * circ.normal[1] - fr.normal[1] * circ.normal[0]], L = Math.hypot(w[0]!, w[1]!, w[2]!), q = (sg: number): K.V3 => [circ.c[0] + (sg * circ.r * w[0]!) / L, circ.c[1] + (sg * circ.r * w[1]!) / L, circ.c[2] + (sg * circ.r * w[2]!) / L]; out.push({ ...base(true, off(circ.c)), kind: "line", a: fr.local(q(-1)), b: fr.local(q(1)) }); }
      continue;
    }
    const a = fr.local(e0), b = fr.local(e1), inPlane = Math.abs(off(e0)) < 1e-9 && Math.abs(off(e1)) < 1e-9;
    if (Math.hypot(...sub(a, b)) < 1e-9) out.push({ ...base(inPlane, off(m)), kind: "point", p: a }); else out.push({ ...base(inPlane, off(m)), kind: "line", a, b });
  }
  out.push({ key: "axis:x", kind: "axis", name: "axis.x", origin: "world", a: [0, 0], b: [1, 0], visible: true }, { key: "axis:y", kind: "axis", name: "axis.y", origin: "world", a: [0, 0], b: [0, 1], visible: true });
  return out;
}
