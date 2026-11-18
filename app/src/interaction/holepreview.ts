// The preview of the holes a Fastener Holes panel would cut (`dec_parts_tool`, `in_847`): drawn in the model view from numbers, with no kernel, so it follows every change of a setting and of the selection. For each hole its outline: the
// section of the receiver turned to four sides, and a ring for each step of it (the hole, the countersink, the counterbore), and for a nut pocket the hexagon at the face and at its floor. As lines in the same form as a toolpath's, so the
// view's toolpath overlay draws it. Pure: a plan in, lines out.
import type { Vec3 } from "../math/vec.ts";
import type { ReceiverPlan } from "./addpart.ts";
import type { ToolpathView } from "./toolpathview.ts";
import { receiverProfile, hexagon, nutTrap } from "../operation/fasteners.ts";

const RING = 32; // (a ring is drawn in this many steps)
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const at = (c: Vec3, e1: Vec3, e2: Vec3, n: Vec3, x: number, y: number, h: number): Vec3 => [c[0] + e1[0] * x + e2[0] * y + n[0] * h, c[1] + e1[1] * x + e2[1] * y + n[1] * h, c[2] + e1[2] * x + e2[2] * y + n[2] * h];

/** The lines of the holes of a plan: pairs of points as flat numbers (ax, ay, az, bx, by, bz, ...). */
export function holeLines(plan: ReceiverPlan): number[] {
  const { spot, kind, size, fit } = plan;
  const e1 = unit(spot.u);
  const n = unit(cross(spot.u, spot.v)); // (out of the body)
  const e2 = cross(n, e1);
  const depth = Math.max(0.1, Math.min(plan.depth, plan.reach)); // (a hole right through is drawn to the far side of the body)
  // the profile as the cut makes it, from the face down: the half a millimetre the cut starts above the face is not drawn
  const prof = receiverProfile(kind, size, fit, depth, plan.engagement).map(([x, y]) => [x, Math.min(y, 0)] as const);
  const out: number[] = [];
  const seg = (a: Vec3, b: Vec3): void => { out.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  const rings = new Set<string>();
  for (const c of plan.places) {
    // the section, on four sides
    for (const [s1, s2] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const dir1: Vec3 = [e1[0] * s1 + e2[0] * s2, e1[1] * s1 + e2[1] * s2, e1[2] * s1 + e2[2] * s2];
      for (let i = 0; i + 1 < prof.length; i++) {
        const [a, b] = [prof[i]!, prof[i + 1]!];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        seg([c[0] + dir1[0] * a[0] + n[0] * a[1], c[1] + dir1[1] * a[0] + n[1] * a[1], c[2] + dir1[2] * a[0] + n[2] * a[1]], [c[0] + dir1[0] * b[0] + n[0] * b[1], c[1] + dir1[1] * b[0] + n[1] * b[1], c[2] + dir1[2] * b[0] + n[2] * b[1]]);
      }
    }
    // a ring for each radius and height the profile steps to
    rings.clear();
    for (const [x, y] of prof) {
      if (x < 1e-9) continue;
      const k = `${Math.round(x * 1e4)}|${Math.round(y * 1e4)}`;
      if (rings.has(k)) continue;
      rings.add(k);
      for (let i = 0; i < RING; i++) {
        const [a0, a1] = [(i / RING) * 2 * Math.PI, ((i + 1) / RING) * 2 * Math.PI];
        seg(at(c, e1, e2, n, x * Math.cos(a0), x * Math.sin(a0), y), at(c, e1, e2, n, x * Math.cos(a1), x * Math.sin(a1), y));
      }
    }
    if (kind === "nutPocket") { // the pocket's hexagon at the face and at its floor, and its corners joined
      const trap = nutTrap(size);
      const hex = hexagon(trap.acrossFlats);
      for (const h of [0, -trap.depth]) for (let i = 0; i < hex.length; i++) { const [p, q] = [hex[i]!, hex[(i + 1) % hex.length]!]; seg(at(c, e1, e2, n, p[0], p[1], h), at(c, e1, e2, n, q[0], q[1], h)); }
      for (const p of hex) seg(at(c, e1, e2, n, p[0], p[1], 0), at(c, e1, e2, n, p[0], p[1], -trap.depth));
    }
  }
  return out;
}
/** The path the holes follow as a dashed line (a dash and a gap by turns along the polyline), flat pairs of points; empty when there is no path. */
export function guideLines(guide: readonly Vec3[], dash = 4, gap = 3): number[] {
  const out: number[] = [];
  let on = true;
  let left = dash;
  for (let i = 0; i + 1 < guide.length; i++) {
    let a = guide[i]!;
    const b = guide[i + 1]!;
    let len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    while (len > 1e-9) {
      const step = Math.min(left, len);
      const k = step / len;
      const m: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      if (on) out.push(a[0], a[1], a[2], m[0], m[1], m[2]);
      a = m; len -= step; left -= step;
      if (left <= 1e-9) { on = !on; left = on ? dash : gap; }
    }
  }
  return out;
}
/** The holes as the view's overlay (the same form as a toolpath's lines: the holes in the cut colour, the path they follow dashed and pale), or null for a plan with no place. */
export function holesView(plan: ReceiverPlan): ToolpathView | null {
  if (!plan.places.length) return null;
  return { done: { cut: holeLines(plan), ...(plan.guide.length ? { travel: guideLines(plan.guide) } : {}) }, rest: {}, head: null, stock: [] };
}
