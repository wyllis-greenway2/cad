// A figure made partly of the body's own edges, copied into the sketch (`dec_body_edge_pieces`, `in_1360`). The pieces a drawing across a body's face is cut into are derived from the lines and the body's edges as they are now; a step made from
// them changes those edges, and every later change to the model lost the step's figure ("a part of this step is gone"). So when the step is made, its figure is drawn as lines and arcs of its own, in the same plane, and the step uses
// those: it no longer depends on the body's edges. The copy is of the figure as it is then: it does not follow a later change of the body's size.
// Pure: a scene and the figures in, the commands that draw the copies and the figures with their new refs out.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, scale, dot, cross, length, normalize } from "../math/vec.ts";
import type { Command } from "./commands.ts";
import { apply } from "./commands.ts";
import type { Scene, Figure } from "./scene.ts";
import { lookup } from "./scene.ts";
import { normalOfPlane, loopSteps } from "./part.ts";
import { loopOf } from "./loops.ts";
import { drawChain } from "./build.ts";

/** Whether a figure's sides are pieces derived from the drawing and the body's edges (named `d/seg@...` or `d/arc@...`), not sides drawn as they are. */
const derivedSides = (scene: Scene, refs: readonly Ref[]): boolean => refs.some((r) => { const p = scene.parts[r]; return p?.kind === "line" && p.derived === true && r.includes("@body/"); });
/** The drawn curves the pieces of a figure were cut from (a piece's name says: `d/seg@e_005.s0@...` was cut from `d/e_005.s0`). */
const sourcesOf = (scene: Scene, refs: readonly Ref[]): Ref[] => [...new Set(refs.flatMap((r) => r.split("@").filter((t) => /^e_\d+\.[a-z0-9]+$/.test(t)).map((t) => `d/${t}` as Ref)))].filter((r) => { const p = scene.parts[r]; return !!p && p.origin === "drawn"; });

/**
 * The figures with every derived loop drawn again as lines and arcs of the sketch. Null when there is nothing to copy (every figure is of sides that were drawn). Refused figures (a loop that does not close) are left as they are.
 */
export function materializeFigures(scene: Scene, figs: readonly Figure[]): { commands: Command[]; figs: Figure[]; /** the drawn curves the pieces were cut from: still the drawing's, but used up by the step, as they were when it named them */ used: Ref[] } | null {
  const get = lookup(scene);
  let sc = scene;
  const commands: Command[] = [];
  let changed = false;
  const used = new Set<Ref>();
  const copyOf = (refs: readonly Ref[]): Ref[] => {
    if (!derivedSides(sc, refs)) return [...refs];
    const loop = loopOf(get, refs);
    const first = scene.parts[refs[0]!];
    const plane = first && "plane" in first ? first.plane : null;
    const pl = plane ? scene.parts[plane] : undefined;
    if (!loop.ok || !plane || !pl || pl.kind !== "plane") return [...refs];
    const steps = loopSteps(get, refs, loop.corners);
    if (steps.length < 2) return [...refs];
    const n = normalize(normalOfPlane(pl));
    const bulges = steps.map((st, i) => {
      if (!st.mid) return 0;
      const [a, b] = [st.at, steps[(i + 1) % steps.length]!.at];
      const chord = sub(b, a);
      const len = length(chord);
      if (len < 1e-9) return 0;
      const perp = cross(n, scale(chord, 1 / len)); // (the way a drawn arc bulges: towards the plane's normal crossed with the chord)
      return dot(sub(st.mid, add(a, scale(chord, 0.5))), perp) / len;
    });
    for (const q of sourcesOf(scene, refs)) used.add(q);
    const drawn = drawChain(sc, plane, steps.map((st): Vec3 => st.at), true, { bulges });
    const next = apply(sc, drawn.command);
    if (!next.ok) return [...refs];
    sc = next.value;
    commands.push(...(drawn.command.type === "batch" ? drawn.command.commands : [drawn.command]));
    changed = true;
    return drawn.lines;
  };
  const out = figs.map((f): Figure => ({ outer: copyOf(f.outer), holes: f.holes.map((h) => copyOf(h)) }));
  return changed ? { commands, figs: out, used: [...used] } : null;
}
