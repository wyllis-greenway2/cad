// The compiler pipeline (`dec_clean_engine_design` section 7): solve the relations, build the kernel graph from the steps, run the kernel, and put the
// body back into the scene as parts. The result is a derived view; the saved thing stays the drawn parts, relations and steps.
import type { Scene } from "../operation/scene.ts";
import type { Ref } from "../shared/ref.ts";
import { withBody, withDerived } from "../operation/scene.ts";
import { withSketchNames } from "../operation/sketchnames.ts";
import type { Kernel, KernelGraph, KernelResult } from "./kernel/adapter.ts";
import { solveScene } from "./solve.ts";
import type { SolveOutcome } from "./solve.ts";
import { buildGraph } from "./graph.ts";
import { cuttingSheets } from "../operation/cutface.ts";
import type { Sheet } from "../operation/cutface.ts";
import type { Part } from "../operation/part.ts";
import type { GearShape } from "../operation/gearshape.ts";
import { gearShapes } from "../operation/gearshape.ts";
import { bodyParts } from "./body.ts";
import { rebindAnchors } from "../operation/anchors.ts";

export interface CompileOutcome {
  /** The scene with solved positions and the current body parts. */
  scene: Scene;
  solve: SolveOutcome;
  /** null when there is no body (no steps, or all failed). */
  kernel: KernelResult | null;
  /** Step id -> why it could not be built (from the graph builder or the kernel). */
  errors: Record<string, string>;
  /** Step id -> the parts of the step that are the problem (the edges of a fillet or chamfer that cannot take the size), when the kernel could tell (`in_266`): they flash red when the step is refused */
  problems?: Record<string, Ref[]>;
  /** Step id -> something to say about a step that was made (a fillet or chamfer that was made together with the edges meeting it at a corner, `in_379`) */
  notes?: Record<string, string>;
  /** Step id -> what an extrusion or revolve that did not say whether it cuts, joins or stands apart came to (a cut, a piece joined on, a piece of its own): the session makes the step say it (`in_436`) */
  modes?: Record<string, "cut" | "add" | "new">;
  /** relations to an edge of the body that is gone and that no edge looks like now (`in_309`): they hold nothing until the body is as it was */
  lost?: string[];
}

/**
 * Scenes that came out of a compile are already solved: their drawn parts satisfy the relations (or the plane was left as it was). Compiling one again, as when the kernel's newer answer is taken in
 * (`refresh`, after every undo and redo in the browser), would solve every plane again to move nothing, which for a sketch with a hundred constraints is most of a tenth of a second (`in_248`).
 */
const settled = new WeakMap<Scene, SolveOutcome>();

/** Where the time of each compile went (ms), the last few and the total since the page began: what a snapshot says when a change is slow (`in_448`). */
const recent: { at: number; solveMs: number; graphMs: number; kernelMs: number; placeMs: number; totalMs: number; ops: number }[] = [];
let compiles = 0;
let compileMs = 0;
export function compileTimings(): { compiles: number; totalMs: number; recent: typeof recent } {
  const r = (v: number) => Math.round(v * 10) / 10;
  return { compiles, totalMs: Math.round(compileMs), recent: recent.map((c) => ({ ...c, solveMs: r(c.solveMs), graphMs: r(c.graphMs), kernelMs: r(c.kernelMs), placeMs: r(c.placeMs), totalMs: r(c.totalMs) })) };
}
function logged(t: number[], ops: number, o: CompileOutcome): CompileOutcome {
  const [t0, t1, t2, t3, t4] = t as [number, number, number, number, number];
  recent.push({ at: Math.round(t0), solveMs: t1 - t0, graphMs: t2 - t1, kernelMs: t3 - t2, placeMs: t4 - t3, totalMs: t4 - t0, ops });
  if (recent.length > 30) recent.shift();
  compiles++;
  compileMs += t4 - t0;
  return o;
}

/**
 * The parts of the body for a kernel answer, kept while it is the same answer (`in_727`): the kernel hands back the very same result for a graph it has made, and a change that leaves the kernel's graph as it was (a figure drawn, a
 * constraint) asked for the parts of every body of it again, a face and edges for each of thousands, and made new part objects for them, which everything worked out from the parts then did again too.
 */
const bodyKept = new WeakMap<object, { key: string; parts: Part[] }>();
function bodyPartsOf(result: KernelResult, sheets: Sheet[], gears: GearShape[]): Part[] {
  const key = JSON.stringify([sheets, gears]);
  const kept = bodyKept.get(result);
  if (kept && kept.key === key) return kept.parts;
  const parts = bodyParts(result, sheets, gears);
  bodyKept.set(result, { key, parts });
  return parts;
}

/** The outcome each derived scene came from (kept while the scene is), so what only the outcome has (the kernel's mesh, with the walls of a gear's teeth) can be found from the scene alone (`in_1020`). */
const outcomes = new WeakMap<Scene, CompileOutcome>();
export const registerOutcome = (o: CompileOutcome): void => { outcomes.set(o.scene, o); };
export const outcomeOfScene = (s: Scene): CompileOutcome | undefined => outcomes.get(s);
export function compile(scene: Scene, kernel: Kernel): CompileOutcome {
  const T0 = performance.now();
  const known = settled.get(scene);
  const solved = known ? { ...known, scene, moves: [] } : solveScene(scene);
  const T1 = performance.now();
  const { graph, errors } = buildGraph(withDerived(solved.scene)); // (a step may name a piece of a cut figure, which exists only once the faces are derived from the solved drawing)
  const T2 = performance.now();
  if (!graph.ops.length) kernel.clear?.(); // (nothing is asked of the kernel: what it last drew must not stand in for the next answer, `in_951`)
  if (!graph.ops.length) return remembered({ scene: withSketchNames(withDerived(withBody(solved.scene, []))), solve: solved, kernel: null, errors });
  const result = kernel.evaluate(graph);
  const T3 = performance.now();
  const problems: Record<string, Ref[]> = {};
  const notes: Record<string, string> = {};
  const modes: Record<string, "cut" | "add" | "new"> = {};
  const cuts: Record<string, string[]> = {};
  for (const op of result.ops) {
    if (op.cutInto) { const made = solved.scene.steps.find((s) => `x_${s.id}` === op.id); if (made) cuts[made.id] = op.cutInto; }
    if (op.used) { const made = solved.scene.steps.find((s) => `x_${s.id}` === op.id); if (made) modes[made.id] = op.used; }
    if (op.note) { const made = solved.scene.steps.find((s) => `x_${s.id}` === op.id || `s_${s.id}` === op.id); if (made) notes[made.id] = op.note; }
    if (!op.error) continue;
    const step = solved.scene.steps.find((s) => `x_${s.id}` === op.id || `s_${s.id}` === op.id);
    if (step) { errors[step.id] ??= op.error; if (op.culprits?.length) problems[step.id] = op.culprits.flatMap((i) => (step.parts[i] ? [step.parts[i]!] : [])); }
  }
  // an answer that is not the answer for this graph (the browser: the last one shown while the new one is made) would give the body parts of another model: the figure of a step just made, taken from the face it was drawn on, loses its
  // pieces named after the body's edges and the step is "gone" (`in_1354`: an arrow pulled, then a number typed). While the answer is awaited the parts the scene has are kept; the answer's parts come with it.
  const keep = !!result.stale && Object.values(solved.scene.parts).some((p) => p.origin === "body");
  const placed = keep ? solved.scene : withBody(solved.scene, bodyPartsOf(result, cuttingSheets(solved.scene), gearShapes(solved.scene)));
  const bound = rebindAnchors(placed); // (a relation to an edge of the body that the change took away is moved to the edge that looks most like it, `in_309`)
  // the drawn parts held to such an edge are solved again against the edge as it is now (the first solve was made before the body was)
  const again = bound.scene !== placed ? solveScene(bound.scene) : null;
  const derived = withSketchNames(withDerived(again ? again.scene : bound.scene));
  return logged([T0, T1, T2, T3, performance.now()], graph.ops.length, remembered({ scene: Object.keys(cuts).length ? { ...derived, cutOf: cuts } : derived, solve: again ? { ...again, moves: [...solved.moves, ...again.moves] } : solved, kernel: result, errors, ...(bound.lost.length ? { lost: bound.lost } : {}), ...(Object.keys(notes).length ? { notes } : {}), ...(Object.keys(modes).length ? { modes } : {}), ...(Object.keys(problems).length ? { problems } : {}) }));
}
function remembered(o: CompileOutcome): CompileOutcome {
  settled.set(o.scene, { ...o.solve, scene: o.scene, moves: [] });
  return o;
}

/** The graph the kernel is given for a scene (the same as `compile` builds): for asking it something else of the same model, such as a mesh for a file. */
export function graphOf(scene: Scene): KernelGraph {
  const known = settled.get(scene);
  return buildGraph(withDerived((known ? { ...known, scene } : solveScene(scene)).scene)).graph;
}
