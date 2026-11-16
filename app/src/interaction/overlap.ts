// The volume two bodies share (`dec_measure_report`, `in_573`): the kernel makes the common part of the two (the same boolean as the combine step's "intersect") and says how much room it takes. It answers later (the kernel's own
// thread), so the answer is kept for the scene as it comes and the report reads what is there: nothing yet, working, the volume, or why not. Pure but for the one question to the kernel.
import type { Ref } from "../shared/ref.ts";
import type { Scene } from "../operation/scene.ts";
import type { Kernel, KernelGraph } from "../compiler/kernel/adapter.ts";
import { graphOf } from "../compiler/compile.ts";

export type Overlap = "working" | { mm3: number } | { error: string };
const kept = new WeakMap<Scene, Map<string, Overlap>>();
const keyOf = (a: Ref, b: Ref): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** What is known of the overlap of two bodies of this scene: null when it has not been asked. */
export const overlapOf = (scene: Scene, a: Ref, b: Ref): Overlap | null => kept.get(scene)?.get(keyOf(a, b)) ?? null;

/** The graph that makes the common part of two bodies of the scene: the scene's own graph and one more step (the combine step's intersect, the bodies by the names they keep) after the last solid. */
function graphFor(scene: Scene, a: string, b: string): KernelGraph | null {
  const graph = graphOf(scene);
  const last = [...graph.ops].reverse().find((o) => o.type !== "sketch");
  if (!last) return null;
  return { ...graph, ops: [...graph.ops, { id: "overlap", type: "combine", target: last.id, bodies: [a, b], mode: "intersect" }] };
}

/**
 * Ask the kernel for the overlap of two bodies, once for the scene and the pair; `done` is called when the answer is there (the scene's answers are then read with `overlapOf`). The common part is meshed coarsely:
 * only its volume is wanted, which the kernel works out from the solid itself.
 */
export function requestOverlap(kernel: Kernel, scene: Scene, a: Ref, b: Ref, done: () => void = () => {}): void {
  if (overlapOf(scene, a, b)) return;
  let by = kept.get(scene);
  if (!by) kept.set(scene, (by = new Map()));
  const [pa, pb] = [scene.parts[a], scene.parts[b]];
  const [ia, ib] = [pa?.kind === "body" ? pa.id : undefined, pb?.kind === "body" ? pb.id : undefined];
  const key = keyOf(a, b);
  const graph = ia && ib ? graphFor(scene, ia, ib) : null;
  if (!graph) { by.set(key, { error: "those bodies are not both there" }); return; }
  by.set(key, "working");
  void kernel.exportMesh(graph, { tolerance: 1, angular: 1, bodies: [ia!] }).then(
    (r) => { by.set(key, r.ok ? { mm3: r.volume } : /nothing in common/.test(r.error) ? { mm3: 0 } : { error: r.error }); done(); },
    (e: unknown) => { by.set(key, { error: String(e) }); done(); },
  );
}
