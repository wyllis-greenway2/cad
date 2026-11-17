// Sketch names that are kept for good (`dec_sketch_recipe_synced` rule 5, `in_620`): each closed figure that is drawn gets the next number when it first appears ("Sketch 3"), and keeps it for good: taking a step out, using the
// figure or drawing others does not renumber it. A figure is known by the ref of its derived face (a loop of lines: `d/loop@<its first line>`, a circle: `d/disk@<it>`). Nothing is saved: the names are made again, the same,
// when a file's commands are replayed, since a figure first appears at the same command each time. Pure.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "./scene.ts";

/** The scene with a number for every drawn figure that has none yet (the ones that appear in one command are numbered in the order of their refs). */
export function withSketchNames(s: Scene): Scene {
  const have = s.sketchNames ?? {};
  const fresh = Object.values(s.parts).filter((p) => p.kind === "face" && p.origin === "drawn" && !(p.ref in have)).map((p) => p.ref).sort();
  if (!fresh.length) return s;
  const names: Record<string, number> = { ...have };
  let count = s.sketchCount ?? Object.keys(have).length;
  for (const r of fresh) names[r] = ++count;
  return { ...s, sketchNames: names, sketchCount: count };
}

/** The number of the figure a step took (its outer lines, or its circle), looked up by the face that holds them; null when there is none (a figure made before names were kept, or one that is gone). */
export function sketchNumberOf(s: Scene, outer: readonly Ref[]): number | null {
  const names = s.sketchNames;
  if (!names || !outer.length) return null;
  for (const p of Object.values(s.parts)) {
    if (p.kind !== "face" || p.origin !== "drawn") continue;
    if (outer.includes(p.ref) || (p.disk && outer.includes(p.disk)) || (outer.length > 0 && p.loop.includes(outer[0]!))) { const n = names[p.ref]; if (n !== undefined) return n; }
  }
  return null;
}
