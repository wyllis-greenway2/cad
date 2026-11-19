// A cycloidal drive as a model (`dec_gear_models`): a base plate with N ring pins, a disc with N - 1 lobes on an eccentric on the input shaft, and an output plate with pins that go through holes in the disc. One turn of the input turns the
// output 1 / (N - 1) of a turn the other way. The disc's outline is exact: the curve the ring pins' centres trace on the disc as it rolls (`R e^(it) - E e^(iNt)`), taken in by the pin's radius and the room. Pure: numbers in, steps out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { PartSteps } from "./fasteners.ts";
import { Builder, disc, outline } from "./modelparts.ts";

export interface CycloidalSpec {
  /** the ring pins (the disc has one lobe fewer) */ pins: number;
  /** the radius of the circle the ring pins stand on, the diameter of a pin and the eccentricity (mm) */ circle: number; pin: number; ecc: number;
  /** the room between the disc and the pins (mm): the disc's outline is taken in by it */ play: number;
  /** the disc's thickness (mm) */ disc: number;
  /** the output pins: how many, on what radius (mm) and their diameter (mm) */ outPins: number; outCircle: number; outPin: number;
  /** the input shaft's diameter and the eccentric's radius (mm) */ shaft: number; cam: number;
  /** the plates' thickness, and the room between the layers and the shaft's room in the plates (mm) */ plate: number; gap: number; room: number;
}
export const CYCLOIDAL_START: CycloidalSpec = { pins: 10, circle: 25, pin: 5, ecc: 1.5, play: 0.2, disc: 8, outPins: 6, outCircle: 13, outPin: 4, shaft: 7, cam: 6, plate: 4, gap: 0.5, room: 0.3 };
const PER_LOBE = 20; // (the points of the disc's outline for each lobe)

/** the disc's outline in its own frame (its centre at the origin), `n` points */
export function discOutline(s: Pick<CycloidalSpec, "pins" | "circle" | "pin" | "ecc" | "play">, n: number): [number, number][] {
  const { pins: N, circle: R, ecc: E } = s, r = s.pin / 2 + s.play;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    // the curve of the pins' centres: C(t) = R e^(it) - E e^(iNt); its tangent T(t) = i R e^(it) - i N E e^(iNt); the outline is C taken in by r along the normal that points in
    const [cx, cy] = [R * Math.cos(t) - E * Math.cos(N * t), R * Math.sin(t) - E * Math.sin(N * t)];
    const [tx, ty] = [-R * Math.sin(t) + N * E * Math.sin(N * t), R * Math.cos(t) - N * E * Math.cos(N * t)];
    const l = Math.hypot(tx, ty) || 1;
    pts.push([cx - (r * ty) / l, cy + (r * tx) / l]); // (in: the tangent turned a quarter turn to the left, for a curve that goes round counter-clockwise)
  }
  return pts;
}
/** the least radius of curvature of the pins' centre curve where it is convex, and the least radius of the outline about the disc's centre (for the checks) */
function shape(s: CycloidalSpec): { curvature: number; least: number } {
  const { pins: N, circle: R, ecc: E } = s;
  let worst = Infinity;
  for (let i = 0; i < 720; i++) {
    const t = (2 * Math.PI * i) / 720;
    const [tx, ty] = [-R * Math.sin(t) + N * E * Math.sin(N * t), R * Math.cos(t) - N * E * Math.cos(N * t)];
    const [ax, ay] = [-R * Math.cos(t) + N * N * E * Math.cos(N * t), -R * Math.sin(t) + N * N * E * Math.sin(N * t)];
    const k = (tx * ay - ty * ax) / Math.hypot(tx, ty) ** 3; // (positive where the curve bends towards its middle)
    if (k > 1e-9) worst = Math.min(worst, 1 / k);
  }
  const least = Math.min(...discOutline(s, 720).map(([x, y]) => Math.hypot(x, y)));
  return { curvature: worst, least };
}

/** Why the numbers make no cycloidal drive, or null */
export function cycloidalProblem(s: CycloidalSpec): string | null {
  if (!Object.values(s).every(Number.isFinite)) return "every number must be a number";
  if (!Number.isInteger(s.pins) || s.pins < 5 || s.pins > 60) return "the ring pins are from 5 to 60";
  if (!Number.isInteger(s.outPins) || s.outPins < 3) return "the output needs 3 or more pins";
  if (![s.circle, s.pin, s.ecc, s.disc, s.outCircle, s.outPin, s.shaft, s.cam, s.plate].every((v) => v > 0)) return "the sizes must be more than 0";
  if (s.play < 0 || s.gap < 0 || s.room < 0) return "the rooms must be 0 or more";
  if (s.circle <= s.ecc * s.pins) return `the eccentricity is too big for the pins' circle: it must be under ${(s.circle / s.pins).toFixed(2)} mm (the radius over the number of pins) or the outline loops`;
  const sh = shape(s);
  if (s.pin / 2 + s.play >= sh.curvature) return `the pins are too big for the disc's lobes: the curve bends to ${sh.curvature.toFixed(2)} mm radius, the pin and room need less than that`;
  if (s.circle - s.pin / 2 <= s.ecc * 4) return "the pins stand too close to the middle for this eccentricity";
  const hole = s.outPin / 2 + s.ecc + s.gap;
  if (s.cam < s.shaft / 2 + s.ecc + 1) return `the eccentric is too small for the shaft: its radius must be ${(s.shaft / 2 + s.ecc + 1).toFixed(1)} mm or more to hold the shaft and the eccentricity`;
  if (s.outCircle - hole < s.cam + s.gap + 1.2) return "the output pins' holes would run into the eccentric's hole: a bigger circle for the output pins";
  if (s.outCircle + hole + 1.2 > sh.least) return `the output pins' holes would run through the disc's edge: a smaller circle for the output pins (the disc is ${sh.least.toFixed(1)} mm from its middle at the least)`;
  return null;
}
/** the speed ratio of the drive: input over output (the output turns the other way) */
export const cycloidalRatio = (s: Pick<CycloidalSpec, "pins">): number => s.pins - 1;

/** The steps that make the drive (the problem, if the numbers make none) */
export function cycloidalSteps(s: CycloidalSpec): Result<PartSteps> {
  const bad = cycloidalProblem(s);
  if (bad) return err(bad);
  const b = new Builder();
  const [T, g, Dt] = [s.plate, s.gap, s.disc];
  const zDisc = T + g, zOut = T + 2 * g + Dt, zTop = zOut + s.plate;
  const rim = s.circle + s.pin / 2 + 4; // (the plates' radius)
  const shaftHole = s.shaft / 2 + s.room;
  const ring = Array.from({ length: s.pins }, (_, k): [number, number] => [s.circle * Math.cos((2 * Math.PI * k) / s.pins), s.circle * Math.sin((2 * Math.PI * k) / s.pins)]);
  // the base plate with the ring pins standing on it (one body)
  const p0 = b.plane(0);
  b.extrude(p0, disc(0, 0, rim), [disc(0, 0, shaftHole)], T, { also: ring.map(([x, y]) => ({ outer: disc(x, y, s.pin / 2), depth: zDisc + Dt })) });
  // the disc, its middle on the eccentric (E, 0), with the hole for the eccentric and the holes for the output pins
  const p1 = b.plane(zDisc);
  const holeR = s.outPin / 2 + s.ecc + s.gap;
  const holes = Array.from({ length: s.outPins }, (_, k) => disc(s.ecc + s.outCircle * Math.cos((2 * Math.PI * k) / s.outPins), s.outCircle * Math.sin((2 * Math.PI * k) / s.outPins), holeR));
  const n = PER_LOBE * (s.pins - 1);
  b.extrude(p1, outline(discOutline(s, n).map(([x, y]) => [x + s.ecc, y] as [number, number])), [disc(s.ecc, 0, s.cam + s.gap), ...holes], Dt);
  // the input shaft, from under the base plate to above the output plate, with the eccentric joined to it inside the disc
  b.extrude(p0, disc(0, 0, s.shaft / 2), [], zTop + 10);
  b.extrude(p1, disc(s.ecc, 0, s.cam), [], Dt, { mode: "add" });
  // the output plate, with its pins reaching down through the disc's holes
  const p2 = b.plane(zOut);
  const pinsOut = Array.from({ length: s.outPins }, (_, k): [number, number] => [s.outCircle * Math.cos((2 * Math.PI * k) / s.outPins), s.outCircle * Math.sin((2 * Math.PI * k) / s.outPins)]);
  b.extrude(p2, disc(0, 0, rim), [disc(0, 0, shaftHole)], s.plate, { also: pinsOut.map(([x, y]) => ({ outer: disc(x, y, s.outPin / 2), depth: -(Dt + g) })) });
  return ok(b.steps);
}
