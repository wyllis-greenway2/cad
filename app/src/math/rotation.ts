// Turning in space, as three angles about the world axes: the body's turn is the product of the turns made about X, Y and Z one after another, and it is shown (and set) as the three angles
// that give the same turn when applied X first, then Y, then Z. Pure: numbers in, numbers out. Angles are degrees, right-handed.
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]; // row-major
export type Angles = [number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** The turn by `angle` degrees about the world axis `axis` (0 X, 1 Y, 2 Z). */
export function about(axis: 0 | 1 | 2, angle: number): Mat3 {
  const [c, s] = [Math.cos(rad(angle)), Math.sin(rad(angle))];
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** a then b: the turn that does `a` first and `b` second. */
export function then(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(b[r * 3]! * a[c]! + b[r * 3 + 1]! * a[3 + c]! + b[r * 3 + 2]! * a[6 + c]!);
  return out as unknown as Mat3;
}
const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

/** The turn of three angles: X first, then Y, then Z. */
const fromAngles = ([x, y, z]: Angles): Mat3 => then(then(about(0, x), about(1, y)), about(2, z));

/** The three angles (X first, then Y, then Z) of a turn; zero for none. A turn that stands the Y axis on end (gimbal lock) is given with Z as 0. */
export function anglesOf(m: Mat3): Angles {
  const sy = Math.max(-1, Math.min(1, -m[6]));
  const y = Math.asin(sy);
  let x: number;
  let z: number;
  if (Math.abs(sy) < 1 - 1e-9) {
    x = Math.atan2(m[7], m[8]);
    z = Math.atan2(m[3], m[0]);
  } else {
    x = Math.atan2(-m[5], m[4]);
    z = 0;
  }
  const clean = (r: number) => Math.round(deg(r) * 1e6) / 1e6 + 0;
  return [clean(x), clean(y), clean(z)];
}

/** The turns that take the body from the way it is turned now (`now`) to the way the angles say (`target`): about X, then Y, then Z, in the world frame (those that are zero are left out). */
export function stepsBetween(now: Mat3, target: Angles): { axis: 0 | 1 | 2; angle: number }[] {
  const delta = then(transpose(now), fromAngles(target)); // first undo `now`, then do `target`: the turn that, done after `now`, gives `target`
  const [a, b, c] = anglesOf(delta);
  return ([[0, a], [1, b], [2, c]] as const).filter(([, v]) => Math.abs(v) > 1e-9).map(([axis, angle]) => ({ axis, angle }));
}
