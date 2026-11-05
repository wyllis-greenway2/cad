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

export function compile(scene: Scene, kernel: Kernel): CompileOutcome {
  const solved = solveScene(scene);
  const { graph, errors } = buildGraph(solved.scene);
  if (!graph.ops.length) return { scene: withDerived(withBody(solved.scene, [])), solve: solved, kernel: null, errors };
  const result = kernel.evaluate(graph);
  for (const op of result.ops) {
    if (!op.error) continue;
    const step = solved.scene.steps.find((s) => `x_${s.id}` === op.id || `s_${s.id}` === op.id);
    if (step) errors[step.id] ??= op.error;
  }
  return { scene: withDerived(withBody(solved.scene, bodyParts(result))), solve: solved, kernel: result, errors };
}
