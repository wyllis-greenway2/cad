// The bubbles (`q_lean_ui`, `in_1562`): the one bubble that stands on the part of a sketch it belongs to. It has two contents: a constraint (its icon) and a dimension (its number). Only the constraints of what is selected are shown (`in_058`..`in_061`);
// a refusal flashes the ones that hold a change back (red) and an already-holding one flashes mild green. Pure: the solver's system and the selection in, descriptions out (where it belongs in the sketch's own axes, what it says, its tone);
// the screen (`bubbledraw.ts`) places and draws them, and `bubbleplace.ts` (the prototype's) says where on the page each stands.
import { RANGEABLE, RELATIONS, kindOf, type Constraint, type Relation, type Solution, type System } from "../engine/solver.ts";
import { offersFor, type Offer } from "./suggest.ts";

export type BubbleTone = "rest" | "refused" | "applied" | "offer";
export interface Bubble {
  /** the constraint's id */ id: string;
  kind: "constraint" | "dimension";
  relation: Relation;
  /** the icon (`icons.ts`) */ icon: string;
  /** where it belongs, in the sketch's own axes (mm) */ at: [number, number];
  /** a dimension's number as it is read, with what the number is of (`R`, `°`) */ text?: string; symbol?: string; unit?: "mm" | "deg"; value?: number;
  tone: BubbleTone;
  /** the words (a tooltip): what it is and what it ties the selection to */ title: string;
  parts: string[];
  /** a constraint a helper held, offered for a moment: a click makes it (`dec_helper_constraint_bubble`); `taken`: it was, and shows a check */ offer?: "open" | "taken";
  /** how much of its colour is left while it fades (1: all) */ fade?: number;
  /** a dimension: locked (the constraint exists, a closed padlock) or only measured (no constraint, an open padlock: `dec_dimensions_measure_then_lock`) */ locked?: boolean;
}
/** A refusal while it flashes: the constraints that held the change back; and the ones that held already. */
export interface Flash { refused?: readonly string[]; applied?: readonly string[] }
/** a constraint is shown when one of its parts is selected, and while it flashes (a refusal shows what holds it back, wherever it is) */

const ICON: Partial<Record<Relation, string>> = { equalLength: "equal", equalRadius: "equal", tangentCircles: "tangent", length: "dimension", distance: "dimension", pointLineDistance: "dimension", horizontalDistance: "dimension", verticalDistance: "dimension", radius: "radius", angle: "angle", fixed: "fixed" };
export const iconOf = (r: Relation): string => ICON[r] ?? r;

/** a number as a person reads it: no more than three decimals, no trailing zeros */
export const numberText = (v: number): string => String(Math.round(v * 1000) / 1000);
const rangeText = (c: Constraint): string => `${c.min !== undefined ? numberText(c.min) : ""}–${c.max !== undefined ? numberText(c.max) : ""}`;

/** The place of a part in the sketch: a point is itself, a line its middle, a circle the top right of its edge. */
function placeOf(S: System, id: string, radii: Record<string, number>): [number, number] {
  const k = kindOf(id, S), pt = (q: string) => { const p = S.points.find((x) => x.id === q)!; return [p.x, p.y] as [number, number]; };
  if (k === "point") return pt(id);
  if (k === "line") { const l = S.lines.find((x) => x.id === id)!, a = pt(l.a), b = pt(l.b); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  const c = S.circles.find((x) => x.id === id)!, m = pt(c.c), r = radii[id] ?? c.r; return [m[0] + r * Math.SQRT1_2, m[1] + r * Math.SQRT1_2];
}
/** where a selection is: the middle of the places of its parts (what the helper bar stands beside) */
export function selectionAnchor(S: System, ids: string[]): [number, number] | null {
  if (!ids.length) return null;
  const radii = Object.fromEntries(S.circles.map((q) => [q.id, q.r])), ps = ids.map((id) => placeOf(S, id, radii));
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}
/** where a constraint belongs: the middle of the places of its parts (on the line, at the point, between two lines) */
export function anchorOf(S: System, c: Constraint): [number, number] {
  const radii = Object.fromEntries(S.circles.map((q) => [q.id, q.r])), ps = c.parts.map((id) => placeOf(S, id, radii));
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}

const sameParts = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
/** The number a selection has of its own (`dec_typing_standard`): a side its length, a circle its radius, two sides their angle, two corners their distance, a corner and a side its distance to it; none for anything else. */
export function ownMeasure(S: System, selection: string[]): Offer | null {
  return selection.length ? offersFor(S, selection).offers.find((o) => o.dimensional && o.measure !== null) ?? null : null;
}
/** the id of a measured number (no constraint yet) */
export const MEASURE_ID = "measure";

/** The bubbles of what is selected (none selected: none): the constraints, in their order, and the number the selection measures if no locked one says it. `S` is the system at the places it is solved to. */
export function bubblesOn(S: System, selection: string[], flash: Flash = {}): Bubble[] {
  // a constraint is shown when one of its parts is selected (a selected line shows its own, not those of the lines that meet it)
  const own = measuredBubble(S, selection), locked = (c: Constraint) => c.parts.some((p) => selection.includes(p)) || flash.refused?.includes(c.id) || flash.applied?.includes(c.id);
  const shown = S.constraints.filter(locked).map((c) => {
    const ties = c.parts.filter((p) => !selection.includes(p));
    const row = RELATIONS[c.kind], dim = RANGEABLE.has(c.kind) && (c.value !== undefined || c.min !== undefined || c.max !== undefined);
    const tone: BubbleTone = flash.refused?.includes(c.id) ? "refused" : flash.applied?.includes(c.id) ? "applied" : "rest";
    const b: Bubble = {
      id: c.id, kind: dim ? "dimension" : "constraint", relation: c.kind, icon: iconOf(c.kind), at: anchorOf(S, c), tone, parts: c.parts,
      title: `${row.label}${dim ? ` ${c.value !== undefined ? numberText(c.value) : rangeText(c)}${c.kind === "angle" ? "°" : ""}` : ""}${ties.length ? ` (with ${ties.join(", ")})` : ""}`,
    };
    if (dim) {
      b.locked = true;
      b.text = c.value !== undefined && !(c.min !== undefined && c.max !== undefined && c.min !== c.max) ? numberText(c.value) : rangeText(c);
      b.unit = c.kind === "angle" ? "deg" : "mm"; if (c.value !== undefined) b.value = c.value;
      if (c.kind === "radius") b.symbol = "R"; else if (c.kind === "angle") b.symbol = "°";
    }
    return b;
  });
  return own ? [...shown, own] : shown;
}
/** the measured number of a selection, as a bubble with an open padlock; none once a locked one of the same kind on the same parts exists */
function measuredBubble(S: System, selection: string[]): Bubble | null {
  const o = ownMeasure(S, selection); if (!o || o.measure === null) return null;
  if (S.constraints.some((c) => c.kind === o.kind && sameParts(c.parts, o.parts) && RANGEABLE.has(c.kind) && (c.value !== undefined || c.min !== undefined || c.max !== undefined))) return null;
  const at = anchorOf(S, { id: MEASURE_ID, kind: o.kind, parts: o.parts });
  return {
    id: MEASURE_ID, kind: "dimension", relation: o.kind, icon: iconOf(o.kind), at, tone: "rest", locked: false, parts: o.parts, text: numberText(o.measure), value: o.measure, unit: o.kind === "angle" ? "deg" : "mm",
    ...(o.kind === "radius" ? { symbol: "R" } : o.kind === "angle" ? { symbol: "°" } : {}), title: `${o.label} ${numberText(o.measure)}${o.kind === "angle" ? "°" : ""} (measured): type a number, or click the padlock to lock it`,
  };
}

/** the system with its parts at the places a solution says */
export const placed = (S: System, sol: Solution): System => ({ ...S, points: S.points.map((p) => (sol.points[p.id] ? { ...p, x: sol.points[p.id]![0], y: sol.points[p.id]![1] } : p)), circles: S.circles.map((q) => ({ ...q, r: sol.circles[q.id] ?? q.r })) });
