// Prototype (thrown away, `in_928`): the outline of a worm wheel's end section (corners and the bulge of each side, counter-clockwise) pulled in by c, with the same number of sides,
// to chamfer the wheel's land. Run (from app/): Z=30 C=0.5 node ../prototypes/wheel-land-chamfer/inset.mjs
import { wheelSections } from "../../app/src/operation/wheelsections.ts";

/** Each corner moves c along the bisector of the two normals there (to the left of the way the outline goes: inward), divided by the cosine of half the turn (a miter: exact for two lines, near enough for two short arcs that meet smoothly);
 *  each side is then an arc of the radius the old one had, c less where it bows away from the inside (a tooth's tip) and c more where it bows to it (a root), through its new ends. Null with a reason when it cannot be done. */
export function inset(points, bulges, c) {
  const n = points.length;
  const side = (i) => { const a = points[i], b = points[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy); return { a, b, L, left: [-dy / L, dx / L], k: bulges[i] ?? 0 }; };
  const S = Array.from({ length: n }, (_, i) => side(i));
  const R = (s) => (Math.abs(s.k) < 1e-9 ? Infinity : ((s.L / 2) ** 2 + (s.k * s.L) ** 2) / (2 * Math.abs(s.k) * s.L));
  // the left normal of a side at its start and at its end (a line: the same; an arc: it turns with the arc, by half its angle either way)
  const turnOf = (s) => (Math.abs(s.k) < 1e-9 ? 0 : 4 * Math.atan(Math.abs(s.k)) * (s.k > 0 ? -1 : 1)); // (the direction of travel turns by this over the side: a bow to the left turns the travel to the right)
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const at = (s, end) => rot(s.left, (end ? 0.5 : -0.5) * turnOf(s));
  const V = [];
  for (let i = 0; i < n; i++) { // corner i is the start of side i and the end of side i-1
    const [p, q] = [S[(i + n - 1) % n], S[i]];
    const [na, nb] = [at(p, true), at(q, false)];
    const d = 1 + na[0] * nb[0] + na[1] * nb[1];
    if (d < 0.25) return { error: "a corner of the outline is too sharp to pull in" };
    const m = [(na[0] + nb[0]) * c / d, (na[1] + nb[1]) * c / d];
    V.push([points[i][0] + m[0], points[i][1] + m[1]]);
  }
  const outB = [];
  for (let i = 0; i < n; i++) {
    const s = S[i], a = V[i], b = V[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(L > 1e-6)) return { error: "a side of the outline vanishes when pulled in" };
    const r0 = R(s);
    if (r0 === Infinity) { outB.push(0); continue; }
    const r = s.k > 0 ? r0 + c : r0 - c; // (a bow to the left is away from the inside)
    if (!(r > L / 2 + 1e-9)) return { error: "the chamfer is too big for the curves of the outline" };
    outB.push(Math.sign(s.k) * (r - Math.sqrt(r * r - L * L / 4)) / L);
  }
  return { points: V, bulges: outB };
}
const sample = (points, bulges, per = 12) => {
  const out = [], n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n], k = bulges[i] ?? 0;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    for (let j = 0; j < per; j++) {
      const t = j / per;
      let x = a[0] + dx * t, y = a[1] + dy * t;
      if (Math.abs(k) > 1e-9) { const s = k * L, r = ((L / 2) ** 2 + s * s) / (2 * Math.abs(s)); const mx = (a[0] + b[0]) / 2 - dy * k, my = (a[1] + b[1]) / 2 + dx * k; // the middle of the arc
        const ctr = [(a[0] + b[0]) / 2 + (dy / L) * (Math.sign(k)) * (r - Math.abs(s)) * 1, (a[1] + b[1]) / 2 - (dx / L) * Math.sign(k) * (r - Math.abs(s))];
        const a0 = Math.atan2(a[1] - ctr[1], a[0] - ctr[0]), m0 = Math.atan2(my - ctr[1], mx - ctr[0]), b0 = Math.atan2(b[1] - ctr[1], b[0] - ctr[0]);
        const wrap = (v) => Math.atan2(Math.sin(v), Math.cos(v));
        const half = wrap(m0 - a0), full = wrap(b0 - a0) ; const sweep = Math.sign(half) * Math.abs(2 * half); // (twice the angle to the middle, with the sign of the way)
        const th = a0 + sweep * t; x = ctr[0] + r * Math.cos(th); y = ctr[1] + r * Math.sin(th); void full; }
      out.push([x, y]);
    }
  }
  return out;
};
const area = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + (q[0] * r[1] - r[0] * q[1]) / 2; }, 0);
if (process.argv[1].endsWith("inset.mjs")) {
  const Z = Number(process.env.Z ?? 30), C = Number(process.env.C ?? 0.5), M = Number(process.env.M ?? 2);
  const r = wheelSections({ teeth: Z, module: M, wheel: { starts: 1, diameter: 10 * M, width: 4.8 * M, land: 0 } });
  if (!r.ok) throw new Error(r.error);
  for (const sec of [r.value[0], r.value[2]]) {
    const o = inset(sec.points, sec.bulges, C);
    if (o.error) { console.log("h", sec.h.toFixed(2), o.error); continue; }
    const full = sample(sec.points, sec.bulges), ins = sample(o.points, o.bulges);
    let worst = 0;
    for (const q of ins) { let d = Infinity; for (const p of full) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); worst = Math.max(worst, Math.abs(d - C)); }
    console.log(`teeth ${Z} module ${M} chamfer ${C} at h ${sec.h.toFixed(2)}: ${sec.points.length} sides, area ${area(full.map((p) => p)).toFixed(1)} -> ${area(ins).toFixed(1)} (expected about ${(area(full) - C * perimeterOf(full)).toFixed(1)}), the inset is ${worst.toFixed(4)} off c at worst`);
  }
}
function perimeterOf(p) { return p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0); }
