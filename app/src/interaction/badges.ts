// What is applied to the selection (`in_058`..`in_061`, `dec_constraint_ownership`, `dec_relations_standard`): the relations that touch the selected parts, as small
// badges (an icon, and for a number its value and lock), the other parts a focused relation ties (shown in amber), and the measure of the pair as a suggestion
// to lock. Pure: derived from the scene and the selection.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { mid } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import { buildMap, touching } from "../operation/ownership.ts";
import { outlineOf, anchorsOf } from "../operation/part.ts";
import { actionsFor, ROWS, REFERENCES_ONLY } from "./actions.ts";

export interface Badge {
  id: string;
  kind: string;
  label: string;
  dimensional: boolean;
  /** the stored number (a locked dimension) */
  value: number | null;
  /** the live measure of its parts now */
  measured: number | null;
  unit: "mm" | "deg" | null;
  locked: boolean;
  /** it points at something that is gone */
  broken: boolean;
  /** the parts of the relation that are not selected: what it ties the selection to */
  others: Ref[];
  focused: boolean;
}
const labelOf = (kind: string): string => ROWS.find((r) => r.id === kind)?.label ?? kind;

/** The selected parts and the corners they are made of: what is "mine" when asking what a relation ties the selection to. */
function mineOf(scene: Scene, selection: readonly Ref[]): Set<Ref> {
  const m = new Set<Ref>(selection);
  for (const r of selection) {
    const p = scene.parts[r];
    if (!p) continue;
    for (const a of anchorsOf(p)) m.add(a);
    if (p.kind === "face") for (const l of [...p.loop, ...(p.disk ? [p.disk] : [])]) { m.add(l); const lp = scene.parts[l]; if (lp) for (const a of anchorsOf(lp)) m.add(a); }
  }
  return m;
}

export function badgesFor(scene: Scene, selection: readonly Ref[], focus: string | null): Badge[] {
  const map = buildMap(scene);
  const mine = mineOf(scene, selection);
  const out = new Map<string, Badge>();
  // a selected closed figure shows the relations of its lines too
  const refs = selection.flatMap((r) => { const p = scene.parts[r]; return p && p.kind === "face" ? [r, ...p.loop, ...(p.disk ? [p.disk] : [])] : [r]; });
  for (const ref of refs) {
    for (const t of touching(scene, map, ref)) {
      if (t.type !== "relation" || out.has(t.id)) continue;
      const rel = scene.relations.find((r) => r.id === t.id)!;
      const action = actionsFor(scene, rel.parts).find((a) => a.id === rel.kind && a.dimensional);
      const measured = action ? action.measure() : null;
      out.set(t.id, {
        id: t.id,
        kind: rel.kind,
        label: labelOf(rel.kind),
        dimensional: rel.value !== undefined,
        value: rel.value ?? null,
        measured,
        unit: action?.unit ?? (rel.kind === "angle" ? "deg" : rel.value !== undefined ? "mm" : null),
        locked: rel.locked !== false && rel.value !== undefined,
        broken: map.items.get(t.id)?.broken ?? false,
        others: rel.parts.filter((p) => !mine.has(p)),
        focused: focus === t.id,
      });
    }
  }
  return [...out.values()];
}

/** The parts to show in amber: what the focused relation ties the selection to. */
export function focusParts(scene: Scene, selection: readonly Ref[], focus: string | null): Ref[] {
  const rel = focus ? scene.relations.find((r) => r.id === focus) : undefined;
  const mine = mineOf(scene, selection);
  return rel ? rel.parts.filter((p) => !mine.has(p) && p in scene.parts) : [];
}

export interface Suggestion {
  id: string;
  label: string;
  value: number;
  unit: "mm" | "deg";
  /** it can be measured but not locked: every part is a reference (a line of the body) */
  readOnly: boolean;
}
/** The measure of the selected pair when it has a number the relation table offers (distance, angle) and no relation of that kind already holds it. */
export function suggestMeasure(scene: Scene, selection: readonly Ref[]): Suggestion | null {
  // a number that only references have (a line of the body, two body corners) is shown as a measurement too, but cannot be locked
  const a = actionsFor(scene, selection).find((x) => x.dimensional && (x.enabled || x.why === REFERENCES_ONLY));
  if (!a || !a.unit) return null;
  const v = a.measure();
  if (v === null) return null;
  const already = scene.relations.some((r) => r.kind === a.id && r.value !== undefined && a.parts.length === r.parts.length && a.parts.every((p) => r.parts.includes(p)));
  return already ? null : { id: a.id, label: a.label, value: v, unit: a.unit, readOnly: !a.enabled };
}

/** A point to put the badges next to: the last selected part's own spot, or null. */
export function anchorOf(scene: Scene, selection: readonly Ref[]): Vec3 | null {
  const last = selection[selection.length - 1];
  const p = last ? lookup(scene)(last) : undefined;
  if (!p) return null;
  const o = outlineOf(lookup(scene), p);
  if (o.shape === "point") return o.at;
  if (o.shape === "segment") return mid(o.a, o.b);
  if (o.shape === "circle") return o.center;
  if (p.kind === "face") { const pts = p.corners.map((c) => scene.parts[c]).filter((q): q is Extract<typeof q, { kind: "corner" }> => q?.kind === "corner").map((q) => q.at); if (pts.length) return pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length, a[2] + q[2] / pts.length] as Vec3, [0, 0, 0] as Vec3); }
  return null;
}
