// Gears that turn each other (`dec_mechanism_motion`, stage 2): from the gears that were meshed (`GearRecord.meshWith`), how much each gear turns (or a rack slides) for the driver's turn. Pure: a scene in, couplings out.
// A pair of outside gears turns the opposite way by the ratio of the teeth; a gear in a ring the same way; a gear and a rack: the rack slides the pinion's pitch radius for each radian it turns. A chain is worked out by walking
// from the driver along the meshes, the ratios multiplied; the direction of each follower's axis is its own, so one that lies the other way up (its plane's normal is the opposite) is accounted for.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "./scene.ts";
import type { GearRecord } from "./gearscene.ts";
import { isMade } from "./gearscene.ts";
import { gearOutline } from "./gear.ts";
import { normalOfPlane } from "./part.ts";

export interface Follower {
  gear: string;
  /** the body that is drawn moved */
  body: Ref;
  /** a turn about the axis through `point` with direction `dir`, or a slide along `dir` */
  kind: "turn" | "slide";
  point: Vec3;
  dir: Vec3;
  /** how many degrees (a turn) or mm (a slide) it makes for each degree or mm the driver makes: a negative number goes the other way round the follower's own `dir` */
  k: number;
}
const gearsOf = (s: Scene): readonly GearRecord[] => s.gears ?? [];
/** the plane's normal for a gear, or null when its plane is not there */
const normalOf = (s: Scene, rec: GearRecord): Vec3 | null => { const p = s.parts[rec.plane]; return p?.kind === "plane" ? normalize(normalOfPlane(p)) : null; };
/** the body a gear's outline was made into: the last step that used its sides (or that it owns), and the body that step names; null when there is none (a gear that is only a sketch, or a body changed since) */
export function bodyOfGear(s: Scene, rec: GearRecord): Ref | null {
  const step = [...s.steps].reverse().find((st) => st.params.gear === rec.id || st.parts.some((r) => isMade(rec.id, r)));
  if (!step) return null;
  const body = Object.values(s.parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${step.id}`);
  return body ? body.ref : null;
}
/** the gear whose body this is, if any */
export function gearOfBody(s: Scene, body: Ref): GearRecord | undefined {
  return gearsOf(s).find((g) => bodyOfGear(s, g) === body);
}
/** whether a gear is a rack, and a ring */
const isRack = (g: GearRecord): boolean => !!g.spec.rack;
/** the line a rack's teeth are along: the plane's first direction, turned by the rack's turn */
function rackDir(s: Scene, g: GearRecord): Vec3 | null {
  const p = s.parts[g.plane];
  if (p?.kind !== "plane") return null;
  const t = g.turn ?? 0;
  return normalize(add(scale(normalize(p.u), Math.cos(t)), scale(normalize(p.v), Math.sin(t))));
}
const pitchRadius = (g: GearRecord): number | null => { const o = gearOutline(g.spec); return o.ok ? o.value.pitchRadius : null; };

/** The motion of gear `b` for a degree (or mm) of gear `a`, when `b` was meshed with `a` (either way round): `k` in b's own axis, or null when this kind of pair is not worked out yet. */
function edge(s: Scene, a: GearRecord, b: GearRecord): { k: number; kind: "turn" | "slide" } | { why: string } {
  const [na, nb] = [normalOf(s, a), normalOf(s, b)];
  if (!na || !nb) return { why: "a gear's plane is gone" };
  for (const g of [a, b]) if (g.spec.worm || g.spec.wheel || g.spec.cam || g.spec.pulley || g.spec.sprocket) return { why: "worms, worm wheels, pulleys, sprockets and cams are not coupled yet" };
  // a gear and a rack
  if (isRack(a) !== isRack(b)) {
    const [gear, rack] = isRack(a) ? [b, a] : [a, b];
    const [r, t] = [pitchRadius(gear), rackDir(s, rack)];
    const ng = normalOf(s, gear);
    if (r === null || !t || !ng) return { why: "the rack and the gear do not make a pair" };
    // the rack lies on one side of the gear's centre: the way from the centre to the rack's pitch line; the rack slides along `ng x d` as the gear turns about `ng`
    const off = sub(rack.at, gear.at);
    const along = dot(off, t);
    const d = normalize(sub(off, scale(t, along)));
    const slide = normalize(cross(ng, d)); // (the way the rack goes for a turn about the gear's own axis)
    const sign = dot(slide, t) >= 0 ? 1 : -1;
    const perDeg = (r * Math.PI) / 180; // mm of slide for a degree of turn
    // the rack's amount is along `t` (its own direction); the gear's about its own normal
    return isRack(b) ? { k: sign * perDeg, kind: "slide" } : { k: sign / perDeg, kind: "turn" };
  }
  if (isRack(a) && isRack(b)) return { why: "a rack does not mesh with a rack" };
  const [za, zb] = [Math.round(a.spec.teeth), Math.round(b.spec.teeth)];
  if (!(za > 0 && zb > 0)) return { why: "the gears have no teeth to count" };
  const ring = !!a.spec.internal !== !!b.spec.internal && (a.spec.internal || b.spec.internal) ? true : false;
  const hand = ring ? 1 : -1; // (a gear in a ring goes the same way round; two outside gears go opposite ways)
  return { k: hand * (za / zb) * (dot(na, nb) >= 0 ? 1 : -1), kind: "turn" };
}

/**
 * Everything the driver turns or slides: each gear reached by walking along the meshes, with its axis, its body and how much it makes for a degree (or mm) of the driver. Gears that have no body to draw are left out; the reason
 * a pair cannot be worked out (a worm, a cam) is `why`.
 */
export function followersOf(s: Scene, driver: GearRecord): { followers: Follower[]; why?: string } {
  const links = new Map<string, string[]>();
  for (const g of gearsOf(s)) if (g.meshWith && gearsOf(s).some((q) => q.id === g.meshWith)) { links.set(g.id, [...(links.get(g.id) ?? []), g.meshWith]); links.set(g.meshWith, [...(links.get(g.meshWith) ?? []), g.id]); }
  const seen = new Map<string, number>([[driver.id, 1]]); // (the factor from the driver, in the unit of each gear's own amount)
  const out: Follower[] = [];
  let why: string | undefined;
  const queue: GearRecord[] = [driver];
  while (queue.length) {
    const a = queue.shift()!;
    for (const id of links.get(a.id) ?? []) {
      if (seen.has(id)) continue;
      const b = gearsOf(s).find((g) => g.id === id)!;
      const e = edge(s, a, b);
      if ("why" in e) { why ??= e.why; continue; }
      const k = seen.get(a.id)! * e.k;
      seen.set(id, k);
      queue.push(b);
      const [body, nb] = [bodyOfGear(s, b), normalOf(s, b)];
      const dir = e.kind === "slide" ? rackDir(s, b) : nb;
      if (body && dir) out.push({ gear: id, body, kind: e.kind, point: b.at, dir, k });
    }
  }
  return { followers: out, ...(why ? { why } : {}) };
}
/** The axis a gear turns about (through its centre, along its plane's normal), or the line a rack slides along. */
export function gearAxis(s: Scene, g: GearRecord): { kind: "turn" | "slide"; point: Vec3; dir: Vec3 } | null {
  const dir = isRack(g) ? rackDir(s, g) : normalOf(s, g);
  return dir ? { kind: isRack(g) ? "slide" : "turn", point: g.at, dir } : null;
}
