// The actions service (`dec_clean_engine_design` section 3): for the selected parts, every relation and operation that applies, each with a label,
// whether it is enabled (or why not), a measure when it has a number, and `run -> command`. The menu, the number chip, the keyboard and the touch
// long-press all ask this one function. Generalises the prototype's relations table (`relations.mjs`) from sketch parts to any parts.
// Geometry is read in 3D from the scene, so no plane or sketch is involved in measuring.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene, Relation } from "../operation/scene.ts";
import { lookup, nextId } from "../operation/scene.ts";
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
      run: () => ({ type: "addStep", step: { id: nextId(scene, "s"), type: "delete", parts: whole, params: {} } }),
    });
  } else {
    const drawn = sel.filter((r) => get(r)?.movable);
    const picked = new Set<Ref>(drawn);
    const used = (corner: Ref) => Object.values(scene.parts).some((q) => !picked.has(q.ref) && ((q.kind === "circle" && q.center === corner) || (q.kind === "line" && (q.a === corner || q.b === corner || q.center === corner)))); // another part still stands on this corner
    const targets = drawn.flatMap((r): Ref[] => {
      const p = get(r);
      if (p?.kind === "face") return [...p.corners, ...p.loop.flatMap((l) => { const x = get(l); return x?.kind === "line" && x.center ? [x.center] : []; })]; // a face's corners (a disk's centre, the centres of its arcs): everything built on them goes too
      // a circle goes with its centre, unless something else stands on it (a line's points are real points and stay): no centre is left behind to snap to or suggest constraints to
      return p?.kind === "circle" && get(p.center)?.movable && !used(p.center) ? [r, p.center] : [r];
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
