// Cycloidal gears, the profile of clock wheels (`dec_gear_tool`, `in_553`): the outline of a spur gear whose teeth are cycloids, as points and bulges like a gear's (`gear.ts`).
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
