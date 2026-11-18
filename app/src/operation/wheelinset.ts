// The end sections of a worm wheel pulled in by an edge chamfer (`in_928`, `prototypes/wheel-land-chamfer`): the wheel's land is its end section carried straight out, and the chamfer is a ruled loft from the section pulled in by the chamfer at
// the face to the full section a chamfer in. The sections are chains of arcs (counter-clockwise, as corners and the bulge of each side), not involutes, so they are pulled in side by side: no offset of a curve in general, only of its pieces.
// Pure maths in the wheel's own x and y.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";
import type { P } from "./arcs.ts";
import { wheelSections, SECTIONS } from "./wheelsections.ts";

export interface Outline { points: P[]; bulges: number[] }

/**
 * Each corner moves `c` along the bisector of the two normals there (to the left of the way the outline goes: inward), divided by the cosine of half the turn (a miter: exact for two lines, near enough for two short arcs that meet smoothly);
 * each side is then an arc of the radius the old one had, `c` less where it bows away from the inside (a tooth's tip) and `c` more where it bows towards it (a root), through its new ends. An error says why it cannot be done.
 */
export function insetOutline(o: Outline, c: number): Result<Outline> {
  const n = o.points.length;
  const side = (i: number) => {
    const [a, b] = [o.points[i]!, o.points[(i + 1) % n]!];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(dx, dy);
    return { L, left: [-dy / L, dx / L] as P, k: o.bulges[i] ?? 0 };
  };
  const S = Array.from({ length: n }, (_, i) => side(i));
  const radius = (s: { L: number; k: number }): number => (Math.abs(s.k) < 1e-9 ? Infinity : ((s.L / 2) ** 2 + (s.k * s.L) ** 2) / (2 * Math.abs(s.k) * s.L));
  const turnOf = (s: { k: number }): number => (Math.abs(s.k) < 1e-9 ? 0 : 4 * Math.atan(Math.abs(s.k)) * (s.k > 0 ? -1 : 1)); // (the way of travel turns this much over the side: a bow to the left turns it to the right)
  const rot = (v: P, a: number): P => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const normalAt = (s: { left: P; k: number }, end: boolean): P => rot(s.left, (end ? 0.5 : -0.5) * turnOf(s));
  const V: P[] = [];
  for (let i = 0; i < n; i++) { // (corner i starts side i and ends side i - 1)
    const [na, nb] = [normalAt(S[(i + n - 1) % n]!, true), normalAt(S[i]!, false)];
    const d = 1 + na[0] * nb[0] + na[1] * nb[1];
    if (d < 0.25) return err("a corner of the outline is too sharp to pull in by the chamfer");
    V.push([o.points[i]![0] + ((na[0] + nb[0]) * c) / d, o.points[i]![1] + ((na[1] + nb[1]) * c) / d]);
  }
  const bulges: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b, s] = [V[i]!, V[(i + 1) % n]!, S[i]!];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L > 1e-6)) return err("a side of the outline vanishes when pulled in by the chamfer");
    const old = [o.points[(i + 1) % n]![0] - o.points[i]![0], o.points[(i + 1) % n]![1] - o.points[i]![1]];
    if (old[0]! * (b[0] - a[0]) + old[1]! * (b[1] - a[1]) <= 0) return err("the chamfer is too big for these teeth: they would vanish (a smaller chamfer)");
    const r0 = radius(s);
    if (r0 === Infinity) { bulges.push(0); continue; }
    const r = s.k > 0 ? r0 + c : r0 - c; // (a bow to the left is away from the inside)
    if (!(r > L / 2 + 1e-9)) return err("the chamfer is too big for the curves of the teeth");
    bulges.push((Math.sign(s.k) * (r - Math.sqrt(r * r - (L * L) / 4))) / L);
  }
  return ok({ points: V, bulges });
}

/** The two end sections of a wheel and each pulled in by its edge chamfer: the lower one's and the upper one's. */
export function wheelEnds(spec: GearSpec): Result<{ lo: { full: Outline; inset: Outline }; hi: { full: Outline; inset: Outline } }> {
  const c = spec.edge ?? 0;
  const w = wheelSections(spec);
  if (!w.ok) return w;
  const [lo, hi] = [w.value[0]!, w.value[SECTIONS - 1]!];
  const [a, b] = [insetOutline(lo, c), insetOutline(hi, c)];
  if (!a.ok) return a;
  if (!b.ok) return b;
  return ok({ lo: { full: lo, inset: a.value }, hi: { full: hi, inset: b.value } });
}
