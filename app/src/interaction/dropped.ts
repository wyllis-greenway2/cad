// Constraints that went with a part (`inv_constraint_uniformity`, `in_1162`): deleting a part takes with it every constraint that names it, and that is not said in words: the parts
// that stayed and leaned on the constraint flash red, and the constraint's bubble pops where it was. A constraint whose parts are all gone has nothing left to show.
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { annotationsOf } from "./annotations.ts";
import type { Annotation } from "./annotations.ts";

export interface Dropped { ids: string[]; parts: Ref[]; ghosts: Annotation[] }

/** The constraints `before` had that `after` has lost because a part they name is gone, the parts of them that are still there, and their bubbles as they were; null when nothing like that happened. */
export function droppedBy(before: Scene, after: Scene): Dropped | null {
  if (before === after || before.relations.length <= after.relations.length) return null;
  const kept = new Set(after.relations.map((r) => r.id));
  const parts = new Set<Ref>();
  const ids: string[] = [];
  for (const r of before.relations) {
    if (kept.has(r.id) || r.kind === "arcEnds" || !r.parts.some((q) => !(q in after.parts))) continue; // (taken away on purpose, or with a part that is still there: not this)
    const stay = r.parts.filter((q) => q in after.parts);
    if (!stay.length) continue;
    ids.push(r.id);
    stay.forEach((q) => parts.add(q));
  }
  if (!ids.length) return null;
  return { ids, parts: [...parts], ghosts: annotationsOf(before, ids) };
}
