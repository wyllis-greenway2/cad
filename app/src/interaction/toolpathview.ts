// The toolpath as lines to draw (`in_570`, `dec_manufacturing_contract` point 7): the shared preview of every route. A toolpath is flattened once into short segments in the world (its frame applied, arcs cut into steps), and a
// position along it (0 to 1, by the length travelled) says how much is done and how much is still to come, and where the head is. Pure: no three.js.
import type { Toolpath, Point3, Move } from "../manufacturing/index.ts";

/** Flat pairs of points (a, b, a, b, ...) of the segments of one kind of line, in the world. */
export interface ToolpathView {
  /** by the layer a cut was on ("cut", "score", "engrave"...) or "travel" for a move with the beam off */
  done: Record<string, number[]>;
  rest: Record<string, number[]>;
  /** where the head is now; null for an empty toolpath */
  head: Point3 | null;
}
interface Seg { a: Point3; b: Point3; layer: string; len: number }

const cache = new WeakMap<Toolpath, { segs: Seg[]; total: number }>();
const STEP = Math.PI / 36; // an arc is drawn in steps of five degrees

function flatten(tp: Toolpath): { segs: Seg[]; total: number } {
  const hit = cache.get(tp);
  if (hit) return hit;
  const f = tp.frame;
  const yDir = f ? ([f.normal[1] * f.xDir[2] - f.normal[2] * f.xDir[1], f.normal[2] * f.xDir[0] - f.normal[0] * f.xDir[2], f.normal[0] * f.xDir[1] - f.normal[1] * f.xDir[0]] as const) : null;
  const world = (p: readonly [number, number, number]): Point3 => (f && yDir ? [0, 1, 2].map((i) => f.origin[i]! + p[0] * f.xDir[i]! + p[1] * yDir[i]! + p[2] * f.normal[i]!) as unknown as Point3 : [p[0], p[1], p[2]]);
  const segs: Seg[] = [];
  let at: readonly [number, number, number] | null = null;
  const add = (to: readonly [number, number, number], layer: string): void => {
    if (at) { const [a, b] = [world(at), world(to)]; segs.push({ a, b, layer, len: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) }); }
    at = to;
  };
  for (const op of tp.operations) {
    for (const m of op.moves as readonly Move[]) {
      if (m.op === "travel") add(m.to, "travel");
      else if (m.op === "cut" || m.op === "extrude") add(m.to, op.layer);
      else if (m.op === "drill") { add(m.to, "travel"); add([m.to[0], m.to[1], m.to[2] - m.depth], op.layer); }
      else if (m.op === "arc" && at) {
        const [a0, a1] = [Math.atan2(at[1] - m.center[1], at[0] - m.center[0]), Math.atan2(m.to[1] - m.center[1], m.to[0] - m.center[0])];
        const r = Math.hypot(at[0] - m.center[0], at[1] - m.center[1]);
        const TAU = Math.PI * 2;
        let sweep = m.clockwise ? -((((a0 - a1) % TAU) + TAU) % TAU) : (((a1 - a0) % TAU) + TAU) % TAU;
        if (Math.abs(sweep) < 1e-9) sweep = m.clockwise ? -TAU : TAU; // (a whole circle)
        const n = Math.max(2, Math.ceil(Math.abs(sweep) / STEP));
        const z0 = at[2];
        for (let i = 1; i <= n; i++) {
          const a = a0 + (sweep * i) / n;
          add(i === n ? m.to : [m.center[0] + r * Math.cos(a), m.center[1] + r * Math.sin(a), z0 + ((m.to[2] - z0) * i) / n], op.layer);
        }
      } else if (m.op === "arc") add(m.to, op.layer);
    }
  }
  const out = { segs, total: segs.reduce((n, s) => n + s.len, 0) };
  cache.set(tp, out);
  return out;
}

/** How much of the toolpath is done at position `t` (0 to 1 of the length of all the moves, travel too), the rest, and where the head is. */
export function viewOf(tp: Toolpath, t: number): ToolpathView {
  const { segs, total } = flatten(tp);
  const done: Record<string, number[]> = {}, rest: Record<string, number[]> = {};
  const target = Math.min(1, Math.max(0, t)) * total;
  let run = 0;
  let head: Point3 | null = segs[0]?.a ?? null;
  const push = (into: Record<string, number[]>, layer: string, a: Point3, b: Point3): void => { (into[layer] ??= []).push(...a, ...b); };
  for (const s of segs) {
    if (run + s.len <= target + 1e-9) { push(done, s.layer, s.a, s.b); head = s.b; }
    else if (run >= target) push(rest, s.layer, s.a, s.b);
    else { // the segment the head is on: split
      const f = (target - run) / s.len;
      const mid: Point3 = [s.a[0] + (s.b[0] - s.a[0]) * f, s.a[1] + (s.b[1] - s.a[1]) * f, s.a[2] + (s.b[2] - s.a[2]) * f];
      push(done, s.layer, s.a, mid); push(rest, s.layer, mid, s.b); head = mid;
    }
    run += s.len;
  }
  return { done, rest, head };
}
