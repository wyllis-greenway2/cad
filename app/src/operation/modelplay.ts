// How a gear assembly model moves when it is played (`dec_gear_models`, `dec_mechanism_motion`): which part is the driver, which turn with it and about what, and by how much for each degree of the driver. Worked out from the model's numbers when
// it is made (in the world, where the model stands) and kept in the scene (`Scene.models`) with the part each body is, so Play can move the bodies without asking the model again. Kinematic only, as all motion is. Pure.
import type { Vec3 } from "../math/vec.ts";
import { dirIn, pointIn } from "./modelparts.ts";
import type { Place } from "./modelparts.ts";
import type { ModelKind, Nums } from "./modelkinds.ts";
import { gearboxFootprint } from "./modelgearbox.ts";
import type { GearboxSpec } from "./modelgearbox.ts";
import { bearingGeometry } from "./modelbearing.ts";
import type { BearingSpec } from "./modelbearing.ts";
import type { DifferentialSpec } from "./modeldifferential.ts";
import type { CycloidalSpec } from "./modelcycloidal.ts";

/** A part that turns about an axis by `k` degrees for each degree of the driver; with `after`, the whole is then turned again about another axis by `after.k` times the driver's amount (a ball or a disc that goes round) */
export interface PlayFollower { part: string; point: Vec3; dir: Vec3; k: number; after?: { point: Vec3; dir: Vec3; k: number } }
export interface PlayPlan { driver: { part: string; point: Vec3; dir: Vec3 }; followers: PlayFollower[]; /** what the motion shows, and what is held */ note: string }
/** the record kept in the scene: the plan, and the step that made the body of each part (or the gear that made it) */
export interface ModelPlay extends PlayPlan { id: string; title: string; parts: Record<string, { step?: string; gear?: string }> }

/** The motion of a model of this kind, in the world where it stands */
export function playPlan(kind: ModelKind, n: Nums, place: Place): PlayPlan {
  const P = (x: number, y: number, z: number): Vec3 => pointIn(place, [x, y, z]);
  const D = (x: number, y: number, z: number): Vec3 => dirIn(place, [x, y, z]);
  const o = P(0, 0, 0), ez = D(0, 0, 1);
  if (kind === "gearbox") {
    const s = n as unknown as GearboxSpec, f = gearboxFootprint(s), r = -s.pinion / s.gear; // (each stage turns the other way, by the pinion's teeth over the gear's)
    const speed = (rod: number): number => r ** rod; // (the rod `rod` stands between stage rod - 1 and stage rod: it turns r to that many)
    const followers: PlayFollower[] = [];
    f.rods.forEach((x, j) => { followers.push({ part: `Rod ${j + 1}`, point: P(x, 0, 0), dir: ez, k: speed(j) }); });
    for (let i = 0; i < s.stages; i++) {
      if (i > 0) followers.push({ part: `Stage ${i + 1} pinion`, point: P(f.rods[i]!, 0, 0), dir: ez, k: speed(i) });
      followers.push({ part: `Stage ${i + 1} gear`, point: P(f.rods[i + 1]!, 0, 0), dir: ez, k: speed(i + 1) });
    }
    return { driver: { part: "Stage 1 pinion", point: P(f.rods[0]!, 0, 0), dir: ez }, followers, note: `the first pinion turns the gears: ${(1 / Math.abs(speed(s.stages))).toFixed(2)} turns of it for one of the last gear` };
  }
  if (kind === "bearing") {
    const s = n as unknown as BearingSpec, g = bearingGeometry(s), zm = s.width / 2;
    const orbit = (g.pitch - g.rb) / (2 * g.pitch); // (a ball's middle goes round at half the speed of the surface of the inner race it rolls on, the outer race held)
    const followers: PlayFollower[] = Array.from({ length: Math.round(s.balls) }, (_, k) => {
      const t = (2 * Math.PI * k) / s.balls;
      return { part: `Ball ${k + 1}`, point: P(g.pitch * Math.cos(t), g.pitch * Math.sin(t), zm), dir: ez, k: 0, after: { point: o, dir: ez, k: orbit } };
    });
    return { driver: { part: "Inner race", point: o, dir: ez }, followers, note: "the inner race turns, the outer is held, the balls go round at about half its speed" };
  }
  if (kind === "differential") {
    const s = n as unknown as DifferentialSpec, ex = D(1, 0, 0), ey = D(0, 1, 0), spin = s.side / s.spider;
    const about = (part: string, k: number): PlayFollower => ({ part, point: o, dir: ex, k });
    const followers: PlayFollower[] = [about("Cap 1", 1), about("Cap 2", 1), about("Cross pin", 1), ...(s.drive ? [about("Drive gear", 1)] : []), about("Side gear 1", 2), about("Axle 1", 2),
      { part: "Spider gear 1", point: o, dir: ey, k: spin, after: { point: o, dir: ex, k: 1 } }, { part: "Spider gear 2", point: o, dir: ey, k: -spin, after: { point: o, dir: ex, k: 1 } }];
    return { driver: { part: "Cage", point: o, dir: ex }, followers, note: "the cage turns with axle 2 held: axle 1 turns twice as fast (the two axles' turns add up to twice the cage's) and the spiders spin on the pin" };
  }
  const s = n as unknown as CycloidalSpec, back = -1 / (s.pins - 1);
  return { driver: { part: "Input shaft and eccentric", point: o, dir: ez }, followers: [{ part: "Cycloidal disc", point: P(s.ecc, 0, 0), dir: ez, k: back, after: { point: o, dir: ez, k: 1 } }, { part: "Output plate and pins", point: o, dir: ez, k: back }], note: `the shaft turns, the disc goes round on its eccentric and turns the other way 1/${s.pins - 1} as fast, and so does the output; the base is held` };
}
