// Suggested constraints (`in_195`): with one or two parts of a drawing selected, the constraints that could be put on them (and are not on them yet) are offered as little buttons by the selection; a click applies one.
// The first selected part moves to meet the one selected after it, as for the same constraint from the menu (`in_229`).
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { pointOf, segmentOf, circleOf } from "../operation/part.ts";
import { lookup, nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { settings } from "../shared/settings.ts";
import { formatId } from "../shared/ref.ts";
import { actionsFor } from "./actions.ts";

export interface Suggestions { at: Vec3; items: { id: string; label: string }[] }

/** What could be applied to this selection: geometric constraints only (a number is asked for where it is shown), those not already holding, and where to put the buttons. Null for nothing to offer. */
export function suggestionsFor(scene: Scene, selection: readonly Ref[]): Suggestions | null {
  if (selection.length < 1 || selection.length > 2) return null;
  const get = lookup(scene);
  const parts = selection.map((r) => scene.parts[r]);
  if (!parts.every((p) => p && p.origin === "drawn" && p.movable && (p.kind === "corner" || p.kind === "line" || p.kind === "circle"))) return null;
  const have = (id: string, refs: readonly Ref[]) => scene.relations.some((r) => r.kind === id && r.parts.length === refs.length && refs.every((x) => r.parts.includes(x)));
  const items = actionsFor(scene, selection).filter((a) => a.group === "relation" && !a.dimensional && a.enabled && !have(a.id, a.parts)).map((a) => ({ id: a.id, label: a.label }));
  items.push(...nearItems(scene, selection).map((n) => ({ id: n.id, label: n.label })));
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
function nearItems(scene: Scene, selection: readonly Ref[]): { id: string; label: string; corners: Ref[]; target: Ref; kind: "onCircle" | "onLine" }[] {
  if (selection.length !== 1) return [];
  const target = selection[0]!;
  const part = scene.parts[target];
  if (!part || part.origin !== "drawn" || !part.movable || part.kind === "corner") return [];
  const get = lookup(scene);
  const own = new Set<Ref>(part.kind === "line" ? [part.a, part.b, ...(part.center ? [part.center] : [])] : part.kind === "circle" ? [part.center] : []);
  // how far a point is from the curve, and the size it is judged against
  let gap: (q: Vec3) => number;
  let size: number;
  let kind: "onCircle" | "onLine";
  const arc = part.kind === "line" && part.center ? pointOf(get, part.center) : null;
  if (part.kind === "circle" || arc) {
    const c = part.kind === "circle" ? circleOf(get, target) : null;
    const [centre, radius] = c ? [c.center, c.radius] : [arc!, Math.hypot(...(pointOf(get, (part as { a: Ref }).a)!.map((v, i) => v - arc![i]!) as [number, number, number]))];
    gap = (q) => Math.abs(Math.hypot(q[0] - centre[0], q[1] - centre[1], q[2] - centre[2]) - radius);
    size = radius;
    kind = "onCircle";
  } else {
    const sg = segmentOf(get, target);
    if (!sg) return [];
    const d = [sg[1][0] - sg[0][0], sg[1][1] - sg[0][1], sg[1][2] - sg[0][2]];
    const len = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (len < 1e-9) return [];
    size = len;
    gap = (q) => {
      const t = ((q[0] - sg[0][0]) * d[0]! + (q[1] - sg[0][1]) * d[1]! + (q[2] - sg[0][2]) * d[2]!) / (len * len);
      if (t < 0 || t > 1) return Infinity; // (beside the line, not on its length)
      return Math.hypot(sg[0][0] + d[0]! * t - q[0], sg[0][1] + d[1]! * t - q[1], sg[0][2] + d[2]! * t - q[2]);
    };
    kind = "onLine";
  }
  const near = Object.values(scene.parts).filter((p) => {
    if (p.kind !== "corner" || p.origin !== "drawn" || p.derived || !p.movable || p.plane !== part.plane || own.has(p.ref)) return false;
    const g = gap(p.at);
    if (!(g > 1e-6 && g <= settings.sketch.nearFrac * size)) return false;
    return !scene.relations.some((r) => r.kind === kind && r.parts.includes(p.ref) && r.parts.includes(target));
  }).map((p) => p.ref);
  if (!near.length) return [];
  const what = kind === "onCircle" ? "Coincident with circle" : "On line";
  return [{ id: `near:${kind}`, label: near.length === 1 ? `${what}: the corner close to it` : `${what}: the ${near.length} corners close to it`, corners: near, target, kind }];
}

/** The command for a "near" suggestion: each corner close to the selected circle, arc or line is put on it (the corner moves, the curve stays), as one step. */
export function nearCommand(scene: Scene, selection: readonly Ref[], id: string): Command | null {
  const item = nearItems(scene, selection).find((n) => n.id === id);
  if (!item) return null;
  const first = Number(/_(\d+)$/.exec(nextId(scene, "r"))?.[1] ?? 0);
  const commands: Command[] = [];
  for (const [i, corner] of item.corners.entries()) {
    const a = actionsFor(scene, [corner, item.target]).find((x) => x.id === item.kind && x.enabled);
    const cmd = a?.run();
    if (cmd && cmd.type === "addRelation") commands.push({ type: "addRelation", relation: { ...cmd.relation, id: formatId("r", first + i) } });
  }
  return commands.length ? { type: "batch", commands } : null;
}
