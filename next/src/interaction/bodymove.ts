// A body moved and turned by the mover orb (`dec_task_handles`): from where the orb's frame was (the body's middle, the world's axes) to where it is now, the steps the engine knows (`turn` about the middle, then `move`), and the matrix to show it before it is made. Pure.
import type { Id } from "../engine/id.ts";
import type { Step } from "../engine/steps.ts";
import type { Frame } from "../planes.ts";
import { cross, sub, unit, type V3 } from "../vec.ts";

/** the frame of a body's middle, in the world's own axes */
export const baseFrame = (origin: V3): Frame => ({ origin, normal: [0, 0, 1], u: [1, 0, 0] });
/** the turn and the move that take `base` (the world's axes at its origin) to `now`: the turn is about the base's origin, then the move carries it to where `now` stands (null turn: none) */
export function motionOf(base: Frame, now: Frame): { turn: { axis: V3; deg: number } | null; by: V3 } {
  const n = unit(now.normal),
    u = unit(now.u),
    v = cross(n, u),
    m = [
      [u[0], v[0], n[0]],
      [u[1], v[1], n[1]],
      [u[2], v[2], n[2]],
    ] as const; // (the turn's matrix: its columns are where the world's axes go)
  const c = Math.max(-1, Math.min(1, (m[0][0] + m[1][1] + m[2][2] - 1) / 2)),
    ang = Math.acos(c),
    by = sub(now.origin, base.origin);
  if (ang < 1e-7) return { turn: null, by };
  let axis: V3;
  if (Math.sin(ang) > 1e-6) axis = unit([m[2][1] - m[1][2], m[0][2] - m[2][0], m[1][0] - m[0][1]]);
  else {
    // (half a turn: the axis is in the diagonal (its length), the signs of the others follow the largest in the off-diagonal)
    const a: V3 = [
        Math.sqrt(Math.max(0, (m[0][0] + 1) / 2)),
        Math.sqrt(Math.max(0, (m[1][1] + 1) / 2)),
        Math.sqrt(Math.max(0, (m[2][2] + 1) / 2)),
      ],
      big = a.indexOf(Math.max(...a)),
      sg: V3 = [1, 1, 1];
    for (const k of [0, 1, 2]) if (k !== big) sg[k] = m[big]![k]! + m[k]![big]! > 0 ? 1 : -1;
    axis = unit([a[0] * sg[0], a[1] * sg[1], a[2] * sg[2]]);
  }
  return { turn: { axis, deg: (ang * 180) / Math.PI }, by };
}
/** where a point of the body goes (to check and to show) */
export function carried(base: Frame, now: Frame, p: V3): V3 {
  const n = unit(now.normal),
    u = unit(now.u),
    v = cross(n, u),
    q = sub(p, base.origin),
    by = sub(now.origin, base.origin);
  return [
    base.origin[0] + u[0] * q[0] + v[0] * q[1] + n[0] * q[2] + by[0],
    base.origin[1] + u[1] * q[0] + v[1] * q[1] + n[1] * q[2] + by[1],
    base.origin[2] + u[2] * q[0] + v[2] * q[1] + n[2] * q[2] + by[2],
  ];
}
/** the matrix (column by column, as three.js takes it) of the body shown moved: x goes to base + R(x - base) + by */
export function matrixOf(base: Frame, now: Frame): number[] {
  const n = unit(now.normal),
    u = unit(now.u),
    v = cross(n, u),
    o = base.origin,
    by = sub(now.origin, o);
  const t: V3 = [
    o[0] - (u[0] * o[0] + v[0] * o[1] + n[0] * o[2]) + by[0],
    o[1] - (u[1] * o[0] + v[1] * o[1] + n[1] * o[2]) + by[1],
    o[2] - (u[2] * o[0] + v[2] * o[1] + n[2] * o[2]) + by[2],
  ];
  return [u[0], u[1], u[2], 0, v[0], v[1], v[2], 0, n[0], n[1], n[2], 0, t[0], t[1], t[2], 1];
}
/** the steps that make it: a turn about the middle, then a move (none of either that is nothing) */
export function moveSteps(
  recipe: readonly Step[],
  body: string,
  base: Frame,
  now: Frame,
  /** which of several bodies in the answer (a body's name as data, or "all"): one turn and move for each; none: the model has one body */
  which: readonly (Id | "all")[] = [],
): Step[] {
  const mo = motionOf(base, now),
    out: Step[] = [],
    free = (p: string) => {
      let n = 1;
      while (recipe.some((s) => s.id === `${p}${n}`) || out.some((s) => s.id === `${p}${n}`)) n++;
      return `${p}${n}`;
    };
  let last = body;
  for (const target of which.length ? which : [null]) {
    const named = target ? { body: target } : {};
    if (mo.turn) {
      const id = free("t");
      out.push({
        id,
        kind: "turn",
        params: { axis: mo.turn.axis, deg: Math.round(mo.turn.deg * 1e6) / 1e6, pivot: base.origin, ...named },
        inputs: [last],
      });
      last = id;
    }
    if (Math.hypot(...mo.by) > 1e-9) {
      const id = free("m");
      out.push({
        id,
        kind: "move",
        params: { by: mo.by.map((x) => Math.round(x * 1e6) / 1e6), ...named },
        inputs: [last],
      });
      last = id;
    }
  }
  return out;
}
