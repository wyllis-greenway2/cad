// Builders for the commands that draw parts: they take the next ids from the scene, so callers never invent names.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import { nextId } from "./scene.ts";
import { formatId } from "../shared/ref.ts";
import type { Command } from "./commands.ts";

/** A line chain through points on a plane: corners d/e_N.p0.. and lines d/e_N.s0.. (closed adds the last line back to the first corner). Returns the command and the refs. */
export function drawChain(s: Scene, plane: Ref, points: Vec3[], closed = false, opts: { bulges?: number[]; reuse?: boolean } = {}): { command: Command; corners: Ref[]; lines: Ref[] } {
  const id = nextId(s, "e");
  // with `reuse`, a point where a drawn corner already is on this plane is that corner (lines that meet share it, so a loop of them is a shape)
  const have = (at: Vec3): Ref | null => {
    if (!opts.reuse) return null;
    const c = Object.values(s.parts).find((p) => p.kind === "corner" && p.origin === "drawn" && p.plane === plane && Math.hypot(p.at[0] - at[0], p.at[1] - at[1], p.at[2] - at[2]) < 1e-6);
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
