// Meshing gears (`dec_gear_tool`, `in_547`): where another gear or a rack goes so that its teeth fit between the teeth of a gear that is there, and how it must be turned. Pure maths in the plane's own x and y.
//
// Pitch circles roll on each other: two outside gears touch at a distance of r1 + r2 (m (z1 + z2) / 2), a gear inside a ring at r1 - r2, a gear on a rack at its pitch radius from the rack's pitch line. The teeth of the two
// must alternate where the pitch circles touch: a tooth of one is in the gap of the other. With the angle `psi` of the way to the other gear measured in a gear's own frame (from its tooth 0, which stands on its x
// axis), the pitch point has a tooth of the first gear exactly where it has a gap of the second when  psi1 z1/2pi + psi2 z2/2pi = 1/2 (mod 1) for two outside gears (the circles turn opposite ways), and
// psi1 z1/2pi - psi2 z2/2pi = 1/2 (mod 1) for a ring and the gear in it. A rack's teeth are a distance pi m apart along its pitch line, the same as the pitch of a gear along its circle.
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { GearRecord } from "./gearscene.ts";
import type { GearSpec } from "./gear.ts";

export interface Placement { at: Vec3; turn: number; spec: GearSpec }
const TAU = 2 * Math.PI;
const wrap = (v: number, period: number): number => ((((v + period / 2) % period) + period) % period) - period / 2; // (into -period/2 .. period/2)
const norm = (a: number): number => { const t = ((a % TAU) + TAU) % TAU; return t > Math.PI ? t - TAU : t; };

/**
 * The gear (or rack) that meshes with `src`, on the plane with first and second directions `u` and `v`. `partner`: how many teeth it has; `rack`: it is a rack. `where`: for a gear or a ring as the source, the direction
 * of the partner from its centre (radians from `u` towards `v`); for a rack as the source, how far along the rack (mm from the middle of its pitch line) the partner stands. Refused, with the reason, for a gear
 * with a profile shift (its centre distance is not the plain one), for the tooth counts that make no mesh (a gear in a ring needs fewer teeth than the ring) and for a rack against a ring.
 */
export function meshWith(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean }, where: number): Result<Placement> {
  const s = src.spec;
  const z2 = Math.round(partner.teeth);
  if (s.pulley || s.sprocket) return err("a pulley or a sprocket meshes with a belt or a chain, not with a gear");
  if ((s.shift ?? 0) !== 0) return err("a gear with a profile shift is not meshed yet");
  if (!Number.isFinite(z2) || z2 < 1) return err("the partner needs teeth");
  const m = s.module;
  const at = (c: Vec3, x: number, y: number): Vec3 => [c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y, c[2] + u[2] * x + v[2] * y];
  if (s.cycloidal && (partner.rack || s.internal)) return err("a clock gear meshes with another clock gear of the same generating circle");
  const base: GearSpec = { teeth: z2, module: m, ...(s.cycloidal ? { cycloidal: { ...s.cycloidal } } : {}), ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), ...(s.backlash !== undefined ? { backlash: s.backlash } : {}), ...(s.clearance !== undefined ? { clearance: s.clearance } : {}) };
  const turn1 = src.turn ?? 0;
  if (s.rack) {
    if (partner.rack) return err("a rack does not mesh with a rack");
    if (z2 < 3) return err("a gear needs 3 or more teeth");
    // the rack along its own x (turned by `turn1`), teeth up; the gear stands on the teeth side, its pitch circle on the rack's pitch line
    const [c, sn] = [Math.cos(turn1), Math.sin(turn1)];
    const L = Math.PI * m * s.teeth;
    const r2 = (m * z2) / 2;
    const e = wrap(-L / 2 - where, Math.PI * m); // (a tooth of the gear stands this far along the rack from where it touches, at a gap of the rack)
    const psi = -e / r2;
    return ok({ at: at(src.at, c * where - sn * r2, sn * where + c * r2), turn: norm(turn1 - Math.PI / 2 - psi), spec: base });
  }
  const r1 = (m * s.teeth) / 2;
  const phi = where;
  const dir = [Math.cos(phi), Math.sin(phi)] as const;
  const psi1 = phi - turn1;
  if (partner.rack) {
    if (s.internal) return err("a rack does not mesh with a ring");
    const L = Math.PI * m * z2;
    const e1 = -psi1 * r1; // (a tooth of the gear stands this far along the rack from the pitch point, at a gap of the rack)
    const delta = wrap(e1 + L / 2, Math.PI * m);
    return ok({ at: at(src.at, dir[0] * r1 - Math.sin(phi) * delta, dir[1] * r1 + Math.cos(phi) * delta), turn: norm(phi + Math.PI / 2), spec: { ...base, rack: true } });
  }
  if (z2 < 3) return err("a gear needs 3 or more teeth");
  if (s.internal) {
    if (z2 >= s.teeth) return err("a gear in a ring needs fewer teeth than the ring");
    const a = (m * (s.teeth - z2)) / 2;
    const psi2 = (TAU / z2) * ((psi1 * s.teeth) / TAU - 0.5);
    return ok({ at: at(src.at, dir[0] * a, dir[1] * a), turn: norm(phi - psi2), spec: base });
  }
  const a = (m * (s.teeth + z2)) / 2;
  const psi2 = (TAU / z2) * (0.5 - (psi1 * s.teeth) / TAU);
  return ok({ at: at(src.at, dir[0] * a, dir[1] * a), turn: norm(phi + Math.PI - psi2), spec: base });
}
