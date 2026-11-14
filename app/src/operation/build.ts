// Builders for the commands that draw parts: they take the next ids from the scene, so callers never invent names.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross } from "../math/vec.ts";
import { circumcentre } from "./part.ts";
import { anchorCorners } from "./anchors.ts";
import type { Scene } from "./scene.ts";
import { nextId } from "./scene.ts";
import { live } from "./ownership.ts";
import { formatId } from "../shared/ref.ts";
import type { Command } from "./commands.ts";

/** A line chain through points on a plane: corners d/e_N.p0.. and lines d/e_N.s0.. (closed adds the last line back to the first corner). Returns the command and the refs. */
export function drawChain(s: Scene, plane: Ref, points: Vec3[], closed = false, opts: { bulges?: number[]; reuse?: boolean } = {}): { command: Command; corners: Ref[]; lines: Ref[] } {
  const id = nextId(s, "e");
  const spent = live(s); // (a corner an extrude used up is not joined to)
  // with `reuse`, a point where a drawn corner already is on this plane is that corner (lines that meet share it, so a loop of them is a shape)
  const have = (at: Vec3): Ref | null => {
    if (!opts.reuse) return null;
    const c = Object.values(spent.parts).find((p) => p.kind === "corner" && p.origin === "drawn" && !p.derived && p.plane === plane && Math.hypot(p.at[0] - at[0], p.at[1] - at[1], p.at[2] - at[2]) < 1e-6);
    return c?.ref ?? null;
  };
  const existing = points.map(have);
  const corners = points.map((_, i) => existing[i] ?? drawnRef(`${id}.p${i}`));
  const n = closed ? points.length : points.length - 1;
  const lines = Array.from({ length: n }, (_, i) => drawnRef(`${id}.s${i}`));
  const base = { origin: "drawn" as const, plane, movable: true };
  const commands: Command[] = [
    ...points.flatMap((at, i): Command[] => (existing[i] ? [] : [{ type: "addPart", part: { ...base, ref: corners[i]!, kind: "corner", at } }])),
    ...lines.map((ref, i): Command => ({ type: "addPart", part: { ...base, ref, kind: "line", a: corners[i]!, b: corners[(i + 1) % points.length]!, ...(opts.bulges?.[i] ? { bulge: opts.bulges[i] } : {}) } })),
  ];
  return { command: { type: "batch", commands }, corners, lines };
}

export function drawRectangle(s: Scene, plane: Ref, a: Vec3, b: Vec3, u: Vec3, v: Vec3) {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const du = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const dv = d[0] * v[0] + d[1] * v[1] + d[2] * v[2];
  const at = (x: number, y: number): Vec3 => [a[0] + u[0] * x + v[0] * y, a[1] + u[1] * x + v[1] * y, a[2] + u[2] * x + v[2] * y];
  return drawChain(s, plane, [at(0, 0), at(du, 0), at(du, dv), at(0, dv)], true);
}

export function drawCircle(s: Scene, plane: Ref, centre: Vec3, radius: number): { command: Command; centre: Ref; circle: Ref } {
  const id = nextId(s, "e");
  const centreRef = drawnRef(`${id}.c`);
  const circle = drawnRef(`${id}.k`);
  const base = { origin: "drawn" as const, plane, movable: true };
  return {
    command: { type: "batch", commands: [
      { type: "addPart", part: { ...base, ref: centreRef, kind: "corner", at: centre } },
      { type: "addPart", part: { ...base, ref: circle, kind: "circle", center: centreRef, radius } },
    ] },
    centre: centreRef,
    circle,
  };
}

/**
 * A rectangle as it is drawn by hand: four corners and lines kept level with the plane's axes (horizontal on the two sides along u, vertical on the two along v),
 * so moving a corner or typing a size keeps it a rectangle. The relation ids follow the scene's counter.
 */
export function drawSquaredRectangle(s: Scene, plane: Ref, a: Vec3, b: Vec3, u: Vec3, v: Vec3) {
  const r = drawRectangle(s, plane, a, b, u, v);
  const base = s.counter + 1 + 8; // after the eight parts of the shape the counter is at least this
  const kinds = ["horizontal", "vertical", "horizontal", "vertical"] as const;
  const rels: Command[] = r.lines.map((line, i): Command => ({ type: "addRelation", relation: { id: formatId("r", base + i), kind: kinds[i]!, parts: [line] } }));
  return { ...r, command: { type: "batch", commands: [r.command, ...rels] } as Command };
}

/** An arc through two ends and a point on it, made as an arc about a centre point (a corner of its own, so it can be positioned and sized with constraints), with the relation that keeps both ends the same distance from the centre. */
export function drawArc(s: Scene, plane: Ref, a: Vec3, m: Vec3, b: Vec3, normal: Vec3): { command: Command; line: Ref; centre: Ref } | null {
  const c = circumcentre(a, m, b);
  if (!c) return null;
  const ccw = dot(cross(sub(a, c), sub(m, c)), normal) > 0; // the middle is counter-clockwise from the start: the arc goes that way round
  const d = drawChain(s, plane, [a, b], false, { reuse: true });
  const id = nextId(s, "e");
  const centre = drawnRef(`${id}.c`);
  const line = d.lines[0]!;
  const commands: Command[] = [];
  for (const c2 of (d.command as { type: "batch"; commands: Command[] }).commands) {
    if (c2.type === "addPart" && c2.part.kind === "line") commands.push({ type: "addPart", part: { ...c2.part, center: centre, ccw } }); // the chain's line becomes the arc
    else commands.push(c2);
  }
  commands.unshift({ type: "addPart", part: { origin: "drawn", plane, movable: true, ref: centre, kind: "corner", at: c } });
  commands.push({ type: "addRelation", relation: { id: nextId(s, "r"), kind: "arcEnds", parts: [line, centre] } });
  return { command: { type: "batch", commands }, line, centre };
}

/**
 * A figure drawn with a corner on a spot where another corner of the drawing already is (its start snapped to the end of a line, a circle centred on a corner) has that corner joined to the other by a coincident
 * relation, so the two stay one point (`in_240`, `in_243`). Lines drawn to a corner share it instead (`reuse`). Two circle centres on one spot are left alone: that is the concentric case, asked about when it is drawn.
 */
export function joinedAtCorners(s: Scene, plane: Ref, command: Command): Command {
  const flatten = (c: Command): Command[] => (c.type === "batch" ? c.commands.flatMap(flatten) : [c]);
  const list = flatten(command);
  const fresh = list.flatMap((c) => (c.type === "addPart" && c.part.kind === "corner" && c.part.origin === "drawn" && c.part.plane === plane ? [c.part] : []));
  if (!fresh.length) return command;
  const centreOfNew = new Set(list.flatMap((c) => (c.type === "addPart" && c.part.kind === "circle" ? [c.part.center] : [])));
  const spent = live(s);
  const circleCentres = new Set(Object.values(spent.parts).flatMap((p) => (p.kind === "circle" ? [p.center] : [])));
  const taken = [...list.flatMap((c) => (c.type === "addPart" ? [c.part.ref] : c.type === "addRelation" ? [c.relation.id] : [])), formatId("e", s.counter)].map((id) => Number(/_(\d+)/.exec(id)?.[1] ?? 0));
  let n0 = Math.max(s.counter, ...taken);
  const out: Command[] = [];
  const pl = spent.parts[plane];
  const bodyCorners = pl?.kind === "plane" ? anchorCorners(spent, pl) : []; // (the corners of the body as they fall on the plane, `in_310`, `in_311`)
  for (const c of fresh) {
    for (const bc of bodyCorners) if (Math.hypot(bc.at[0] - c.at[0], bc.at[1] - c.at[1], bc.at[2] - c.at[2]) <= 1e-6) out.push({ type: "addRelation", relation: { id: formatId("r", ++n0), kind: "coincident", parts: [c.ref, bc.ref] } });
    for (const p of Object.values(spent.parts)) {
      if (p.kind !== "corner" || p.origin !== "drawn" || p.derived || p.plane !== plane) continue;
      if (Math.hypot(p.at[0] - c.at[0], p.at[1] - c.at[1], p.at[2] - c.at[2]) > 1e-6) continue;
      if (centreOfNew.has(c.ref) && circleCentres.has(p.ref)) continue;
      out.push({ type: "addRelation", relation: { id: formatId("r", ++n0), kind: "coincident", parts: [c.ref, p.ref] } });
    }
  }
  return out.length ? { type: "batch", commands: [command, ...out] } : command;
}
