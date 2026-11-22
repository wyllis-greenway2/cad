// `hold` (E57): where a point lands, and what it would hold to, when the pointer is near things that can be held. One function for every user (the sketch tools, the mover, picking, the handles); they differ only in what they do with the answer.
// It only places and suggests (`dec_hints_place_only`): a hold carries the constraint it WOULD make as a draft, and makes none. Pure; reads the reference set; changes nothing.
import type { Relation } from "../engine/solver.ts";
import type { Tone } from "./style.ts";
import type { Pt, Ref } from "./refs.ts";

export type HoldKind = "coincident" | "midpoint" | "onLine" | "onCircle" | "onAxis" | "horizontal" | "vertical" | "parallel" | "perpendicular" | "tangent" | "alignX" | "alignY" | "equalLength";
/** the constraint a hold would make, in the names of the sketch; `$new` and `$line` are the point and the line being drawn (the tool fills them in); `needs`: anchors to add first */
export interface Draft { kind: Relation; parts: string[]; needs: { id: string; edge: unknown }[] }
export interface Guide { kind: "dashed" | "line" | "ball" | "ring"; points: Pt[]; tone: Tone; /** a ring: its radius */ r?: number }
export interface Hold {
  kind: HoldKind; /** what it holds to: a drawn part, a body's edge in the plane, one seen through its projection, a world axis (the nearer to the sketch wins a tie) */ origin: Ref["origin"]; /** lower is stronger: a point beats a line beats an alignment */ rank: number; ref: string; /** where the pointer would be taken to */ at: Pt; /** how far the pointer is from that */ distance: number;
  /** the constraint already holds where the pointer is now (nothing to snap) */ satisfied: boolean; draft: Draft | null; guides: Guide[]; label: string;
}
export type Want = { what: "point" } | { what: "lineEnd"; from: Pt };
export interface HoldOptions {
  /** how near, in sketch units, the pointer must be to a point, a line, a circle (the screen's pixels times its units a pixel) */ reach: number;
  /** how near, in degrees, a direction must be to level, upright, parallel, square or tangent */ angle?: number;
  includeHidden?: boolean; /** the names a hold may not use (the part being dragged is not a reference for itself) */ not?: string[];
}
export interface HoldResult {
  /** the best first, then the rest */ holds: Hold[]; /** the holds taken together (at most one for each thing they fix) */ taken: Hold[]; /** where the pointer is put when they are taken */ at: Pt;
  /** the figure drawn: orange while a direction or a length is held, teal otherwise */ figure: Tone;
}

const d2 = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]), add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]], sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]], mul = (a: Pt, s: number): Pt => [a[0] * s, a[1] * s];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1], unit = (a: Pt): Pt => { const l = Math.hypot(a[0], a[1]); return l > 0 ? [a[0] / l, a[1] / l] : [1, 0]; };
/** the angle between two directions, in degrees, where a line has no front or back (0 to 90) */
const between = (u: Pt, v: Pt) => { const c = Math.abs(dot(unit(u), unit(v))); return (Math.acos(Math.min(1, c)) * 180) / Math.PI; };
const foot = (p: Pt, a: Pt, b: Pt): { at: Pt; t: number } => { const ab = sub(b, a), t = dot(sub(p, a), ab) / (dot(ab, ab) || 1); return { at: add(a, mul(ab, t)), t }; };
const RANK: Record<HoldKind, number> = { coincident: 0, midpoint: 0.9, onLine: 1, onCircle: 1, onAxis: 1.5, horizontal: 2, vertical: 2, parallel: 3, perpendicular: 3, tangent: 3, alignX: 4, alignY: 4, equalLength: 5 };
const needs = (r: Ref): Draft["needs"] => (r.anchor && !r.anchor.held ? [{ id: r.anchor.id, edge: r.anchor.edge }] : []);

/** the holds for a point near the references (where a point or the end of a line would land) */
function pointHolds(pointer: Pt, refs: Ref[], o: HoldOptions, who: string): Hold[] {
  const out: Hold[] = [], reach = o.reach;
  const mk = (kind: HoldKind, r: Ref, at: Pt, draft: Draft | null, guides: Guide[], label: string): Hold => ({ kind, origin: r.origin, rank: RANK[kind], ref: r.key, at, distance: d2(pointer, at), satisfied: d2(pointer, at) < 1e-9, draft, guides, label });
  for (const r of refs) {
    if (!(r.visible || o.includeHidden) || o.not?.includes(r.name)) continue;
    if (r.kind === "point" && r.p) {
      const dp = d2(pointer, r.p); if (dp <= reach) out.push(mk("coincident", r, r.p, { kind: "coincident", parts: [who, r.name], needs: needs(r) }, [{ kind: "ball", points: [r.p], tone: "candidate" }], "at the corner"));
      // lined up with it, across or up and down (a dashed guide through it)
      else {
        if (Math.abs(pointer[0] - r.p[0]) <= reach) out.push(mk("alignX", r, [r.p[0], pointer[1]], { kind: "vertical", parts: [who, r.name], needs: needs(r) }, [{ kind: "dashed", points: [r.p, [r.p[0], pointer[1]]], tone: "candidate" }], "in line, up and down"));
        if (Math.abs(pointer[1] - r.p[1]) <= reach) out.push(mk("alignY", r, [pointer[0], r.p[1]], { kind: "horizontal", parts: [who, r.name], needs: needs(r) }, [{ kind: "dashed", points: [r.p, [pointer[0], r.p[1]]], tone: "candidate" }], "in line, across"));
      }
    } else if (r.kind === "line" && r.a && r.b) {
      const f = foot(pointer, r.a, r.b), onSeg = f.t >= -reach / (d2(r.a, r.b) || 1) && f.t <= 1 + reach / (d2(r.a, r.b) || 1), mid = mul(add(r.a, r.b), 0.5);
      if (d2(pointer, mid) <= reach) out.push(mk("midpoint", r, mid, { kind: "midpoint", parts: [who, r.name], needs: needs(r) }, [{ kind: "line", points: [r.a, r.b], tone: "candidate" }, { kind: "ball", points: [mid], tone: "candidate" }], "at the middle"));
      else if (onSeg && d2(pointer, f.at) <= reach) out.push(mk("onLine", r, f.at, { kind: "pointOnLine", parts: [who, r.name], needs: needs(r) }, [{ kind: "line", points: [r.a, r.b], tone: "candidate" }, { kind: "ball", points: [f.at], tone: "candidate" }], "on the line"));
    } else if (r.kind === "circle" && r.c && r.r !== undefined) {
      const dv = sub(pointer, r.c), dist = Math.hypot(dv[0], dv[1]);
      if (dist > 0 && Math.abs(dist - r.r) <= reach) { const at = add(r.c, mul(unit(dv), r.r)); out.push(mk("onCircle", r, at, { kind: "pointOnCircle", parts: [who, r.name], needs: needs(r) }, [{ kind: "ring", points: [r.c], r: r.r, tone: "candidate" }, { kind: "ball", points: [at], tone: "candidate" }], "on the circle")); }
    } else if (r.kind === "axis" && r.a && r.b) {
      const f = foot(pointer, r.a, r.b); if (d2(pointer, f.at) <= reach) out.push(mk("onAxis", r, f.at, null, [{ kind: "dashed", points: [add(f.at, mul(sub(r.b, r.a), -1e3)), add(f.at, mul(sub(r.b, r.a), 1e3))], tone: "candidate" }], r.name === "axis.x" ? "on the across axis" : "on the up and down axis"));
    }
  }
  return out;
}
/** the holds for the end of a line that starts at `from`: the point holds, and the directions and the length */
function lineEndHolds(pointer: Pt, from: Pt, refs: Ref[], o: HoldOptions): Hold[] {
  const out = pointHolds(pointer, refs, o, "$end"), ang = o.angle ?? 3, dir = sub(pointer, from), L = Math.hypot(dir[0], dir[1]); if (L < 1e-9) return out;
  const mk = (kind: HoldKind, ref: string, at: Pt, draft: Draft, guides: Guide[], label: string, origin: Ref["origin"] = "drawn"): Hold => ({ kind, origin, rank: RANK[kind], ref, at, distance: d2(pointer, at), satisfied: d2(pointer, at) < 1e-9, draft, guides, label });
  const along = (u: Pt): Pt => add(from, mul(unit(u), dot(dir, unit(u)))), far = (u: Pt): Guide => ({ kind: "dashed", points: [add(from, mul(unit(u), -L * 0.4)), add(from, mul(unit(u), L * 1.4))], tone: "candidate" });
  if (between(dir, [1, 0]) <= ang) out.push(mk("horizontal", "axis:x", [pointer[0], from[1]], { kind: "horizontal", parts: ["$line"], needs: [] }, [far([1, 0])], "level"));
  if (between(dir, [0, 1]) <= ang) out.push(mk("vertical", "axis:y", [from[0], pointer[1]], { kind: "vertical", parts: ["$line"], needs: [] }, [far([0, 1])], "upright"));
  for (const r of refs) {
    if (!(r.visible || o.includeHidden) || o.not?.includes(r.name)) continue;
    if (r.kind === "line" && r.a && r.b) {
      const rd = sub(r.b, r.a), link: Guide = { kind: "dashed", points: [mul(add(r.a, r.b), 0.5), from], tone: "candidate" };
      if (between(dir, rd) <= ang) { const at = along(rd); out.push(mk("parallel", r.key, at, { kind: "parallel", parts: ["$line", r.name], needs: needs(r) }, [{ kind: "line", points: [r.a, r.b], tone: "candidate" }, link, far(rd)], "parallel to it")); }
      else if (Math.abs(between(dir, rd) - 90) <= ang) { const n: Pt = [-rd[1], rd[0]], at = along(n); out.push(mk("perpendicular", r.key, at, { kind: "perpendicular", parts: ["$line", r.name], needs: needs(r) }, [{ kind: "line", points: [r.a, r.b], tone: "candidate" }, link, far(n)], "square to it")); }
      const rl = d2(r.a, r.b); if (Math.abs(L - rl) <= o.reach) out.push(mk("equalLength", r.key, add(from, mul(unit(dir), rl)), { kind: "equalLength", parts: ["$line", r.name], needs: needs(r) }, [{ kind: "line", points: [r.a, r.b], tone: "candidate" }], "as long as it"));
    } else if (r.kind === "circle" && r.c && r.r !== undefined) {
      const w = sub(r.c, from), dist = Math.hypot(w[0], w[1]); if (dist <= r.r) continue; // from outside: two tangent lines
      const half = Math.asin(r.r / dist), base = Math.atan2(w[1], w[0]);
      for (const s of [-1, 1]) { const u: Pt = [Math.cos(base + s * half), Math.sin(base + s * half)]; if (between(dir, u) <= ang && dot(dir, u) > 0) out.push(mk("tangent", r.key, along(u), { kind: "tangent", parts: ["$line", r.name], needs: needs(r) }, [{ kind: "ring", points: [r.c], r: r.r, tone: "candidate" }, far(u)], "touching the circle")); }
    }
  }
  return out;
}

/** where a point lands, and what it would hold to */
export function hold(pointer: Pt, refs: Ref[], want: Want, opts: HoldOptions): HoldResult {
  const ORIGIN = { drawn: 0, anchor: 1, projection: 2, world: 3 }; // what is nearer the sketch is held first when two are equally near (the edge in the plane, not the edge below it that falls on the same line)
  const holds = (want.what === "point" ? pointHolds(pointer, refs, opts, "$new") : lineEndHolds(pointer, want.from, refs, opts)).sort((a, b) => a.rank - b.rank || (Math.abs(a.distance - b.distance) < 1e-9 ? ORIGIN[a.origin] - ORIGIN[b.origin] : a.distance - b.distance));
  const taken: Hold[] = [];
  if (holds.length) {
    const first = holds[0]!; taken.push(first);
    // a second hold that fixes the other thing: lined up across and up and down; a direction and a length
    const pair = (a: HoldKind, b: HoldKind) => (first.kind === a ? holds.find((h) => h.kind === b && h.ref !== first.ref) : first.kind === b ? holds.find((h) => h.kind === a && h.ref !== first.ref) : undefined);
    const second = pair("alignX", "alignY") ?? (["horizontal", "vertical", "parallel", "perpendicular", "tangent"].includes(first.kind) ? holds.find((h) => h.kind === "equalLength") : first.kind === "equalLength" ? holds.find((h) => ["horizontal", "vertical", "parallel", "perpendicular", "tangent"].includes(h.kind)) : undefined);
    if (second) taken.push(second);
  }
  let at = pointer;
  if (taken.length === 1) at = taken[0]!.at;
  else if (taken.length === 2) {
    const [a, b] = taken as [Hold, Hold], ax = [a, b].find((h) => h.kind === "alignX"), ay = [a, b].find((h) => h.kind === "alignY");
    if (ax && ay) at = [ax.at[0], ay.at[1]];
    else if (want.what === "lineEnd") { const dirHold = [a, b].find((h) => h.kind !== "equalLength")!, len = [a, b].find((h) => h.kind === "equalLength")!; const u = unit(sub(dirHold.at, want.from)), L = d2(want.from, len.at); at = add(want.from, mul(u, L)); }
    else at = a.at;
  }
  const figure: Tone = taken.some((h) => ["horizontal", "vertical", "parallel", "perpendicular", "tangent", "equalLength"].includes(h.kind)) ? "aligned" : "figure";
  return { holds, taken, at, figure };
}
