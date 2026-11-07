// Trim (`in_195`): cut the part of a line or a circle that lies between the places where other drawn curves cross it, as scissors do. The part the pointer is on goes; what is left stays:
// a line becomes the piece or two pieces that remain (new points where it was cut, kept on what cut it), a circle becomes the arc that remains.
import type { Ref } from "../shared/ref.ts";
import { drawnRef, formatId } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale } from "../math/vec.ts";
import type { Scene, Relation } from "./scene.ts";
import { nextId } from "./scene.ts";
import type { Command } from "./commands.ts";
import { consumed } from "./ownership.ts";
import { curvesOn, meet, along, TAU, ang, mod } from "./regions.ts";
import type { Curve, V2 } from "./regions.ts";

export interface TrimPlan {
  /** the part that goes, as a polyline in space (for showing it) */
  span: Vec3[];
  command: Command;
}

/** The plan for trimming `ref` where `at` is (a point on its plane near the pointer), or null if it cannot be trimmed there (not a line or circle of the drawing, or nothing crosses it). */
export function trimAt(s: Scene, ref: Ref, at: Vec3): TrimPlan | null {
  const part = s.parts[ref];
  if (!part || part.origin !== "drawn" || !part.movable || !part.plane || (part.kind !== "line" && part.kind !== "circle") || (part.kind === "line" && part.derived)) return null;
  const built = curvesOn(s, part.plane, consumed(s));
  if (!built) return null;
  const { curves, pl, flat } = built;
  const target = curves.find((c) => c.ref === ref);
  if (!target) return null;
  const lift = (q: V2): Vec3 => add(pl.at, add(scale(pl.u, q[0]), scale(pl.v, q[1])));
  const click = flat(at);
  // where along the curve the pointer is, and where it is cut by the other curves (each cut remembers what made it)
  const cuts: { t: number; by: Curve }[] = [];
  for (const o of curves) {
    if (o === target) continue;
    for (const q of meet(target, o)) {
      const [t1, t2] = [along(target, q), along(o, q)];
      if (t1 !== null && t2 !== null && !cuts.some((c) => Math.abs(c.t - t1) < 1e-9)) cuts.push({ t: t1, by: o });
    }
  }
  if (part.kind === "line" && target.k === "seg") return trimSide(s, part, target, lift, click, cuts);
  if (part.kind === "line" && target.k === "arc") return trimArc(s, part, target, lift, click, cuts);
  if (part.kind === "circle" && target.k === "circle") return trimCircle(s, part, target, lift, click, cuts);
  return null;
}

const newIds = (s: Scene) => nextId(s, "e");
/**
 * What a trim keeps of a part's constraints (`in_229`): the tangent to a circle or an arc stays on every piece that is left (the line was made tangent on purpose, and a smaller circle later must still be touched by it),
 * a point on a circle stays on the arc the circle became, and the size of a circle goes to the arc as its radius. Anything else (equal lengths, a length, a direction held by another line) belonged to the whole part and goes.
 */
function carried(s: Scene, old: Ref, now: Ref, rid: () => string, opts: { circleToArc?: boolean } = {}): Relation[] {
  const out: Relation[] = [];
  for (const r of s.relations) {
    if (!r.parts.includes(old)) continue;
    if ((r.kind === "tangent" || r.kind === "onCircle") && r.parts.length === 2) out.push({ ...r, id: rid(), parts: r.parts.map((p) => (p === old ? now : p)) } as Relation);
    else if (opts.circleToArc && r.kind === "diameter" && r.parts.length === 1 && r.value !== undefined) out.push({ id: rid(), kind: "radius", parts: [now], value: r.value / 2, ...(r.locked === false ? { locked: false } : { locked: true }) } as Relation);
  }
  return out;
}
/** Relation ids one after another from the next free one (a trim makes several at once). */
const relIds = (s: Scene) => { let n = s.counter; return () => formatId("r", ++n); };

function pointAtParam(c: Extract<Curve, { k: "seg" }>, t: number): V2 { return [c.p[0] + (c.q[0] - c.p[0]) * t, c.p[1] + (c.q[1] - c.p[1]) * t]; }

function trimSide(s: Scene, part: Extract<Scene["parts"][string], { kind: "line" }>, c: Extract<Curve, { k: "seg" }>, lift: (q: V2) => Vec3, click: V2, cuts: { t: number; by: Curve }[]): TrimPlan | null {
  const d: V2 = [c.q[0] - c.p[0], c.q[1] - c.p[1]];
  const len2 = d[0] * d[0] + d[1] * d[1];
  const tc = Math.min(1, Math.max(0, ((click[0] - c.p[0]) * d[0] + (click[1] - c.p[1]) * d[1]) / len2));
  const inner = cuts.filter((k) => k.t > 1e-9 && k.t < 1 - 1e-9).sort((x, y) => x.t - y.t);
  const bounds = [{ t: 0, by: null as Curve | null }, ...inner, { t: 1, by: null as Curve | null }];
  let i = 0;
  while (i + 1 < bounds.length - 1 && bounds[i + 1]!.t <= tc) i++;
  const [lo, hi] = [bounds[i]!, bounds[i + 1]!];
  const id = newIds(s);
  const base = { origin: "drawn" as const, plane: part.plane, movable: true };
  const commands: Command[] = [];
  const rid = relIds(s);
  let n = 0;
  const cornerAt = (b: { t: number; by: Curve | null }): Ref => {
    if (b.t <= 1e-9) return part.a;
    if (b.t >= 1 - 1e-9) return part.b;
    const r = drawnRef(`${id}.p${n++}`);
    commands.push({ type: "addPart", part: { ...base, ref: r, kind: "corner", at: lift(pointAtParam(c, b.t)) } });
    if (b.by && (b.by.k === "seg" || b.by.k === "circle")) commands.push({ type: "addRelation", relation: { id: rid(), kind: b.by.k === "seg" ? "onLine" : "onCircle", parts: [r, b.by.ref] } as Relation });
    return r;
  };
  const keep: { a: { t: number; by: Curve | null }; b: { t: number; by: Curve | null } }[] = [];
  if (lo.t > 1e-9) keep.push({ a: bounds[0]!, b: lo });
  if (hi.t < 1 - 1e-9) keep.push({ a: hi, b: bounds[bounds.length - 1]! });
  const own = s.relations.filter((r) => r.parts.length === 1 && r.parts[0] === part.ref && (r.kind === "horizontal" || r.kind === "vertical"));
  keep.forEach((k, j) => {
    const [a, b] = [cornerAt(k.a), cornerAt(k.b)];
    const line = drawnRef(`${id}.s${j}`);
    commands.push({ type: "addPart", part: { ...base, ref: line, kind: "line", a, b } });
    own.forEach((r, m) => commands.push({ type: "addRelation", relation: { id: rid(), kind: r.kind, parts: [line] } as Relation }));
    for (const r of carried(s, part.ref, line, rid)) commands.push({ type: "addRelation", relation: r });
  });
  commands.push({ type: "deleteParts", refs: [part.ref] });
  // an end that nothing else stands on goes with the piece it was the end of
  const used = new Set<Ref>([...(lo.t > 1e-9 ? [part.a] : []), ...(hi.t < 1 - 1e-9 ? [part.b] : [])]);
  const orphans = [part.a, part.b].filter((r) => !used.has(r) && s.parts[r]?.movable && !Object.values(s.parts).some((q) => q.ref !== part.ref && ((q.kind === "line" && (q.a === r || q.b === r || q.center === r)) || (q.kind === "circle" && q.center === r))));
  if (orphans.length) commands.push({ type: "deleteParts", refs: orphans });
  return { span: [lift(pointAtParam(c, lo.t)), lift(pointAtParam(c, hi.t))], command: { type: "batch", commands } };
}

/** An arc: the part between two cuts (or a cut and an end) goes; what is left are the arcs on either side, about the same middle, each ending on what cut it (`in_228`). */
function trimArc(s: Scene, part: Extract<Scene["parts"][string], { kind: "line" }>, c: Extract<Curve, { k: "arc" }>, lift: (q: V2) => Vec3, click: V2, cuts: { t: number; by: Curve }[]): TrimPlan | null {
  const total = Math.abs(c.sweep);
  const turn = c.sweep > 0 ? mod(ang(c.c, click) - c.a0) : mod(c.a0 - ang(c.c, click));
  const tc = turn <= total ? turn / total : turn - total < TAU - turn ? 1 : 0; // (the pointer is off the end of the arc: the nearer end)
  const inner = cuts.filter((k) => k.t > 1e-9 && k.t < 1 - 1e-9).sort((x, y) => x.t - y.t);
  const bounds = [{ t: 0, by: null as Curve | null }, ...inner, { t: 1, by: null as Curve | null }];
  let i = 0;
  while (i + 1 < bounds.length - 1 && bounds[i + 1]!.t <= tc) i++;
  const [lo, hi] = [bounds[i]!, bounds[i + 1]!];
  const pointAt = (t: number): V2 => { const th = c.a0 + c.sweep * t; return [c.c[0] + Math.cos(th) * c.r, c.c[1] + Math.sin(th) * c.r]; };
  const id = newIds(s);
  const base = { origin: "drawn" as const, plane: part.plane, movable: true };
  const commands: Command[] = [];
  const rid = relIds(s);
  let n = 0;
  const cornerAt = (b: { t: number; by: Curve | null }): Ref => {
    if (b.t <= 1e-9) return part.a;
    if (b.t >= 1 - 1e-9) return part.b;
    const r = drawnRef(`${id}.p${n++}`);
    commands.push({ type: "addPart", part: { ...base, ref: r, kind: "corner", at: lift(pointAt(b.t)) } });
    if (b.by && (b.by.k === "seg" || b.by.k === "circle")) commands.push({ type: "addRelation", relation: { id: rid(), kind: b.by.k === "seg" ? "onLine" : "onCircle", parts: [r, b.by.ref] } as Relation });
    return r;
  };
  const keep: { a: { t: number; by: Curve | null }; b: { t: number; by: Curve | null } }[] = [];
  if (lo.t > 1e-9) keep.push({ a: bounds[0]!, b: lo });
  if (hi.t < 1 - 1e-9) keep.push({ a: hi, b: bounds[bounds.length - 1]! });
  keep.forEach((k, j) => {
    const [a, b] = [cornerAt(k.a), cornerAt(k.b)];
    const arc = drawnRef(`${id}.s${j}`);
    commands.push({ type: "addPart", part: { ...base, ref: arc, kind: "line", a, b, center: part.center!, ...(part.ccw === undefined ? {} : { ccw: part.ccw }) } });
    commands.push({ type: "addRelation", relation: { id: rid(), kind: "arcEnds", parts: [arc, part.center!] } as Relation });
    for (const r of carried(s, part.ref, arc, rid)) commands.push({ type: "addRelation", relation: r });
  });
  commands.push({ type: "deleteParts", refs: [part.ref] });
  // an end that nothing else stands on goes with the piece it was the end of (the middle stays: the arcs are about it)
  const used = new Set<Ref>([...(lo.t > 1e-9 ? [part.a] : []), ...(hi.t < 1 - 1e-9 ? [part.b] : [])]);
  const orphans = [part.a, part.b].filter((r) => !used.has(r) && s.parts[r]?.movable && !Object.values(s.parts).some((q) => q.ref !== part.ref && ((q.kind === "line" && (q.a === r || q.b === r || q.center === r)) || (q.kind === "circle" && q.center === r))));
  if (orphans.length) commands.push({ type: "deleteParts", refs: orphans });
  const sweep = (hi.t - lo.t) * c.sweep;
  return { span: Array.from({ length: 33 }, (_, q) => lift(pointAt(lo.t + ((hi.t - lo.t) * q) / 32))).filter(() => Math.abs(sweep) > 0), command: { type: "batch", commands } };
}

function trimCircle(s: Scene, part: Extract<Scene["parts"][string], { kind: "circle" }>, c: Extract<Curve, { k: "circle" }>, lift: (q: V2) => Vec3, click: V2, cuts: { t: number; by: Curve }[]): TrimPlan | null {
  if (cuts.length < 2) return null; // (one cut leaves nothing to take off)
  const sorted = [...cuts].sort((x, y) => x.t - y.t);
  const tc = mod(ang(c.c, click));
  // the cut at or before the pointer (turning back from it), and the next one after it
  let k = sorted.length - 1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i]!.t <= tc) k = i;
  const [lo, hi] = [sorted[k]!, sorted[(k + 1) % sorted.length]!];
  const at = (t: number): V2 => [c.c[0] + Math.cos(t) * c.r, c.c[1] + Math.sin(t) * c.r];
  const arcPoints = (from: number, to: number): Vec3[] => { const sweep = mod(to - from) || TAU; return Array.from({ length: 33 }, (_, i) => lift(at(from + (sweep * i) / 32))); };
  const id = newIds(s);
  const base = { origin: "drawn" as const, plane: part.plane, movable: true };
  const commands: Command[] = [];
  const rid = relIds(s);
  // what is left runs counter-clockwise from the cut after the pointer round to the cut before it
  const [pa, pb] = [drawnRef(`${id}.p0`), drawnRef(`${id}.p1`)];
  commands.push({ type: "addPart", part: { ...base, ref: pa, kind: "corner", at: lift(at(hi.t)) } });
  commands.push({ type: "addPart", part: { ...base, ref: pb, kind: "corner", at: lift(at(lo.t)) } });
  const arc = drawnRef(`${id}.s0`);
  commands.push({ type: "addPart", part: { ...base, ref: arc, kind: "line", a: pa, b: pb, center: part.center, ccw: true } });
  commands.push({ type: "addRelation", relation: { id: rid(), kind: "arcEnds", parts: [arc, part.center] } as Relation });
  [[pa, hi], [pb, lo]].forEach(([r, k2], j) => {
    const by = (k2 as typeof hi).by;
    if (by.k === "seg" || by.k === "circle") commands.push({ type: "addRelation", relation: { id: rid(), kind: by.k === "seg" ? "onLine" : "onCircle", parts: [r as Ref, by.ref] } as Relation });
  });
  for (const r of carried(s, part.ref, arc, rid, { circleToArc: true })) commands.push({ type: "addRelation", relation: r });
  commands.push({ type: "deleteParts", refs: [part.ref] }); // (the circle's centre stays: the arc is about it)
  return { span: arcPoints(lo.t, hi.t), command: { type: "batch", commands } };
}
