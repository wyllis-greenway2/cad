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
import { bevelFrame } from "./bevel.ts";
import { chainOf } from "./chains.ts";
import { camShapes } from "./cams.ts";
import { mateStatus } from "./mates.ts";

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
  /** a cam's follower: a slide for each whole degree of the cam's turn (360 numbers, counted from where the cam stands), instead of `k` times the driver's amount */
  table?: number[];
  /** the slider's mate, for keeping the pose */
  mate?: string;
  /** a Geneva wheel: turned by its crank by the law of the drive (`genevaTurn`) instead of `k` times the driver's amount; `n` slots, `a` the crank's radius */
  geneva?: { n: number; a: number };
  /** a planet on a turning carrier: after it has turned about its own axis (`k`), the whole is turned again about this axis by `k` times the driver's amount (the orbit) */
  after?: { point: Vec3; dir: Vec3; k: number };
  /** a body that yields to contact (`interaction/contact.ts`): where it stands, whatever the driver's amount */
  value?: number;
}
/**
 * How far a Geneva wheel has turned (degrees, the way round that the crank turns being positive) when the crank has turned `deg` degrees from the pose the drive is drawn in (the pin pointing away from the wheel, the wheel locked). The pin
 * is in a slot while the crank is within `beta = 90 - 180/n` degrees either side of the line of centres; there the wheel follows the slot, outside it the wheel stands still: a step of 360/n degrees for each turn of the crank, the other way round.
 */
export function genevaTurn(n: number, a: number, deg: number): number {
  const c = a / Math.sin(Math.PI / n), beta = Math.PI / 2 - Math.PI / n, step = (2 * Math.PI) / n;
  const phi = (deg * Math.PI) / 180;
  const turns = Math.floor(phi / (2 * Math.PI));
  const al = Math.PI - (phi - turns * 2 * Math.PI); // (the crank's angle from the line of centres, 180 at the start)
  const p = al > beta ? 0 : al < -beta ? step : Math.PI / n - Math.atan2(a * Math.sin(al), c - a * Math.cos(al));
  return (-(turns * step + p) * 180) / Math.PI;
}
/** How much a follower makes when the driver is at `a` (degrees or mm): its ratio, or a cam follower's table, read between the whole degrees and round the turn. */
export function followAmount(f: Pick<Follower, "k" | "table" | "geneva" | "value">, a: number): number {
  if (f.value !== undefined) return f.value;
  if (f.geneva) return genevaTurn(f.geneva.n, f.geneva.a, a);
  const t = f.table;
  if (!t || t.length === 0) return f.k * a;
  const x = ((a % t.length) + t.length) % t.length;
  const i = Math.floor(x);
  return t[i]! + (t[(i + 1) % t.length]! - t[i]!) * (x - i);
}
const gearsOf = (s: Scene): readonly GearRecord[] => s.gears ?? [];
/** the plane's normal for a gear, or null when its plane is not there */
const normalOf = (s: Scene, rec: GearRecord): Vec3 | null => { const p = s.parts[rec.plane]; return p?.kind === "plane" ? normalize(normalOfPlane(p)) : null; };
/**
 * The axis a gear really turns about: its plane's normal for a plain gear; the normal of its own frame for a bevel, crown, spiral or face gear that was meshed with another (its plane is the source's, its shaft stands at the shaft angle: `meshBevel`, `meshFace`);
 * the worm's own X (its shaft lies in the plane, along the plane's first direction turned by the record's turn). Null when the plane is not there.
 */
export function axisOf(s: Scene, rec: GearRecord): Vec3 | null {
  const p = s.parts[rec.plane];
  if (p?.kind !== "plane") return null;
  if (rec.spec.worm) { const [c, sn, u, v] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0), normalize(p.u), normalize(p.v)]; return normalize(add(scale(u, c), scale(v, sn))); }
  if (rec.spec.bevel) return bevelFrame(normalize(p.u), normalize(p.v), rec.spec, 0).n;
  return normalOf(s, rec);
}
/** the body a gear's outline was made into: the last step that used its sides (or that it owns), and the body that step names; null when there is none (a gear that is only a sketch, or a body changed since) */
export function bodyOfGear(s: Scene, rec: GearRecord): Ref | null {
  const step = [...s.steps].reverse().find((st) => st.params.gear === rec.id || st.parts.some((r) => isMade(rec.id, r)));
  if (!step) return null;
  const body = Object.values(s.parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${step.id}`);
  return body ? body.ref : null;
}
/** the gear whose body this is, if any (a Geneva drive made as a model has three: the wheel, the locking disc and the crank) */
export function gearOfBody(s: Scene, body: Ref): GearRecord | undefined {
  return gearsOf(s).find((g) => bodyOfGear(s, g) === body || (g.spec.cam?.kind === "geneva" && Object.values(genevaBodies(s, g)).includes(body)));
}
const bodyOfStep = (s: Scene, id: string): Ref | null => { const b = Object.values(s.parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${id}`); return b ? b.ref : null; };
/** The bodies of a Geneva drive that comes as a model (`layout: "model"`): the wheel, the locking disc (when there is one) and the crank with its pin; empty for anything else. */
export function genevaBodies(s: Scene, rec: GearRecord): { wheel?: Ref; disc?: Ref; crank?: Ref } {
  if (rec.spec.cam?.kind !== "geneva" || rec.spec.cam.layout !== "model") return {};
  const owned = s.steps.filter((st) => st.params.gear === rec.id);
  const fresh = owned.filter((st) => st.params.mode === "new");
  const [w, d, c] = [fresh[0], fresh.length === 3 ? fresh[1] : undefined, fresh[fresh.length - 1]]; // (the pin is added to the crank's body: the crank is the last new one)
  const out: { wheel?: Ref; disc?: Ref; crank?: Ref } = {};
  const [wb, db, cb] = [w ? bodyOfStep(s, w.id) : null, d ? bodyOfStep(s, d.id) : null, c ? bodyOfStep(s, c.id) : null];
  if (wb) out.wheel = wb;
  if (db) out.disc = db;
  if (cb) out.crank = cb;
  return out;
}
/** The crank's shaft: the second shaft of the drive, a line's length from the wheel's along the record's own first direction. */
function genevaShaft(s: Scene, rec: GearRecord): Vec3 | null {
  const [cam, plane] = [rec.spec.cam, s.parts[rec.plane]];
  if (!cam || plane?.kind !== "plane") return null;
  const c = (cam.crank ?? 0) / Math.sin(Math.PI / Math.max(3, Math.round(cam.teeth ?? 0)));
  const t = rec.turn ?? 0, [u, v] = [normalize(plane.u), normalize(plane.v)];
  return add(rec.at, add(scale(u, c * Math.cos(t)), scale(v, c * Math.sin(t))));
}
/** The Geneva drive as it is played from its crank (or its disc): the disc and the crank turn together about the second shaft, and the wheel follows by the law of the drive. Null for anything else; `why` when it is the wheel. */
export function genevaPlay(s: Scene, rec: GearRecord, body: Ref): { driver: { point: Vec3; dir: Vec3 }; followers: Follower[] } | { why: string } | null {
  const b = genevaBodies(s, rec);
  if (!b.wheel || !b.crank) return null;
  if (body === b.wheel) return { why: "the wheel is turned by its crank: play the crank or the locking disc" };
  const [shaft, n] = [genevaShaft(s, rec), normalOf(s, rec)];
  if (!shaft || !n) return null;
  const other = body === b.crank ? b.disc : b.crank;
  const cam = rec.spec.cam!;
  const followers: Follower[] = [{ gear: rec.id, body: b.wheel, kind: "turn", point: rec.at, dir: n, k: 0, geneva: { n: Math.round(cam.teeth ?? 0), a: cam.crank ?? 0 } }];
  if (other) followers.push({ gear: rec.id, body: other, kind: "turn", point: shaft, dir: n, k: 1 });
  return { driver: { point: shaft, dir: n }, followers };
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

/**
 * A worm and its wheel: the wheel makes `starts / teeth` turns for a turn of the worm (the other way round for the worm). The way: the thread is a right-handed helix (`wormSteps`: a positive turn with a positive advance), so a turn of the worm by `w1` about its own axis X
 * moves its surface at the contact by `-w1 lead / 2 pi` along X, and the wheel's surface there (`w2 R` along `n x y`, `y` the way from the wheel's centre to the worm's axis) must go with it. A worm with a wheel with the wrong sign would turn it backwards.
 */
function wormEdge(a: GearRecord, b: GearRecord, na: Vec3, nb: Vec3): { k: number } & { kind: "turn" } | { why: string } {
  const [worm, wheel] = a.spec.worm && b.spec.wheel ? [a, b] : b.spec.worm && a.spec.wheel ? [b, a] : [null, null];
  if (!worm || !wheel) return { why: "a worm meshes with a worm wheel" };
  const [nw, nh] = worm === a ? [na, nb] : [nb, na];
  const z = Math.round(wheel.spec.teeth), starts = Math.round(worm.spec.teeth);
  if (!(z > 0 && starts > 0)) return { why: "the gears have no teeth to count" };
  const off = sub(worm.at, wheel.at);
  const y = sub(off, scale(nh, dot(off, nh))); // (the way from the wheel's centre across to the worm's axis)
  if (Math.hypot(...y) < 1e-9) return { why: "the worm's axis passes through the wheel's centre" };
  const sign = -(dot(cross(nh, normalize(y)), nw) >= 0 ? 1 : -1); // (the wheel's turn about its own axis for a positive turn of the worm)
  const kw = sign * (starts / z);
  return { k: wheel === b ? kw : 1 / kw, kind: "turn" };
}
/** The belt or chain a pulley or sprocket runs on, as one text to compare: a pulley's belt kind and pitch, a sprocket's chain pitch and roller; null for anything else. */
function chainOf2(g: GearRecord): string | null {
  if (g.spec.pulley) return `${g.spec.pulley}:${g.spec.module}`;
  if (g.spec.sprocket) { const c = chainOf(g.spec.sprocket); return c ? `chain:${c.pitch.toFixed(4)}:${c.roller.toFixed(4)}` : null; }
  return null;
}
/** The motion of gear `b` for a degree (or mm) of gear `a`, when `b` was meshed with `a` (either way round): `k` in b's own axis, or null when this kind of pair is not worked out yet. */
function edge(s: Scene, a: GearRecord, b: GearRecord): { k: number; kind: "turn" | "slide" } | { why: string } {
  const [na, nb] = [axisOf(s, a), axisOf(s, b)];
  if (!na || !nb) return { why: "a gear's plane is gone" };
  for (const g of [a, b]) if (g.spec.cam) return { why: "cams are not coupled to gears" };
  if (a.spec.pulley || b.spec.pulley || a.spec.sprocket || b.spec.sprocket) { // a belt or a chain: both turn the same way by the ratio of the teeth, if it is the same belt or chain (`in_1125`)
    const [ca, cb] = [chainOf2(a), chainOf2(b)];
    if (!ca || !cb || ca !== cb) return { why: "a belt or a chain goes round pulleys or sprockets of its own pitch" };
    const [za, zb] = [Math.round(a.spec.teeth), Math.round(b.spec.teeth)];
    if (!(za > 0 && zb > 0)) return { why: "the gears have no teeth to count" };
    return { k: (za / zb) * (dot(na, nb) >= 0 ? 1 : -1), kind: "turn" };
  }
  if (a.spec.worm || b.spec.worm || a.spec.wheel || b.spec.wheel) return wormEdge(a, b, na, nb);
  const [ba, bb] = [a.spec.bevel, b.spec.bevel];
  if (ba || bb) {
    if (!ba || !bb) return { why: "a bevel gear meshes with a bevel gear" };
    const [za, zb] = [Math.round(a.spec.teeth), Math.round(b.spec.teeth)];
    if (!(za > 0 && zb > 0)) return { why: "the gears have no teeth to count" };
    // each about its own shaft (`axisOf`): a pair of cones, or of a crown and its pinion, goes the other way round (`meshBevel`: the partner's tangent at the contact is the opposite); a face gear and its pinion go the same way (`meshFace`: the pinion's turn gives the gear's z1/z2 of it)
    return { k: (ba.facegear !== undefined ? 1 : -1) * (za / zb), kind: "turn" };
  }
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
  for (const q of s.planetaries ?? []) { // a planetary set: the sun meshes each planet, and the ring meshes them (the first stands for the rest: the others reach it through the sun)
    const ids = new Set(gearsOf(s).map((g) => g.id));
    const pairs: [string, string][] = [...q.planetIds.map((p): [string, string] => [q.sunId, p]), ...(q.planetIds[0] ? [[q.ringId, q.planetIds[0]] as [string, string]] : [])];
    for (const [x, y] of pairs) if (ids.has(x) && ids.has(y)) { links.set(x, [...(links.get(x) ?? []), y]); links.set(y, [...(links.get(y) ?? []), x]); }
  }
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
      const [body, nb] = [bodyOfGear(s, b), axisOf(s, b)];
      const dir = e.kind === "slide" ? rackDir(s, b) : nb;
      if (body && dir) out.push({ gear: id, body, kind: e.kind, point: b.at, dir, k });
    }
  }
  const cam = camFollower(s, driver);
  if ("why" in cam) why ??= cam.why;
  else if (cam.follower) out.push(cam.follower);
  return { followers: out, ...(why ? { why } : {}) };
}

type V2 = readonly [number, number];
/** The edge of a cam, in its own flat numbers (before it is turned): the circle of an eccentric, the spiral of a snail (the line that closes it is implied), a disc cam's curve. */
function camEdge(rec: GearRecord): V2[] | null {
  const c = rec.spec.cam ? camShapes(rec.spec.cam) : null;
  if (!c || !c.ok) return null;
  const sh = c.value;
  if (sh.closed) return sh.closed;
  if (sh.spiral) return sh.spiral;
  const disc = sh.circles.find((q) => !q.hole);
  if (disc) return Array.from({ length: 180 }, (_, i) => [disc.c[0] + disc.r * Math.cos((i * Math.PI) / 90), disc.c[1] + disc.r * Math.sin((i * Math.PI) / 90)] as V2);
  return null;
}
/** How far along the line `p0 + t e` the edge reaches on one side (the furthest `t` for side 1, the nearest for -1), or null when the line misses it. */
function reach(poly: readonly V2[], p0: V2, e: V2, side: 1 | -1): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const [rx, ry] = [b[0] - a[0], b[1] - a[1]];
    const den = e[0] * ry - e[1] * rx;
    if (Math.abs(den) < 1e-12) continue;
    const [qx, qy] = [a[0] - p0[0], a[1] - p0[1]];
    const t = (qx * ry - qy * rx) / den;
    const u = (qx * e[1] - qy * e[0]) / den;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    if (best === null || (side === 1 ? t > best : t < best)) best = t;
  }
  return best;
}
/**
 * The follower of a cam: the body of the slider mate it was linked to (`GearRecord.follower`) rides the cam's edge along the slider's own line, which has to lie in the cam's plane. The table is the slide for each degree the cam turns, from the pose it stands in.
 * `{}` when the cam has no follower; `why` when it has one that cannot be worked out.
 */
export function camFollower(s: Scene, rec: GearRecord): { follower?: Follower } | { why: string } {
  const link = rec.follower;
  if (!link) return {};
  const m = mateStatus(s).find((x) => x.id === link.mate && x.state === "ok" && x.mode === "coaxial" && x.mover);
  const [n, plane, edge] = [normalOf(s, rec), s.parts[rec.plane], camEdge(rec)];
  if (!m?.mover || !n || plane?.kind !== "plane" || !edge) return { why: "the cam's follower is not a slider on a rod any more" };
  const d = normalize(m.mover.dir);
  if (Math.abs(dot(d, n)) > 1e-3) return { why: "the follower's rod does not lie in the cam's plane" };
  const [u, v] = [normalize(plane.u), normalize(plane.v)];
  const rel = sub(m.mover.point, rec.at);
  const p0: V2 = [dot(rel, u), dot(rel, v)];
  const e: V2 = [dot(d, u), dot(d, v)];
  const table: number[] = [];
  let first: number | null = null, prev = 0;
  for (let deg = 0; deg < 360; deg++) {
    const phi = -((rec.turn ?? 0) + (deg * Math.PI) / 180);
    const [c, sn] = [Math.cos(phi), Math.sin(phi)];
    const rot = (q: V2): V2 => [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c];
    const t = reach(edge, rot(p0), rot(e), link.side);
    if (t !== null) { first ??= t; prev = t - first; }
    table.push(prev);
  }
  if (first === null) return { why: "the follower's rod misses the cam" };
  return { follower: { gear: rec.id, body: m.mover.body, kind: "slide", point: m.mover.point, dir: d, k: 0, table, mate: m.id } };
}
/** The axis a gear turns about (through its centre, along its plane's normal), or the line a rack slides along. */
export function gearAxis(s: Scene, g: GearRecord): { kind: "turn" | "slide"; point: Vec3; dir: Vec3 } | null {
  const dir = isRack(g) ? rackDir(s, g) : axisOf(s, g);
  return dir ? { kind: isRack(g) ? "slide" : "turn", point: g.at, dir } : null;
}

/**
 * A planetary set played from its carrier (the plate with the pins, one body): the carrier turns about the sun's axis and the sun is held. The ring turns `1 + S/R` for each degree of the carrier, and each planet turns `S/P` about its own axis and then
 * goes round the centre with the carrier (it rolls round the held sun, so its turn in the world is `1 + S/P`). `S`, `P` and `R` are the sun's, a planet's and the ring's teeth. Null when this body is not a carrier.
 */
export function carrierPlay(s: Scene, body: Ref): { driver: { point: Vec3; dir: Vec3 }; followers: Follower[] } | null {
  const q = (s.planetaries ?? []).find((p) => p.carrierStep && bodyOfStep(s, p.carrierStep) === body);
  const n = q ? normalOf(s, { plane: q.plane } as GearRecord) : null;
  if (!q || !n) return null;
  const [S, P] = [q.spec.sun, q.spec.planet], R = S + 2 * P;
  const followers: Follower[] = [];
  for (const id of q.planetIds) {
    const g = gearsOf(s).find((x) => x.id === id), b = g ? bodyOfGear(s, g) : null;
    if (g && b) followers.push({ gear: id, body: b, kind: "turn", point: g.at, dir: n, k: S / P, after: { point: q.at, dir: n, k: 1 } });
  }
  const ring = gearsOf(s).find((x) => x.id === q.ringId), rb = ring ? bodyOfGear(s, ring) : null;
  if (ring && rb) followers.push({ gear: q.ringId, body: rb, kind: "turn", point: q.at, dir: n, k: 1 + S / R });
  return { driver: { point: q.at, dir: n }, followers };
}

/**
 * The bodies that are hooked up to an animation, each with the body whose Play moves it: a pin or a rod on a joint, a gear and the gears meshed with it, the crank and disc of a Geneva drive (the wheel, which they drive, goes with its crank), a planetary
 * set's carrier, and a cam with its follower (the rod goes with the cam). Cheap enough for every change of the scene: one look at the mates and one at each record.
 */
export function animatedBodies(s: Scene): Map<Ref, Ref> {
  const out = new Map<Ref, Ref>();
  for (const m of mateStatus(s)) if (m.state === "ok" && m.mode === "coaxial" && m.mover) out.set(m.mover.body, m.mover.body);
  for (const g of gearsOf(s)) {
    const [b, ax] = [bodyOfGear(s, g), gearAxis(s, g)];
    if (b && ax) out.set(b, b);
    const gb = genevaBodies(s, g);
    if (gb.crank) { out.set(gb.crank, gb.crank); if (gb.disc) out.set(gb.disc, gb.crank); if (gb.wheel) out.set(gb.wheel, gb.crank); }
    if (g.follower && b) { const m = mateStatus(s).find((x) => x.id === g.follower!.mate && x.mover); if (m?.mover) out.set(m.mover.body, b); } // (the rod rides the cam: playing it plays the cam)
  }
  for (const pv of s.pivots ?? []) { const b = Object.values(s.parts).find((p) => p.kind === "body" && p.id === pv.body); if (b) out.set(b.ref, b.ref); } // (a body made to turn)
  for (const q of s.planetaries ?? []) { const c = q.carrierStep ? bodyOfStep(s, q.carrierStep) : null; if (c) out.set(c, c); }
  return out;
}
