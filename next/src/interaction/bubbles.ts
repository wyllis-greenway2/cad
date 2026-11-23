// The bubbles (`q_lean_ui`, `in_1562`): the one bubble that stands on the part of a sketch it belongs to. It has two contents: a constraint (its icon) and a dimension (its number). Only the constraints of what is selected are shown (`in_058`..`in_061`);
// a refusal flashes the ones that hold a change back (red) and an already-holding one flashes mild green. Pure: the solver's system and the selection in, descriptions out (where it belongs in the sketch's own axes, what it says, its tone);
// the screen (`bubbledraw.ts`) places and draws them, and `bubbleplace.ts` (the prototype's) says where on the page each stands.
import { RANGEABLE, RELATIONS, kindOf, solve, type Constraint, type Relation, type Solution, type System } from "../engine/solver.ts";

export type BubbleTone = "rest" | "refused" | "applied";
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
}
/** A refusal while it flashes: the constraints that held the change back; and the ones that held already. */
export interface Flash { refused?: readonly string[]; applied?: readonly string[] }

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
/** where a constraint belongs: the middle of the places of its parts (on the line, at the point, between two lines) */
export function anchorOf(S: System, c: Constraint): [number, number] {
  const radii = Object.fromEntries(S.circles.map((q) => [q.id, q.r])), ps = c.parts.map((id) => placeOf(S, id, radii));
  return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
}

/** The bubbles of what is selected (none selected: none), in the order of the constraints. `S` is the system at the places it is solved to. */
export function bubblesOn(S: System, selection: string[], flash: Flash = {}): Bubble[] {
  // a constraint is shown when one of its parts is selected (a selected line shows its own, not those of the lines that meet it)
  return S.constraints.filter((c) => c.parts.some((p) => selection.includes(p))).map((c) => {
    const ties = c.parts.filter((p) => !selection.includes(p));
    const row = RELATIONS[c.kind], dim = RANGEABLE.has(c.kind) && (c.value !== undefined || c.min !== undefined || c.max !== undefined);
    const tone: BubbleTone = flash.refused?.includes(c.id) ? "refused" : flash.applied?.includes(c.id) ? "applied" : "rest";
    const b: Bubble = {
      id: c.id, kind: dim ? "dimension" : "constraint", relation: c.kind, icon: iconOf(c.kind), at: anchorOf(S, c), tone, parts: c.parts,
      title: `${row.label}${dim ? ` ${c.value !== undefined ? numberText(c.value) : rangeText(c)}${c.kind === "angle" ? "°" : ""}` : ""}${ties.length ? ` (with ${ties.join(", ")})` : ""}`,
    };
    if (dim) {
      b.text = c.value !== undefined && !(c.min !== undefined && c.max !== undefined && c.min !== c.max) ? numberText(c.value) : rangeText(c);
      b.unit = c.kind === "angle" ? "deg" : "mm"; if (c.value !== undefined) b.value = c.value;
      if (c.kind === "radius") b.symbol = "R"; else if (c.kind === "angle") b.symbol = "°";
    }
    return b;
  });
}

/** What typing a new number into a dimension comes to: the sketch with the number changed and solved, or the constraints that hold it back (the bubbles flash them, and the number goes back). */
export type Retyped = { ok: true; system: System; solved: System } | { ok: false; victims: string[]; reason: string };
export function retype(S: System, id: string, value: number): Retyped {
  const c = S.constraints.find((q) => q.id === id);
  if (!c || !RANGEABLE.has(c.kind)) return { ok: false, victims: [], reason: "that is not a number that can be typed" };
  if (!(value > 0) && c.kind !== "angle" && !c.kind.endsWith("Distance")) return { ok: false, victims: [id], reason: "a size must be more than nothing" };
  const next: System = { ...S, constraints: S.constraints.map((q) => (q.id === id ? { ...q, value, min: undefined, max: undefined } : q)) };
  const r = solve(next);
  if (!r.verdict.ok) return { ok: false, victims: r.verdict.conflict.filter((v) => v !== id).length ? r.verdict.conflict : [id], reason: r.verdict.reason };
  return { ok: true, system: next, solved: placed(next, r.solution) };
}
/** the system with its parts at the places a solution says */
export const placed = (S: System, sol: Solution): System => ({ ...S, points: S.points.map((p) => (sol.points[p.id] ? { ...p, x: sol.points[p.id]![0], y: sol.points[p.id]![1] } : p)), circles: S.circles.map((q) => ({ ...q, r: sol.circles[q.id] ?? q.r })) });
