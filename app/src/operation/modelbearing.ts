// A ball bearing as a model (`dec_gear_models`): an inner and an outer race, each turned with a round groove, and the balls between them, every ball a body of its own, free in its groove (the room round it is the number
// the person sets: `prin_manufacture_agnostic`). Pure: numbers in, steps out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import { Builder } from "./modelparts.ts";
import type { Place, ModelBuild } from "./modelparts.ts";
import { bulgeOf } from "./arcs.ts";

export interface BearingSpec {
  /** the bore, the outside diameter and the width (mm) */ bore: number; outer: number; width: number;
  /** the balls and the diameter of one (mm) */ balls: number; ball: number;
  /** the room between a ball and its groove all round (mm) */ gap: number;
}
/** a 608 skate bearing: 8 by 22 by 7 mm, seven 4 mm balls (the balls' diameter is the one printed here, not a catalogue's) */
export const BEARING_START: BearingSpec = { bore: 8, outer: 22, width: 7, balls: 7, ball: 4, gap: 0.3 };
const SHOULDER = 0.4; // (how far a ball stands out of the race's surface, as a fraction of its radius, on each side)
const WALL = 0.8; // (the least wall under a groove and on a shoulder, mm)

/** the geometry of the races from the numbers */
export function bearingGeometry(s: BearingSpec): { pitch: number; rb: number; rg: number; inner: number; outerR: number; half: number } {
  const pitch = (s.bore + s.outer) / 4, rb = s.ball / 2, rg = rb + s.gap;
  const surface = SHOULDER * rb; // (a race's surface is this far from the ball's centre circle)
  return { pitch, rb, rg, inner: pitch - surface, outerR: pitch + surface, half: Math.sqrt(Math.max(0, rg * rg - surface * surface)) };
}

/** Why the numbers make no bearing, or null */
export function bearingProblem(s: BearingSpec): string | null {
  if (![s.bore, s.outer, s.width, s.balls, s.ball, s.gap].every(Number.isFinite)) return "every number must be a number";
  if (s.bore <= 0 || s.ball <= 0 || s.width <= 0 || s.gap < 0) return "the sizes must be more than 0, the room 0 or more";
  if (!Number.isInteger(s.balls) || s.balls < 3) return "a bearing needs 3 or more balls";
  if (s.outer <= s.bore) return "the outside diameter must be more than the bore";
  const g = bearingGeometry(s);
  if (g.pitch - g.rg - s.bore / 2 < WALL) return `the inner race is too thin under its groove (${(g.pitch - g.rg - s.bore / 2).toFixed(2)} mm, ${WALL} at least): a smaller ball or a bigger outside diameter`;
  if (s.outer / 2 - (g.pitch + g.rg) < WALL) return `the outer race is too thin over its groove (${(s.outer / 2 - g.pitch - g.rg).toFixed(2)} mm, ${WALL} at least): a smaller ball or a bigger outside diameter`;
  if (s.width / 2 - g.half < WALL) return `the groove is too wide for ${s.width} mm: ${(s.width / 2 - g.half).toFixed(2)} mm of shoulder, ${WALL} at least`;
  if (s.balls * s.ball * 1.05 > 2 * Math.PI * g.pitch) return `${s.balls} balls of ${s.ball} mm do not fit round the ring of balls (${(2 * Math.PI * g.pitch).toFixed(1)} mm long)`;
  return null;
}

/** The steps that make the bearing: the inner race, the outer race, and each ball (the problem, if the numbers make none) */
export function bearingSteps(s: BearingSpec, place?: Place): Result<ModelBuild> {
  const bad = bearingProblem(s);
  if (bad) return err(bad);
  const { pitch, rb, rg, inner, outerR, half } = bearingGeometry(s);
  const B = s.width, zm = B / 2, b = new Builder(place);
  const side = b.frame([0, 0, 0], [1, 0, 0], [0, 0, 1]); // (the section across the bearing: x out from the axis, y up it)
  const up: [number, number, number] = [0, 0, 1];
  b.part("Inner race");
  // the inner race: its section a rectangle with the groove cut into the outside, a circular arc about the middle of a ball
  {
    const a: [number, number] = [inner, zm - half], c: [number, number] = [inner, zm + half], via: [number, number] = [pitch - rg, zm];
    b.turn(side, [[s.bore / 2, 0], [inner, 0], a, c, [inner, B], [s.bore / 2, B]], [0, 0, bulgeOf(a, via, c), 0, 0, 0], [0, 0, 0], up);
  }
  // the outer race: the groove cut into its inside
  b.part("Outer race");
  {
    const a: [number, number] = [outerR, zm + half], c: [number, number] = [outerR, zm - half], via: [number, number] = [pitch + rg, zm];
    b.turn(side, [[outerR, 0], [s.outer / 2, 0], [s.outer / 2, B], [outerR, B], a, c], [0, 0, 0, 0, bulgeOf(a, via, c), 0], [0, 0, 0], up);
  }
  // the balls: a half disc turned about its diameter, on a plane through the axis
  for (let k = 0; k < s.balls; k++) {
    b.part(`Ball ${k + 1}`);
    const t = (2 * Math.PI * k) / s.balls, [cs, sn] = [Math.cos(t), Math.sin(t)];
    const pl = b.frame([0, 0, 0], [cs, sn, 0], [0, 0, 1]);
    const lo: [number, number] = [pitch, zm - rb], hi: [number, number] = [pitch, zm + rb];
    b.turn(pl, [lo, [pitch, zm], hi], [0, 0, bulgeOf(hi, [pitch + rb, zm], lo)], [pitch * cs, pitch * sn, 0], up);
  }
  return ok(b.build());
}
