// How a gear assembly model moves when it is played (`dec_gear_models`, `dec_mechanism_motion`): which part is the driver, which turn with it and about what, and by how much for each degree of the driver. Worked out from the model's numbers when
// it is made (in the world, where the model stands) and kept in the scene (`Scene.models`) with the part each body is, so Play can move the bodies without asking the model again. Kinematic only, as all motion is. Pure.
import type { Vec3 } from "../math/vec.ts";
import { dirIn, pointIn } from "./modelparts.ts";
import type { Place } from "./modelparts.ts";
import type { ModelKind, Nums } from "./modelkinds.ts";
import { gearboxFootprint } from "./modelgearbox.ts";
import type { GearboxSpec } from "./modelgearbox.ts";
import { bearingFromNums } from "./bearingdata.ts";
import type { DifferentialSpec } from "./modeldifferential.ts";
import type { CycloidalSpec } from "./modelcycloidal.ts";
import { engineGeometry, pistonX, rodAngle } from "./modelengine.ts";
import type { EngineSpec } from "./modelengine.ts";

/** A part that turns about an axis by `k` degrees for each degree of the driver; with `after`, the whole is then turned again about another axis by `after.k` times the driver's amount (a ball or a disc that goes round) */
export interface PlayFollower { part: string; point: Vec3; dir: Vec3; k: number; /** a slide along `dir` (not a turn), and/or an amount for each whole degree of the driver in place of `k` (the slider crank: not a constant ratio) */ kind?: "turn" | "slide"; table?: number[]; after?: { point: Vec3; dir: Vec3; k: number; slip?: true } }
export interface PlayPlan { /** parts that stand still (held: a wall, `setFixed`) and the parts that turn about an axis of their own (a pivot), made with the model so that things can be driven on it */ hold?: string[]; pivots?: { part: string; point: Vec3; dir: Vec3 }[]; driver: { part: string; point: Vec3; dir: Vec3 }; followers: PlayFollower[]; /** what the motion shows, and what is held */ note: string; /** the parts that are glued to one another (`glue.ts`): a gear and its rod, the cage and what is fixed to it; one of each group is the driver or a follower, the rest go with it */ glue: string[][] }
/** the record kept in the scene: the plan, and the step that made the body of each part (or the gear that made it) */
export interface ModelPlay extends Omit<PlayPlan, "glue" | "hold" | "pivots"> { id: string; title: string; parts: Record<string, { step?: string; gear?: string }> }

/** The motion of a model of this kind, in the world where it stands */
export function playPlan(kind: ModelKind, n: Nums, place: Place): PlayPlan {
  const P = (x: number, y: number, z: number): Vec3 => pointIn(place, [x, y, z]);
  const D = (x: number, y: number, z: number): Vec3 => dirIn(place, [x, y, z]);
  const o = P(0, 0, 0), ez = D(0, 0, 1);
  if (kind === "gearbox") {
    const s = n as unknown as GearboxSpec, f = gearboxFootprint(s), r = -s.pinion / s.gear; // (each stage turns the other way, by the pinion's teeth over the gear's)
    const speed = (rod: number): number => r ** rod; // (the rod `rod` stands between stage rod - 1 and stage rod: it turns r to that many)
    // a gear is glued to the rod it is on and to the pinion of the next stage; only the gears are followers, the rods and the pinions go with them
    const followers: PlayFollower[] = Array.from({ length: s.stages }, (_, i) => ({ part: `Stage ${i + 1} gear`, point: P(f.rods[i + 1]!, 0, 0), dir: ez, k: speed(i + 1) }));
    const glue = f.rods.map((_, j) => [`Rod ${j + 1}`, ...(j < s.stages ? [`Stage ${j + 1} pinion`] : []), ...(j > 0 ? [`Stage ${j} gear`] : [])]);
    return { driver: { part: "Stage 1 pinion", point: P(f.rods[0]!, 0, 0), dir: ez }, followers, glue, note: `the first pinion turns the gears: ${(1 / Math.abs(speed(s.stages))).toFixed(2)} turns of it for one of the last gear` };
  }
  if (kind === "ballbearing") {
    const sh = bearingFromNums(n);
    if (typeof sh === "string") return { driver: { part: "Inner race", point: o, dir: ez }, followers: [], glue: [], note: "" };
    const g = { pitch: sh.pitch, rb: sh.rb }, zm = sh.width / 2, count = sh.detail ? sh.balls : 0; // (a simple bearing has two rings and no balls)
    const orbit = (g.pitch - g.rb) / (2 * g.pitch); // (a ball's middle goes round at half the speed of the surface of the inner race it rolls on, the outer race held)
    const followers: PlayFollower[] = Array.from({ length: count }, (_, k) => {
      const t = (2 * Math.PI * k) / count;
      return { part: `Ball ${k + 1}`, point: P(g.pitch * Math.cos(t), g.pitch * Math.sin(t), zm), dir: ez, k: 0, after: { point: o, dir: ez, k: orbit } };
    });
    return { driver: { part: "Inner race", point: o, dir: ez }, followers, glue: [], hold: ["Outer race"], pivots: [{ part: "Inner race", point: o, dir: ez }], note: "the inner race turns, the outer is held, the balls go round at about half its speed" };
  }
  if (kind === "wheelcut") return { driver: { part: "Pockets", point: o, dir: ez }, followers: [], glue: [], note: "" };
  if (kind === "wheel") return { driver: { part: "Wheel", point: o, dir: ez }, followers: [], glue: [], pivots: [{ part: "Wheel", point: o, dir: ez }], note: "the wheel turns about its axis" };
  if (kind === "engine") {
    const s = n as unknown as EngineSpec, g = engineGeometry(s), r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
    const deg = Array.from({ length: 360 }, (_, i) => i);
    const rod = deg.map((a) => r4(rodAngle(g.r, g.l, a))), piston = deg.map((a) => r4(pistonX(g.r, g.l, a) - (g.r + g.l)));
    // the crank turns; the rod turns about its big eye by the angle it leans and goes round with the crank pin (the eye is moved, not turned, by the orbit); the piston slides along the cylinder
    const followers: PlayFollower[] = [
      { part: "Connecting rod", point: P(g.r, 0, g.zc), dir: ez, k: 0, table: rod, after: { point: o, dir: ez, k: 1, slip: true } },
      { part: "Piston", point: P(g.r + g.l, 0, g.zc), dir: D(1, 0, 0), kind: "slide", k: 0, table: piston }];
    return { driver: { part: "Crankshaft", point: o, dir: ez }, followers, glue: [["Crankshaft", "Flywheel"], ["Piston", "Piston pin"]], hold: ["Block"], pivots: [{ part: "Crankshaft", point: o, dir: ez }], note: "the crank turns: the rod leans and the piston slides by the exact slider crank (the block is held)" };
  }
  if (kind === "differential") {
    const s = n as unknown as DifferentialSpec, ex = D(1, 0, 0), ey = D(0, 1, 0), spin = s.side / s.spider;
    const followers: PlayFollower[] = [{ part: "Side gear 1", point: o, dir: ex, k: 2 },
      { part: "Spider gear 1", point: o, dir: ey, k: spin, after: { point: o, dir: ex, k: 1 } }, { part: "Spider gear 2", point: o, dir: ey, k: -spin, after: { point: o, dir: ex, k: 1 } }];
    // glued: the cage with its caps, the pin and the drive gear (all fixed to it); each side gear with its axle
    const glue = [["Cage", "Cap 1", "Cap 2", "Cross pin", ...(s.drive ? ["Drive gear"] : [])], ["Side gear 1", "Axle 1"], ["Side gear 2", "Axle 2"]];
    return { driver: { part: "Cage", point: o, dir: ex }, followers, glue, note: "the cage turns with axle 2 held: axle 1 turns twice as fast (the two axles' turns add up to twice the cage's) and the spiders spin on the pin" };
  }
  const s = n as unknown as CycloidalSpec, back = -1 / (s.pins - 1); // (the disc's own turn is `back`; the orbit turns it too, so its spin about its own middle is `back - 1`: a planet's `k` is the same)
  return { driver: { part: "Input shaft and eccentric", point: o, dir: ez }, glue: [], followers: [{ part: "Cycloidal disc", point: P(s.ecc, 0, 0), dir: ez, k: back - 1, after: { point: o, dir: ez, k: 1 } }, { part: "Output plate and pins", point: o, dir: ez, k: back }], note: `the shaft turns, the disc goes round on its eccentric and turns the other way 1/${s.pins - 1} as fast, and so does the output; the base is held` };
}
