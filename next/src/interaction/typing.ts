// Typing numbers while a figure is drawn (`dec_dimensions_measure_then_lock`, slice b, the old app's chip by the pointer): each tool names its measures once, as a relation of the table over the figure's free parts (`engine/free.ts`);
// digits typed go to the active one, Tab changes it, a typed number holds that size where the pointer is (`engine/typed.ts`), and the figure is made with the typed numbers locked as dimensions. Pure.
import { C, L, P, S, type Free, type Pt } from "../engine/free.ts";
import type { Relation } from "../engine/solver.ts";
import type { TypedMeasure } from "../engine/typed.ts";
import type { DrawKind } from "./tools.ts";

/** a number of a figure: what it is called, what it measures, and how it is shown (`scale`: a circle's radius is shown as a diameter); `signed`: a distance across or up has a side, which the pointer gives unless the number is typed with a minus */
export interface FieldSpec { label: string; kind: Relation; parts: string[]; scale: number; signed: boolean }
export const FIELDS: Record<DrawKind, FieldSpec[]> = {
  rect: [{ label: "Width", kind: "horizontalDistance", parts: [S, P], scale: 1, signed: true }, { label: "Height", kind: "verticalDistance", parts: [S, P], scale: 1, signed: true }],
  line: [{ label: "Length", kind: "length", parts: [L], scale: 1, signed: false }],
  circle: [{ label: "Diameter", kind: "radius", parts: [C], scale: 2, signed: false }],
  arc: [],
};
/** the free thing of a tool once its first place is down */
export function freeOf(kind: DrawKind, from: Pt, startId?: string): Free {
  const id = startId === undefined ? {} : { startId };
  return kind === "line" ? { shape: "line", from, ...id } : kind === "circle" ? { shape: "circle", centre: from, ...id } : kind === "rect" ? { shape: "corner", from, ...id } : { shape: "point" };
}
export const emptyTyped = (kind: DrawKind | "trim"): string[] => (kind === "trim" ? [] : FIELDS[kind].map(() => ""));

/** a key typed into the active number: digits, a point, a minus (first only), Backspace; the same list if it is not for a number */
export function typeKey(typed: readonly string[], field: number, key: string): string[] {
  const cur = typed[field] ?? "";
  let next: string | null = null;
  if (/^[0-9]$/.test(key)) next = cur + key;
  else if (key === "." && !cur.includes(".")) next = cur + (cur === "" || cur === "-" ? "0." : ".");
  else if (key === "-" && cur === "") next = "-";
  else if (key === "Backspace") next = cur.slice(0, -1);
  return next === null ? [...typed] : typed.map((t, i) => (i === field ? next! : t));
}
/** the numbers typed, as measures to hold: a signed one takes the pointer's side (`live`: what the figure measures at the pointer) unless it was typed with a minus; a number that is not a number yet ("", "-", "0.") holds nothing */
export function typedMeasures(kind: DrawKind, typed: readonly string[], live: readonly number[]): TypedMeasure[] {
  return FIELDS[kind].flatMap((f, i): TypedMeasure[] => {
    const text = typed[i] ?? "", n = Number(text);
    if (text === "" || text === "-" || !Number.isFinite(n)) return [];
    const mag = Math.abs(n) / f.scale, value = f.signed ? ((text.startsWith("-") ? -1 : (live[i] ?? 0) < 0 ? -1 : 1) * mag) : mag;
    return value === 0 && !f.signed ? [] : [{ kind: f.kind, parts: f.parts, value }];
  });
}
export interface ChipField { label: string; text: string; /** a number was typed for it (a closed padlock) */ typed: boolean; active: boolean }
/** what the chip by the pointer says: each number as the figure measures it now (or as typed), the active one marked */
export function chipFields(kind: DrawKind, typed: readonly string[], field: number, live: readonly number[]): ChipField[] {
  const show = (v: number) => String(Math.round(Math.abs(v) * 100) / 100);
  return FIELDS[kind].map((f, i) => ({ label: f.label, text: (typed[i] ?? "") !== "" ? typed[i]! : show((live[i] ?? 0) * f.scale), typed: (typed[i] ?? "") !== "", active: i === field }));
}

/** the names the free parts of a figure have once it is made: the points at the place and at the first place, the line between, the circle about the first place (by where they are) */
export function madeNames(p: import("../engine/sketch.ts").SketchParams, sol: { points: Record<string, [number, number]> }, at: Pt, start: Pt | null): Partial<Record<typeof P | typeof S | typeof L | typeof C, string>> {
  const near = (q: Pt | null) => (q ? p.points.find((x) => Math.hypot(sol.points[x.id]![0] - q[0], sol.points[x.id]![1] - q[1]) < 1e-6)?.id : undefined);
  const made: Partial<Record<typeof P | typeof S | typeof L | typeof C, string>> = { [P]: near(at), [S]: near(start) };
  made[L] = (p.lines ?? []).find((l) => l.a === made[S] && l.b === made[P])?.id;
  made[C] = [...(p.circles ?? [])].reverse().find((k) => k.c === made[S])?.id;
  return made;
}
