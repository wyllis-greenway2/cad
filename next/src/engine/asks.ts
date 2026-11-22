// The questions the worker answers about the recipe it holds (E28, E35, E58, E70, E71): each is its arguments (a type) and its answer (a function of the engine), written together, once. The protocol's `Ask`
// is made from this table and the worker calls it, so a new question is one entry here and nothing else. A question is answered on a copy: the recipe is not changed. The answer is plain data.
import { type Engine } from "./engine.ts";
import { Body } from "./lineage.ts";
import { type Change, options, probe, probeParam, trial } from "./failure.ts";
import { exportBody, meshOf, toBase64 } from "./exchange.ts";
import { dragSketch } from "./drag.ts";

/** what each question takes */
export interface AskArgs {
  /** what a change would do (ok, ok with notes, or refused in words) */ trial: { change: Change };
  /** where a step's number works */ probe: { step: string; key: string; lo?: number; hi?: number };
  /** where a named parameter works (E67); `focus`: a step that must come out fine */ probeParam: { name: string; lo?: number; hi?: number; focus?: string };
  /** what the person can do about a failed step (E35) */ options: { step: string };
  /** where a sketch goes when the points the person drags are pinned (E58) */ dragSketch: { step: string; pins: Record<string, [number, number]>; hold?: string[] };
  /** the mesh of what a step made, by face id (E70); `bodies`: only these */ mesh: { step: string; bodies?: string[]; tolerance?: number };
  /** a file of what a step made (E21, E71): the answer is `{ format, base64, bytes }` */ export: { step: string; format: "step" | "stl"; bodies?: string[]; tolerance?: number; ascii?: boolean };
}
export type Ask = { [K in keyof AskArgs]: { what: K } & AskArgs[K] }[keyof AskArgs];

/** the body a step made, or a sentence that says why there is none */
function bodyOf(e: Engine, step: string, to: string): Body {
  if (!e.ids().includes(step)) throw new Error(`no step ${step}`);
  const v = e.result(step).value; if (!(v instanceof Body) || !v.faces.length) throw new Error(`step ${step} has no body to ${to}`); return v;
}
export const asks: { [K in keyof AskArgs]: (e: Engine, a: AskArgs[K]) => unknown } = {
  trial: (e, a) => trial(e, a.change),
  probe: (e, a) => probe(e, a.step, a.key, { lo: a.lo, hi: a.hi }),
  probeParam: (e, a) => probeParam(e, a.name, { lo: a.lo, hi: a.hi, focus: a.focus }),
  options: (e, a) => options(e, a.step),
  dragSketch: (e, a) => dragSketch(e, a.step, a.pins, a.hold),
  mesh: (e, a) => meshOf(bodyOf(e, a.step, "mesh"), { bodies: a.bodies, tolerance: a.tolerance }),
  export: (e, a) => { const bytes = exportBody(bodyOf(e, a.step, "export"), a.format, { bodies: a.bodies, tolerance: a.tolerance, ascii: a.ascii }); return { format: a.format, base64: toBase64(bytes), bytes: bytes.length }; },
};
/** answer a question (an unknown one is said) */
export function answer(e: Engine, a: Ask): unknown { const f = (asks as Record<string, (e: Engine, a: unknown) => unknown>)[a.what]; if (!f) throw new Error(`there is no question called ${String(a.what)}`); return f(e, a); }
