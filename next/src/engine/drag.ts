// A drag of a sketch, asked of the worker (E58): the same solver as the commit, with the points the person is dragging as pins; the answer is where every point and circle ends up, what could not be
// reached and what was held, or a refusal that names the constraints in the way (E55). The recipe is not changed and nothing is made: this is the picture of the drag, and the commit is an ordinary edit.
import { Body } from "./lineage.ts";
import { type Engine } from "./engine.ts";
import { type SketchParams, makeSketch } from "./sketch.ts";
import { type Sketch, Refusal } from "./steps.ts";
import * as K from "./kernel.ts";

export type DragAnswer =
  | {
      ok: true;
      solution: { points: Record<string, [number, number]>; circles: Record<string, number> };
      unreached: Record<string, number>;
      holds: string[];
      kind: string;
      freedom: number;
    }
  | { ok: false; why: string; victims: string[] };
/** where the sketch of `step` goes when `pins` (point name -> where it is dragged to) are asked for; `hold` are parts that do not move */
export function dragSketch(
  engine: Engine,
  step: string,
  pins: Record<string, [number, number]>,
  hold: string[] = [],
): DragAnswer {
  if (!engine.ids().includes(step)) throw new Error(`no step ${step}`);
  const v = engine.result(step).value as Sketch;
  if (!v || v.kind !== "sketch" || !v.definition) throw new Error(`step ${step} is not a constrained sketch`);
  const st = engine.step(step),
    input = st.inputs[0] ? engine.result(st.inputs[0]).value : null;
  try {
    return K.scoped(() => {
      const out = makeSketch(
        v.definition as SketchParams,
        input instanceof Body ? input : null,
        { id: step },
        { pins, hold },
      );
      const s = out.solve!;
      return {
        ok: true as const,
        solution: s.solution!,
        unreached: s.unreached ?? {},
        holds: s.holds ?? [],
        kind: s.kind,
        freedom: s.freedom,
      };
    });
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, why: e.message, victims: e.victims };
    throw e;
  }
}
