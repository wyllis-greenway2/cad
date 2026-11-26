// The free part of a figure being drawn, and what can be read of it (`dec_helpers_one_rule`, `dec_dimensions_measure_then_lock`; no kernel): the place `~P`, with the figure's first place `~S` (a point of the sketch, or only a place) and the line `~L` or circle `~C` between them.
// `figureOf` gives the parts a relation names, at a place, as a small system (so a relation's residuals can be read), and the sketch with the figure's parts in it;
import type { Motion } from "./probe.ts";
import { residualsOf, type System } from "./solver.ts";

export type Pt = [number, number];
export const P = "~P",
  S = "~S",
  L = "~L",
  C = "~C";
/** the free thing: a place alone (`point`), a corner with the first corner placed (`corner`), the end of a line from the first place (`line`), the edge of a circle about it (`circle`); `startId`: the first place is this point of the sketch */
export type Free =
  | { shape: "point" }
  | { shape: "corner"; from: Pt; startId?: string }
  | { shape: "line"; from: Pt; startId?: string }
  | { shape: "circle"; centre: Pt; startId?: string };
export const isFree = (id: string) => id.startsWith("~");

/** what can be read of a figure being drawn (or a circle's edge dragged): the sketch with the figure's temporary parts added at a place (`whole`: the place `~P`, the first place `~S` when it is not a point of the sketch, the line `~L` or circle `~C` between them), the residuals of a relation there (`rows`), and the motion that is the place (`motion`: the parts it moves are the place, and the line or circle made of it) */
export function figureOf(S0: System, f: Free) {
  const startId = f.shape === "point" ? undefined : f.startId,
    startAt: Pt | null = f.shape === "line" || f.shape === "corner" ? f.from : f.shape === "circle" ? f.centre : null;
  const startName = startId ?? S;
  const whole = (at: Pt): System => {
    const points = [...S0.points, { id: P, x: at[0], y: at[1] }],
      lines = [...S0.lines],
      circles = [...S0.circles];
    if (startId === undefined && startAt) points.push({ id: S, x: startAt[0], y: startAt[1] });
    if (f.shape === "line") lines.push({ id: L, a: startName, b: P });
    if (f.shape === "circle")
      circles.push({ id: C, c: startName, r: Math.hypot(at[0] - startAt![0], at[1] - startAt![1]) || 1e-9 });
    return { points, lines, circles, constraints: S0.constraints };
  };
  const affected = new Set([P, ...(f.shape === "line" ? [L] : []), ...(f.shape === "circle" ? [C] : [])]);
  /** the residuals of a relation over parts (the temporary ones by name) as a function of the place */
  const rows =
    (c: { kind: import("./solver.ts").Relation; parts: string[]; value?: number } & Record<string, unknown>) =>
    (at: Pt): number[] =>
      residualsOf(whole(at), { id: "h", ...c } as never);
  const motion: Motion = { dim: 2, affected, at: (q) => whole([q[0]!, q[1]!]) };
  return { whole, rows, startAt, startId, startName, affected, motion };
}
