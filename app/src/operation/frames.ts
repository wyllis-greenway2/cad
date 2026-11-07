// The body's frame (`in_204`): the moves and turns of the whole body are steps after the extrude that made it; the sketch that made it is carried along with each of them (so it stays attached to the body),
// and the extrude reads the sketch back through the motions that came after it, since the step list moves the body again by itself. Pure: numbers in, numbers out.
import type { Vec3 } from "../math/vec.ts";
import { about, then } from "../math/rotation.ts";
import type { Mat3 } from "../math/rotation.ts";
import type { Step } from "./scene.ts";

/** A rigid motion: a point goes to `turn * point + shift`. */
export interface Rigid { turn: Mat3; shift: Vec3 }
export const NONE: Rigid = { turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [0, 0, 0] };

const mul = (m: Mat3, v: Vec3): Vec3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const applyPoint = (r: Rigid, p: Vec3): Vec3 => { const q = mul(r.turn, p); return [q[0] + r.shift[0], q[1] + r.shift[1], q[2] + r.shift[2]]; };
export const applyDir = (r: Rigid, d: Vec3): Vec3 => mul(r.turn, d);
/** a, then b. */
const compose = (a: Rigid, b: Rigid): Rigid => ({ turn: then(a.turn, b.turn), shift: applyPoint(b, a.shift) });
export const inverse = (r: Rigid): Rigid => { const t = transpose(r.turn); const s = mul(t, r.shift); return { turn: t, shift: [-s[0], -s[1], -s[2]] }; };

/** The motion one step of the whole body makes, when the sketches were carried along with it (`follow`), else null (older steps, and anything that is not a move or a turn). */
function stepMotion(st: Step): Rigid | null {
  if ((st.type !== "move" && st.type !== "rotate") || Number(st.params.follow) !== 1) return null;
  const axis = Number(st.params.axis ?? 0) as 0 | 1 | 2;
  const v = Number(st.params.value ?? 0);
  if (st.type === "move") { const d: [number, number, number] = [0, 0, 0]; d[axis] = v; return { turn: NONE.turn, shift: d }; }
  if (st.params.px === undefined) return null; // (a turn about the middle of the body, which was not recorded)
  const pivot: Vec3 = [Number(st.params.px), Number(st.params.py), Number(st.params.pz)];
  const turn = about(axis, v);
  const moved = mul(turn, pivot);
  return { turn, shift: [pivot[0] - moved[0], pivot[1] - moved[1], pivot[2] - moved[2]] };
}

/** What the later steps of the whole body do to something made at step `index`: all their motions, one after another. */
export function laterMotion(steps: readonly Step[], index: number): Rigid {
  let m = NONE;
  for (let i = index + 1; i < steps.length; i++) { const s = stepMotion(steps[i]!); if (s) m = compose(m, s); }
  return m;
}
