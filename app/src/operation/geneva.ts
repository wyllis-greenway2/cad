// A Geneva drive (`dec_geneva`): the slotted wheel with its locking arcs, the driver's locking disc, and the crank, in the plane's own x and y, the wheel's shaft at the origin, the first slot along +x. The geometry is exact: for
// `n` slots and a pin circle of radius `a` the pin enters a slot straight when the line from the crank's centre to the pin is square to the slot, which puts the centres `C = a / sin(pi / n)` apart, and the pin enters at
// `b = C cos(pi / n)` from the wheel's centre. The crank is in a layer under the wheel in a working drive, so the drawing puts it, and the locking disc (which turns with it), below the wheel and not on it.
//
// The locking disc keeps the wheel from turning between the pin's visits: its rim sits in a concave arc of the wheel's rim (a circle about the disc's centre, a little bigger than the disc), and it is cut away where the wheel's
// material would meet it while the pin is in the slot. That notch is not a formula but the envelope of the wheel as it turns: for each direction from the disc's centre, how far the disc may go before the wheel is met at any
// moment of the visit (`discRadii`), so the disc is as full as the wheel lets it be and no fuller.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { CamSpec, CamShapes, V2 } from "./cams.ts";
import { fitKnots } from "./cams.ts";
import { bulgeOf } from "./arcs.ts";

/** how far apart the shafts are for this many slots and this crank radius */
export const genevaCentres = (slots: number, crank: number): number => crank / Math.sin(Math.PI / slots);
const polar = (r: number, a: number): V2 => [r * Math.cos(a), r * Math.sin(a)];
const MIN_WALL = 1; // mm of wheel kept between two slots at the foot of their ends, and of disc round the shaft's hole
/** the wheel's radius: the pin enters at b; the rim stands a little beyond the pin's far side */
export const genevaWheelRadius = (slots: number, crank: number, pin: number, clearance: number): number => genevaCentres(slots, crank) * Math.cos(Math.PI / slots) + pin / 2 + clearance + 0.6;

/** a closed outline of corners and bulges as a polyline (each arc as a few points), for working out where the wheel is */
export function outlinePoints(points: readonly V2[], bulges: readonly number[]): V2[] {
  const out: V2[] = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length]!;
    const k = bulges[i] ?? 0;
    out.push(a);
    if (!k) return;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const mid: V2 = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
    // the circle through a, mid, b, and the points along the arc from a to b
    const [ax, ay, bx, by, cx, cy] = [a[0], a[1], mid[0], mid[1], b[0], b[1]];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-12) return;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    const r = Math.hypot(ax - ux, ay - uy);
    const ang = (q: V2): number => Math.atan2(q[1] - uy, q[0] - ux);
    const wrap = (x: number): number => { let y = x % (2 * Math.PI); if (y > Math.PI) y -= 2 * Math.PI; if (y <= -Math.PI) y += 2 * Math.PI; return y; };
    const ta = ang(a);
    const [dm, db] = [wrap(ang(mid) - ta), wrap(ang(b) - ta)]; // (the way round from a through the middle to b: counter-clockwise when the middle is counter-clockwise of a)
    const sweep = dm > 0 ? (db > dm ? db : db + 2 * Math.PI) : db < dm ? db : db - 2 * Math.PI;
    const tb = ta + sweep;
    const stepAngle = Math.min((20 * Math.PI) / 180, Math.max((2 * Math.PI) / 180, 2 * Math.acos(Math.max(0, 1 - 0.02 / r)))); // (points close enough that the arc is within 0.02 mm of its chords)
    const steps = Math.max(2, Math.ceil(Math.abs(tb - ta) / stepAngle));
    for (let j = 1; j < steps; j++) { const t = ta + ((tb - ta) * j) / steps; out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]); }
  });
  return out;
}
/**
 * How far from the disc's centre the locking disc may reach in each direction (`count` directions round it, counter-clockwise from the one the pin is in), no more than `limit`, while the pin is in the slot: the wheel, turned as
 * the pin turns it, is met at some distance along each direction, and the disc stops `clearance` short of the nearest. The crank turns `beta` either side of the line of centres.
 */
function discRadii(wheel: readonly V2[], c: number, a: number, beta: number, clearance: number, limit: number, count: number): number[] {
  const out = new Array<number>(count).fill(limit);
  const STEPS = 90;
  const reach = Math.max(...wheel.map((q) => Math.hypot(q[0], q[1]))); // (a ray that passes farther from the wheel's centre than this meets nothing)
  const turnAt = (al: number): number => Math.atan2(a * Math.sin(al), c - a * Math.cos(al));
  // between two of the crank angles tried the wheel moves, at its rim, by up to the turn between them times its radius: the disc keeps half of that more away, so the gap it is given holds between them too
  let step = 0;
  for (let k = 0; k < STEPS; k++) step = Math.max(step, Math.abs(turnAt(-beta + (2 * beta * (k + 1)) / STEPS) - turnAt(-beta + (2 * beta * k) / STEPS)));
  const margin = clearance + 0.5 * reach * step;
  for (let k = 0; k <= STEPS; k++) {
    const al = -beta + (2 * beta * k) / STEPS;
    const turn = turnAt(al); // the wheel's turn when the crank is `al` off the line of centres
    const [ct, st] = [Math.cos(turn), Math.sin(turn)];
    const poly = wheel.map((p): V2 => [p[0] * ct - p[1] * st, p[0] * st + p[1] * ct]);
    const dirOf = (i: number): number => (2 * Math.PI * i) / count + Math.PI - al; // (the disc's own direction i, in the world: the crank is turned half a turn from the pin's side, less `al`)
    // each corner of the wheel is a circle of the margin's radius the disc must keep out of, along the directions that pass near it
    for (const v of poly) {
      const [vx, vy] = [v[0] - c, v[1]];
      const d = Math.hypot(vx, vy);
      if (d <= margin) { for (let i = 0; i < count; i++) out[i] = Math.min(out[i]!, 0); continue; }
      const half = Math.asin(Math.min(1, margin / d));
      const centreI = ((Math.atan2(vy, vx) - Math.PI + al) / (2 * Math.PI)) * count;
      const span = Math.ceil((half / (2 * Math.PI)) * count) + 1;
      for (let m = -span; m <= span; m++) {
        const i = (((Math.round(centreI) + m) % count) + count) % count;
        let delta = Math.atan2(vy, vx) - dirOf(i);
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const q = margin * margin - d * d * Math.sin(delta) ** 2;
        if (Math.abs(delta) < Math.PI / 2 && q >= 0) out[i] = Math.min(out[i]!, d * Math.cos(delta) - Math.sqrt(q));
      }
    }
    for (let i = 0; i < count; i++) {
      const dir = dirOf(i);
      const [dx, dy] = [Math.cos(dir), Math.sin(dir)];
      const along = c * dx; // (the ray's closest approach to the wheel's centre)
      if (c * c - along * along > (reach + margin) ** 2 || (along > 0 && c > reach + margin)) continue;
      for (let j = 0; j < poly.length; j++) { // the sides: the disc stops `margin` short of the line of a side the ray meets, as far as that side reaches
        const [p, q] = [poly[j]!, poly[(j + 1) % poly.length]!];
        const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const [wx, wy] = [p[0] - c, p[1]];
        const t = (wx * ey - wy * ex) / den;
        const u = (wx * dy - wy * dx) / den;
        if (t <= 1e-9 || u < 0 || u > 1) continue;
        const sinG = Math.abs(den) / Math.hypot(ex, ey); // (the angle between the ray and the side)
        const back = margin / Math.max(sinG, 1e-3);
        const foot = u - (back * (dx * ex + dy * ey)) / (ex * ex + ey * ey);
        if (foot < 0 || foot > 1) continue; // (past the end of the side: its corner's circle holds the disc off)
        if (t - back < out[i]!) out[i] = t - back;
      }
    }
  }
  return out;
}

export function genevaShapes(s: CamSpec): Result<{ polys: { points: V2[]; bulges: number[] }[]; circles: CamShapes["circles"]; rings: V2[][] }> {
  const n = Math.round(s.teeth ?? 0);
  const [a, p, clr] = [s.crank ?? 0, s.pin ?? 0, s.clearance ?? 0];
  if (!(n >= 3 && n <= 24)) return err("a Geneva wheel has 3 to 24 slots");
  if (!(a > 0) || !(p > 0)) return err("the crank and the pin need a size");
  if (clr < 0) return err("the clearance cannot be less than nothing");
  if (p >= 2 * a) return err("the pin is as wide as the crank's circle: make the pin smaller");
  const w = p + 2 * clr; // the slot's width
  const c = genevaCentres(n, a);
  const rw = genevaWheelRadius(n, a, p, clr);
  const sc = c - a; // the pin's nearest approach: the middle of the slot's rounded end
  const delta = Math.asin(w / 2 / rw); // half the slot's mouth, as an angle
  const half = Math.PI / n;
  if (sc - w / 2 < MIN_WALL) return err("a slot would reach the middle of the wheel: use more slots, or a smaller pin or clearance");
  if (2 * sc * Math.sin(half) - w < MIN_WALL) return err("two slots would meet at their ends: use a smaller pin or clearance, or more slots");
  // the locking arcs: a circle about the disc's centre, `clearance` bigger than the disc, meets the rim at an angle gamma either side of the middle of the stretch between two slots
  const lockOn = s.lock === undefined || s.lock > 0;
  const gammaMax = half - delta - 0.03; // (the arc stays clear of the slot's mouth)
  if (gammaMax <= 0.02) return err("the slots are too wide for the wheel to have locking arcs between them: use more slots or a smaller pin");
  let rl = 0, rc = 0, gamma = 0;
  if (lockOn) {
    rl = s.lock ?? Math.sqrt(rw * rw + c * c - 2 * rw * c * Math.cos(0.55 * gammaMax)) - clr; // (the disc's radius, if left: its arc takes just over half the room)
    rc = rl + clr;
    const cosg = (rw * rw + c * c - rc * rc) / (2 * rw * c);
    if (!(rl > 0) || cosg > 1 || cosg < -1) return err("the locking disc's radius does not meet the wheel's rim: make it bigger, or smaller (about the distance from the wheel's rim to the disc's shaft up to the distance from its centre to the rim's far side)");
    gamma = Math.acos(cosg);
    if (gamma > gammaMax) return err("the locking disc is so big that its arc would run into the slot's mouth: make the disc's radius smaller");
  }
  // the wheel, counter-clockwise: for each slot, the mouth's near corner, down the wall to the end, round the end, up the other wall, and along the rim (round a locking arc) to the next slot
  const sm = Math.sqrt(rw * rw - (w * w) / 4);
  const wheel: { points: V2[]; bulges: number[] } = { points: [], bulges: [] };
  const rim = (from: number, to: number): number => -Math.tan((to - from) / 4) / 2; // (the bulge of the rim's arc: round, bulging away from the centre)
  for (let k = 0; k < n; k++) {
    const th = (2 * Math.PI * k) / n;
    const at = (axial: number, across: number): V2 => { const [e, t]: [V2, V2] = [[Math.cos(th), Math.sin(th)], [-Math.sin(th), Math.cos(th)]]; return [axial * e[0] + across * t[0], axial * e[1] + across * t[1]]; };
    const [m1, e1, e2, m2] = [at(sm, -w / 2), at(sc, -w / 2), at(sc, w / 2), at(sm, w / 2)];
    const thNext = th + 2 * Math.PI / n;
    const nextM1: V2 = [sm * Math.cos(thNext) + (w / 2) * Math.sin(thNext), sm * Math.sin(thNext) - (w / 2) * Math.cos(thNext)];
    wheel.points.push(m1, e1, e2, m2);
    wheel.bulges.push(0, bulgeOf(e1, at(sc - w / 2, 0), e2), 0);
    if (!lockOn) { wheel.bulges.push(bulgeOf(m2, polar(rw, th + half), nextM1)); continue; }
    const mid = th + half;
    const [a1, a2] = [polar(rw, mid - gamma), polar(rw, mid + gamma)];
    wheel.points.push(a1, a2);
    wheel.bulges.push(rim(th + delta, mid - gamma), bulgeOf(a1, polar(c - rc, mid), a2), rim(mid + gamma, thNext - delta));
  }
  // the hole for the shaft, if left: as big as the room round it allows (a quarter of the crank radius at most)
  let rings: V2[][] = [];
  let discAt: V2 = [0, 0];
  const hy = -(rw + 6 + Math.max(p, 4));
  let hole = s.hole;
  let discOutline: ((t: number) => V2) | null = null;
  let radii: number[] | null = null;
  const COUNT = 720;
  if (lockOn) {
    radii = discRadii(outlinePoints(wheel.points, wheel.bulges), c, a, Math.PI / 2 - half, clr, rl, COUNT);
    const smallest = Math.min(...radii);
    if (hole < 0) hole = Math.max(0, Math.min(a / 4, 2 * (smallest - MIN_WALL), 2 * (sc - w / 2 - MIN_WALL)));
    else if (hole / 2 > smallest - MIN_WALL + 1e-9) return err("the locking disc's notch comes too near the shaft's hole (the wheel's rim passes close to the disc's shaft): use a smaller hole, a bigger crank, or fewer slots");
  } else if (hole < 0) hole = Math.max(0, Math.min(a / 4, 2 * (sc - w / 2 - MIN_WALL)));
  if (hole / 2 > sc - w / 2 - MIN_WALL + 1e-9) return err("a slot would reach the shaft's hole: use more slots, a smaller pin or clearance, or a smaller hole");
  const rh = Math.max(hole / 2 + 1.5, p);
  if (radii) {
    const f = (t: number): number => { const x = ((t / (2 * Math.PI)) % 1 + 1) % 1 * COUNT; const i = Math.floor(x); const u = x - i; return radii![i % COUNT]! * (1 - u) + radii![(i + 1) % COUNT]! * u; };
    discAt = [a + p / 2 + 4 + rl + rh, hy]; // (beside the crank, its notch toward +x like the crank's pin)
    discOutline = (t) => [discAt[0] + f(t) * Math.cos(t), discAt[1] + f(t) * Math.sin(t)];
    const dense = Array.from({ length: COUNT }, (_, i) => discOutline!((2 * Math.PI * i) / COUNT));
    // the corners of the notch (where the disc's radius leaves the full radius) are knots, so the curve is not rounded off them
    const edges: number[] = [];
    for (let i = 0; i < COUNT; i++) if ((radii[i]! < rl - 1e-6) !== (radii[(i + 1) % COUNT]! < rl - 1e-6)) edges.push(((i + 0.5) / COUNT) * 2 * Math.PI);
    const marks = [0, ...edges.filter((e) => e > 1e-6 && e < 2 * Math.PI - 1e-6), 2 * Math.PI];
    rings = [fitKnots(discOutline, marks, Math.max(0.02, rl * 1e-3), dense)];
  }
  // the crank, below the wheel: a hub with the shaft's hole, an arm as wide as the pin, and the pin's circle at its end, the pin pointing along +x
  const rp = p / 2;
  const xh = Math.sqrt(rh * rh - rp * rp);
  const q2: V2 = [xh, hy - rp], t2: V2 = [a, hy - rp], t1: V2 = [a, hy + rp], q1: V2 = [xh, hy + rp];
  const crank = { points: [q2, t2, t1, q1], bulges: [0, bulgeOf(t2, [a + rp, hy], t1), 0, bulgeOf(q1, [-rh, hy], q2)] };
  const circles: CamShapes["circles"] = hole > 0 ? [{ c: [0, 0], r: hole / 2, hole: true }, { c: [0, hy], r: hole / 2, hole: true }, ...(lockOn ? [{ c: discAt, r: hole / 2, hole: true as const }] : [])] : [];
  return ok({ polys: [wheel, crank], circles, rings });
}
