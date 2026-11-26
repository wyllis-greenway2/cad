// The free part of a figure being drawn, and what can be read of it (`dec_helpers_one_rule`, `dec_dimensions_measure_then_lock`; no kernel): the place `~P`, with the figure's first place `~S` (a point of the sketch, or only a place) and the line `~L` or circle `~C` between them.
// `figureOf` gives the parts a relation names, at a place, as a small system (so a relation's residuals can be read), and the sketch with the figure's parts in it; `land` is Newton on residuals: where they are zero, from where the pointer is.
import { residualsOf, type System } from "./solver.ts";

export type Pt = [number, number];
export const P = "~P", S = "~S", L = "~L", C = "~C";
/** the free thing: a place alone (`point`), a corner with the first corner placed (`corner`), the end of a line from the first place (`line`), the edge of a circle about it (`circle`); `startId`: the first place is this point of the sketch */
export type Free = { shape: "point" } | { shape: "corner"; from: Pt; startId?: string } | { shape: "line"; from: Pt; startId?: string; /** the other lines that end at the same place (a corner of several lines dragged): each from a point of the sketch, by a free name */ more?: { name: string; from: Pt; startId: string }[] } | { shape: "circle"; centre: Pt; startId?: string }
  /** a part of the sketch moved as one piece (`in_1618`): its points by a free name (`~` and the point's own name, as they are), its lines and circles by free names over those points, and `ref`, the place that stands for the whole (the place asked about is where `ref` is: the piece is moved by the difference) */
  | { shape: "piece"; ref: Pt; points: Record<string, Pt>; lines: { name: string; a: string; b: string }[]; circles: { name: string; c: string; r: number }[] };
export const isFree = (id: string) => id.startsWith("~");

export function figureOf(S0: System, f: Free) {
  const pts = new Map(S0.points.map((p) => [p.id, p] as const)), lines = new Map(S0.lines.map((l) => [l.id, l] as const)), circles = new Map(S0.circles.map((c) => [c.id, c] as const));
  const startId = f.shape === "point" || f.shape === "piece" ? undefined : f.startId, startAt: Pt | null = f.shape === "line" || f.shape === "corner" ? f.from : f.shape === "circle" ? f.centre : null;
  const startName = startId ?? S;
  /** the parts a relation names, at a place, as a small system (only what it names) */
  const small = (names: string[], at: Pt): System => {
    const points: System["points"] = [], seen = new Set<string>(), ls: System["lines"] = [], cs: System["circles"] = [];
    const off: Pt = f.shape === "piece" ? [at[0] - f.ref[0], at[1] - f.ref[1]] : [0, 0], mine = f.shape === "piece" ? f : null;
    const addPt = (id: string) => { if (seen.has(id)) return; seen.add(id); const q = mine?.points[id]; points.push(id === P ? { id, x: at[0], y: at[1] } : id === S ? { id, x: startAt![0], y: startAt![1] } : q ? { id, x: q[0] + off[0], y: q[1] + off[1] } : pts.get(id)!); };
    for (const id of names) {
      const pl = mine?.lines.find((x) => x.name === id), pc = mine?.circles.find((x) => x.name === id);
      if (pl) { addPt(pl.a); addPt(pl.b); ls.push({ id, a: pl.a, b: pl.b }); }
      else if (pc) { addPt(pc.c); cs.push({ id, c: pc.c, r: pc.r }); }
      else if (mine && mine.points[id]) addPt(id);
      else if (id === P) addPt(P);
      else if (id === L) { addPt(startName); addPt(P); ls.push({ id: L, a: startName, b: P }); }
      else if (f.shape === "line" && f.more?.some((m) => m.name === id)) { const m = f.more.find((x) => x.name === id)!; addPt(m.startId); addPt(P); ls.push({ id, a: m.startId, b: P }); }
      else if (id === C) { addPt(startName); cs.push({ id: C, c: startName, r: Math.hypot(at[0] - startAt![0], at[1] - startAt![1]) || 1e-9 }); }
      else if (lines.has(id)) { const l = lines.get(id)!; addPt(l.a); addPt(l.b); ls.push(l); }
      else if (circles.has(id)) { const k = circles.get(id)!; addPt(k.c); cs.push(k); }
      else addPt(id);
    }
    return { points, lines: ls, circles: cs, constraints: [] };
  };
  /** the whole sketch with the figure's free parts in it at a place */
  const whole = (at: Pt): System => {
    const extra: System = f.shape === "piece" ? small([...f.lines.map((l) => l.name), ...f.circles.map((c) => c.name), ...Object.keys(f.points)], at) : small([P, ...(f.shape === "line" ? [L, ...(f.more ?? []).map((m) => m.name)] : []), ...(f.shape === "circle" ? [C] : []), ...(startId === undefined && startAt ? [S] : [])], at);
    const have = new Set(S0.points.map((p) => p.id));
    return { points: [...S0.points, ...extra.points.filter((p) => !have.has(p.id))], lines: [...S0.lines, ...extra.lines], circles: [...S0.circles, ...extra.circles], constraints: S0.constraints };
  };
  /** the residuals of a relation over parts (the free ones by name) as a function of the place */
  const rows = (c: { kind: import("./solver.ts").Relation; parts: string[]; value?: number } & Record<string, unknown>) => (at: Pt): number[] => residualsOf(small(c.parts, at), { id: "h", ...c } as never);
  return { small, whole, rows, startAt, startId, startName };
}

const norm = (v: number[]) => Math.hypot(...v);
/** Newton on residuals (one row or two) toward where they are zero, from `from`; null when it does not get there, or when the first step is longer than 3 times `reach` */
export function land(row: (at: Pt) => number[], from: Pt, reach: number, steps = 8): Pt | null {
  let at: Pt = [from[0], from[1]];
  for (let it = 0; it < steps; it++) {
    const r = row(at); if (r.length === 0 || !r.every(Number.isFinite)) return null;
    if (norm(r) < 1e-9) return at;
    const h = 1e-5, gx = row([at[0] + h, at[1]]).map((v, i) => (v - row([at[0] - h, at[1]])[i]!) / (2 * h)), gy = row([at[0], at[1] + h]).map((v, i) => (v - row([at[0], at[1] - h])[i]!) / (2 * h));
    let dx: number, dy: number;
    if (r.length === 1) { const n = gx[0]! ** 2 + gy[0]! ** 2; if (n < 1e-14) return null; dx = -(r[0]! * gx[0]!) / n; dy = -(r[0]! * gy[0]!) / n; }
    else { const a = gx[0]!, b = gy[0]!, c = gx[1]!, d = gy[1]!, det = a * d - b * c; if (Math.abs(det) < 1e-12) return null; dx = -(d * r[0]! - b * r[1]!) / det; dy = -(-c * r[0]! + a * r[1]!) / det; }
    if (it === 0 && Math.hypot(dx, dy) > 3 * reach) return null;
    at = [at[0] + dx, at[1] + dy];
  }
  return norm(row(at)) < 1e-6 ? at : null;
}
