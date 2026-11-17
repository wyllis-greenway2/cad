// A gear that keeps its numbers (`dec_gear_tool`, `in_577`): the scene holds a record (the plane, the centre, the numbers) and the gear's parts are made from it each time the scene is derived, as the copies of a repeat are
// (`repeat.ts`), so changing the numbers changes the gear and the bodies made from it. The parts are locked (they are the gear's, not drawn); they are named by the gear and their place in the outline
// (`d/g_003.s17`), so a step made from them finds them again; when the numbers change the count of sides, the steps that use the whole outline are given the new sides. Pure: scenes in, scenes out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, Step } from "./scene.ts";
import { nextId, bumpCounter } from "./scene.ts";
import type { Part } from "./part.ts";
import { gearOutline, helixTwist, helixShear, hasBody, chamferProfile } from "./gear.ts";
import { boreLoop } from "./bore.ts";
import type { GearSpec, GearOutline } from "./gear.ts";
import { wormRefs, wormParts, wormSteps, wheelRefs, wheelParts, wheelSteps } from "./wormscene.ts";
import { wheelSections } from "./wheelsections.ts";
import { bevelRefs, bevelParts, bevelSteps } from "./bevelscene.ts";
import { camShapes } from "./cams.ts";
import { camParts, camRefs, camSteps } from "./camscene.ts";
import { meshBevel } from "./mesh.ts";

/** `at`: the centre, in the world; `turn`: how far the gear is turned about its centre in its plane, radians (tooth 0 points along the plane's first direction when 0); `spec`: the numbers (`gear.ts`) */
export interface GearRecord { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn?: number; /** the gear this one was meshed with when it was made (Mesh gear): they turn each other (`gearcouple.ts`, `dec_mechanism_motion`) */ meshWith?: string }

const gearsOf = (s: Scene): readonly GearRecord[] => s.gears ?? [];
/** Whether this part is made by the gear `id`. */
export const isMade = (id: string, ref: Ref): boolean => ref.startsWith(`d/${id}.`);
export const madeByAGear = (s: Scene, ref: Ref): boolean => gearsOf(s).some((g) => isMade(g.id, ref));

const cache = new Map<string, Result<GearOutline>>();
function outlineOf(spec: GearSpec): Result<GearOutline> {
  const key = JSON.stringify(spec);
  let r = cache.get(key);
  if (!r) {
    r = gearOutline(spec);
    if (cache.size > 64) cache.clear();
    cache.set(key, r);
  }
  return r;
}
const cornerRef = (id: string, i: number): Ref => drawnRef(`${id}.p${i}`);
const lineRef = (id: string, i: number): Ref => drawnRef(`${id}.s${i}`);
/** The sides of a gear's outline, in order (what a step that extrudes it names), the circle of its bore and, for a ring, the circle of its wall; empty if the numbers make no gear. */
export function gearRefs(rec: GearRecord): { lines: Ref[]; wall?: Ref; bore?: string } {
  if (rec.spec.cam) return camRefs(rec); // (a cam or a ratchet, `camscene.ts`)
  const o = outlineOf(rec.spec);
  if (!o.ok) return { lines: [] };
  if (rec.spec.bevel) { const b = bevelRefs(rec); return { lines: b.sections[0]!, ...(b.bores[0] ? { bore: b.bores[0] } : {}) }; } // (the big end)
  if (rec.spec.worm) return { lines: wormRefs(rec).threads[0]! }; // (the thread's figure)
  if (rec.spec.wheel) { const w = wheelRefs(rec); return { lines: w.sections[Math.floor(w.sections.length / 2)]!, ...(w.bores[0] ? { bore: w.bores[Math.floor(w.bores.length / 2)]! } : {}) }; } // (the middle section)
  return { lines: o.value.points.map((_, i) => lineRef(rec.id, i)), ...(o.value.outerRadius !== undefined ? { wall: drawnRef(`${rec.id}.k`) } : {}), ...(!rec.spec.internal && (rec.spec.bore ?? 0) > 0 ? { bore: boreGroup(rec) } : {}) };
}

/** The bore as a hole of a step names it: its circle, or the sides of its D or keyway loop joined by commas. */
function boreGroup(rec: GearRecord): string {
  const l = boreLoop(rec.spec);
  return l ? l.points.map((_, i) => drawnRef(`${rec.id}.bs${i}`)).join(",") : drawnRef(`${rec.id}.b`);
}

/** The parts of a gear: the corners and sides of its outline and, for a ring, its wall's circle. Locked. Empty if its plane is not there or the numbers make no gear. */
function partsOf(s: Scene, rec: GearRecord): Part[] {
  if (rec.spec.bevel) return bevelParts(s, rec);
  if (rec.spec.cam) return camParts(s, rec);
  if (rec.spec.worm) return wormParts(s, rec);
  if (rec.spec.wheel) return wheelParts(s, rec);
  const plane = s.parts[rec.plane];
  const o = outlineOf(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return [];
  const g = o.value;
  const [ct, st] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
  const at = (q: readonly [number, number]): Vec3 => { const p = [q[0] * ct - q[1] * st, q[0] * st + q[1] * ct]; return [rec.at[0] + plane.u[0] * p[0]! + plane.v[0] * p[1]!, rec.at[1] + plane.u[1] * p[0]! + plane.v[1] * p[1]!, rec.at[2] + plane.u[2] * p[0]! + plane.v[2] * p[1]!]; };
  const base = { origin: "drawn" as const, plane: rec.plane, movable: false };
  const n = g.points.length;
  const out: Part[] = g.points.map((p, i): Part => ({ ...base, ref: cornerRef(rec.id, i), kind: "corner", at: at(p) }));
  for (let i = 0; i < n; i++) out.push({ ...base, ref: lineRef(rec.id, i), kind: "line", a: cornerRef(rec.id, i), b: cornerRef(rec.id, (i + 1) % n), ...(g.bulges[i] ? { bulge: g.bulges[i]! } : {}) });
  if (g.outerRadius !== undefined) {
    out.push({ ...base, ref: drawnRef(`${rec.id}.c`), kind: "corner", at: rec.at });
    out.push({ ...base, ref: drawnRef(`${rec.id}.k`), kind: "circle", center: drawnRef(`${rec.id}.c`), radius: g.outerRadius });
  }
  const loop = !g.outerRadius ? boreLoop(rec.spec) : null;
  if (loop) {
    const m = loop.points.length;
    loop.points.forEach((p, i) => out.push({ ...base, ref: drawnRef(`${rec.id}.bp${i}`), kind: "corner", at: at(p) }));
    loop.points.forEach((_, i) => out.push({ ...base, ref: drawnRef(`${rec.id}.bs${i}`), kind: "line", a: drawnRef(`${rec.id}.bp${i}`), b: drawnRef(`${rec.id}.bp${(i + 1) % m}`), ...(loop.bulges[i] ? { bulge: loop.bulges[i]! } : {}) }));
  } else if (!g.outerRadius && (rec.spec.bore ?? 0) > 0) {
    out.push({ ...base, ref: drawnRef(`${rec.id}.bc`), kind: "corner", at: rec.at });
    out.push({ ...base, ref: drawnRef(`${rec.id}.b`), kind: "circle", center: drawnRef(`${rec.id}.bc`), radius: rec.spec.bore! / 2 });
  }
  const cut = chamferProfile(rec.spec, g.tipRadius);
  if (cut) { // the figure of the chamfer's cutter (`in_791`): drawn on a plane through the axis, along the plane's first direction and its normal
    const nn = cross3(plane.u, plane.v), len = Math.hypot(...nn) || 1;
    const q = drawnRef(`${rec.id}.xq`);
    out.push({ ref: q, origin: "drawn", plane: null, movable: false, kind: "plane", at: rec.at, u: plane.u, v: [nn[0] / len, nn[1] / len, nn[2] / len] });
    const b2 = { origin: "drawn" as const, plane: q, movable: false };
    cut.forEach(([r, h], i) => out.push({ ...b2, ref: drawnRef(`${rec.id}.xp${i}`), kind: "corner", at: [rec.at[0] + plane.u[0] * r + (nn[0] / len) * h, rec.at[1] + plane.u[1] * r + (nn[1] / len) * h, rec.at[2] + plane.u[2] * r + (nn[2] / len) * h] }));
    cut.forEach((_, i) => out.push({ ...b2, ref: drawnRef(`${rec.id}.xs${i}`), kind: "line", a: drawnRef(`${rec.id}.xp${i}`), b: drawnRef(`${rec.id}.xp${(i + 1) % cut.length}`) }));
  }
  return out;
}
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The steps of a tooth chamfer (`in_791`): the cutter turned a full turn as a piece of its own, then cut from the gear's body (the body the gear's first step made, `@s0`); a cut acts on every body, so the neighbours are not asked. */
function chamferSteps(s: Scene, rec: GearRecord): Omit<Step, "id">[] {
  const plane = s.parts[rec.plane], o = outlineOf(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return [];
  const cut = chamferProfile(rec.spec, o.value.tipRadius);
  if (!cut) return [];
  const n = cross3(plane.u, plane.v), len = Math.hypot(...n) || 1;
  const lines = cut.map((_, i) => drawnRef(`${rec.id}.xs${i}`));
  return [
    { type: "revolve", parts: lines, params: { angle: 360, advance: 0, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: n[0] / len, dy: n[1] / len, dz: n[2] / len, mode: "new", gear: rec.id, tool: 1 } },
    { type: "combine", parts: ["@s0", "@s1"] as Ref[], params: { mode: "subtract", gear: rec.id } },
  ];
}

/** The scene with its gears' parts made again from the records as they are now (the old ones taken out first). */
export function withGears(s: Scene): Scene {
  const recs = gearsOf(s);
  if (!recs.length) return s;
  const parts: Record<string, Part> = {};
  const prefixes = recs.map((r) => `d/${r.id}.`);
  for (const p of Object.values(s.parts)) if (!(p.origin === "drawn" && prefixes.some((x) => p.ref.startsWith(x)))) parts[p.ref] = p;
  for (const r of recs) for (const p of madeParts({ ...s, parts }, r)) parts[p.ref] = p;
  return { ...s, parts };
}

/**
 * The parts of a gear, kept while its record and its plane are the same ones: made again for every change of the scene they were new objects each time, so that everything worked out from them (a loop's points, a face) was worked out
 * again for every gear on every edit (`in_727`). A gear whose numbers change has a new record, and so new parts.
 */
const madeKept = new WeakMap<GearRecord, { plane: Part | undefined; parts: Part[] }>();
function madeParts(s: Scene, rec: GearRecord): Part[] {
  const plane = s.parts[rec.plane];
  const kept = madeKept.get(rec);
  if (kept && kept.plane === plane) return kept.parts;
  const parts = partsOf(s, rec);
  madeKept.set(rec, { plane, parts });
  return parts;
}

/** The figure of the body of a plain gear or a ring: the outline and its bore, or, for a ring, the circle of its wall with the teeth as the hole. */
function bodyFigure(rec: GearRecord): { parts: Ref[]; holes?: string } {
  const r = gearRefs(rec);
  if (rec.spec.internal && r.wall) return { parts: [r.wall as Ref], holes: r.lines.join(",") };
  return { parts: r.lines, ...(r.bore ? { holes: r.bore } : {}) };
}
/** The numbers of the step that makes the body of a gear with a helix or a thickness (`in_697`): the whole outline carried along the plane's normal through the centre for the thickness, turning for a helix (`dec_spiral_extrude`, the twist about the normal), and which gear it is of. */
function bodyParams(s: Scene, rec: GearRecord): { step: Omit<Step, "id"> } | null {
  const plane = s.parts[rec.plane];
  if (!hasBody(rec.spec) || !plane || plane.kind !== "plane") return null;
  const fig = bodyFigure(rec);
  const shear = helixShear(rec.spec);
  if (shear !== null) { // a helical rack (`in_783`): its section carried through the thickness, slid along the rack by tan(helix) for each mm (the rack's own x is the plane's first direction turned by the record's turn)
    const [c, sn] = [Math.cos(rec.turn ?? 0), Math.sin(rec.turn ?? 0)];
    return { step: { type: "extrude", parts: fig.parts, params: { depth: rec.spec.width!, slantx: shear * c, slanty: shear * sn, ...(fig.holes ? { holes: fig.holes } : {}), mode: "new", gear: rec.id } } };
  }
  const turn = helixTwist(rec.spec);
  if (turn === null) return rec.spec.width ? { step: { type: "extrude", parts: fig.parts, params: { depth: rec.spec.width, ...(fig.holes ? { holes: fig.holes } : {}), mode: "new", gear: rec.id } } } : null; // (a thickness and no helix: a straight extrusion)
  const [u, v] = [plane.u, plane.v];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  return { step: { type: "revolve", parts: fig.parts, params: { ...(fig.holes ? { holes: fig.holes } : {}), angle: turn, advance: rec.spec.width!, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: n[0] / len, dy: n[1] / len, dz: n[2] / len, mode: "new", gear: rec.id } } };
}
/** The steps that make the body of a gear that has one made with it (a helical gear's twist, a worm's core and threads, a worm wheel's loft), without their names; none for a plain gear. */
function ownedSpecs(s: Scene, rec: GearRecord): Omit<Step, "id">[] {
  if (rec.spec.cam) return camSteps(s, rec) ?? []; // (a Geneva drive that comes as a model, `camscene.ts`)
  if (rec.spec.bevel) return bevelSteps(s, rec) ?? [];
  if (rec.spec.worm) return wormSteps(s, rec) ?? [];
  if (rec.spec.wheel) return wheelSteps(s, rec) ?? [];
  const body = bodyParams(s, rec);
  return body ? [body.step, ...chamferSteps(s, rec)] : [];
}
/** A gear's own steps that name each other's bodies (`@s0`: the body the gear's first step made, `@s1` the second's, as a worm wheel's land is joined): the names put in, now that the steps are named. */
function resolveOwnRefs(steps: readonly Step[]): Step[] {
  return steps.map((st) => st.parts.some((r) => /^@s\d+$/.test(r)) ? { ...st, parts: st.parts.map((r) => { const m = /^@s(\d+)$/.exec(r); return m ? (`b/x_${steps[Number(m[1])]!.id}/o` as Ref) : r; }) } : st);
}
/** A step made from a gear's record may name the steps before it of the same gear as `$0`, `$1`...: the names they were given, put in. */
const named = (st: Step, before: readonly Step[]): Step => (st.parts.some((p) => p.includes("$")) ? { ...st, parts: st.parts.map((p) => p.replace(/\$(\d+)/g, (_, k: string) => before[Number(k)]?.id ?? "")) as Ref[] } : st);
const ownedBy = (id: string) => (st: Step): boolean => st.params.gear === id;
/** The steps that make the body of a gear, named (the scene's next names), with the scene they are added to: its counter is moved on past them. */
export function ownedSteps(s: Scene, rec: GearRecord): { scene: Scene; steps: Step[] } {
  let cur = s;
  const steps: Step[] = [];
  for (const spec of ownedSpecs(s, rec)) { const st: Step = named({ ...spec, id: nextId(cur, "s") }, steps); steps.push(st); cur = bumpCounter({ ...cur, steps: [...cur.steps, st] }, st.id); }
  const resolved = resolveOwnRefs(steps);
  if (resolved.some((st, i) => st !== steps[i])) { cur = { ...cur, steps: cur.steps.map((st) => resolved.find((n) => n.id === st.id) ?? st) }; resolved.forEach((st, i) => { steps[i] = st; }); }
  // a worm made for a wheel that is there already: its threads and cuts act on every piece that stands before them (a step that adds or cuts works on all the bodies made so far, and a thread touching the wheel's teeth would join it),
  // so its steps go in front of the wheel's, and the wheel (a piece of its own) comes after, as when the wheel is made for the worm (`in_708`)
  if (rec.spec.worm && steps.length) {
    const wheels = new Set(gearsOf(s).filter((g) => g.spec.wheel).map((g) => g.id));
    const at = s.steps.findIndex((st) => wheels.has(String(st.params.gear)));
    if (at >= 0) cur = { ...cur, steps: [...s.steps.slice(0, at), ...steps, ...s.steps.slice(at)] };
  }
  return { scene: cur, steps };
}

export function addGear(s: Scene, rec: GearRecord): Result<Scene> {
  if (gearsOf(s).some((g) => g.id === rec.id)) return err(`gear ${rec.id} already exists`);
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane") return err(`plane ${rec.plane} does not exist`);
  const o = rec.spec.cam ? camShapes(rec.spec.cam) : outlineOf(rec.spec);
  if (!o.ok) return err(o.error);
  if (rec.spec.wheel) { const w = wheelSections(rec.spec); if (!w.ok) return err(w.error); }
  const added = { ...rec, at: [...rec.at] as unknown as Vec3, spec: { ...rec.spec } };
  // a bevel gear made to mesh with another: that one learns of it (the two are put right together when either's teeth are changed, `in_776`)
  const mate = rec.spec.bevel?.with ? gearsOf(s).find((g) => g.id === rec.spec.bevel!.with) : undefined;
  const gears = gearsOf(s).map((g) => (g === mate && mate.spec.bevel && mate.spec.bevel.with === undefined ? { ...g, spec: { ...g.spec, bevel: { ...g.spec.bevel!, with: rec.id } } } : g));
  return ok({ ...s, gears: [...gears, added] });
}

/** `from` replaced by `to` wherever a step names the whole run of them, in whatever order it has them (its figure, a hole of it, a sibling figure). */
function swapRun(st: Step, from: readonly Ref[], to: readonly Ref[]): Step {
  const set = new Set<string>(from);
  const whole = (list: readonly string[]) => list.length === set.size && list.every((r) => set.has(r));
  const group = (text: string, sep: string): string => text.split(sep).map((g) => (whole(g.split(",").filter(Boolean)) ? to.join(",") : g)).join(sep); // (a group of refs joined by commas)
  const params: Record<string, number | string> = { ...st.params };
  if (typeof params.holes === "string") params.holes = group(params.holes, ";");
  if (typeof params.also === "string") params.also = params.also.split("|").map((f) => { const [o, h] = f.split(">"); return `${group(o ?? "", "\u0000")}${h === undefined ? "" : `>${group(h, ";")}`}`; }).join("|");
  return { ...st, parts: whole(st.parts) ? [...to] : st.parts, params };
}
/** A step that names the whole outline: the bore circle a hole of it, or not, as the gear has it now. */
function swapBore(st: Step, lines: readonly Ref[], was: string | undefined, now: string | undefined): Step {
  if (!["extrude", "revolve", "loft", "sweep"].includes(st.type) || st.parts.length !== lines.length || !st.parts.every((r) => lines.includes(r))) return st;
  const groups = String(st.params.holes ?? "").split(";").filter(Boolean).filter((g) => g !== was);
  if (now) groups.push(now);
  const { holes: _h, ...rest } = st.params;
  return { ...st, params: groups.length ? { ...rest, holes: groups.join(";") } : rest };
}
/** New numbers (and, if given, a new centre) for a gear. Refused if the numbers make no gear, or a constraint stands on a corner or side that would be gone. */
function setGearCore(s: Scene, id: string, spec: GearSpec, at?: Vec3, turn?: number): Result<Scene> {
  const rec = gearsOf(s).find((g) => g.id === id);
  if (!rec) return err(`gear ${id} does not exist`);
  const o = spec.cam ? camShapes(spec.cam) : outlineOf(spec);
  if (!o.ok) return err(o.error);
  if (spec.wheel) { const w = wheelSections(spec); if (!w.ok) return err(w.error); }
  const next: GearRecord = { ...rec, spec: { ...spec }, ...(at ? { at: [...at] as unknown as Vec3 } : {}), ...(turn !== undefined ? (turn ? { turn } : { turn: undefined }) : {}) };
  const [was, now] = [gearRefs(rec), gearRefs(next)];
  const after = new Set(partsOf(s, next).map((p) => p.ref));
  const lost = new Set(Object.keys(s.parts).filter((r) => isMade(id, r as Ref) && !after.has(r as Ref)));
  const rel = s.relations.find((r) => r.parts.some((q) => lost.has(q)));
  if (rel) return err(`that would take away a corner or side that a constraint (${rel.kind}) stands on`);
  const same = was.lines.length === now.lines.length;
  const swapped = same ? s.steps : s.steps.map((st) => swapRun(st, was.lines, now.lines));
  const steps = was.bore === now.bore ? swapped : swapped.map((st) => swapBore(st, now.lines, was.bore, now.bore)); // (a bore put in or taken out is a hole of every figure that is the whole outline)
  // the steps that make its body follow its numbers, its centre and its hand: made again from the record, with the names they had (a gear that is no longer one that has a body made with it loses them)
  const own = ownedBy(id);
  const old = steps.filter(own), fresh = ownedSpecs(s, next);
  const kept = steps.filter((st) => !own(st));
  const at0 = steps.findIndex(own);
  let counter: Scene = { ...s, steps };
  const made: Step[] = [];
  fresh.forEach((spec, i) => { const name = old[i]?.id ?? nextId(counter, "s"); const st: Step = named({ ...spec, id: name }, made); if (!old[i]) counter = bumpCounter({ ...counter, steps: [...counter.steps, st] }, name); made.push(st); });
  const place = at0 < 0 ? kept.length : steps.slice(0, at0).filter((st) => !own(st)).length;
  const resolved = resolveOwnRefs(made);
  const turned = [...kept.slice(0, place), ...resolved, ...kept.slice(place)];
  return ok({ ...counter, steps: turned, gears: gearsOf(s).map((g) => (g === rec ? next : g)) });
}
/**
 * New numbers for a gear, and, for a bevel gear made to mesh with another (`BevelSpec.with`), the other put right with it (`in_776`): the teeth of one are the other's mate teeth, they share the module, the pressure angle, the shaft angle and
 * the face, and the one that stands across (the partner: it has a direction) is placed again from the other (the anchor), phase and all, as when it was made.
 */
export function setGear(s: Scene, id: string, spec: GearSpec, at?: Vec3, turn?: number): Result<Scene> {
  const rec = gearsOf(s).find((g) => g.id === id);
  const bv = spec.bevel;
  const other = rec && bv?.with ? gearsOf(s).find((g) => g.id === bv.with) : undefined;
  if (!rec || !bv || !other || !other.spec.bevel || other.spec.bevel.with !== id) return setGearCore(s, id, spec, at, turn);
  const edited: GearRecord = { ...rec, spec, ...(at ? { at } : {}), ...(turn !== undefined ? { turn } : {}) };
  const follower = bv.dir !== undefined ? edited : other, anchor = bv.dir !== undefined ? other : edited;
  const fresh = (g: GearRecord): GearSpec => ({ ...g.spec, teeth: g === edited ? spec.teeth : bv.mate, module: spec.module, ...(spec.pressure !== undefined ? { pressure: spec.pressure } : {}), bevel: { ...g.spec.bevel!, mate: g === edited ? bv.mate : spec.teeth, ...(bv.shaft !== undefined ? { shaft: bv.shaft } : {}), ...(bv.face !== undefined ? { face: bv.face } : {}) } });
  const a2: GearRecord = { ...anchor, spec: fresh(anchor) };
  const pl = s.parts[a2.plane];
  if (!pl || pl.kind !== "plane") return setGearCore(s, id, spec, at, turn);
  const f0 = fresh(follower);
  const placed = meshBevel(a2, pl.u, pl.v, { teeth: f0.teeth }, follower.spec.bevel!.dir ?? 0);
  if (!placed.ok) return err(placed.error);
  const f2: GearRecord = { ...follower, at: placed.value.at, turn: placed.value.turn, spec: { ...f0, bevel: { ...f0.bevel!, ...(placed.value.spec.bevel!.frame ? { frame: placed.value.spec.bevel!.frame } : {}) } } };
  const first = setGearCore(s, a2.id, a2.spec, anchor === edited ? at : undefined, anchor === edited ? turn : undefined);
  if (!first.ok) return first;
  return setGearCore(first.value, f2.id, f2.spec, f2.at, f2.turn);
}
/** A gear taken away: its record and its parts, and the constraints on them. A step made from it stays and is reported broken, as one made from a deleted figure is. */
export function deleteGear(s: Scene, id: string): Result<Scene> {
  if (!gearsOf(s).some((g) => g.id === id)) return err(`gear ${id} does not exist`);
  const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !isMade(id, k as Ref)));
  const rest = gearsOf(s).filter((g) => g.id !== id);
  return ok({ ...s, parts, steps: s.steps.filter((st) => !ownedBy(id)(st)), relations: s.relations.filter((r) => !r.parts.some((q) => isMade(id, q))), gears: rest.length ? rest : undefined });
}
/** The gear a part belongs to: one of its corners, sides or its wall, or a face made of them. */
export function gearOfPart(s: Scene, ref: Ref): GearRecord | undefined {
  const p = s.parts[ref];
  if (p?.kind === "body" && p.id?.startsWith("x_")) { // the body of a gear that has one made with it (a helical gear's twist, a worm, a worm wheel: `in_598`, `in_608`) is the gear's
    const step = s.steps.find((st) => st.id === p.id!.slice(2) && typeof st.params.gear === "string");
    const own = step ? gearsOf(s).find((g) => g.id === step.params.gear) : undefined;
    if (own) return own;
  }
  const refs: Ref[] = p?.kind === "face" ? [...p.loop, ...(p.disk ? [p.disk] : [])] : [ref];
  return gearsOf(s).find((g) => refs.some((r) => isMade(g.id, r)));
}

/**
 * The gear a selected part belongs to, for the gear's icon and its Edit, Helix and Mesh items: what `gearOfPart` finds, and also the body of a gear that was extruded from its outline (or a face of that body), whose
 * step names the parts of the gear's own sketch. (Not for delete, move or turn: a body made from a gear's outline is a body to those, as before.)
 */
const onlyBody = (s: Scene): string | undefined => { const bs = Object.values(s.parts).filter((q) => q.kind === "body" && !!q.id); return bs.length === 1 ? (bs[0] as { id?: string }).id : undefined; }; // (with one body, its faces do not say which it is)
export function gearOfSelection(s: Scene, ref: Ref): GearRecord | undefined {
  const own = gearOfPart(s, ref);
  if (own) return own;
  const p = s.parts[ref];
  if (!p || p.origin === "drawn" || p.origin === "world" || !s.gears?.length) return undefined;
  const owner = p.kind === "body" ? p : p.of ? s.parts[p.of] : undefined; // (`of`: the body it is a face or an edge of, when there are several)
  const bodyId = owner ? (owner as { id?: string }).id : onlyBody(s);
  const step = bodyId?.startsWith("x_") ? s.steps.find((st) => st.id === bodyId.slice(2) && st.type === "extrude" && st.parts.length > 0) : undefined;
  if (!step) return undefined;
  return s.gears.find((g) => step.parts.every((r) => isMade(g.id, r)));
}
