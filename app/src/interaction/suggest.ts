// Suggested constraints (`in_195`): with one or two parts of a drawing selected, the constraints that could be put on them (and are not on them yet) are offered as little buttons by the selection; a click applies one.
// The first selected part moves to meet the one selected after it, as for the same constraint from the menu (`in_229`).
import { anchorRounds, anchorLines, anchorCorners } from "../operation/anchors.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { pointOf, segmentOf, circleOf } from "../operation/part.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { settings } from "../shared/settings.ts";
import { formatId } from "../shared/ref.ts";
import { actionsFor } from "./actions.ts";
import { similarTo } from "./similar.ts";
import { breakable } from "../operation/groups.ts";

export interface Suggestions { at: Vec3; items: { id: string; label: string }[] }

/** What could be applied to this selection: geometric constraints only (a number is asked for where it is shown), those not already holding, and where to put the buttons. Null for nothing to offer. */
export function suggestionsFor(scene: Scene, selection: readonly Ref[], tol = 0): Suggestions | null {
  const constraints = constraintsFor(scene, selection, tol);
  // "select similar" is offered when there are more like what is selected (`in_268`), and "ungroup" when a whole group is selected (`in_269`), after the constraints
  const more = [similarOffer(scene, selection), ungroupOffer(scene, selection)].filter((o): o is { at: Vec3; item: { id: string; label: string } } => !!o);
  if (!more.length) return constraints;
  const items = [...(constraints?.items ?? []), ...more.map((o) => o.item)];
  return { at: constraints?.at ?? more[0]!.at, items };
}

/** The middle of what is selected, where the buttons stand. */
function spotOf(scene: Scene, selection: readonly Ref[]): Vec3 | null {
  const get = lookup(scene);
  const spots = selection.slice(0, 60).map((r): Vec3 | null => {
    const p = scene.parts[r];
    if (p?.kind === "corner") return pointOf(get, r);
    if (p?.kind === "line") { const s = segmentOf(get, r); return s ? [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2, (s[0][2] + s[1][2]) / 2] : null; }
    if (p?.kind === "circle") return circleOf(get, r)?.center ?? null;
    if (p?.kind === "plane" && p.mesh && p.mesh.length >= 9) { let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i + 2 < p.mesh.length; i += 3) { x += p.mesh[i]!; y += p.mesh[i + 1]!; z += p.mesh[i + 2]!; n++; } return [x / n, y / n, z / n]; }
    return null;
  }).filter((q): q is Vec3 => !!q);
  if (!spots.length) return null;
  return [spots.reduce((a, q) => a + q[0], 0) / spots.length, spots.reduce((a, q) => a + q[1], 0) / spots.length, spots.reduce((a, q) => a + q[2], 0) / spots.length];
}
function ungroupOffer(scene: Scene, selection: readonly Ref[]): { at: Vec3; item: { id: string; label: string } } | null {
  if (!breakable(scene, selection).length) return null;
  const at = spotOf(scene, selection);
  return at ? { at, item: { id: "select:ungroup", label: "Ungroup" } } : null;
}

const offers = new WeakMap<Scene, Map<string, { count: number } | null>>();
/** Select similar as a button, when what is selected has others like it (the same body or sketch): where it stands (the middle of what is selected) and the button. */
function similarOffer(scene: Scene, selection: readonly Ref[]): { at: Vec3; item: { id: string; label: string } } | null {
  if (!selection.length || selection.length > 4) return null;
  const memo = offers.get(scene) ?? offers.set(scene, new Map()).get(scene)!;
  const key = selection.join("|");
  let found = memo.get(key);
  if (found === undefined) {
    const r = similarTo(scene, selection);
    found = r.ok && r.refs.length > selection.length ? { count: r.refs.length - selection.length } : null;
    memo.set(key, found);
  }
  if (!found) return null;
  const at = spotOf(scene, selection);
  if (!at) return null;
  return { at, item: { id: "select:similar", label: `Select similar (${found.count} more)` } };
}

function constraintsFor(scene: Scene, selection: readonly Ref[], tol = 0): Suggestions | null {
  if (selection.length < 1 || selection.length > 2) return null;
  const get = lookup(scene);
  const parts = selection.map((r) => scene.parts[r]);
  if (!parts.every((p) => p && p.origin === "drawn" && p.movable && (p.kind === "corner" || p.kind === "line" || p.kind === "circle"))) return null;
  const have = (id: string, refs: readonly Ref[]) => scene.relations.some((r) => r.kind === id && r.parts.length === refs.length && refs.every((x) => r.parts.includes(x)));
  const items = actionsFor(scene, selection).filter((a) => a.group === "relation" && !a.dimensional && a.enabled && !have(a.id, a.parts)).map((a) => ({ id: a.id, label: a.label }));
  items.push(...nearItems(scene, selection, tol).map((n) => ({ id: n.id, label: n.label })));
  if (!items.length) return null;
  // by the selection: the middle of what is selected
  const spots = selection.map((r): Vec3 | null => {
    const p = scene.parts[r];
    if (p?.kind === "corner") return pointOf(get, r);
    if (p?.kind === "line") { const s = segmentOf(get, r); return s ? [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2, (s[0][2] + s[1][2]) / 2] : null; }
    const c = circleOf(get, r);
    return c ? c.center : null;
  }).filter((q): q is Vec3 => !!q);
  if (!spots.length) return null;
  const at: Vec3 = [spots.reduce((a, q) => a + q[0], 0) / spots.length, spots.reduce((a, q) => a + q[1], 0) / spots.length, spots.reduce((a, q) => a + q[2], 0) / spots.length];
  return { at, items };
}

/**
 * Corners that lie close to a selected circle, arc or line without being on it (`in_244`): "coincident with circle" / "on line" for them is offered too, though they are not in the selection (a circle drawn by eye
 * lands near the ends of lines, and the pair would otherwise have to be selected one by one). One suggestion puts every near corner on it; each moves to the curve, which stays.
 */
function nearItems(scene: Scene, selection: readonly Ref[], tol = 0): { id: string; label: string; corners: Ref[]; target: Ref; kind: "onCircle" | "onLine" | "tangent" | "concentric" }[] {
  if (selection.length !== 1) return [];
  const target = selection[0]!;
  const part = scene.parts[target];
  if (!part || part.origin !== "drawn" || !part.movable) return [];
  if (part.kind === "corner") return nearCurves(scene, part, tol);
  const m = curveGap(scene, part);
  if (!m) return [];
  const touching = part.kind === "circle" ? touchingCircles(scene, part, tol) : [];
  const plane = part.plane ? scene.parts[part.plane] : undefined;
  const bodyCorners = plane?.kind === "plane" ? anchorCorners(scene, plane) : []; // (the corners of the body in this plane: the curve can be held to them, `in_310`)
  const closeEnough = (at: Vec3) => m.gap(at) <= Math.max(settings.sketch.nearFrac * m.size, tol); // (exactly on it counts: nothing ties it there yet)
  const tied = (ref: Ref) => scene.relations.some((r) => r.kind === m.kind && r.parts.includes(ref) && r.parts.includes(target));
  const near = [
    ...Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "drawn" && !p.derived && p.movable && p.plane === part.plane && !m.own.has(p.ref) && closeEnough(p.at) && !tied(p.ref)).map((p) => p.ref),
    ...bodyCorners.filter((c) => closeEnough(c.at) && !tied(c.ref)).map((c) => c.ref),
  ];
  if (!near.length) return touching;
  const what = m.kind === "onCircle" ? "Coincident with circle" : "On line";
  return [...touching, { id: `near:${m.kind}`, label: near.length === 1 ? `${what}: the corner close to it` : `${what}: the ${near.length} corners close to it`, corners: near, target, kind: m.kind }];
}

/** The circles that almost touch this one, outside it or inside it: "tangent" is offered for each (`in_292`). */
function touchingCircles(scene: Scene, circle: Extract<Scene["parts"][string], { kind: "circle" }>, tol = 0): { id: string; label: string; corners: Ref[]; target: Ref; kind: "tangent" | "concentric" }[] {
  const get = lookup(scene);
  const a = circleOf(get, circle.ref);
  if (!a) return [];
  const out: { id: string; label: string; corners: Ref[]; target: Ref; kind: "tangent" | "concentric"; g: number }[] = [];
  // the circular edges of the body in this circle's plane are circles too, read-only (`in_308`): tangent when they almost touch, concentric when the centres are almost one
  const plane = circle.plane ? scene.parts[circle.plane] : undefined;
  for (const an of plane?.kind === "plane" ? anchorRounds(scene, plane) : []) {
    const d = Math.hypot(a.center[0] - an.center[0], a.center[1] - an.center[1], a.center[2] - an.center[2]);
    const g = Math.min(Math.abs(d - (a.radius + an.radius)), Math.abs(d - Math.abs(a.radius - an.radius)));
    if (g <= Math.max(settings.sketch.nearFrac * Math.min(a.radius, an.radius), tol) && !scene.relations.some((r) => r.kind === "tangent" && r.parts.includes(circle.ref) && r.parts.includes(an.ref))) out.push({ id: `near:tangent:${an.ref}`, label: "Tangent: the edge of the body that nearly touches it", corners: [], target: an.ref, kind: "tangent", g });
    if (d > 1e-6 && d <= Math.max(settings.sketch.nearFrac * Math.min(a.radius, an.radius), tol) && !scene.relations.some((r) => r.kind === "concentric" && r.parts.includes(circle.ref) && r.parts.includes(an.ref))) out.push({ id: `near:concentric:${an.ref}`, label: "Concentric: the edge of the body whose centre is close", corners: [], target: an.ref, kind: "concentric", g: d });
  }
  for (const p of Object.values(scene.parts)) {
    if (p.kind !== "circle" || p.ref === circle.ref || p.origin !== "drawn" || !p.movable || p.plane !== circle.plane) continue;
    const b = circleOf(get, p.ref);
    if (!b) continue;
    const d = Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1], a.center[2] - b.center[2]);
    const g = Math.min(Math.abs(d - (a.radius + b.radius)), Math.abs(d - Math.abs(a.radius - b.radius)));
    if (!(g <= Math.max(settings.sketch.nearFrac * Math.min(a.radius, b.radius), tol))) continue;
    if (scene.relations.some((r) => r.kind === "tangent" && r.parts.includes(circle.ref) && r.parts.includes(p.ref))) continue;
    out.push({ id: `near:tangent:${p.ref}`, label: "Tangent: the circle that nearly touches it", corners: [], target: p.ref, kind: "tangent", g });
  }
  return out.sort((x, y) => x.g - y.g).slice(0, 2).map(({ g: _g, ...rest }) => rest);
}

/** How far a point is from a drawn circle, arc or straight line, the size that is judged against, and what its own points are (a corner of its own is never offered to it). */
function curveGap(scene: Scene, part: Scene["parts"][string]): { gap: (q: Vec3) => number; size: number; kind: "onCircle" | "onLine"; own: Set<Ref> } | null {
  if (part.kind !== "line" && part.kind !== "circle") return null;
  const get = lookup(scene);
  const own = new Set<Ref>(part.kind === "line" ? [part.a, part.b, ...(part.center ? [part.center] : [])] : [part.center]);
  const arc = part.kind === "line" && part.center ? pointOf(get, part.center) : null;
  if (part.kind === "circle" || arc) {
    const c = part.kind === "circle" ? circleOf(get, part.ref) : null;
    const [centre, radius] = c ? [c.center, c.radius] : [arc!, Math.hypot(...(pointOf(get, (part as { a: Ref }).a)!.map((v, i) => v - arc![i]!) as [number, number, number]))];
    return { gap: (q) => Math.abs(Math.hypot(q[0] - centre[0], q[1] - centre[1], q[2] - centre[2]) - radius), size: radius, kind: "onCircle", own };
  }
  const sg = segmentOf(get, part.ref);
  if (!sg) return null;
  const d = [sg[1][0] - sg[0][0], sg[1][1] - sg[0][1], sg[1][2] - sg[0][2]];
  const len = Math.hypot(d[0]!, d[1]!, d[2]!);
  if (len < 1e-9) return null;
  return {
    size: len, kind: "onLine", own,
    gap: (q) => {
      const t = ((q[0] - sg[0][0]) * d[0]! + (q[1] - sg[0][1]) * d[1]! + (q[2] - sg[0][2]) * d[2]!) / (len * len);
      if (t < 0 || t > 1) return Infinity; // (beside the line, not on its length)
      return Math.hypot(sg[0][0] + d[0]! * t - q[0], sg[0][1] + d[1]! * t - q[1], sg[0][2] + d[2]! * t - q[2]);
    },
  };
}

/** A selected point (the centre of a circle, a corner) that lies close to the edge of a circle or arc, or a line, that it is not on: "on circle" / "on line" is offered for it (`in_290`). */
function nearCurves(scene: Scene, corner: Extract<Scene["parts"][string], { kind: "corner" }>, tol = 0): { id: string; label: string; corners: Ref[]; target: Ref; kind: "onCircle" | "onLine" }[] {
  const out: { id: string; label: string; corners: Ref[]; target: Ref; kind: "onCircle" | "onLine"; g: number }[] = [];
  for (const p of Object.values(scene.parts)) {
    if (p.origin !== "drawn" || !p.movable || p.plane !== corner.plane || (p.kind !== "line" && p.kind !== "circle") || (p.kind === "line" && p.derived)) continue;
    const m = curveGap(scene, p);
    if (!m || m.own.has(corner.ref)) continue;
    const g = m.gap(corner.at);
    if (!(g <= Math.max(settings.sketch.nearFrac * m.size, tol))) continue;
    if (scene.relations.some((r) => r.kind === m.kind && r.parts.includes(corner.ref) && r.parts.includes(p.ref))) continue;
    out.push({ id: `near:${m.kind}:${p.ref}`, label: m.kind === "onCircle" ? "On the circle close to it" : "On the line close to it", corners: [corner.ref], target: p.ref, kind: m.kind, g });
  }
  // the straight edges and the circular edges of the body in this plane are curves too, read-only (`in_310`)
  const plane = corner.plane ? scene.parts[corner.plane] : undefined;
  if (plane?.kind === "plane") {
    const consider = (ref: Ref, g: number, size: number, kind: "onCircle" | "onLine") => {
      if (!(g <= Math.max(settings.sketch.nearFrac * size, tol))) return;
      if (scene.relations.some((r) => r.kind === kind && r.parts.includes(corner.ref) && r.parts.includes(ref))) return;
      out.push({ id: `near:${kind}:${ref}`, label: "On the edge of the body close to it", corners: [corner.ref], target: ref, kind, g });
    };
    for (const l of anchorLines(scene, plane)) { const m = curveGap(scene, scene.parts[l.ref]!); if (m) consider(l.ref, m.gap(corner.at), m.size, "onLine"); }
    for (const r of anchorRounds(scene, plane)) consider(r.ref, Math.abs(Math.hypot(corner.at[0] - r.center[0], corner.at[1] - r.center[1], corner.at[2] - r.center[2]) - r.radius), r.radius, "onCircle");
  }
  return out.sort((x, y) => x.g - y.g).slice(0, 2).map(({ g: _g, ...rest }) => rest);
}

/** The command for a "near" suggestion: each corner close to the selected circle, arc or line is put on it (the corner moves, the curve stays), as one step. */
export function nearCommand(scene: Scene, selection: readonly Ref[], id: string, tol = 0): Command | null {
  const item = nearItems(scene, selection, tol).find((n) => n.id === id);
  if (!item) return null;
  if (item.kind === "tangent" || item.kind === "concentric") return { type: "addRelation", relation: { id: nextId(scene, "r"), kind: item.kind, parts: [selection[0]!, item.target] } }; // (the solver puts the circles touching, or their centres together)
  const first = Number(/_(\d+)$/.exec(nextId(scene, "r"))?.[1] ?? 0);
  const commands: Command[] = [];
  for (const [i, corner] of item.corners.entries()) {
    const a = actionsFor(scene, [corner, item.target]).find((x) => x.id === item.kind && x.enabled);
    const cmd = a?.run();
    if (cmd && cmd.type === "addRelation") commands.push({ type: "addRelation", relation: { ...cmd.relation, id: formatId("r", first + i) } });
  }
  return commands.length ? { type: "batch", commands } : null;
}
