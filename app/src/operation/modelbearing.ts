// A ball bearing as a model (`dec_gear_models`, `dec_bearing_library`): an inner and an outer race, each turned with a round groove, and the balls between them, every ball a body of its own, free in its groove (the room round it is the number
// the person sets: `prin_manufacture_agnostic`). Pure: numbers in, steps out.
import { Builder } from "./modelparts.ts";
import { bulgeOf } from "./arcs.ts";

/** The rings and balls of a ball bearing as parts of a build: the geometry is the ball circle (`pitch`), the ball's radius, the groove's radius, how far each ring's surface stands from the ball circle, and the width (mm) */
export interface BallRingShape { bore: number; outer: number; width: number; balls: number; pitch: number; rb: number; rg: number; surface: number; half: number; /** true: the grooves and the balls; false: two plain rings */ detail?: boolean }
export function bearingParts(b: Builder, g: BallRingShape): void {
  const { pitch, rb, rg } = g, inner = pitch - g.surface, outerR = pitch + g.surface, half = g.half, B = g.width, zm = B / 2;
  const side = b.frame([0, 0, 0], [1, 0, 0], [0, 0, 1]); // (the section across the bearing: x out from the axis, y up it)
  const up: [number, number, number] = [0, 0, 1];
  if (g.detail === false) { // (simple: an inner and an outer ring, each a plain donut)
    b.part("Inner race");
    b.turn(side, [[g.bore / 2, 0], [inner, 0], [inner, B], [g.bore / 2, B]], [0, 0, 0, 0], [0, 0, 0], up);
    b.part("Outer race");
    b.turn(side, [[outerR, 0], [g.outer / 2, 0], [g.outer / 2, B], [outerR, B]], [0, 0, 0, 0], [0, 0, 0], up);
    return;
  }
  // the inner race: its section a rectangle with the groove cut into the outside, a circular arc about the middle of a ball
  b.part("Inner race");
  {
    const a: [number, number] = [inner, zm - half], c: [number, number] = [inner, zm + half], via: [number, number] = [pitch - rg, zm];
    b.turn(side, [[g.bore / 2, 0], [inner, 0], a, c, [inner, B], [g.bore / 2, B]], [0, 0, bulgeOf(a, via, c), 0, 0, 0], [0, 0, 0], up);
  }
  // the outer race: the groove cut into its inside
  b.part("Outer race");
  {
    const a: [number, number] = [outerR, zm + half], c: [number, number] = [outerR, zm - half], via: [number, number] = [pitch + rg, zm];
    b.turn(side, [[outerR, 0], [g.outer / 2, 0], [g.outer / 2, B], [outerR, B], a, c], [0, 0, 0, 0, bulgeOf(a, via, c), 0], [0, 0, 0], up);
  }
  // the balls: a half disc turned about its diameter, on a plane through the axis
  for (let k = 0; k < g.balls; k++) {
    b.part(`Ball ${k + 1}`);
    const t = (2 * Math.PI * k) / g.balls, [cs, sn] = [Math.cos(t), Math.sin(t)];
    const pl = b.frame([0, 0, 0], [cs, sn, 0], [0, 0, 1]);
    const lo: [number, number] = [pitch, zm - rb], hi: [number, number] = [pitch, zm + rb];
    b.turn(pl, [lo, [pitch, zm], hi], [0, 0, bulgeOf(hi, [pitch + rb, zm], lo)], [pitch * cs, pitch * sn, 0], up);
  }
}
