// Trim (the prototype's `in_195`, `in_228`, `in_229`; here `in_1560`, `in_1561`): the part of a line, an arc or a circle between the places where other drawn curves cross it goes, as scissors do; what is left stays.
// A pure edit of a sketch's definition (points, lines, arcs, circles, constraints): nothing here runs the kernel. The part the pointer is on goes:
//   a line becomes the one or two lines that remain (the one that has the line's own start keeps its id, so a step that names the line, the side face of an extrude, still finds it; a second piece is new and is kept in line with the first)
//   an arc becomes the one or two arcs that remain about the same centre (the second equal in radius to the first); a circle becomes the arc that remains
//   each new end is the crossing: a point on what cut it (or that point, where one already is), so the trim follows the cutter when it is moved
//   constraints stay where they still mean the same (a line's direction, a tangent, a point on it, a circle's size); a length, an equal length and a midpoint belonged to the whole line and go, and each is reported with why
import { segsOf, solveDefinition } from "./definition.ts";
import { Refusal } from "./refusal.ts";
import { alongSeg, crossingPoints, pointOnSeg, type Pt } from "./region.ts";
import type { SketchParams } from "./sketch.ts";
import type { Constraint } from "./solver.ts";

export interface TrimOutcome {
  /** the definition after the trim */ params: SketchParams;
  /** the part that went, as a polyline in the sketch's plane (to show it) */ span: Pt[];
  /** constraints that could not be kept, and why */ dropped: { id: string; kind: string; why: string }[];
  /** the parts the trim made (points, lines, arcs, constraints) */ made: string[];
  /** the parts it took away (the whole part, or the end points nothing else uses) */ removed: string[];
}
const TAU = 2 * Math.PI;
const hyp = Math.hypot;
/** constraints that said something about the whole line, which a piece of it no longer says */
const WHOLE_LINE = new Set(["length", "midpoint"]);

/**
 * Trim the part `id` where `at` is (a point in the sketch's plane near the pointer). Throws, in words, when it cannot (not a drawn line, arc or circle; a circle crossed fewer than twice; a drawing that does not solve).
 */
/** how a definition is read: where its parts end up. On a plane alone, `solveDefinition`; a sketch that holds a body's edges reads them with the body (`solvedPositions` of sketch.ts: the worker's trim question) */
export type Read = (p: SketchParams) => { points: Record<string, [number, number]>; radii: Record<string, number> };
export function trimAt(p: SketchParams, id: string, at: Pt, read: Read = solveDefinition): TrimOutcome {
  const { points: sol, radii } = read(p),
    segs = segsOf(p, sol, radii),
    target = segs.find((s) => s.name === id);
  // the drawing as it is on the screen: a point that the solve moved is where it ended up (a point left alone afterwards must not jump back to where the definition first put it)
  p = {
    ...p,
    points: p.points.map((x) => (sol[x.id] ? { ...x, x: sol[x.id]![0], y: sol[x.id]![1] } : x)),
    ...(p.circles
      ? { circles: p.circles.map((c) => (radii[c.id] !== undefined ? { ...c, r: radii[c.id]! } : c)) }
      : {}),
  };
  const line = (p.lines ?? []).find((l) => l.id === id),
    arc = (p.arcs ?? []).find((a) => a.id === id),
    circle = (p.circles ?? []).find((c) => c.id === id);
  if (!target || !(line || arc || circle))
    throw new Error(`${id} is not a line, an arc or a circle that is drawn in this sketch, so it cannot be trimmed`);
  const ext = Math.max(
      1,
      ...segs
        .flatMap((s) =>
          s.kind === "line" ? [...s.a, ...s.b] : [s.c[0] + s.r, s.c[1] + s.r, s.c[0] - s.r, s.c[1] - s.r],
        )
        .map(Math.abs),
    ),
    eps = 1e-9 * ext;
  // where along the part a place is, counted from its start in the way it goes: a line from 0 to 1, an arc by its angle from its start, a circle by its angle from the east
  const total = target.kind === "line" ? 1 : target.sweep,
    travel = (q: Pt): number | null => {
      const u = alongSeg(target, q, eps);
      if (u === null) return null;
      return target.kind === "arc" && arc?.cw ? (u >= target.sweep - eps / target.r ? 0 : target.sweep - u) : u;
    };
  const place = (s: number): Pt => pointOnSeg(target, target.kind === "arc" && arc?.cw ? target.sweep - s : s);
  const closed = !!circle,
    unit = target.kind === "line" ? hyp(target.b[0] - target.a[0], target.b[1] - target.a[1]) || 1 : target.r,
    e = (eps * 10) / unit;
  // the cuts: every place another drawn curve crosses this one (an end of another curve that stands on it counts)
  interface Cut {
    s: number;
    at: Pt;
  }
  const cuts: Cut[] = [];
  for (const o of segs) {
    if (o === target) continue;
    for (const q of crossingPoints(target, o, eps)) {
      const s = travel(q);
      if (
        s !== null &&
        alongSeg(o, q, eps) !== null &&
        !cuts.some((c) => hyp(c.at[0] - q[0], c.at[1] - q[1]) < eps * 10)
      )
        cuts.push({ s, at: q });
    }
  }
  cuts.sort((a, b) => a.s - b.s);
  // where the pointer is along the part
  const click = (() => {
    if (target.kind === "line") {
      const dx = target.b[0] - target.a[0],
        dy = target.b[1] - target.a[1];
      return Math.min(
        1,
        Math.max(0, ((at[0] - target.a[0]) * dx + (at[1] - target.a[1]) * dy) / (dx * dx + dy * dy || 1)),
      );
    }
    const u = (((Math.atan2(at[1] - target.c[1], at[0] - target.c[0]) - target.t0) % TAU) + TAU) % TAU;
    if (closed) return u;
    if (u <= target.sweep) return arc?.cw ? target.sweep - u : u;
    const nearSweepEnd = u - target.sweep < TAU - u; // off the end of the arc: the nearer end (the segment's own end is at u = sweep)
    return arc?.cw ? (nearSweepEnd ? 0 : total) : nearSweepEnd ? total : 0;
  })();
  // the stretch that goes: between the two cuts either side of the pointer (or a cut and an end)
  let lo: Cut | null, hi: Cut | null;
  if (closed) {
    if (cuts.length < 2)
      throw new Error(
        "a circle is trimmed between two crossings: this one is crossed " + (cuts.length ? "once" : "not at all"),
      );
    let k = cuts.length - 1;
    for (let i = 0; i < cuts.length; i++) if (cuts[i]!.s <= click) k = i;
    lo = cuts[k]!;
    hi = cuts[(k + 1) % cuts.length]!;
  } else {
    const inner = cuts.filter((c) => c.s > e && c.s < total - e);
    lo = null;
    hi = null;
    for (const c of inner) {
      if (c.s <= click) lo = c;
      else {
        hi = c;
        break;
      }
    }
  }
  const lowS = lo ? lo.s : 0,
    highS = hi ? hi.s : total;
  const gap = closed ? (((hi!.s - lo!.s) % TAU) + TAU) % TAU || TAU : highS - lowS,
    from = closed ? lo!.s : lowS;
  const span: Pt[] = (() => {
    const n = target.kind === "line" ? 2 : 33;
    return Array.from({ length: n }, (_x, i) => place((from + (gap * i) / (n - 1)) % (closed ? TAU : total + 1)));
  })();

  // ---- the new definition
  const q: SketchParams = JSON.parse(JSON.stringify(p));
  q.points = q.points ?? [];
  q.lines = q.lines ?? [];
  q.arcs = q.arcs ?? [];
  q.circles = q.circles ?? [];
  q.constraints = q.constraints ?? [];
  const used = new Set<string>([
    ...q.points.map((x) => x.id),
    ...q.lines.map((x) => x.id),
    ...q.arcs.map((x) => x.id),
    ...q.circles.map((x) => x.id),
    ...q.constraints.map((x) => x.id),
    ...(q.anchors ?? []).map((x) => x.id),
  ]);
  const fresh = (base: string): string => {
    let name = base,
      n = 2;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    return name;
  };
  const made: string[] = [],
    removed: string[] = [],
    dropped: { id: string; kind: string; why: string }[] = [];
  const own = new Set<string>(line ? [line.a, line.b] : arc ? [arc.a, arc.b, arc.c] : [circle!.c]);
  const add = <T extends { id: string }>(list: T[], item: T) => {
    list.push(item);
    made.push(item.id);
  };
  /** the point at a cut: one that is already there (an end of another part, joined, not doubled), or a new one held on what cut it */
  const newConstraints: Constraint[] = [];
  const pointAt = (c: Cut): string => {
    const near = p.points.find(
      (x) => !own.has(x.id) && sol[x.id] && hyp(sol[x.id]![0] - c.at[0], sol[x.id]![1] - c.at[1]) < eps * 10,
    );
    if (near) return near.id;
    const pid = fresh(`${id}_cut`);
    add(q.points!, { id: pid, x: c.at[0], y: c.at[1] });
    for (const o of segs) {
      if (o === target || alongSeg(o, c.at, eps) === null) continue;
      const isLine = (p.lines ?? []).some((l) => l.id === o.name),
        cid = fresh(`${pid}_on_${o.name}`);
      newConstraints.push({ id: cid, kind: "on", parts: [pid, o.name] });
      made.push(cid);
    }
    return pid;
  };

  // the pieces that stay
  const left = lo !== null && !closed && lowS > e,
    right = hi !== null && !closed && highS < total - e;
  let id2: string | null = null;
  if (line) {
    const a0 = line.a,
      b0 = line.b,
      keep = q.lines.find((l) => l.id === id)!;
    if (!lo && !hi) {
      q.lines = q.lines.filter((l) => l.id !== id);
      removed.push(id);
    } else if (left) {
      const pLo = pointAt(lo!);
      keep.b = pLo;
      if (right) {
        id2 = fresh(`${id}_2`);
        add(q.lines, { id: id2, a: pointAt(hi!), b: b0 });
      }
    } else if (right) {
      keep.a = pointAt(hi!);
      keep.b = b0;
      void a0;
    }
  } else if (arc) {
    const a0 = arc.a,
      b0 = arc.b,
      keep = q.arcs.find((x) => x.id === id)!;
    if (!lo && !hi) {
      q.arcs = q.arcs.filter((x) => x.id !== id);
      removed.push(id);
    } else if (left) {
      keep.b = pointAt(lo!);
      if (right) {
        id2 = fresh(`${id}_2`);
        add(q.arcs, { id: id2, c: arc.c, a: pointAt(hi!), b: b0, ...(arc.cw ? { cw: true } : {}) });
      }
    } else if (right) {
      keep.a = pointAt(hi!);
      keep.b = b0;
      void a0;
    }
  } else {
    // a circle: the arc that remains runs from the cut after the pointer round to the cut before it
    const c0 = circle!;
    q.circles = q.circles.filter((x) => x.id !== id);
    const a = pointAt(hi!),
      b = pointAt(lo!);
    q.arcs.push({ id, c: c0.c, a, b });
    made.push(id);
    if (c0.fixedR) {
      const rid = fresh(`${id}_r`);
      newConstraints.push({ id: rid, kind: "radius", parts: [id], value: radii[id]! });
      made.push(rid);
    }
  }
  if (id2) {
    // the second piece stays in line with the first (a line), or on the same circle (an arc)
    const cid = fresh(`${id2}_same`);
    if (line) {
      // (in line is the two ends of the second piece on the first)
      const l2 = q.lines.find((x) => x.id === id2)!,
        cid2 = fresh(`${id2}_same2`);
      newConstraints.push({ id: cid, kind: "on", parts: [l2.a, id] }, { id: cid2, kind: "on", parts: [l2.b, id] });
      made.push(cid, cid2);
    } else {
      // (the second arc is on the first's circle: its two ends on it, as the second line's are on the first)
      const a2 = q.arcs.find((x) => x.id === id2)!,
        cid2 = fresh(`${id2}_same2`);
      newConstraints.push({ id: cid, kind: "on", parts: [a2.a, id] }, { id: cid2, kind: "on", parts: [a2.b, id] });
      made.push(cid, cid2);
    }
  }

  // ---- the constraints that were on the part
  const gone = !lo && !hi && !closed;
  q.constraints = q.constraints.filter((c) => {
    if (!c.parts.includes(id)) return true;
    if (gone) {
      dropped.push({ id: c.id, kind: c.kind, why: `${id} went` });
      return false;
    }
    if (line && WHOLE_LINE.has(c.kind)) {
      dropped.push({
        id: c.id,
        kind: c.kind,
        why:
          c.kind === "midpoint"
            ? `${id} is shorter now, so its middle is not where it was`
            : `a piece of ${id} is not the length of the whole line`,
      });
      return false;
    }
    return true; // a direction, a tangent, a point on it, a circle's size: the same line or circle still says it
  });
  q.constraints.push(...newConstraints);
  // an end point nothing uses any more goes with the piece it was the end of
  const stillUsed = (pid: string) =>
    q.lines!.some((l) => l.a === pid || l.b === pid) ||
    q.arcs!.some((a) => a.a === pid || a.b === pid || a.c === pid) ||
    q.circles!.some((c) => c.c === pid) ||
    q.constraints!.some((c) => c.parts.includes(pid));
  for (const pid of [...own])
    if ((line || arc) && !(arc && pid === arc.c) && !stillUsed(pid)) {
      q.points = q.points!.filter((x) => x.id !== pid);
      removed.push(pid);
    }

  // ---- it must still be a drawing that can be made: a constraint that does not hold with the new ends is let go, and said
  const mine = new Set<string>(made);
  for (let tries = 0; tries < 5; tries++) {
    try {
      read(q);
      break;
    } catch (x) {
      if (!(x instanceof Refusal)) throw x;
      const victims = x.victims.filter(
        (v) => mine.has(v) || (p.constraints ?? []).some((c) => c.id === v && c.parts.includes(id)),
      );
      if (!victims.length || tries === 4)
        throw new Error(`the trim leaves a drawing that cannot be made: ${x.message}`);
      for (const v of victims) {
        const c = q.constraints!.find((k) => k.id === v);
        if (c) {
          dropped.push({ id: c.id, kind: c.kind, why: "it does not hold with the new ends" });
        }
      }
      q.constraints = q.constraints!.filter((c) => !victims.includes(c.id));
    }
  }
  return { params: q, span, dropped, made, removed };
}
