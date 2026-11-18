// A spiral bevel gear whose body the kernel could not cut (`dec_spiral_bevel_gears`, `in_829`): the cut of the tooth prism by the blank of the two cones fails for some places of the cones along the axis and not for others, and which depends on where the gear stands, so
// the next place (`SPIRAL.shifts`, `BevelSpec.cone`) is tried, until one works or there are no more. The command that made the gear is made again with the gear's `cone` one more (a gear that stands at the cone it works with is kept as such in the file).
import type { Scene } from "./scene.ts";
import type { Command } from "./commands.ts";
import { SPIRAL } from "./spiral.ts";

/** the kernel's answers for a cut it cannot make */
const CUT = /nothing in common|invalid solid|memory access|pass through itself|nothing was left|upstream/;
/** The command to try instead of `c`, which made `scene` (a scene with a step the kernel could not make: `failed`, with this `error`), or null if no other place of the cones is to try. */
export function coneRetry(scene: Scene, c: Command, failed: string, error: string): Command | null {
  const gid = scene.steps.find((st) => st.id === failed)?.params.gear;
  const rec = typeof gid === "string" ? scene.gears?.find((g) => g.id === gid) : undefined;
  if (!rec || rec.spec.bevel?.spiral === undefined || !CUT.test(error)) return null;
  const cone = rec.spec.bevel.cone ?? 0;
  if (cone + 1 >= SPIRAL.shifts.length) return null;
  const spec = { ...rec.spec, bevel: { ...rec.spec.bevel, cone: cone + 1 } };
  if ((c.type === "gear" || c.type === "setGear") && c.id === gid) return { ...c, spec };
  if (c.type === "setGear" || c.type === "gear") return { type: "batch", commands: [{ type: "setGear", id: gid as string, spec }, c] }; // (the other gear of a pair, put right by the change)
  return null;
}
