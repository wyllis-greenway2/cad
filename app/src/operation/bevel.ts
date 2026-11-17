// A straight bevel gear (`dec_bevel_gears`, `in_735`): an APPROXIMATION of the standard tooth, marked as such everywhere it is shown. Pure maths; the parts and steps are `bevelscene.ts`'s.
// The tooth is the Tredgold back cone tooth (the shape the prototype `prototypes/bevel-pair` measured to fit): an involute spur tooth of the equivalent gear (z / cos delta teeth, the module, the pressure angle) developed on the back cone,
// carried round the axis (angle / cos delta) and projected through the pitch cone's apex onto a plane across the axis; the small end is the same outline scaled toward the apex, so the faces are ruled by lines through the apex.
// NOT the octoid or spherical involute form of ISO 23509 / AGMA 2005 (those standards were not available: `q_bevel_gears`). Proportions: KHK-USA, Gear Solutions, July 2019 (wheel ha = 0.54 m + 0.46 m / uv, pinion 2 m less that,
// whole depth 2.188 m, face at most R / 3), the pitch angle and cone distance from the same article; backlash is the tooth made thinner by `backlash` mm on the pitch circle at the big end (the normal backlash of ISO / AGMA at the outer end).
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearSpec } from "./gear.ts";
import type { Vec3 } from "../math/vec.ts";
import { bulgeOf } from "./arcs.ts";
import type { P } from "./arcs.ts";

/** a bevel gear: the teeth of the gear it meshes with, the angle between the shafts (degrees, 90 if none) and the face width as a fraction of the cone distance (a third if none) */
export interface BevelSpec {
  mate: number; shaft?: number; face?: number;
  /** a partner that stands across its mate's axis (`meshBevel`): its own first and second directions (unit vectors, the plane of the big end, its normal their cross product, along the axis towards the apex) in place of the plane's; none for a gear on its plane */
  frame?: [Vec3, Vec3];
  /** the gear it was made to mesh with (and, for that gear, this one): editing the teeth of either puts the other right again (`in_776`) */
  with?: string;
  /** a partner: the direction it stands in from the gear it meshes with, radians from that gear's first direction (what the mesh was made with, so it can be made again) */
  dir?: number;
}
export interface BevelGeometry {
  /** the pitch cone's half angle, radians */ delta: number;
  /** the cone distance, mm */ R: number;
  /** the face width along the cone, mm */ face: number;
  /** the distance from the apex to the big end's plane, along the axis, and to the small end's */ big: number; small: number;
  /** the small end's scale about the axis */ k: number;
  pitchRadius: number; tipRadius: number; rootRadius: number;
  /** the addendum and dedendum at the big end, mm */ addendum: number; dedendum: number;
  /** the teeth of the equivalent spur gear */ zv: number;
}
const inv = (a: number) => Math.tan(a) - a;
/** The number of the sides of a flank (the outline is straight sides: a tooth is about 2 sides x this + 3). */
const PER_FLANK = 4; // (a flank is two arcs, through five points of the tooth)

/** The pitch angle of a gear of `z` teeth meshing with one of `mate` teeth, the shafts `shaftDeg` apart: tan delta = sin S / (mate / z + cos S). */
export const pitchAngle = (z: number, mate: number, shaftDeg = 90): number => { const s = (shaftDeg * Math.PI) / 180; return Math.atan2(Math.sin(s), mate / z + Math.cos(s)); };

/** The numbers that follow from a bevel gear's spec, or why there is no gear. */
export function bevelOf(spec: GearSpec): Result<BevelGeometry> {
  const b = spec.bevel;
  if (!b) return err("not a bevel gear");
  const z = Math.round(spec.teeth), mate = Math.round(b.mate), m = spec.module, shaft = b.shaft ?? 90;
  if (!Number.isFinite(z) || z < 6 || z > 200) return err("a bevel gear needs 6 to 200 teeth");
  if (!Number.isFinite(mate) || mate < 6 || mate > 200) return err("the gear it meshes with needs 6 to 200 teeth");
  if (!Number.isFinite(m) || m <= 0) return err("the module must be above zero");
  if (!(shaft >= 30 && shaft <= 150)) return err("the angle between the shafts must be from 30 to 150 degrees");
  const face = b.face ?? 1 / 3;
  if (!(face >= 0.1 && face <= 0.5)) return err("the face width must be from 0.1 to 0.5 of the cone distance (a third is usual)");
  const alpha = ((spec.pressure ?? 20) * Math.PI) / 180;
  if (!(alpha > 0 && alpha < (35 * Math.PI) / 180)) return err("the pressure angle must be between 0 and 35 degrees");
  const delta = pitchAngle(z, mate, shaft);
  const deltaMate = (shaft * Math.PI) / 180 - delta;
  const R = (m * z) / (2 * Math.sin(delta));
  const zv = z / Math.cos(delta), zvMate = mate / Math.cos(deltaMate);
  const wheel = z >= mate;
  const uv = wheel ? zv / zvMate : zvMate / zv; // (the equivalent teeth of the wheel over the pinion's, at least 1)
  const haWheel = 0.54 * m + (0.46 * m) / uv;
  const addendum = wheel ? haWheel : 2 * m - haWheel;
  const dedendum = 2.188 * m - addendum;
  const pitchRadius = R * Math.sin(delta);
  const faceMm = R * face;
  const big = R * Math.cos(delta);
  const g: BevelGeometry = { delta, R, face: faceMm, big, small: big * (1 - face), k: 1 - face, pitchRadius, tipRadius: pitchRadius + addendum * Math.cos(delta), rootRadius: pitchRadius - dedendum * Math.cos(delta), addendum, dedendum, zv };
  if (!(g.rootRadius > 0.5)) return err("the root is on the axis: more teeth or a smaller module");
  return ok(g);
}

/**
 * The tooth outline as points of the back cone before they are put on a plane: for each, its distance `x` from the apex along the axis, its radius `r` from the axis and its angle `th` (counter-clockwise, the first tooth
 * centred on angle 0). The pitch point is at x = R cos delta, r = R sin delta.
 */
export function bevelRaw(spec: GearSpec): Result<{ x: number; r: number; th: number; /** the first point of a flank: the five points from here are two arcs */ flank?: true }[]> {
  const g = bevelOf(spec);
  if (!g.ok) return g;
  const { delta, R, addendum, dedendum, zv } = g.value;
  const m = spec.module, alpha = ((spec.pressure ?? 20) * Math.PI) / 180, z = Math.round(spec.teeth);
  const cd = Math.cos(delta);
  const Rb = (m * zv) / 2; // (the pitch radius of the equivalent gear on the back cone)
  const tipV = Rb + addendum, rootV = Rb - dedendum, baseV = Rb * Math.cos(alpha);
  if (!(rootV > 0)) return err("the root is on the axis: more teeth or a smaller module");
  const half0 = Math.max(1e-6, (m * (Math.PI / 2)) - (spec.backlash ?? 0)) / 2 / Rb; // (half the tooth thickness on the pitch circle, as an angle)
  const halfAt = (rho: number) => half0 + inv(alpha) - inv(Math.acos(Math.min(1, baseV / rho)));
  if (!(halfAt(tipV) > 0.002)) return err("the teeth come to a point at their tips: more teeth or a smaller pressure angle");
  const pitchV = (2 * Math.PI) / zv;
  const to = (rho: number, phi: number) => ({ x: R / cd - rho * Math.sin(delta), r: rho * cd, th: phi / cd }); // (a point of the developed gear on the back cone)
  const lo = Math.max(baseV, rootV);
  const pts: { x: number; r: number; th: number; flank?: true }[] = [];
  for (let k = 0; k < z; k++) {
    const c = k * pitchV;
    const flank = (side: 1 | -1) => Array.from({ length: PER_FLANK + 1 }, (_, i) => { const rho = lo + ((tipV - lo) * i) / PER_FLANK; return to(rho, c + side * halfAt(rho)); });
    const right = flank(-1), left = flank(1);
    if (rootV < baseV) pts.push(to(rootV, c - halfAt(baseV)));
    pts.push(...right.map((q, i) => (i === 0 ? { ...q, flank: true as const } : q)), ...left.reverse().map((q, i) => (i === 0 ? { ...q, flank: true as const } : q)));
    if (rootV < baseV) pts.push(to(rootV, c + halfAt(baseV)));
    pts.push(to(rootV, c + pitchV / 2)); // (the root between this tooth and the next)
  }
  // the teeth are spread over z / cos(delta) pitches of the developed gear: the last gap ends where the first tooth starts (z pitches of 2 pi cos(delta) / z each, divided by cos(delta): a whole turn)
  return ok(pts);
}

/** The outline as it is on the plane across the axis through the pitch point (x = R cos delta): each point of the back cone carried along its ray through the apex onto it. Polar points (radius, angle). */
function bevelPolar(spec: GearSpec): Result<[number, number][]> {
  const raw = bevelRaw(spec), g = bevelOf(spec);
  if (!raw.ok) return raw;
  if (!g.ok) return g;
  const Rcd = g.value.big;
  return ok(raw.value.map((q): [number, number] => [(q.r * Rcd) / q.x, q.th]));
}

/** The outline in the plane's x and y (counter-clockwise, the first tooth along +x) as corners and, for each side, how far its middle stands out (a flank is two arcs): what `gear.ts` gives for the gear. */
export function bevelPoints(spec: GearSpec): Result<{ points: [number, number][]; bulges: number[]; geometry: BevelGeometry }> {
  const g = bevelOf(spec), raw = bevelRaw(spec), polar = bevelPolar(spec);
  if (!g.ok) return g;
  if (!raw.ok) return raw;
  if (!polar.ok) return polar;
  const xy = polar.value.map(([r, th]): P => [r * Math.cos(th), r * Math.sin(th)]);
  const points: [number, number][] = [], bulges: number[] = [];
  for (let i = 0; i < xy.length; i++) {
    if (raw.value[i]!.flank) { // five points: two arcs, through (0, 1, 2) and (2, 3, 4)
      points.push(xy[i]!, xy[i + 2]!);
      bulges.push(bulgeOf(xy[i]!, xy[i + 1]!, xy[i + 2]!), bulgeOf(xy[i + 2]!, xy[i + 3]!, xy[i + 4]!));
      i += 3; // (the loop adds one: the last point of the flank starts the next side)
    } else { points.push(xy[i]!); bulges.push(0); }
  }
  return ok({ points, bulges, geometry: g.value });
}

/**
 * How the body of a bevel gear is made (`in_776`): the real ends of a bevel gear are cones (the back cones, square to the pitch cone), not planes across the axis, and a plane section of the tooth is taller than the tooth by 1 / cos delta
 * or more (the teeth looked longer the more teeth the gear had). So the body is a prism of the tooth cones, long enough to hold the whole tooth (a ruled loft between two sections through the apex's rays: the outline of the pitch
 * plane scaled by `x / (R cos delta)` at the plane `x` from the apex), cut down to a blank: a revolved shape bounded by the heel's back cone (through the point `x0 = R / cos delta` of the axis, slope tan delta), the toe's (the heel's
 * scaled by the face) and, inside the roots, flat discs for a hub. The two are intersected (`combine`). Coordinates of the blank are (radius a, height h along the axis towards the apex from the plane of the pitch point), counter-clockwise.
 */
export interface BevelLayout { geometry: BevelGeometry; /** the heel section: height and the scale of the outline */ heel: { h: number; scale: number }; toe: { h: number; scale: number }; blank: [number, number][] }
export function bevelLayout(spec: GearSpec): Result<BevelLayout> {
  const g = bevelOf(spec), polar = bevelPolar(spec);
  if (!g.ok) return g;
  if (!polar.ok) return polar;
  const { delta, big: Rcd, k, R, addendum, dedendum } = g.value;
  const m = spec.module, sd = Math.sin(delta), s = Math.tan(delta), x0 = R / Math.cos(delta);
  const xB = Rcd + dedendum * sd + m, xS = k * (Rcd - addendum * sd - 0.5 * m);
  if (!(xS > 0.1 * Rcd * k)) return err("the cone is too flat for this module and teeth: a smaller module or more teeth");
  const rmax = 1.1 * Math.max(...polar.value.map((q) => q[0])) * (xB / Rcd) + m;
  const xFar = xB + 0.25 * m;
  const rA = (x0 - xFar) / s;
  if (!(rA > 0.5)) return err("the heel cone is too flat for this module and teeth: more teeth or a smaller module");
  const L = (r: number) => x0 - s * r, Lk = (r: number) => k * x0 - s * r;
  // the hub's front: flat inside the radius `rT` (inside the roots), a hub two modules thick if the toe's cone allows it, else as thick as it can be
  const rootK = k * g.value.rootRadius;
  const rFor = (x: number) => (k * x0 - x) / s;
  const rT = Math.min(0.97 * rootK, Math.max(0.8 * rootK, rFor(xFar - 2 * m)));
  if (!(Lk(rT) < xFar - 0.3 * m && Lk(rT) > xS)) return err("the hub does not fit between the cones for this module and teeth");
  const xy: [number, number][] = [[xFar, 0], [xFar, rA], [L(rmax), rmax], [Lk(rmax), rmax], [Lk(rT), rT], [Lk(rT), 0]];
  let blank = xy.map(([x, r]): [number, number] => [r, Rcd - x]);
  const area = blank.reduce((acc, p, i) => { const q = blank[(i + 1) % blank.length]!; return acc + (p[0] * q[1] - q[0] * p[1]); }, 0);
  if (area < 0) blank = blank.slice().reverse();
  return ok({ geometry: g.value, heel: { h: Rcd - xB, scale: xB / Rcd }, toe: { h: Rcd - xS, scale: xS / Rcd }, blank });
}

/** The frame of a bevel gear turned by `turn` (radians) about its axis: X and Y in the plane of its big end (tooth 0 along X) and n along the axis towards the apex, on the plane with directions `u` and `v` unless the gear stands across (`BevelSpec.frame`). */
export function bevelFrame(u: Vec3, v: Vec3, spec: GearSpec, turn: number): { X: Vec3; Y: Vec3; n: Vec3 } {
  const [b0, b1] = spec.bevel?.frame ?? [u, v];
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const X: Vec3 = [b0[0] * c + b1[0] * s, b0[1] * c + b1[1] * s, b0[2] * c + b1[2] * s];
  const Y: Vec3 = [-b0[0] * s + b1[0] * c, -b0[1] * s + b1[1] * c, -b0[2] * s + b1[2] * c];
  const n: Vec3 = [b0[1] * b1[2] - b0[2] * b1[1], b0[2] * b1[0] - b0[0] * b1[2], b0[0] * b1[1] - b0[1] * b1[0]];
  const len = Math.hypot(...n) || 1;
  return { X, Y, n: [n[0] / len, n[1] / len, n[2] / len] };
}
