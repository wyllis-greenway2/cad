// A Geneva drive (`dec_geneva`): the slotted wheel and its crank, in the plane's own x and y, the wheel's shaft at the origin, the first slot along +x. The geometry is exact: for `n` slots and a pin circle of radius `a` the pin
// enters a slot straight when the line from the crank's centre to the pin is square to the slot, which puts the centres `C = a / sin(pi / n)` apart, and the pin enters at `b = C cos(pi / n)` from the wheel's centre.
// The crank is drawn below the wheel, not on it: in a working Geneva it is in a layer under the wheel (`dec_geneva`).
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { CamSpec, CamShapes, V2 } from "./cams.ts";
import { bulgeOf } from "./arcs.ts";

/** how far apart the shafts are for this many slots and this crank radius */
export const genevaCentres = (slots: number, crank: number): number => crank / Math.sin(Math.PI / slots);
const polar = (r: number, a: number): V2 => [r * Math.cos(a), r * Math.sin(a)];

const MIN_WALL = 1; // mm of wheel kept between two slots at the foot of their ends

export function genevaShapes(s: CamSpec): Result<{ polys: { points: V2[]; bulges: number[] }[]; circles: CamShapes["circles"] }> {
  const n = Math.round(s.teeth ?? 0);
  const [a, p, clr, hole] = [s.crank ?? 0, s.pin ?? 0, s.clearance ?? 0, s.hole];
  if (!(n >= 3 && n <= 24)) return err("a Geneva wheel has 3 to 24 slots");
  if (!(a > 0) || !(p > 0)) return err("the crank and the pin need a size");
  if (clr < 0 || hole < 0) return err("the clearance and the shaft's hole cannot be less than nothing");
  if (p >= 2 * a) return err("the pin is as wide as the crank's circle: make the pin smaller");
  const w = p + 2 * clr; // the slot's width
  const c = genevaCentres(n, a);
  const b = c * Math.cos(Math.PI / n); // where the pin enters
  const rw = b + p; // the wheel's radius
  const sc = c - a; // the pin's nearest approach: the middle of the slot's rounded end
  if (sc - w / 2 < hole / 2 + 1) return err("a slot would reach the shaft's hole: use more slots, a smaller pin or clearance, or a smaller hole");
  if (2 * sc * Math.sin(Math.PI / n) - w < MIN_WALL) return err("two slots would meet at their ends: use a smaller pin or clearance, or more slots");
  // the wheel, counter-clockwise: for each slot, the mouth's near corner, down the wall to the end, round the end, up the other wall, and along the rim to the next slot
  const sm = Math.sqrt(rw * rw - (w * w) / 4);
  const wheel: { points: V2[]; bulges: number[] } = { points: [], bulges: [] };
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n;
    const at = (axial: number, across: number): V2 => { const [e, t]: [V2, V2] = [[Math.cos(th), Math.sin(th)], [-Math.sin(th), Math.cos(th)]]; return [axial * e[0] + across * t[0], axial * e[1] + across * t[1]]; };
    const [m1, e1, e2, m2] = [at(sm, -w / 2), at(sc, -w / 2), at(sc, w / 2), at(sm, w / 2)];
    const nextM1 = (() => { const th2 = (2 * Math.PI * (k + 1)) / n; return [sm * Math.cos(th2) + (w / 2) * Math.sin(th2), sm * Math.sin(th2) - (w / 2) * Math.cos(th2)] as V2; })();
    wheel.points.push(m1, e1, e2, m2);
    wheel.bulges.push(0, bulgeOf(e1, at(sc - w / 2, 0), e2), 0, bulgeOf(m2, polar(rw, th + Math.PI / n), nextM1));
  }
  // the crank, below the wheel: a hub with the shaft's hole, an arm as wide as the pin, and the pin's circle at its end, the pin pointing along +x
  const rh = Math.max(hole / 2 + 1.5, p);
  const rp = p / 2;
  const hy = -(rw + rh + 3);
  const xh = Math.sqrt(rh * rh - rp * rp);
  const q2: V2 = [xh, hy - rp], t2: V2 = [a, hy - rp], t1: V2 = [a, hy + rp], q1: V2 = [xh, hy + rp];
  const crank = { points: [q2, t2, t1, q1], bulges: [0, bulgeOf(t2, [a + rp, hy], t1), 0, bulgeOf(q1, [-rh, hy], q2)] };
  const circles: CamShapes["circles"] = hole > 0 ? [{ c: [0, 0], r: hole / 2, hole: true }, { c: [0, hy], r: hole / 2, hole: true }] : [];
  return ok({ polys: [wheel, crank], circles });
}
