// A bevel gear differential as a model (`dec_gear_models`): two side gears on the x axis, two spider gears on a cross pin along y (the four bevel gears are gear records made with the gear tool, meshed as it meshes them), a cage (a tube
// with a cap at each end, the pin through its wall), an axle through each side gear and, if asked, a spur drive gear round the cage. Pure: numbers in, steps out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { PartSteps } from "./fasteners.ts";
import { Builder, disc, meshedWith } from "./modelparts.ts";
import type { GearHolder } from "./modelparts.ts";
import { bevelOf, bevelLayout } from "./bevel.ts";
import type { GearSpec } from "./gear.ts";
import type { Vec3 } from "../math/vec.ts";

export interface DifferentialSpec {
  /** the teeth of the side gears (even, so the two spiders mesh with both) and of the spider gears */ side: number; spider: number;
  module: number;
  /** the axles' and the cross pin's diameters (mm) */ axle: number; pin: number;
  /** the room between a gear's bore and what is through it, and between a hole in the cage and what is through it (mm) */ fit: number; room: number;
  /** the cage's wall and its caps' thickness (mm) */ wall: number; cap: number;
  /** the teeth of a spur gear round the cage (0: none), its module and its thickness (mm) */ drive: number; driveModule: number; driveWidth: number;
}
export const DIFFERENTIAL_START: DifferentialSpec = { side: 16, spider: 10, module: 2, axle: 5, pin: 4, fit: 0.1, room: 0.2, wall: 3, cap: 3, drive: 40, driveModule: 1.5, driveWidth: 6 };
const BACK = 1.5; // (the room behind a side gear, between it and its cap)
const CAP_GAP = 0.2; // (a cap stands this far off the tube: the two stay separate bodies; it is screwed or glued on)
const AXLE_OUT = 10; // (how far an axle stands out of the cap)

/** the numbers the layout follows from (mm): the side and spider gears' distances from the middle to their big ends, and the cage's inner radius */
export function differentialGeometry(s: DifferentialSpec): Result<{ bigS: number; bigP: number; inner: number; outer: number; half: number }> {
  const side: GearSpec = { teeth: s.side, module: s.module, bevel: { mate: s.spider } }, spider: GearSpec = { teeth: s.spider, module: s.module, bevel: { mate: s.side } };
  const [ls, lp] = [bevelLayout(side), bevelLayout(spider)];
  if (!ls.ok) return ls;
  if (!lp.ok) return lp;
  // a gear's blank stands behind its big end's plane (the back cone and the hub's back) and reaches out to a radius: the cage has room for both
  const [behindS, behindP] = [-Math.min(...ls.value.blank.map((q) => q[1])), -Math.min(...lp.value.blank.map((q) => q[1]))];
  const [bigS, bigP] = [ls.value.geometry.big, lp.value.geometry.big];
  const inner = Math.max(ls.value.geometry.tipRadius, bigP + behindP) + 1.5;
  return ok({ bigS, bigP, inner, outer: inner + s.wall, half: bigS + behindS + BACK });
}

/** Why the numbers make no differential, or null */
export function differentialProblem(s: DifferentialSpec): string | null {
  const nums = [s.side, s.spider, s.module, s.axle, s.pin, s.fit, s.room, s.wall, s.cap, s.drive, s.driveModule, s.driveWidth];
  if (!nums.every(Number.isFinite)) return "every number must be a number";
  if (!Number.isInteger(s.side) || !Number.isInteger(s.spider)) return "the teeth must be whole numbers";
  if (s.side % 2) return "the side gears need an even number of teeth (so that both spiders mesh with both)";
  if (s.side < 12 || s.spider < 8) return "the side gears need 12 or more teeth and the spiders 8 or more";
  if (s.side < s.spider) return "the side gears are the bigger ones: they need at least the spiders' teeth";
  if (s.module <= 0 || s.axle <= 0 || s.pin <= 0 || s.wall <= 0 || s.cap <= 0) return "the sizes must be more than 0";
  if (s.fit < 0 || s.room < 0) return "the rooms must be 0 or more";
  if (s.drive !== 0 && (!Number.isInteger(s.drive) || s.drive < 8 || s.driveModule <= 0 || s.driveWidth <= 0)) return "a drive gear needs 8 or more teeth, a module and a thickness (or 0 teeth for none)";
  const g = differentialGeometry(s);
  if (!g.ok) return g.error;
  const toe = (z: number, mate: number): number => { // (the smallest wall left round the bore at the narrow end of a gear: its root circle there, less the bore)
    const gg = bevelOf({ teeth: z, module: s.module, bevel: { mate } });
    return gg.ok ? (gg.value.rootRadius * gg.value.k) : 0;
  };
  if (toe(s.side, s.spider) < s.axle / 2 + s.fit + 1) return `the axle is too wide for the side gears: their narrow end is ${(2 * toe(s.side, s.spider)).toFixed(1)} mm across at the root`;
  if (toe(s.spider, s.side) < s.pin / 2 + s.fit + 1) return `the pin is too wide for the spider gears: their narrow end is ${(2 * toe(s.spider, s.side)).toFixed(1)} mm across at the root`;
  if (s.drive !== 0 && (s.drive * s.driveModule) / 2 - 1.25 * s.driveModule < g.value.outer + 1) return `the drive gear is too small to go round the cage (its root circle is ${(s.drive * s.driveModule - 2.5 * s.driveModule).toFixed(1)} mm across, the cage ${(2 * g.value.outer).toFixed(1)}): more teeth or a bigger module`;
  return null;
}

/** The steps that make the differential (the problem, if the numbers make none) */
export function differentialSteps(s: DifferentialSpec): Result<PartSteps> {
  const bad = differentialProblem(s);
  if (bad) return err(bad);
  const g = differentialGeometry(s);
  if (!g.ok) return g;
  const { bigS, inner, outer, half } = g.value;
  const b = new Builder();
  const ground = b.plane(0);
  const bore = (d: number) => d + 2 * s.fit;
  // the cage first, so that the hole for the pin is cut into it alone: a tube along x, and a hole through its wall along y
  const across = b.frame([-half, 0, 0], [0, 1, 0], [0, 0, 1]); // (a plane across the axis: its normal is +x)
  b.extrude(across, disc(0, 0, outer), [disc(0, 0, inner)], 2 * half);
  const side = b.frame([0, outer + 1, 0], [1, 0, 0], [0, 0, 1]); // (a plane across the pin: its normal is -y)
  b.extrude(side, disc(0, 0, s.pin / 2 + s.room), [], 2 * outer + 2, { mode: "cut" });
  // a cap at each end, a little off the tube, with a hole for the axle
  for (const sign of [-1, 1]) {
    const x0 = sign < 0 ? -half - CAP_GAP - s.cap : half + CAP_GAP;
    const pl = b.frame([x0, 0, 0], [0, 1, 0], [0, 0, 1]);
    b.extrude(pl, disc(0, 0, outer), [disc(0, 0, s.axle / 2 + s.room)], s.cap);
  }
  // the gears: the side gear on -x with its apex at the middle, a spider meshed with it on +y, the other side gear meshed with the spider, and the second spider that of the first turned half a turn about the axle
  const base = (teeth: number, mate: number, d: number): GearSpec => ({ teeth, module: s.module, bore: bore(d), bevel: { mate } });
  const x: Vec3 = [1, 0, 0];
  const s1spec: GearSpec = { ...base(s.side, s.spider, s.axle), bevel: { mate: s.spider, frame: [[0, 1, 0], [0, 0, 1]] } };
  const s1: GearHolder = b.gear(ground, [-bigS, 0, 0], s1spec);
  const p1p = meshedWith(s1, s.spider, 0);
  if (typeof p1p === "string") return err(p1p);
  const p1spec: GearSpec = { ...p1p.spec, bore: bore(s.pin) };
  const p1: GearHolder = b.gear(ground, p1p.at, p1spec, p1p.turn, s1);
  const [X2, Y2] = p1spec.bevel!.frame!;
  const s2p = meshedWith(p1, s.side, Math.atan2(x[0] * Y2[0] + x[1] * Y2[1] + x[2] * Y2[2], x[0] * X2[0] + x[1] * X2[1] + x[2] * X2[2]));
  if (typeof s2p === "string") return err(s2p);
  b.gear(ground, s2p.at, { ...s2p.spec, bore: bore(s.axle) }, s2p.turn, p1);
  const turnX = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]]; // (half a turn about the x axis)
  b.gear(ground, turnX(p1p.at), { ...p1spec, bevel: { ...p1spec.bevel!, frame: [turnX(X2), turnX(Y2)] } }, p1p.turn, s1);
  // the axles, one through each side gear (they end before the pin), and the pin through the spiders and the cage's wall
  const stop = s.pin / 2 + 0.5;
  b.extrude(b.frame([-half - CAP_GAP - s.cap - AXLE_OUT, 0, 0], [0, 1, 0], [0, 0, 1]), disc(0, 0, s.axle / 2), [], half + CAP_GAP + s.cap + AXLE_OUT - stop);
  b.extrude(b.frame([stop, 0, 0], [0, 1, 0], [0, 0, 1]), disc(0, 0, s.axle / 2), [], half + CAP_GAP + s.cap + AXLE_OUT - stop);
  b.extrude(b.frame([0, outer, 0], [1, 0, 0], [0, 0, 1]), disc(0, 0, s.pin / 2), [], 2 * outer);
  // a drive gear round the cage, in the middle (it covers the ends of the pin and keeps it in)
  if (s.drive !== 0) {
    const pl = b.frame([-s.driveWidth / 2, 0, 0], [0, 1, 0], [0, 0, 1]);
    b.gear(pl, [-s.driveWidth / 2, 0, 0], { teeth: s.drive, module: s.driveModule, width: s.driveWidth, bore: 2 * outer + 2 * s.fit });
  }
  return ok(b.steps);
}
