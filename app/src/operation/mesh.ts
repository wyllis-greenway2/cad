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
import { bevelOf, bevelFrame } from "./bevel.ts";
import { spiralRole, CONTACT } from "./spiral.ts";
import { faceFor } from "./face.ts";
import { PINION_OVERHANG } from "./facescene.ts";

export interface Placement { at: Vec3; turn: number; spec: GearSpec }
const TAU = 2 * Math.PI;
const wrap = (v: number, period: number): number => ((((v + period / 2) % period) + period) % period) - period / 2; // (into -period/2 .. period/2)
const norm = (a: number): number => { const t = ((a % TAU) + TAU) % TAU; return t > Math.PI ? t - TAU : t; };

/**
 * The gear (or rack) that meshes with `src`, on the plane with first and second directions `u` and `v`. `partner`: how many teeth it has; `rack`: it is a rack. `where`: for a gear or a ring as the source, the direction
 * of the partner from its centre (radians from `u` towards `v`); for a rack as the source, how far along the rack (mm from the middle of its pitch line) the partner stands. Refused, with the reason, for a gear
 * with a profile shift (its centre distance is not the plain one), for the tooth counts that make no mesh (a gear in a ring needs fewer teeth than the ring) and for a rack against a ring.
 */
export function meshWith(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; offset?: number; width?: number; land?: number; /** a ring that goes round the gear (`in_686`) */ ring?: boolean }, where: number): Result<Placement> {
  const s = src.spec;
  if (s.bevel?.facegear !== undefined) return meshFace(src, u, v, partner, where);
  if (s.bevel) return meshBevel(src, u, v, partner, where);
  if (s.cam) return err("a cam or a ratchet does not mesh with a gear");
  if (s.worm) return meshWormWheel(src, u, v, partner, where);
  if (s.wheel) return meshWheelWorm(src, u, v, partner, where);
  const z2 = Math.round(partner.teeth);
  if (s.pulley || s.sprocket) return err("a pulley or a sprocket meshes with a belt or a chain, not with a gear");
  if ((s.shift ?? 0) !== 0) return err("a gear with a profile shift is not meshed yet");
  if (!Number.isFinite(z2) || z2 < 1) return err("the partner needs teeth");
  const helical = s.helix !== undefined;
  const m = helical ? s.module / Math.cos((Math.abs(s.helix!) * Math.PI) / 180) : s.module; // (a helical gear's pitch circles are those of its transverse section)
  const at = (c: Vec3, x: number, y: number): Vec3 => [c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y, c[2] + u[2] * x + v[2] * y];
  const base: GearSpec = { teeth: z2, module: s.module, ...(helical ? { helix: (partner.ring || s.internal || partner.rack || s.rack ? 1 : -1) * s.helix! } : {}), ...(s.width ? { width: s.width } : {}), // (a helical pair outside has opposite hands, a gear in a ring the ring's own)
     ...(s.cycloidal ? { cycloidal: { ...s.cycloidal } } : {}), ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), ...(s.backlash !== undefined ? { backlash: s.backlash } : {}), ...(s.clearance !== undefined ? { clearance: s.clearance } : {}) };
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
function meshWormWheel(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; offset?: number; width?: number; land?: number }, where: number): Result<Placement> {
  const s = src.spec, g = wormOf(s);
  if (!g.ok) return g;
  if (partner.rack) return err("a rack does not mesh with a worm");
  const z2 = Math.round(partner.teeth);
  const wheel = { starts: s.teeth, diameter: s.worm!.diameter, width: 0 };
  const probe = wheelOf({ teeth: z2, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), wheel: { ...wheel, width: 1 } });
  if (!probe.ok) return probe;
  const width = partner.width && partner.width > 0 ? partner.width : Math.min(6 * s.module, 1.2 * probe.value.throat);
  const spec: GearSpec = { teeth: z2, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), wheel: { ...wheel, width, land: partner.land !== undefined && partner.land > 0 ? partner.land : 0 } }; // (no land unless one is typed: it takes the kernel about four times as long to make the wheel, `in_790`)
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
  const a0 = wormLayout(g.value, s.worm!).a0;
  const aC = a0 + (side > 0 ? 0 : lead / 2); // (the thread's figure is on the worm's +Y side: on the other side the thread is half a lead on)
  const xc = side * (aC - off);
  const delta = ((((xc - lead / 4) % px2) + px2 + px2 / 2) % px2) - px2 / 2;
  const turn = norm(t + (side > 0 ? 0 : Math.PI) + delta / w.value.rw);
  return ok({ at, turn, spec });
}

/**
 * The worm for a worm wheel (`in_697`), the other way round from `meshWormWheel`: the worm lies along the wheel's own x at the centre distance on the side of the wheel's middle the pointer is on (its length `partner.width`, its starts `partner.teeth`, `partner.offset`
 * along the wheel's x from the wheel's middle); the wheel keeps its turn and the worm is turned about its axis' direction so that its thread meets the wheel's teeth (the same fit as the wheel for a worm, solved for the worm's turn).
 */
function meshWheelWorm(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; offset?: number; width?: number; ring?: boolean }, where: number): Result<Placement> {
  const s = src.spec, w = wheelOf(s);
  if (!w.ok) return w;
  if (partner.rack || partner.ring) return err("only a worm meshes with a worm wheel");
  const starts = Math.round(partner.teeth);
  if (starts !== s.wheel!.starts) return err(`the worm for this wheel has ${s.wheel!.starts} start${s.wheel!.starts === 1 ? "" : "s"}: it was made for that many (type Starts)`);
  const length = partner.width && partner.width > 0 ? partner.width : Math.max(25, 4 * Math.PI * Math.max(1, starts)) * s.module;
  const spec: GearSpec = { teeth: starts, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), worm: { diameter: s.wheel!.diameter, length } };
  const g = wormOf(spec);
  if (!g.ok) return g;
  const tw = src.turn ?? 0;
  const side = Math.sin(where - tw) <= 0 ? 1 : -1; // (the worm is on the wheel's -Y side in the usual way round: `side` is the worm's own convention, as in `meshWormWheel`)
  const lead = g.value.lead, px2 = g.value.px;
  const a0 = wormLayout(g.value, spec.worm!).a0;
  const aC = a0 + (side > 0 ? 0 : lead / 2);
  // the wheel's teeth are fixed where they are, so the worm is fitted by sliding it along its own axis (its thread is a screw: a turn about its axis is a slide): the places that fit are a pitch apart, and the one nearest the offset asked for is taken
  const base0 = aC - side * (lead / 4);
  const off = base0 + Math.round(((partner.offset ?? 0) - base0) / px2) * px2;
  const t = norm(tw - (side > 0 ? 0 : Math.PI)); // (the wheel's turn is the worm's, plus the half turn of the other side)
  const [cx, sx] = [Math.cos(t), Math.sin(t)];
  const [qx, qy] = [cx * off - sx * side * w.value.cd, sx * off + cx * side * w.value.cd];
  const at: Vec3 = [src.at[0] - (u[0] * qx + v[0] * qy), src.at[1] - (u[1] * qx + v[1] * qy), src.at[2] - (u[2] * qx + v[2] * qy)];
  return ok({ at, turn: t, spec });
}

const [dot3, cross3, norm3] = [(a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], (a: Vec3): Vec3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }];
/**
 * The straight bevel gear that meshes with a bevel gear `src` (`dec_bevel_gears`, `in_755`; an approximation of the standard tooth): its pitch cone has the same apex and touches the source's along the line at the direction `where`
 * (radians, from the plane's first direction, taken across the source's axis) so its axis stands at the shaft angle to the source's, and it is turned to put a tooth where the source has a gap. The source's axis is its plane's normal
 * (or its frame's, if it stands across itself) and its apex lies along it at the cone distance times cos delta. Worked in 3D: the partner's frame (`BevelSpec.frame`) is the one whose first direction is the tangent of the contact, tooth 0 along it.
 */
export function meshBevel(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; ring?: boolean }, where: number): Result<Placement> {
  const s = src.spec, z2 = Math.round(partner.teeth);
  if (partner.rack || partner.ring) return err("a bevel gear meshes with a bevel gear: not with a rack or a ring");
  if (!Number.isFinite(z2) || z2 < 1) return err("the partner needs teeth");
  const g1 = bevelOf(s);
  if (!g1.ok) return g1;
  const shaft = s.bevel!.shaft ?? 90, sig = (shaft * Math.PI) / 180;
  const spec: GearSpec = { teeth: z2, module: s.module, ...(s.pressure !== undefined ? { pressure: s.pressure } : {}), ...(s.backlash !== undefined ? { backlash: s.backlash } : {}), bevel: { mate: s.teeth, ...(shaft !== 90 ? { shaft } : {}), ...(s.bevel!.face !== undefined ? { face: s.bevel!.face } : {}), ...(s.bevel!.spiral !== undefined ? { spiral: s.bevel!.spiral } : {}), ...(s.bevel!.offset ? { offset: s.bevel!.offset } : {}), ...(s.bevel!.with === undefined ? { with: src.id } : {}), dir: where } };
  const g2 = bevelOf(spec);
  if (!g2.ok) return g2;
  const f1 = bevelFrame(u, v, s, src.turn ?? 0), f0 = bevelFrame(u, v, s, 0);
  const ns = f1.n;
  // the direction across the source's axis towards the partner: the asked direction taken off the axis (the asked one if the plane is across it)
  const asked: Vec3 = [Math.cos(where) * f0.X[0] + Math.sin(where) * f0.Y[0], Math.cos(where) * f0.X[1] + Math.sin(where) * f0.Y[1], Math.cos(where) * f0.X[2] + Math.sin(where) * f0.Y[2]];
  const off = dot3(asked, ns);
  const e = norm3([asked[0] - ns[0] * off, asked[1] - ns[1] * off, asked[2] - ns[2] * off]);
  const apex: Vec3 = [src.at[0] + ns[0] * g1.value.big, src.at[1] + ns[1] * g1.value.big, src.at[2] + ns[2] * g1.value.big];
  const u2: Vec3 = [-Math.cos(sig) * ns[0] + Math.sin(sig) * e[0], -Math.cos(sig) * ns[1] + Math.sin(sig) * e[1], -Math.cos(sig) * ns[2] + Math.sin(sig) * e[2]]; // (the partner's axis out from the apex)
  const n2: Vec3 = [-u2[0], -u2[1], -u2[2]];
  const X2 = norm3(cross3(ns, e)), Y2 = norm3(cross3(n2, X2));
  // a hypoid pair (`dec_hypoid_gears`): the partner's apex (the foot of the common perpendicular on its axis) is the source's moved by the offset along the direction across both axes (the pinion below the ring gear's axis: the same sign either way round)
  const eo = -(s.bevel!.offset ?? 0), apex2: Vec3 = [apex[0] + X2[0] * eo, apex[1] + X2[1] * eo, apex[2] + X2[2] * eo];
  const at2: Vec3 = [apex2[0] + u2[0] * g2.value.big, apex2[1] + u2[1] * g2.value.big, apex2[2] + u2[2] * g2.value.big];
  // the source's tooth nearest the contact line stands phi1 (radians of its turn) from it; along the contact's tangent (the source turns the way that carries a point along X2) that is r1 phi1; the partner's teeth must stand half a pitch further along,
  // and the partner turns the other way about its own axis (its tangent there is the opposite), so its offset from the contact is the opposite of that arc over its pitch radius
  const [r1, r2, pitch1] = [g1.value.pitchRadius, g2.value.pitchRadius, TAU / Math.round(s.teeth)];
  const asnap = (x: number, period: number) => ((x % period) + period) % period;
  const phi1 = asnap((src.turn ?? 0) - Math.atan2(dot3(e, f0.Y), dot3(e, f0.X)), pitch1);
  const spiral = s.bevel!.spiral !== undefined;
  // a spiral pair (`spiral.ts`): the place the pair was made at has the pinion's contact line at azimuth -pi/2 of its body and the ring gear's at +pi/2; turning one by an angle turns the other by the ratio of their teeth the other way, whatever the angle (the surfaces are conjugate), so the partner's phase follows from the source's, no tooth to snap to
  const beta2 = spiral ? CONTACT[spiralRole(spec)] - (Math.round(s.teeth) / z2) * ((Math.atan2(dot3(e, f0.Y), dot3(e, f0.X)) - (src.turn ?? 0)) - CONTACT[spiralRole(s)]) : 0;
  const psi = spiral ? -beta2 : asnap(-(r1 * phi1 + (Math.PI * s.module) / 2) / r2, TAU / z2);
  const e2: Vec3 = [(-ns[0] + Math.cos(sig) * n2[0]) / Math.sin(sig), (-ns[1] + Math.cos(sig) * n2[1]) / Math.sin(sig), (-ns[2] + Math.cos(sig) * n2[2]) / Math.sin(sig)]; // (the direction across the partner's axis towards the source)
  const a2 = Math.atan2(dot3(e2, Y2), dot3(e2, X2));
  return ok({ at: at2, turn: norm(a2 + psi), spec: { ...spec, bevel: { ...spec.bevel!, frame: [X2, Y2] } } });
}

/**
 * The other gear of a face gear drive (`dec_crown_gear_set`, `in_886`): the spur pinion for a face gear, or the face gear for a pinion, the axes crossing at 90 degrees. The pinion's axis lies along the radius of the face gear that `where` points along (radians from the first direction of
 * the plane, for a face gear; for a pinion, the direction from its axis towards the face gear, in its own plane), at the height of its pitch radius above the face gear's pitch plane; its plane is across that axis at the inner end of the teeth (a millimetre short) and its directions are
 * the tangent and the face gear's axis. A pair rolls: the pinion turned by an angle turns the face gear by z1 / z2 of it the same way about its axis, in any state (the surfaces are conjugate), so the partner's phase follows from the source's. The pair's place has the face gear's slot 0
 * on the contact radius and the pinion's tooth 0 pointing at it.
 */
export function meshFace(src: GearRecord, u: Vec3, v: Vec3, partner: { teeth: number; rack?: boolean; ring?: boolean }, where: number): Result<Placement> {
  const s = src.spec, z2 = Math.round(partner.teeth), b = s.bevel!;
  if (partner.rack || partner.ring) return err("a face gear drive is a face gear and a spur pinion: not a rack or a ring");
  if (!Number.isFinite(z2) || z2 < 1) return err("the partner needs teeth");
  const mine = faceFor(s);
  if (!mine.ok) return mine;
  const role = b.facegear!;
  const spec: GearSpec = { teeth: z2, module: s.module, ...(s.backlash !== undefined ? { backlash: s.backlash } : {}), ...(s.crown ? { crown: { ...s.crown } } : {}), bevel: { mate: s.teeth, facegear: role === "gear" ? "pinion" : "gear", ...(b.with === undefined ? { with: src.id } : {}), dir: where } };
  const theirs = faceFor(spec);
  if (!theirs.ok) return theirs;
  const pr = theirs.value.pair;
  const [f0, f1] = [bevelFrame(u, v, s, 0), bevelFrame(u, v, s, src.turn ?? 0)];
  const kk = pr.z1 / pr.z2;
  const dirOf = (a: number): Vec3 => [Math.cos(a) * f0.X[0] + Math.sin(a) * f0.Y[0], Math.cos(a) * f0.X[1] + Math.sin(a) * f0.Y[1], Math.cos(a) * f0.X[2] + Math.sin(a) * f0.Y[2]];
  if (role === "gear") { // the source is the face gear: the pinion lies along the radius at `where`, above the teeth
    const n = f1.n, asked = dirOf(where), off = dot3(asked, n);
    const e = norm3([asked[0] - n[0] * off, asked[1] - n[1] * off, asked[2] - n[2] * off]);
    const t = norm3(cross3(n, e));
    const p = (k: number): Vec3 => [src.at[0] + n[0] * pr.r1 + e[0] * k, src.at[1] + n[1] * pr.r1 + e[1] * k, src.at[2] + n[2] * pr.r1 + e[2] * k];
    const omega = Math.atan2(dot3(e, f0.Y), dot3(e, f0.X));
    const phiF = (src.turn ?? 0) - omega, phiP = phiF / kk;
    return ok({ at: p(pr.inner - PINION_OVERHANG), turn: norm(-Math.PI / 2 + phiP), spec: { ...spec, bevel: { ...spec.bevel!, frame: [t, n] } } });
  }
  // the source is the pinion: the face gear lies below it on the side `where` points to
  const ep = f1.n, asked = dirOf(where), off = dot3(asked, ep);
  const d = norm3([asked[0] - ep[0] * off, asked[1] - ep[1] * off, asked[2] - ep[2] * off]);
  const nF: Vec3 = [-d[0], -d[1], -d[2]];
  const I: Vec3 = [src.at[0] - ep[0] * (pr.inner - PINION_OVERHANG), src.at[1] - ep[1] * (pr.inner - PINION_OVERHANG), src.at[2] - ep[2] * (pr.inner - PINION_OVERHANG)];
  const at2: Vec3 = [I[0] + d[0] * pr.r1, I[1] + d[1] * pr.r1, I[2] + d[2] * pr.r1];
  const Y = norm3(cross3(nF, ep));
  const phiP = (src.turn ?? 0) - where;
  return ok({ at: at2, turn: norm(kk * phiP), spec: { ...spec, bevel: { ...spec.bevel!, frame: [ep, Y] } } });
}
