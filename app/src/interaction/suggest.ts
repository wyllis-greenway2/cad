// Suggested constraints (`in_195`): with one or two parts of a drawing selected, the constraints that could be put on them (and are not on them yet) are offered as little buttons by the selection; a click applies one.
// The first selected part is the mover and the second the reference, as for the same constraint from the menu (`in_090`).
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { pointOf, segmentOf, circleOf } from "../operation/part.ts";
import { lookup } from "../operation/scene.ts";
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
