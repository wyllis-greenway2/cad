// Trim (`in_195`): cut the part of a line or a circle that lies between the places where other drawn curves cross it, as scissors do. The part the pointer is on goes; what is left stays:
// a line becomes the piece or two pieces that remain (new points where it was cut, kept on what cut it), a circle becomes the arc that remains.
import type { Ref } from "../shared/ref.ts";
import { drawnRef, formatId } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale } from "../math/vec.ts";
import type { Scene, Relation } from "./scene.ts";
import { nextId } from "./scene.ts";
import type { Command } from "./commands.ts";
import { apply } from "./commands.ts";
import { consumed } from "./ownership.ts";
import { pointOf, liftOf, localOf } from "./part.ts";
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
  const lift = (q: V2): Vec3 => liftOf(pl, q);
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

/**
 * A corner a trim makes sits where another corner already is (the end of a piece the other curve was cut to, a vertex the cutter ends on): the two are one point, so they are joined by a coincident relation
 * (`dec_hide_structural_constraints`), not left as two that happen to be at the same spot (a solve can pull those apart).
 */
function partnersOf(s: Scene, corner: Ref, at: Vec3, plane: Ref, skip: ReadonlySet<Ref>, rid: () => string): Command[] {
  const get = (r: Ref) => s.parts[r];
  const out: Command[] = [];
  for (const p of Object.values(s.parts)) {
    if (p.kind !== "corner" || p.derived || p.plane !== plane || p.origin !== "drawn" || skip.has(p.ref)) continue; // (a crossing the faces made is not a corner to join)
    const q = pointOf(get, p.ref);
    if (!q || Math.hypot(q[0] - at[0], q[1] - at[1], q[2] - at[2]) > 1e-6) continue;
    if (s.relations.some((r) => r.kind === "coincident" && r.parts.includes(p.ref) && r.parts.includes(corner))) continue;
    out.push({ type: "addRelation", relation: { id: rid(), kind: "coincident", parts: [corner, p.ref] } as Relation });
  }
  return out;
}

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
    const where = lift(pointAtParam(c, b.t));
    commands.push({ type: "addPart", part: { ...base, ref: r, kind: "corner", at: where } });
    if (b.by && (b.by.k === "seg" || b.by.k === "circle")) commands.push({ type: "addRelation", relation: { id: rid(), kind: b.by.k === "seg" ? "onLine" : "onCircle", parts: [r, b.by.ref] } as Relation });
    commands.push(...partnersOf(s, r, where, part.plane!, new Set([part.a, part.b]), rid));
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
    const where = lift(pointAt(b.t));
    commands.push({ type: "addPart", part: { ...base, ref: r, kind: "corner", at: where } });
    if (b.by && (b.by.k === "seg" || b.by.k === "circle")) commands.push({ type: "addRelation", relation: { id: rid(), kind: b.by.k === "seg" ? "onLine" : "onCircle", parts: [r, b.by.ref] } as Relation });
    commands.push(...partnersOf(s, r, where, part.plane!, new Set([part.a, part.b]), rid));
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
  commands.push(...partnersOf(s, pa, lift(at(hi.t)), part.plane!, new Set([part.center]), rid), ...partnersOf(s, pb, lift(at(lo.t)), part.plane!, new Set([part.center]), rid));
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

// ---- delete a whole surface (`in_285`) ----

/**
 * Why a surface of a sketch cannot be deleted, or null when it can: one that is used by a step (a body is made from it: a body must stay valid, so its sketch is taken away with the step that made it, not by deleting a surface of it)
 * or one whose every edge another surface shares (nothing of it is its own to take off).
 */
export function whyNotDeleteSurface(s: Scene, face: Ref): string | null {
  const f = s.parts[face];
  if (!f || f.kind !== "face" || !f.pieces) return "this is not a surface cut out of a drawing";
  const used = new Set<Ref>(s.steps.flatMap((st) => st.parts));
  if (used.has(face) || f.loop.some((l) => used.has(l) || used.has(parentOf(l)))) return "this surface is part of a body: take the body's step out first";
  return ownPieces(s, f).length ? null : "every edge of this surface is shared with another surface, so there is nothing of it to take off";
}

/** The curve a piece was cut from (a piece's name says: `d/arc@e_003.k@x@...` was cut from `d/e_003.k`). */
const parentOf = (piece: Ref): Ref => `d/${piece.split("@")[1] ?? ""}` as Ref;

/** The edges of the surface no other surface has: its own. */
function ownPieces(s: Scene, f: Extract<Scene["parts"][string], { kind: "face" }>): Ref[] {
  const others = Object.values(s.parts).filter((g): g is typeof f => g.kind === "face" && g.ref !== f.ref && !!g.pieces);
  return f.loop.filter((l) => s.parts[l]?.kind === "line" && !others.some((g) => g.loop.includes(l)));
}

/** A point in the middle of a piece (a straight side, or an arc of a circle). */
function pieceMiddle(s: Scene, piece: Ref): { at: Vec3; plane: Ref } | null {
  const p = s.parts[piece];
  if (p?.kind !== "line" || !p.plane) return null;
  const [a, b, pl] = [pointOf((r) => s.parts[r], p.a), pointOf((r) => s.parts[r], p.b), s.parts[p.plane]];
  if (!a || !b || pl?.kind !== "plane") return null;
  if (!p.center) return { at: scale(add(a, b), 0.5), plane: p.plane };
  const c = pointOf((r) => s.parts[r], p.center);
  if (!c) return null;
  const [lc, la, lb] = [localOf(pl, c), localOf(pl, a), localOf(pl, b)];
  const a0 = Math.atan2(la[1] - lc[1], la[0] - lc[0]);
  const a1 = Math.atan2(lb[1] - lc[1], lb[0] - lc[0]);
  const sweep = p.ccw !== false ? mod(a1 - a0) || TAU : -(mod(a0 - a1) || TAU);
  const r = Math.hypot(la[0] - lc[0], la[1] - lc[1]);
  const m = a0 + sweep / 2;
  return { at: liftOf(pl, [lc[0] + Math.cos(m) * r, lc[1] + Math.sin(m) * r]), plane: p.plane };
}

/** The drawn line, arc or circle on this plane that passes through the point (what a piece was cut from, as it is now). */
function curveThrough(s: Scene, plane: Ref, at: Vec3, prefer: Ref): Ref | null {
  const pl = s.parts[plane];
  if (pl?.kind !== "plane") return null;
  const q = localOf(pl, at);
  const near = (r: Ref): boolean => {
    const p = s.parts[r];
    if (!p || p.origin !== "drawn" || p.plane !== plane || (p.kind !== "line" && p.kind !== "circle") || (p.kind === "line" && p.derived)) return false;
    const get = (x: Ref) => s.parts[x];
    if (p.kind === "circle") { const c = pointOf(get, p.center); return !!c && Math.abs(Math.hypot(...[0, 1].map((i) => localOf(pl, c)[i]! - q[i]!) as [number, number]) - p.radius) < 1e-4; }
    const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)];
    if (!a || !b) return false;
    const [la, lb] = [localOf(pl, a), localOf(pl, b)];
    if (!p.center) {
      const d: V2 = [lb[0] - la[0], lb[1] - la[1]];
      const t = Math.max(0, Math.min(1, ((q[0] - la[0]) * d[0] + (q[1] - la[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1] || 1)));
      return Math.hypot(la[0] + d[0] * t - q[0], la[1] + d[1] * t - q[1]) < 1e-4;
    }
    const c = pointOf(get, p.center);
    if (!c) return false;
    const lc = localOf(pl, c);
    if (Math.abs(Math.hypot(q[0] - lc[0], q[1] - lc[1]) - Math.hypot(la[0] - lc[0], la[1] - lc[1])) > 1e-4) return false;
    const a0 = Math.atan2(la[1] - lc[1], la[0] - lc[0]);
    const span = p.ccw !== false ? mod(Math.atan2(lb[1] - lc[1], lb[0] - lc[0]) - a0) : mod(a0 - Math.atan2(lb[1] - lc[1], lb[0] - lc[0]));
    const at2 = p.ccw !== false ? mod(Math.atan2(q[1] - lc[1], q[0] - lc[0]) - a0) : mod(a0 - Math.atan2(q[1] - lc[1], q[0] - lc[0]));
    return at2 <= span + 1e-6;
  };
  if (near(prefer)) return prefer;
  return Object.keys(s.parts).find((r) => near(r as Ref)) as Ref | undefined ?? null;
}

/**
 * Delete a whole surface of a sketch (`in_285`): its own edges are trimmed off (each is the part of its line or circle between the places where other curves cross it, as the trim tool takes it), and the edges another surface
 * shares stay, with everything else of the drawing: a circle with its outer arc trimmed off is left as the arc that runs through the circles over it. Null (with the reason) when the surface is part of a body.
 */
export function deleteSurface(s: Scene, face: Ref): { command: Command } | { why: string } {
  const why = whyNotDeleteSurface(s, face);
  if (why) return { why };
  const f = s.parts[face] as Extract<Scene["parts"][string], { kind: "face" }>;
  const own = ownPieces(s, f).map((l) => ({ piece: l, mid: pieceMiddle(s, l) }));
  let cur = s;
  const commands: Command[] = [];
  for (const { piece, mid } of own) {
    if (!mid) return { why: "an edge of this surface could not be found" };
    const parent = curveThrough(cur, mid.plane, mid.at, parentOf(piece));
    if (!parent) continue; // (already gone with an earlier trim)
    const plan = trimAt(cur, parent, mid.at);
    if (!plan) return { why: "an edge of this surface cannot be trimmed off (nothing crosses it)" };
    const next = apply(cur, plan.command);
    if (!next.ok) return { why: "an edge of this surface cannot be trimmed off" };
    commands.push(plan.command);
    cur = next.value;
  }
  return { command: { type: "batch", commands } };
}
