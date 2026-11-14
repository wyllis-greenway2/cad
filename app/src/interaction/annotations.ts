// What is applied to the selected parts, shown on the parts themselves (`in_058`..`in_061`, `in_118`). Constraints belong to the thing they constrain: a line has line constraints
// (horizontal, vertical, length, parallel, perpendicular, equal, angle, distances), a vertex has vertex constraints (fixed, coincident, same height, distances); a plane or a
// face has none, it is only what its lines fill in. Each constraint is one annotation placed where it means something:
//   on the line (horizontal, vertical, a length), at the vertex (fixed, coincident), between the two lines (parallel, equal), where the lines meet if extended (perpendicular),
//   as a small arc between the two lines (an angle), and as the segment it measures (a distance between two things).
// Pure: derived from the scene and the selection; the UI places a bubble at `at` and draws `lines`.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize, mid, length } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { buildMap, structuralRelations } from "../operation/ownership.ts";
import { sketchOfEdge } from "../operation/edgesource.ts";
import type { Lookup } from "../operation/part.ts";
import { pointOf, segmentOf, circleOf, curveMid } from "../operation/part.ts";
import { actionsFor, measureAction } from "./actions.ts";
import { lengthEditable } from "./lengths.ts";
import { surfaceTriangles } from "./surfaces.ts";
import { ROWS, REFERENCES_ONLY } from "./rows.ts";

export interface Annotation {
  /** the relation id, or "measure" for a number that could be locked */
  id: string;
  relationId: string | null;
  kind: string;
  label: string;
  /** where its bubble goes */
  at: Vec3;
  /** the number shown: the locked value, or what the parts measure now */
  value: number | null;
  unit: "mm" | "deg" | null;
  locked: boolean;
  /** a number you can type over */
  editable: boolean;
  /** a measurement of references only (a line of the body): it cannot be locked */
  readOnly: boolean;
  broken: boolean;
  open: boolean;
  /** a mark shown before the number: Ø for a diameter, R for a radius */
  symbol?: string;
  /** the parts it ties the selection to (shown amber while it is open) */
  others: Ref[];
  /** polylines drawn with it: the arc of an angle, the segment a distance measures */
  lines: Vec3[][];
}

const labelOf = (kind: string): string => ROWS.find((r) => r.id === kind)?.label ?? kind;
const isPart = (scene: Scene, r: Ref) => ["corner", "line", "circle"].includes(scene.parts[r]?.kind ?? "");

/** The nearest points of two infinite lines (a through p, b through q), or null if parallel. */
function closestOfLines(p: Vec3, u: Vec3, q: Vec3, v: Vec3): [Vec3, Vec3] | null {
  const w = sub(p, q);
  const [a, b, c, d, e] = [dot(u, u), dot(u, v), dot(v, v), dot(u, w), dot(v, w)];
  const den = a * c - b * b;
  if (den < 1e-9) return null;
  const s = (b * e - c * d) / den;
  const t = (a * e - b * d) / den;
  return [add(p, scale(u, s)), add(q, scale(v, t))];
}
/** The foot of the perpendicular from p on the infinite line through a and b. */
const footOn = (p: Vec3, a: Vec3, b: Vec3): Vec3 => {
  const u = normalize(sub(b, a));
  return add(a, scale(u, dot(sub(p, a), u)));
};
/** A small arc at `v` from the direction to p to the direction to q, through the smaller angle. */
function arcBetween(v: Vec3, p: Vec3, q: Vec3): { points: Vec3[]; middle: Vec3 } {
  const a = normalize(sub(p, v));
  const b = normalize(sub(q, v));
  const r = Math.min(length(sub(p, v)), length(sub(q, v))) * 0.3;
  const cos = Math.max(-1, Math.min(1, dot(a, b)));
  const angle = Math.acos(cos);
  const n = normalize(cross(a, b));
  const perp = length(n) < 1e-9 ? cross(a, [0, 0, 1]) : cross(n, a); // in the plane of both, at a right angle to a
  const at = (t: number): Vec3 => add(v, scale(add(scale(a, Math.cos(angle * t)), scale(normalize(perp), Math.sin(angle * t))), r));
  const points = Array.from({ length: 17 }, (_, i) => at(i / 16));
  const bisector = length(add(a, b)) < 1e-9 ? normalize(perp) : normalize(add(a, b));
  return { points, middle: add(v, scale(bisector, r * 1.3)) };
}

interface Placed { at: Vec3; lines: Vec3[][] }
/** Where a constraint of this kind between these parts is shown, and the lines drawn with it. Null if its parts are gone. */
function place(get: Lookup, kind: string, parts: readonly Ref[]): Placed | null {
  const kinds = parts.map((r) => get(r)?.kind);
  const corners = parts.filter((_, i) => kinds[i] === "corner");
  const lines = parts.filter((_, i) => kinds[i] === "line");
  const circles = parts.filter((_, i) => kinds[i] === "circle");
  const pt = (r: Ref | undefined) => (r ? pointOf(get, r) : null);
  const seg = (r: Ref | undefined) => (r ? segmentOf(get, r) : null);
  const [c1, c2] = [pt(corners[0]), pt(corners[1])];
  const [s1, s2] = [seg(lines[0]), seg(lines[1])];
  switch (kind) {
    case "horizontal": case "vertical": case "length":
      return s1 ? { at: mid(s1[0], s1[1]), lines: [] } : null;
    case "fixed": case "coincident":
      return c1 ? { at: c1, lines: [] } : null;
    case "sameHeight": case "sameAcross":
      return c1 && c2 ? { at: mid(c1, c2), lines: [] } : null;
    case "diameter": {
      const c = circles[0] ? circleOf(get, circles[0]) : null;
      return c ? { at: c.center, lines: [] } : null;
    }
    case "concentric": {
      const c = circles[0] ? circleOf(get, circles[0]) : null;
      return c ? { at: c.center, lines: [] } : null;
    }
    case "equalRadius": {
      const [a, b] = circles.map((r) => circleOf(get, r));
      return a && b ? { at: mid(a.center, b.center), lines: [] } : null;
    }
    case "equalLength": case "parallel":
      return s1 && s2 ? { at: mid(mid(s1[0], s1[1]), mid(s2[0], s2[1])), lines: [] } : null; // in the space between them
    case "perpendicular": {
      if (!s1 || !s2) return null;
      const hit = closestOfLines(s1[0], normalize(sub(s1[1], s1[0])), s2[0], normalize(sub(s2[1], s2[0])));
      return { at: hit ? mid(hit[0], hit[1]) : mid(mid(s1[0], s1[1]), mid(s2[0], s2[1])), lines: [] }; // where they meet if extended
    }
    case "angle": {
      if (!s1 || !s2) return null;
      const [la, lb] = [get(lines[0]!), get(lines[1]!)];
      if (la?.kind !== "line" || lb?.kind !== "line") return null;
      const sharedRef = [la.a, la.b].find((r) => r === lb.a || r === lb.b);
      const v = pt(sharedRef);
      if (!v || !sharedRef) return null;
      const p = pt(sharedRef === la.a ? la.b : la.a);
      const q = pt(sharedRef === lb.a ? lb.b : lb.a);
      if (!p || !q) return null;
      const arc = arcBetween(v, p, q);
      return { at: arc.middle, lines: [arc.points] };
    }
    case "distance": {
      if (c1 && c2) return { at: mid(c1, c2), lines: [[c1, c2]] };
      if (c1 && s1) { const f = footOn(c1, s1[0], s1[1]); return { at: mid(c1, f), lines: [[c1, f]] }; }
      if (s1 && s2) { const m = mid(s1[0], s1[1]); const f = footOn(m, s2[0], s2[1]); return { at: mid(m, f), lines: [[m, f]] }; }
      return null;
    }
    case "tangent": {
      // where the line touches the circle or the arc: the foot of its centre on the line (an arc is a line part that has a centre: the straight one is the other)
      const c = circles[0] ? circleOf(get, circles[0]) : null;
      const isArc = (r: Ref) => { const l = get(r); return l?.kind === "line" && !!l.center; };
      const arc = lines.map((r) => get(r)).find((l) => l?.kind === "line" && !!l.center);
      const arcCentre = arc?.kind === "line" && arc.center ? pt(arc.center) : null;
      // two circles that touch: where the line between their centres crosses the first one's edge
      if (circles.length === 2) {
        const [c1, c2] = [circleOf(get, circles[0]!), circleOf(get, circles[1]!)];
        if (!c1 || !c2) return null;
        const dv: Vec3 = [c2.center[0] - c1.center[0], c2.center[1] - c1.center[1], c2.center[2] - c1.center[2]];
        const dl = Math.hypot(...dv) || 1;
        const sign = dl >= Math.abs(c1.radius - c2.radius) + 1e-9 && Math.abs(dl - (c1.radius + c2.radius)) <= Math.abs(dl - Math.abs(c1.radius - c2.radius)) ? 1 : c1.radius >= c2.radius ? 1 : -1;
        return { at: [c1.center[0] + (dv[0] / dl) * c1.radius * sign, c1.center[1] + (dv[1] / dl) * c1.radius * sign, c1.center[2] + (dv[2] / dl) * c1.radius * sign], lines: [] };
      }
      // an arc with a circle: they meet at the end of the arc that is on the circle (the end whose distance from the circle's centre is nearest its radius)
      if (arc && arc.kind === "line" && (c || lines.filter(isArc).length === 2)) {
        const [pa, pb] = [pt(arc.a), pt(arc.b)];
        if (!pa || !pb) return null;
        if (!c) return { at: pa, lines: [] };
        const off = (p: Vec3) => Math.abs(Math.hypot(p[0] - c.center[0], p[1] - c.center[1], p[2] - c.center[2]) - c.radius);
        return { at: off(pa) <= off(pb) ? pa : pb, lines: [] };
      }
      const straight = seg(lines.find((r) => !isArc(r)));
      const centre = c ? c.center : arcCentre;
      return straight && centre ? { at: footOn(centre, straight[0], straight[1]), lines: [] } : null;
    }
    case "onCircle": case "onLine":
      return c1 ? { at: c1, lines: [] } : null;
    default:
      return null;
  }
}

/** The annotation of one relation (where it is shown, its number, its state), or null if its parts are gone. */
function annotationOf(scene: Scene, rel: Scene["relations"][number], sel: readonly Ref[], focus: string | null, map: ReturnType<typeof buildMap>): Annotation | null {
  const placed = place(lookup(scene), rel.kind, rel.parts);
  if (!placed) return null;
  const action = actionsFor(scene, rel.parts).find((a) => a.id === rel.kind && a.dimensional);
  const measured = action ? action.measure() : null;
  const locked = rel.value !== undefined && rel.locked !== false;
  return {
    id: rel.id, relationId: rel.id, kind: rel.kind, label: labelOf(rel.kind), at: placed.at, ...(rel.kind === "diameter" ? { symbol: "Ø" } : rel.kind === "radius" ? { symbol: "R" } : {}),
    value: rel.value === undefined ? null : locked ? rel.value : measured ?? rel.value,
    unit: rel.value === undefined ? null : action?.unit ?? (rel.kind === "angle" ? "deg" : "mm"),
    locked, editable: rel.value !== undefined, readOnly: false,
    broken: map.items.get(rel.id)?.broken ?? false, open: focus === rel.id,
    others: rel.parts.filter((p) => !sel.includes(p)), lines: placed.lines,
  };
}

/** What each selected part has applied, one annotation per constraint (a constraint between two selected parts is shown once), then the measure of the selection that could be locked. */
export function annotationsFor(scene: Scene, selection0: readonly Ref[], focus: string | null, all = false): Annotation[] {
  // an edge of the body that lies where a sketch part was says what that part says (its radius, its constraints), and its numbers are shown on the edge (`in_209`)
  const src = selection0.length === 1 ? sketchOfEdge(scene, selection0[0]!) : null;
  const selection = src ? [src.ref] : selection0;
  const base = annotationsOf0(scene, selection, focus, all);
  const out0 = [...base, ...(src && !base.some((a) => a.kind === "radius") ? arcRadius(scene, src.ref) : [])];
  return src ? out0.map((a) => ({ ...a, at: add(a.at, src.shift), lines: a.lines.map((ln) => ln.map((q) => add(q, src.shift))) })) : out0;
}
/** The radius of an arc of a sketch (a whole circle already has its radius and diameter among the actions): the number is shown, it cannot be typed over here. */
function arcRadius(scene: Scene, ref: Ref): Annotation[] {
  const l = scene.parts[ref];
  if (l?.kind !== "line" || !l.center) return [];
  const [c, a] = [scene.parts[l.center], scene.parts[l.a]];
  const m = curveMid(lookup(scene), l);
  if (c?.kind !== "corner" || a?.kind !== "corner" || !m) return [];
  return [{ id: "radius", relationId: null, kind: "radius", label: "Radius", at: m, symbol: "R", value: Math.round(Math.hypot(...sub(a.at, c.at)) * 1e4) / 1e4, unit: "mm", locked: false, editable: false, readOnly: true, broken: false, open: false, others: [], lines: [] }];
}
function annotationsOf0(scene: Scene, selection: readonly Ref[], focus: string | null, all: boolean): Annotation[] {
  const hidden = all ? new Set<string>() : structuralRelations(scene); // (the joins of a body's outline are not shown unless all are asked for, `in_239`)
  const sel = selection.filter((r) => isPart(scene, r)); // planes, faces and the body have no constraints of their own
  const map = buildMap(scene);
  // what a selected line or circle has applied includes what its end points and centre have (a coincident, a point on a circle): selecting the part always shows its constraints (`in_195`)
  const scope = new Set<Ref>(sel);
  for (const r of sel) {
    const p = scene.parts[r];
    if (p?.kind === "line") [p.a, p.b, ...(p.center ? [p.center] : [])].forEach((c) => scope.add(c));
    else if (p?.kind === "circle") scope.add(p.center);
  }
  const out = scene.relations.filter((rel) => rel.kind !== "arcEnds" && !hidden.has(rel.id) && rel.parts.some((p) => scope.has(p))).map((rel) => annotationOf(scene, rel, sel, focus, map)).filter((a): a is Annotation => !!a);
  const m = measureOf(scene, selection);
  const r = radiusOf(scene, selection);
  return [...out, ...(m ? [m] : []), ...(r ? [r] : [])];
}

/** The annotations of these relations whether or not their parts are selected (to show what a refused change would have broken). */
export function annotationsOf(scene: Scene, ids: readonly string[]): Annotation[] {
  const map = buildMap(scene);
  return scene.relations.filter((r) => ids.includes(r.id)).map((rel) => annotationOf(scene, rel, [], null, map)).filter((a): a is Annotation => !!a);
}

/** The measure of the selected pair (or part) when the relation table offers a number for it and no relation of that kind already holds it. */
function measureOf(scene: Scene, selection: readonly Ref[]): Annotation | null {
  if (selection.length < 1 || selection.length > 2 || !selection.every((r) => isPart(scene, r))) return null;
  // a number that only references have (a line of the body, two body corners) is shown as a measurement too, but cannot be locked
  const a = measureAction(actionsFor(scene, selection), (x) => x.enabled || x.why === REFERENCES_ONLY);
  if (!a || !a.unit) return null;
  // the distance between a straight edge and a curved one is no one number (the chord of an arc is not where it is): nothing is measured, no line is drawn
  if (a.id === "distance" && selection.some((r) => { const p = scene.parts[r]; return p?.kind === "line" && (p.mid || p.circle || p.center); })) return null;
  // the length of a block's edge can be set too: the face at its end is pushed or pulled (`lengths.ts`)
  const bodyLine = a.id === "length" && selection.length === 1 && !a.enabled && lengthEditable(scene, selection[0]!);
  const v = a.measure();
  if (v === null) return null;
  if (scene.relations.some((r) => r.kind === a.id && r.value !== undefined && a.parts.length === r.parts.length && a.parts.every((p) => r.parts.includes(p)))) return null;
  const placed = place(lookup(scene), a.id, a.parts);
  const at = placed?.at ?? a.spot();
  if (!at) return null;
  return { id: "measure", relationId: null, kind: a.id, label: a.label, at, ...(a.id === "diameter" ? { symbol: "Ø" } : a.id === "radius" ? { symbol: "R" } : {}), value: v, unit: a.unit, locked: false, editable: a.enabled || bodyLine, readOnly: !a.enabled && !bodyLine, broken: false, open: false, others: [], lines: placed?.lines ?? [] };
}

/** The parts to show in amber: what the open constraint ties the selection to. */
export function focusParts(scene: Scene, selection: readonly Ref[], focus: string | null): Ref[] {
  const rel = focus ? scene.relations.find((r) => r.id === focus) : undefined;
  return rel ? rel.parts.filter((p) => !selection.includes(p) && p in scene.parts) : [];
}

/** A curved face of the body that is part of a cylinder or a sphere (a fillet, a rounded edge) says its radius when it is selected: R and the number, read only. (A full round post or hole shows its diameter, Ø, with its push / pull arrow.) */
function radiusOf(scene: Scene, selection: readonly Ref[]): Annotation | null {
  const p = selection.length === 1 ? scene.parts[selection[0]!] : undefined;
  if (!p || p.kind !== "plane" || p.origin !== "body" || !p.rounded || !p.radius) return null;
  const tris = surfaceTriangles(lookup(scene), p);
  if (!tris || tris.length < 9) return null;
  let [x, y, z] = [0, 0, 0];
  for (let i = 0; i + 2 < tris.length; i += 3) { x += tris[i]!; y += tris[i + 1]!; z += tris[i + 2]!; }
  const n = tris.length / 3;
  return { id: "radius", relationId: null, kind: "radius", label: "Radius", at: [x / n, y / n, z / n], symbol: "R", value: p.radius, unit: "mm", locked: false, editable: false, readOnly: true, broken: false, open: false, others: [], lines: [] };
}
