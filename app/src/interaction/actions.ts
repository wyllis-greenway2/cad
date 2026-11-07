// The actions service (`dec_clean_engine_design` section 3): for the selected parts, every relation and operation that applies, each with a label,
// whether it is enabled (or why not), a measure when it has a number, and `run -> command`. The menu, the number chip, the keyboard and the touch
// long-press all ask this one function. Generalises the prototype's relations table (`relations.mjs`) from sketch parts to any parts.
// Geometry is read in 3D from the scene, so no plane or sketch is involved in measuring.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup, nextId, figureRefs } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import { ordered } from "./selection.ts";
import { ROWS, REFERENCES_ONLY, same } from "./rows.ts";
import type { Ctx } from "./rows.ts";

export interface Action {
  id: string;
  label: string;
  group: "relation" | "operation";
  dimensional: boolean;
  unit: "mm" | "deg" | null;
  /** The parts, mover first. */
  parts: Ref[];
  enabled: boolean;
  /** Why it cannot be done now (when not enabled). */
  why: string | null;
  /** The current value of a dimensional relation. */
  measure(): number | null;
  /** Where a chip for the number goes. */
  spot(): Vec3 | null;
  /** The command that does it; a dimensional relation takes a value (the measure if none). */
  run(value?: number): Command;
}

/** Every relation and operation that applies to the selection, relations first, in the order of the table. */
export function actionsFor(scene: Scene, selection: readonly Ref[]): Action[] {
  const get = lookup(scene);
  const sel = ordered(selection, get).filter((r) => get(r));
  if (!sel.length) return [];
  const kinds = sel.map((r) => get(r)!.kind);
  const ctx: Ctx = { scene, get, parts: sel };
  const out: Action[] = [];
  const movable = sel.some((r) => get(r)?.movable);

  for (const row of ROWS) {
    if (row.pair.length !== sel.length) continue;
    if (!(same(row.pair, kinds) || (row.anyOrder && same(row.pair, [...kinds].reverse())))) continue;
    if (row.hidden?.(ctx, sel)) continue;
    const why = !movable ? REFERENCES_ONLY : (row.unavailable?.(ctx, sel) ?? null);
    const dimensional = !!row.measure;
    out.push({
      id: row.id,
      label: row.label,
      group: "relation",
      dimensional,
      unit: row.unit ?? null,
      parts: sel,
      enabled: why === null,
      why,
      measure: () => row.measure?.(ctx, sel) ?? null,
      spot: () => row.spot?.(ctx, sel) ?? null,
      run: (value) => {
        const v = value ?? row.measure?.(ctx, sel) ?? undefined;
        const rel: Relation = {
          id: nextId(scene, "r"),
          kind: row.id,
          parts: sel,
          ...(dimensional ? { value: v, locked: true } : {}),
          ...(row.params ? { params: row.params(ctx, sel) } : {}),
        };
        return { type: "addRelation", relation: rel };
      },
    });
  }

  // delete: drawn parts (a closed figure goes with its corners, so nothing is left behind), or the whole body (one step, so it undoes)
  const whole = sel.filter((r) => get(r)?.kind === "body");
  if (whole.length) {
    out.push({
      id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: whole,
      enabled: true, why: null, measure: () => null, spot: () => null,
      run: (): Command => {
        // the body is gone, and so is all that made it: its steps (they would make a body that is deleted again at once) and the sketches they used, which were only hidden (`in_192`). What is not used up stays: a corner another drawing stands on, the circle that a piece of was extruded
        const gone = new Set<Ref>();
        for (const st of scene.steps) {
          if (st.type !== "extrude") continue;
          const cut = st.params.cut !== undefined || figureRefs(st).some((r) => r.includes("@")); // (a piece of a cut shape: the sides stay with the other pieces)
          for (const r of figureRefs(st)) { const p = get(r); if (p?.movable && !r.includes("@") && (!cut || p.kind === "circle")) gone.add(r); }
        }
        const corners = [...gone].flatMap((r): Ref[] => { const p = get(r); return p?.kind === "circle" ? [p.center] : p?.kind === "line" ? [p.a, p.b, ...(p.center ? [p.center] : [])] : []; });
        const alone = (c: Ref) => !!get(c)?.movable && !Object.values(scene.parts).some((q) => !gone.has(q.ref) && ((q.kind === "circle" && q.center === c) || (q.kind === "line" && (q.a === c || q.b === c || q.center === c))));
        const refs = [...gone, ...new Set(corners.filter(alone))].filter((r) => r in scene.parts);
        return { type: "batch", commands: [...[...scene.steps].reverse().map((st): Command => ({ type: "removeStep", id: st.id })), ...(refs.length ? [{ type: "deleteParts", refs } as Command] : [])] };
      },
    });
  } else {
    const drawn = sel.filter((r) => get(r)?.movable);
    const picked = new Set<Ref>(drawn);
    const used = (corner: Ref) => Object.values(scene.parts).some((q) => !picked.has(q.ref) && ((q.kind === "circle" && q.center === corner) || (q.kind === "line" && (q.a === corner || q.b === corner || q.center === corner)))); // another part still stands on this corner
    const targets = drawn.flatMap((r): Ref[] => {
      const p = get(r);
      if (p?.kind === "face" && p.pieces) {
        // a piece of a figure cut by lines: only the sides nothing else borders go (a side another piece shares, an arc of a circle, a crossing point stay): deleting one piece must not take the whole drawing
        const mine = p.loop.filter((l) => { const x = get(l); return x?.kind === "line" && !x.derived && !Object.values(scene.parts).some((f) => f.kind === "face" && f.ref !== p.ref && f.loop.includes(l)); });
        const gone = new Set<Ref>(mine);
        const alone = (c: Ref) => get(c)?.movable && !Object.values(scene.parts).some((q) => !gone.has(q.ref) && ((q.kind === "circle" && q.center === c) || (q.kind === "line" && (q.a === c || q.b === c || q.center === c))));
        return [...mine, ...mine.flatMap((l) => { const x = get(l); return x?.kind === "line" ? [x.a, x.b].filter(alone) : []; })];
      }
      if (p?.kind === "face") return [...p.corners, ...p.loop.flatMap((l) => { const x = get(l); return x?.kind === "line" && x.center ? [x.center] : []; })]; // a face's corners (a disk's centre, the centres of its arcs): everything built on them goes too
      // a circle or a line goes with its points, unless something else stands on them: no point is left behind to snap to or suggest constraints to
      const own = p?.kind === "circle" ? [p.center] : p?.kind === "line" ? [p.a, p.b, ...(p.center ? [p.center] : [])] : [];
      return [r, ...own.filter((c) => get(c)?.movable && !used(c))];
    });
    if (targets.length) {
      out.push({
        id: "delete", label: "Delete", group: "operation", dimensional: false, unit: null, parts: drawn,
        enabled: true, why: null, measure: () => null, spot: () => null,
        run: (): Command => ({ type: "deleteParts", refs: targets }),
      });
    }
  }
  return out;
}

export const dimensionalFor = (scene: Scene, selection: readonly Ref[]): Action | null => actionsFor(scene, selection).find((a) => a.dimensional) ?? null;
