// Meshing gears (`dec_gear_tool`, `in_579`): where another gear or a rack goes so that its teeth fit between the teeth of a gear that is there, and how it must be turned. Pure maths in the plane's own x and y.
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
import { wormOf, wheelOf, wormLayout } from "./worm.ts";

export interface Placement { at: Vec3; turn: number; spec: GearSpec }
const TAU = 2 * Math.PI;
const wrap = (v: number, period: number): number => ((((v + period / 2) % period) + period) % period) - period / 2; // (into -period/2 .. period/2)
const norm = (a: number): number => { const t = ((a % TAU) + TAU) % TAU; return t > Math.PI ? t - TAU : t; };

/**
 * The gear (or rack) that meshes with `src`, on the plane with first and second directions `u` and `v`. `partner`: how many teeth it has; `rack`: it is a rack. `where`: for a gear or a ring as the source, the direction
 * of the partner from its centre (radians from `u` towards `v`); for a rack as the source, how far along the rack (mm from the middle of its pitch line) the partner stands. Refused, with the reason, for a gear
 * with a profile shift (its centre distance is not the plain one), for the tooth counts that make no mesh (a gear in a ring needs fewer teeth than the ring) and for a rack against a ring.
 */
export function meshWith(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; offset?: number; width?: number; /** a ring that goes round the gear (`in_686`) */ ring?: boolean }, where: number): Result<Placement> {
  const s = src.spec;
  if (s.cam) return err("a cam or a ratchet does not mesh with a gear");
  if (s.worm) return meshWormWheel(src, u, v, partner, where);
  if (s.wheel) return err("a worm wheel is meshed by selecting the worm, not the wheel");
  const z2 = Math.round(partner.teeth);
  if (s.pulley || s.sprocket) return err("a pulley or a sprocket meshes with a belt or a chain, not with a gear");
  if ((s.shift ?? 0) !== 0) return err("a gear with a profile shift is not meshed yet");
  if (!Number.isFinite(z2) || z2 < 1) return err("the partner needs teeth");
  const helical = s.helix !== undefined;
  if (helical && partner.rack) return err("a helical gear does not mesh with a rack yet");
  const m = helical ? s.module / Math.cos((Math.abs(s.helix!) * Math.PI) / 180) : s.module; // (a helical gear's pitch circles are those of its transverse section)
  const at = (c: Vec3, x: number, y: number): Vec3 => [c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y, c[2] + u[2] * x + v[2] * y];
  const base: GearSpec = { teeth: z2, module: s.module, ...(helical ? { helix: -s.helix!, width: s.width } : {}), ...(s.cycloidal ? { cycloidal: { ...s.cycloidal } } : {}), ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), ...(s.backlash !== undefined ? { backlash: s.backlash } : {}), ...(s.clearance !== undefined ? { clearance: s.clearance } : {}) };
  const turn1 = src.turn ?? 0;
  if (s.rack) {
    if (partner.rack) return err("a rack does not mesh with a rack");
    if (partner.ring) return err("a ring does not go round a rack");
    if (z2 < 3) return err("a gear needs 3 or more teeth");
    // the rack along its own x (turned by `turn1`), teeth up; the gear stands on the teeth side, its pitch circle on the rack's pitch line
    const [c, sn] = [Math.cos(turn1), Math.sin(turn1)];
    const L = Math.PI * m * s.teeth;
    const r2 = (m * z2) / 2;
    const e = wrap(-L / 2 - where, Math.PI * m); // (a tooth of the gear stands this far along the rack from where it touches, at a gap of the rack)
    const psi = -e / r2;
    return ok({ at: at(src.at, c * where - sn * r2, sn * where + c * r2), turn: norm(turn1 - Math.PI / 2 - psi), spec: base });
  }
  if (partner.ring) {
    // a ring round an outside gear: the gear is inside the ring, so this is the case of a gear in a ring seen from the gear: `where` is the direction of the ring's middle from the gear, and the contact is
    // the other way, `phi2` (the direction of the gear from the ring's middle)
    if (s.internal) return err("a ring does not go round a ring");
    if (z2 <= s.teeth) return err("a ring round a gear needs more teeth than the gear's " + s.teeth + " (type Teeth)");
    const phi2 = where + Math.PI;
    const a = (m * (z2 - s.teeth)) / 2;
    const psiGear = phi2 - turn1;
    const psiRing = (TAU / z2) * ((psiGear * s.teeth) / TAU + 0.5);
    return ok({ at: at(src.at, Math.cos(where) * a, Math.sin(where) * a), turn: norm(phi2 - psiRing), spec: { ...base, internal: true } });
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
    if (z2 >= s.teeth) return err("a gear in a ring needs fewer teeth than the ring's " + s.teeth + " (type Teeth)");
    const a = (m * (s.teeth - z2)) / 2;
    const psi2 = (TAU / z2) * ((psi1 * s.teeth) / TAU - 0.5);
    return ok({ at: at(src.at, dir[0] * a, dir[1] * a), turn: norm(phi - psi2), spec: base });
  }
  const a = (m * (s.teeth + z2)) / 2;
  const psi2 = (TAU / z2) * (0.5 - (psi1 * s.teeth) / TAU);
  return ok({ at: at(src.at, dir[0] * a, dir[1] * a), turn: norm(phi + Math.PI - psi2), spec: base });
}

/**
 * The worm wheel for a worm (`in_608`): beside the worm, its axis across the worm's axis in the plane's normal, at the centre distance (the wheel's pitch radius and the worm's), on the side of the worm's axis the pointer is on, `partner.offset` mm along the
 * worm from its middle. It is turned so that its teeth meet the thread: in the wheel's own frame (x along the worm's axis, y from the worm to the wheel's centre) the sections of the wheel (`wheelsections.ts`) are for a worm whose thread stands at x = lead / 4
 * on the line of contact (mod the pitch of the thread); the thread of this worm stands at x_c, so the wheel is turned by the difference over its pitch radius.
 */
function meshWormWheel(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; offset?: number; width?: number }, where: number): Result<Placement> {
  const s = src.spec, g = wormOf(s);
  if (!g.ok) return g;
  if (partner.rack) return err("a rack does not mesh with a worm");
  const z2 = Math.round(partner.teeth);
  const wheel = { starts: s.teeth, diameter: s.worm!.diameter, width: 0 };
  const probe = wheelOf({ teeth: z2, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), wheel: { ...wheel, width: 1 } });
  if (!probe.ok) return probe;
  const width = partner.width && partner.width > 0 ? partner.width : Math.min(6 * s.module, 1.2 * probe.value.throat);
  const spec: GearSpec = { teeth: z2, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), wheel: { ...wheel, width } };
  const w = wheelOf(spec);
  if (!w.ok) return w;
  const t = src.turn ?? 0;
  const side = Math.sin(where - t) * 1 >= 0 ? 1 : -1; // (which side of the worm's axis the pointer is on: the worm's Y is its X turned a quarter)
  const [cx, sx] = [Math.cos(t), Math.sin(t)];
  const off = partner.offset ?? 0;
  // the wheel's centre: from the worm's, `off` along its axis and the centre distance across it
  const [px, py] = [cx * off - sx * side * w.value.cd, sx * off + cx * side * w.value.cd];
  const at: Vec3 = [src.at[0] + u[0] * px + v[0] * py, src.at[1] + u[1] * px + v[1] * py, src.at[2] + u[2] * px + v[2] * py];
  // where the thread stands on the line of contact, along the wheel's x (which is the worm's axis, or its opposite when the wheel is on the -Y side)
  const lead = g.value.lead, px2 = g.value.px;
  const a0 = wormLayout(g.value, s.worm!.length).a0;
  const aC = a0 + (side > 0 ? 0 : lead / 2); // (the thread's figure is on the worm's +Y side: on the other side the thread is half a lead on)
  const xc = side * (aC - off);
  const delta = ((((xc - lead / 4) % px2) + px2 + px2 / 2) % px2) - px2 / 2;
  const turn = norm(t + (side > 0 ? 0 : Math.PI) + delta / w.value.rw);
  return ok({ at, turn, spec });
}
