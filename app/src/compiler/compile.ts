// The compiler pipeline (`dec_clean_engine_design` section 7): solve the relations, build the kernel graph from the steps, run the kernel, and put the
// body back into the scene as parts. The result is a derived view; the saved thing stays the drawn parts, relations and steps.
import type { Scene } from "../operation/scene.ts";
import { withBody, withDerived } from "../operation/scene.ts";
import type { Kernel, KernelResult } from "./kernel/adapter.ts";
import { solveScene } from "./solve.ts";
import type { SolveOutcome } from "./solve.ts";
import { buildGraph } from "./graph.ts";
import { bodyParts } from "./body.ts";

export interface CompileOutcome {
  /** The scene with solved positions and the current body parts. */
  scene: Scene;
  solve: SolveOutcome;
  /** null when there is no body (no steps, or all failed). */
  kernel: KernelResult | null;
  /** Step id -> why it could not be built (from the graph builder or the kernel). */
  errors: Record<string, string>;
}

/**
 * Scenes that came out of a compile are already solved: their drawn parts satisfy the relations (or the plane was left as it was). Compiling one again, as when the kernel's newer answer is taken in
 * (`refresh`, after every undo and redo in the browser), would solve every plane again to move nothing, which for a sketch with a hundred constraints is most of a tenth of a second (`in_248`).
 */
const settled = new WeakMap<Scene, SolveOutcome>();

export function compile(scene: Scene, kernel: Kernel): CompileOutcome {
  const known = settled.get(scene);
  const solved = known ? { ...known, scene, moves: [] } : solveScene(scene);
  const { graph, errors } = buildGraph(withDerived(solved.scene)); // (a step may name a piece of a cut figure, which exists only once the faces are derived from the solved drawing)
  if (!graph.ops.length) return remembered({ scene: withDerived(withBody(solved.scene, [])), solve: solved, kernel: null, errors });
  const result = kernel.evaluate(graph);
  for (const op of result.ops) {
    if (!op.error) continue;
    const step = solved.scene.steps.find((s) => `x_${s.id}` === op.id || `s_${s.id}` === op.id);
    if (step) errors[step.id] ??= op.error;
  }
  return remembered({ scene: withDerived(withBody(solved.scene, bodyParts(result))), solve: solved, kernel: result, errors });
}
function remembered(o: CompileOutcome): CompileOutcome {
  settled.set(o.scene, { ...o.solve, scene: o.scene, moves: [] });
  return o;
}
