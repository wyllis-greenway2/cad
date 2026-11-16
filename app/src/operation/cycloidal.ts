// Cycloidal gears, the profile of clock wheels (`dec_gear_tool`, `in_585`): the outline of a spur gear whose teeth are cycloids, as points and bulges like a gear's (`gear.ts`).
//
// The geometry (the textbook one): the part of a flank outside the pitch circle (the addendum) is an epicycloid, the curve a point on a circle of radius r traces as it rolls on the outside of the pitch circle (radius R);
// the part inside (the dedendum) is a hypocycloid, rolling on the inside. The tooth's flank at the pitch point is radial. Two gears mesh when the circle that makes the addendum of one is the circle that makes the
// dedendum of the other, so one generating circle for a whole set of gears of one module makes every pair mesh (and any two of them are interchangeable). When the circle is half the pitch circle (r = R/2) the
// hypocycloid is a straight line through the centre: the radial flank of clock toothing, which a pinion of 12 teeth has when r = 3 modules, the default here.
//
// Numbers that are conventions, not read from a standard (the defaults are the involute gear's): addendum 1 module, dedendum 1.25 modules, the generating circle 3 modules in radius (all the person's to change).
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec, GearOutline } from "./gear.ts";
import type { P } from "./arcs.ts";
import { polar, bulgeOf } from "./arcs.ts";

/** how many arcs make up each cycloid of a flank (each through two points of it and the point between); the first are the closest together, where the curve bends most */
const ARCS = 5;

export function cycloidalOutline(spec: GearSpec): Result<GearOutline> {
  if (spec.rack) return cycloidalRack(spec);
  if (spec.internal) return cycloidalRing(spec);
  const z = Math.round(spec.teeth);
  const m = spec.module;
  const c = spec.cycloidal ?? {};
  if (!Number.isFinite(z) || z < 7 || z > 500) return err("a cycloidal gear needs 7 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const [ha, hd, rg] = [(c.addendum ?? 1) * m, (c.dedendum ?? 1.25) * m, (c.circle ?? 3) * m];
  const R = (m * z) / 2;
  if (!(ha > 0) || !(hd > 0) || !(rg > 0)) return err("the addendum, dedendum and generating circle must be above zero");
  if (rg >= R) return err("the generating circle must be smaller than the pitch circle: more teeth or a smaller circle");
  if (ha > 2 * rg * 0.98) return err("the addendum is more than the generating circle can make: a smaller addendum or a bigger circle");
  const Ra = R + ha, Rd = R - hd;
  if (Rd <= 0.15 * R) return err("the teeth are too deep for this few: a smaller dedendum");
  if (Rd < Math.abs(R - 2 * rg) + 1e-6) return err("the dedendum is more than the generating circle can make: a smaller dedendum or a bigger circle");
  const backlash = spec.backlash ?? 0;
  const thickness = (Math.PI * m) / 2 - backlash; // (on the pitch circle: half the pitch, less the backlash)
  if (!(thickness > 0)) return err("the backlash is as big as the tooth");
  const thp = thickness / (2 * R); // (half the tooth, as an angle, at the pitch circle)
  const pitch = (2 * Math.PI) / z;
  // the epicycloid: r rolls on the outside of R; the point's radius and angle from where it left the pitch circle, as the rolling goes round by theta
  const epi = (th: number): { rho: number; phi: number } => { const k = (R + rg) / rg; const [x, y] = [(R + rg) * Math.cos(th) - rg * Math.cos(k * th), (R + rg) * Math.sin(th) - rg * Math.sin(k * th)]; return { rho: Math.hypot(x, y), phi: Math.atan2(y, x) }; };
  const hypo = (th: number): { rho: number; phi: number } => { const k = (R - rg) / rg; const [x, y] = [(R - rg) * Math.cos(th) + rg * Math.cos(k * th), (R - rg) * Math.sin(th) - rg * Math.sin(k * th)]; return { rho: Math.hypot(x, y), phi: Math.atan2(y, x) }; };
  // how far the rolling must go to reach the tip (epicycloid) and the root (hypocycloid)
  const thTip = (rg / R) * Math.acos(Math.max(-1, Math.min(1, ((R + rg) ** 2 + rg * rg - Ra * Ra) / (2 * rg * (R + rg)))));
  const thRoot = (rg / R) * Math.acos(Math.max(-1, Math.min(1, (Rd * Rd - (R - rg) ** 2 - rg * rg) / (2 * rg * (R - rg)))));
  const tip = epi(thTip), root = hypo(thRoot);
  const [halfTip, halfRoot] = [thp - tip.phi, thp + root.phi]; // (the half tooth, as an angle, at the tip and at the root: the flank leans toward the middle of the tooth by phi, which is negative where it leans away)
  if (!(halfTip > 0.02 * pitch)) return err("the teeth are pointed: a smaller addendum or a bigger tooth");
  if (!(halfRoot < pitch / 2 - 1e-4)) return err("the teeth meet at the root: a smaller dedendum or a smaller generating circle");
  const bore = spec.bore ?? 0;
  if (bore < 0 || bore >= 2 * Rd * 0.95) return err("the bore must be smaller than the gear's root circle");
  // the flank of the side toward the negative angle, from the root up to the tip, as points S with the middle M of each arc; the other side is its mirror
  const spaced = (n: number, last: number): number[] => Array.from({ length: n + 1 }, (_, i) => last * Math.pow(i / n, 1.7)); // (closer together near the pitch circle, where the curve bends most)
  const upper = spaced(ARCS, thTip), lower = spaced(ARCS, thRoot);
  const outer = (th: number): P => { const e = epi(th); return polar(e.rho, -thp + e.phi); }; // (the negative side: the epicycloid leans toward the middle of the tooth, to the positive angle)
  // (the hypocycloid is traced with the circle rolling the other way round, so it leans the other way: away from the middle when the generating circle is under half the pitch circle (the root is wider), toward it when over (undercut). Checked by gears that mesh, with the tooth counts on both sides of 12)
  const inner = (th: number): P => { const h = hypo(th); return polar(h.rho, -thp - h.phi); };
  const S: P[] = [], M: P[] = [];
  for (let i = ARCS; i >= 1; i--) { S.push(inner(lower[i]!)); M.push(inner((lower[i]! + lower[i - 1]!) / 2)); } // (the hypocycloid, from the root to the pitch circle)
  for (let i = 0; i < ARCS; i++) { S.push(outer(upper[i]!)); M.push(outer((upper[i]! + upper[i + 1]!) / 2)); } // (the epicycloid, from the pitch circle to the tip)
  S.push(outer(upper[ARCS]!));
  const n = S.length - 1;
  const points: P[] = [], bulges: number[] = [];
  const add = (p: P, mm: P, q: P) => { points.push(p); bulges.push(bulgeOf(p, mm, q)); };
  const rot = (p: P, a: number): P => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const flip = (p: P): P => [p[0], -p[1]];
  for (let k = 0; k < z; k++) {
    const r = (p: P) => rot(p, k * pitch);
    for (let i = 0; i < n; i++) add(r(S[i]!), r(M[i]!), r(S[i + 1]!)); // up the negative side
    add(r(S[n]!), r(polar(Ra, 0)), r(flip(S[n]!))); // the tip: an arc about the centre
    for (let i = n; i >= 1; i--) add(r(flip(S[i]!)), r(flip(M[i - 1]!)), r(flip(S[i - 1]!))); // down the positive side
    add(r(flip(S[0]!)), r(polar(Rd, pitch / 2)), rot(S[0]!, (k + 1) * pitch)); // the root: an arc about the centre to the next tooth
  }
  return ok({ points, bulges, pitchRadius: R, baseRadius: 0, tipRadius: Ra, rootRadius: Rd, warnings: z < 12 ? ["few teeth: the generating circle is more than half the pitch circle, so the flank curves in and the root is undercut"] : [] });
}

/** the points of a flank sampled along a curve by its parameter, closer together near the start where it bends most */
const spacedAt = (n: number, last: number): number[] => Array.from({ length: n + 1 }, (_, i) => last * Math.pow(i / n, 1.7));

/**
 * A ring (an internal gear) of this tooth (`in_586`). The ring's teeth point in; a gear inside it has its addendum conjugate to the ring's dedendum, which is outside the ring's pitch circle: an epicycloid of the generating
 * circle rolling on the outside; and its dedendum conjugate to the ring's addendum, which is inside: a hypocycloid of the circle rolling on the inside. The hole is drawn going round counter-clockwise (the teeth's
 * narrow ends, the tips, are the nearest the middle) and the wall round it is a circle of `rim` modules (2 if none) outside the roots, as for an involute ring.
 */
function cycloidalRing(spec: GearSpec): Result<GearOutline> {
  const z = Math.round(spec.teeth);
  const m = spec.module;
  const c = spec.cycloidal ?? {};
  if (!Number.isFinite(z) || z < 7 || z > 500) return err("a cycloidal ring needs 7 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const [ha, hd, rg] = [(c.addendum ?? 1) * m, (c.dedendum ?? 1.25) * m, (c.circle ?? 3) * m];
  const R = (m * z) / 2;
  if (!(ha > 0) || !(hd > 0) || !(rg > 0)) return err("the addendum, dedendum and generating circle must be above zero");
  if (rg >= R) return err("the generating circle must be smaller than the pitch circle: more teeth or a smaller circle");
  const [Rt, Rr] = [R - ha, R + hd]; // (the tips are inside the pitch circle, the roots outside)
  if (Rt <= 0.15 * R) return err("the teeth are too long for this few: a smaller addendum");
  if (Rt < Math.abs(R - 2 * rg) + 1e-6) return err("the addendum is more than the generating circle can make: a smaller addendum or a bigger circle");
  if (hd > 2 * rg * 0.98) return err("the dedendum is more than the generating circle can make: a smaller dedendum or a bigger circle");
  const thickness = (Math.PI * m) / 2 - (spec.backlash ?? 0);
  if (!(thickness > 0)) return err("the backlash is as big as the tooth");
  const thp = thickness / (2 * R);
  const pitch = (2 * Math.PI) / z;
  const epi = (th: number): { rho: number; phi: number } => { const k = (R + rg) / rg; const [x, y] = [(R + rg) * Math.cos(th) - rg * Math.cos(k * th), (R + rg) * Math.sin(th) - rg * Math.sin(k * th)]; return { rho: Math.hypot(x, y), phi: Math.atan2(y, x) }; };
  const hypo = (th: number): { rho: number; phi: number } => { const k = (R - rg) / rg; const [x, y] = [(R - rg) * Math.cos(th) + rg * Math.cos(k * th), (R - rg) * Math.sin(th) - rg * Math.sin(k * th)]; return { rho: Math.hypot(x, y), phi: Math.atan2(y, x) }; };
  const thRoot = (rg / R) * Math.acos(Math.max(-1, Math.min(1, ((R + rg) ** 2 + rg * rg - Rr * Rr) / (2 * rg * (R + rg))))); // (the dedendum: the epicycloid out to the roots)
  const thTip = (rg / R) * Math.acos(Math.max(-1, Math.min(1, (Rt * Rt - (R - rg) ** 2 - rg * rg) / (2 * rg * (R - rg))))); // (the addendum: the hypocycloid in to the tips)
  const [halfTip, halfRoot] = [thp + RING_H * hypo(thTip).phi, thp + RING_E * epi(thRoot).phi];
  if (!(halfTip > 0.02 * pitch)) return err("the teeth are pointed: a smaller addendum or a bigger tooth");
  if (!(halfRoot < pitch / 2 - 1e-4)) return err("the teeth meet at the root: a smaller dedendum or a smaller generating circle");
  const upper = spacedAt(ARCS, thTip), lower = spacedAt(ARCS, thRoot);
  const outer = (th: number): P => { const e = epi(th); return polar(e.rho, -thp - RING_E * e.phi); }; // (the negative side, going out from the pitch circle to the root)
  const inner = (th: number): P => { const h = hypo(th); return polar(h.rho, -thp - RING_H * h.phi); }; // (and in to the tip)
  const S: P[] = [], M: P[] = [];
  for (let i = ARCS; i >= 1; i--) { S.push(outer(lower[i]!)); M.push(outer((lower[i]! + lower[i - 1]!) / 2)); } // (from the root in to the pitch circle)
  for (let i = 0; i < ARCS; i++) { S.push(inner(upper[i]!)); M.push(inner((upper[i]! + upper[i + 1]!) / 2)); } // (and on in to the tip)
  S.push(inner(upper[ARCS]!));
  const n = S.length - 1;
  const points: P[] = [], bulges: number[] = [];
  const add = (p: P, mm: P, q: P) => { points.push(p); bulges.push(bulgeOf(p, mm, q)); };
  const rot = (p: P, a: number): P => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
  const flip = (p: P): P => [p[0], -p[1]];
  for (let k = 0; k < z; k++) {
    const r = (p: P) => rot(p, k * pitch);
    for (let i = 0; i < n; i++) add(r(S[i]!), r(M[i]!), r(S[i + 1]!));
    add(r(S[n]!), r(polar(Rt, 0)), r(flip(S[n]!))); // the tip: an arc about the centre
    for (let i = n; i >= 1; i--) add(r(flip(S[i]!)), r(flip(M[i - 1]!)), r(flip(S[i - 1]!)));
    add(r(flip(S[0]!)), r(polar(Rr, pitch / 2)), rot(S[0]!, (k + 1) * pitch)); // the root: an arc about the centre to the next tooth
  }
  return ok({ points, bulges, pitchRadius: R, baseRadius: 0, tipRadius: Rt, rootRadius: Rr, outerRadius: Rr + m * (spec.rim ?? 2), warnings: [] });
}
/** which way the ring's flanks lean, as a sign on the angle of each cycloid: both lean toward the middle of the tooth going in (the addendum) and going out (the dedendum). Settled by gears that mesh (the addendum) and by the curves themselves: a point of the pinion's addendum epicycloid, carried round with the pinion's turn, touches the ring's dedendum curve to a thousandth of a millimetre with this sign and misses it by 0.14 mm with the other */
const RING_H = -1, RING_E = -1;

/**
 * A rack of this tooth (`in_586`): a gear of endless radius. The generating circle rolls on the straight pitch line: from above for the addendum (the cycloid x = r (t - sin t), y = r (1 - cos t)), from below for the dedendum;
 * the flank leans toward the middle of the tooth above the line and away from it below, as a gear's does. The pitch line is the x axis with the middle of its length at the origin, teeth up, a space (not a tooth) at the
 * left end, as `rackOutline` has it, so a gear meshes with it by the same rules.
 */
function cycloidalRack(spec: GearSpec): Result<GearOutline> {
  const n = Math.round(spec.teeth);
  const m = spec.module;
  const c = spec.cycloidal ?? {};
  if (!Number.isFinite(n) || n < 1 || n > 500) return err("a rack needs 1 to 500 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  const [ha, hd, rg] = [(c.addendum ?? 1) * m, (c.dedendum ?? 1.25) * m, (c.circle ?? 3) * m];
  if (!(ha > 0) || !(hd > 0) || !(rg > 0)) return err("the addendum, dedendum and generating circle must be above zero");
  if (ha > 2 * rg * 0.98) return err("the addendum is more than the generating circle can make: a smaller addendum or a bigger circle");
  if (hd > 2 * rg * 0.98) return err("the dedendum is more than the generating circle can make: a smaller dedendum or a bigger circle");
  const p = Math.PI * m;
  const thickness = p / 2 - (spec.backlash ?? 0);
  if (!(thickness > 0)) return err("the backlash is as big as the tooth");
  const xp = thickness / 2; // (half the tooth on the pitch line)
  const [tha, thd] = [Math.acos(1 - ha / rg), Math.acos(1 - hd / rg)];
  const [tipHalf, rootHalf] = [xp - rg * (tha - Math.sin(tha)), xp + rg * (thd - Math.sin(thd))];
  if (!(tipHalf > 0.02 * p)) return err("the teeth are pointed: a smaller addendum or a bigger tooth");
  if (!(rootHalf < p / 2 - 1e-4)) return err("the teeth meet at the root: a smaller dedendum or a smaller generating circle");
  const bottom = -hd - (spec.rim ?? 2) * m;
  const L = n * p;
  // the right flank of a tooth about x = 0, from the root up to the tip, with the middle of each arc (the left is its mirror)
  const addAt = (t: number): P => [xp - rg * (t - Math.sin(t)), rg * (1 - Math.cos(t))];
  const dedAt = (t: number): P => [xp + rg * (t - Math.sin(t)), -rg * (1 - Math.cos(t))];
  const ua = spacedAt(ARCS, tha), ud = spacedAt(ARCS, thd);
  const S: P[] = [], M: P[] = [];
  for (let i = ARCS; i >= 1; i--) { S.push(dedAt(ud[i]!)); M.push(dedAt((ud[i]! + ud[i - 1]!) / 2)); } // (from the root up to the pitch line)
  for (let i = 0; i < ARCS; i++) { S.push(addAt(ua[i]!)); M.push(addAt((ua[i]! + ua[i + 1]!) / 2)); } // (and on up to the tip)
  S.push(addAt(ua[ARCS]!));
  const nn = S.length - 1;
  // the top edge from the left end to the right as nodes, each with the middle of the arc that goes on to the next (null: a straight side)
  type Node = { p: P; out: P | null };
  const nodes: Node[] = [{ p: [0, -hd], out: null }];
  for (let k = 0; k < n; k++) {
    const xc = (k + 0.5) * p;
    const left = (q: P): P => [xc - q[0], q[1]], right = (q: P): P => [xc + q[0], q[1]];
    for (let i = 0; i <= nn; i++) nodes.push({ p: left(S[i]!), out: i < nn ? left(M[i]!) : null }); // (up the left flank from the root; across the flat tip)
    for (let i = nn; i >= 0; i--) nodes.push({ p: right(S[i]!), out: i > 0 ? right(M[i - 1]!) : null }); // (and down the right; then along the flat of the space)
  }
  nodes.push({ p: [L, -hd], out: null });
  // the outline goes along the bottom, up the right end, back along the top, down the left end
  const rev = nodes.slice().reverse();
  const shift = (q: P): P => [q[0] - L / 2, q[1]];
  const points: P[] = [shift([0, bottom]), shift([L, bottom])];
  const bulges: number[] = [0, 0];
  rev.forEach((nd, j) => {
    points.push(shift(nd.p));
    const mid = j + 1 < rev.length ? nodes[nodes.length - 2 - j]!.out : null; // (the edge from this node to the next, the way it goes now, is the one the other way round from before)
    const next = rev[j + 1];
    bulges.push(mid && next ? bulgeOf(shift(nd.p), shift(mid), shift(next.p)) : 0);
  });
  return ok({ points, bulges, pitchRadius: 0, baseRadius: 0, tipRadius: ha, rootRadius: -hd, length: L, warnings: [] });
}
