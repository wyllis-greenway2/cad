// A gear that keeps its numbers (`dec_gear_tool`, `in_545`): the scene holds a record (the plane, the centre, the numbers) and the gear's parts are made from it each time the scene is derived, as the copies of a repeat are
// (`repeat.ts`), so changing the numbers changes the gear and the bodies made from it. The parts are locked (they are the gear's, not drawn); they are named by the gear and their place in the outline
// (`d/g_003.s17`), so a step made from them finds them again; when the numbers change the count of sides, the steps that use the whole outline are given the new sides. Pure: scenes in, scenes out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, Step } from "./scene.ts";
import { nextId } from "./scene.ts";
import type { Part } from "./part.ts";
import { gearOutline, helixTwist } from "./gear.ts";
import { boreLoop } from "./bore.ts";
import type { GearSpec, GearOutline } from "./gear.ts";

/** `at`: the centre, in the world; `turn`: how far the gear is turned about its centre in its plane, radians (tooth 0 points along the plane's first direction when 0); `spec`: the numbers (`gear.ts`) */
export interface GearRecord { id: string; plane: Ref; at: Vec3; spec: GearSpec; turn?: number }

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
  const o = outlineOf(rec.spec);
  if (!o.ok) return { lines: [] };
  return { lines: o.value.points.map((_, i) => lineRef(rec.id, i)), ...(o.value.outerRadius !== undefined ? { wall: drawnRef(`${rec.id}.k`) } : {}), ...(!rec.spec.internal && (rec.spec.bore ?? 0) > 0 ? { bore: boreGroup(rec) } : {}) };
}

/** The bore as a hole of a step names it: its circle, or the sides of its D or keyway loop joined by commas. */
function boreGroup(rec: GearRecord): string {
  const l = boreLoop(rec.spec);
  return l ? l.points.map((_, i) => drawnRef(`${rec.id}.bs${i}`)).join(",") : drawnRef(`${rec.id}.b`);
}

/** The parts of a gear: the corners and sides of its outline and, for a ring, its wall's circle. Locked. Empty if its plane is not there or the numbers make no gear. */
function partsOf(s: Scene, rec: GearRecord): Part[] {
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
  return out;
}

/** The scene with its gears' parts made again from the records as they are now (the old ones taken out first). */
export function withGears(s: Scene): Scene {
  const recs = gearsOf(s);
  if (!recs.length) return s;
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (!recs.some((r) => isMade(r.id, p.ref))) parts[p.ref] = p;
  for (const r of recs) for (const p of partsOf({ ...s, parts }, r)) parts[p.ref] = p;
  return { ...s, parts };
}

/** The numbers of the twist step of a helical gear: the whole outline carried along the plane's normal through the centre for the width while it turns (`dec_spiral_extrude`, the twist about the normal), and which gear it is of. */
function twistParams(s: Scene, rec: GearRecord): Record<string, number | string> | null {
  const turn = helixTwist(rec.spec);
  const plane = s.parts[rec.plane];
  if (turn === null || !plane || plane.kind !== "plane") return null;
  const [u, v] = [plane.u, plane.v];
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(...n) || 1;
  const bore = gearRefs(rec).bore;
  return { ...(bore ? { holes: bore } : {}), angle: turn, advance: rec.spec.width!, ax: rec.at[0], ay: rec.at[1], az: rec.at[2], dx: n[0] / len, dy: n[1] / len, dz: n[2] / len, gear: rec.id };
}
/** The step that makes the body of a helical gear from its outline, or null for a gear that is not helical. */
export function helicalStep(s: Scene, rec: GearRecord): Step | null {
  const params = twistParams(s, rec);
  return params ? { id: nextId(s, "s"), type: "revolve", parts: gearRefs(rec).lines, params } : null;
}

export function addGear(s: Scene, rec: GearRecord): Result<Scene> {
  if (gearsOf(s).some((g) => g.id === rec.id)) return err(`gear ${rec.id} already exists`);
  const pl = s.parts[rec.plane];
  if (!pl || pl.kind !== "plane") return err(`plane ${rec.plane} does not exist`);
  const o = outlineOf(rec.spec);
  if (!o.ok) return err(o.error);
  return ok({ ...s, gears: [...gearsOf(s), { ...rec, at: [...rec.at] as unknown as Vec3, spec: { ...rec.spec } }] });
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
export function setGear(s: Scene, id: string, spec: GearSpec, at?: Vec3, turn?: number): Result<Scene> {
  const rec = gearsOf(s).find((g) => g.id === id);
  if (!rec) return err(`gear ${id} does not exist`);
  const o = outlineOf(spec);
  if (!o.ok) return err(o.error);
  const next: GearRecord = { ...rec, spec: { ...spec }, ...(at ? { at: [...at] as unknown as Vec3 } : {}), ...(turn !== undefined ? (turn ? { turn } : { turn: undefined }) : {}) };
  const [was, now] = [gearRefs(rec), gearRefs(next)];
  const after = new Set(partsOf(s, next).map((p) => p.ref));
  const lost = new Set(Object.keys(s.parts).filter((r) => isMade(id, r as Ref) && !after.has(r as Ref)));
  const rel = s.relations.find((r) => r.parts.some((q) => lost.has(q)));
  if (rel) return err(`that would take away a corner or side that a constraint (${rel.kind}) stands on`);
  const same = was.lines.length === now.lines.length;
  const swapped = same ? s.steps : s.steps.map((st) => swapRun(st, was.lines, now.lines));
  const steps = was.bore === now.bore ? swapped : swapped.map((st) => swapBore(st, now.lines, was.bore, now.bore)); // (a bore put in or taken out is a hole of every figure that is the whole outline)
  const twist = twistParams(s, next);
  const own = (st: Step) => st.type === "revolve" && st.params.gear === id;
  const turned = twist ? steps.map((st) => { if (!own(st)) return st; const { holes: _h, ...rest } = st.params; return { ...st, params: { ...rest, ...twist } }; }) : steps.filter((st) => !own(st)); // (the twist follows the numbers and the centre; a gear that is no longer helical loses it)
  return ok({ ...s, steps: turned, gears: gearsOf(s).map((g) => (g === rec ? next : g)) });
}
/** A gear taken away: its record and its parts, and the constraints on them. A step made from it stays and is reported broken, as one made from a deleted figure is. */
export function deleteGear(s: Scene, id: string): Result<Scene> {
  if (!gearsOf(s).some((g) => g.id === id)) return err(`gear ${id} does not exist`);
  const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !isMade(id, k as Ref)));
  const rest = gearsOf(s).filter((g) => g.id !== id);
  return ok({ ...s, parts, steps: s.steps.filter((st) => !(st.type === "revolve" && st.params.gear === id)), relations: s.relations.filter((r) => !r.parts.some((q) => isMade(id, q))), gears: rest.length ? rest : undefined });
}
/** The gear a part belongs to: one of its corners, sides or its wall, or a face made of them. */
export function gearOfPart(s: Scene, ref: Ref): GearRecord | undefined {
  const p = s.parts[ref];
  if (p?.kind === "body" && p.id?.startsWith("x_")) { // the body of a helical gear (made by its twist step, `in_566`) is the gear's
    const step = s.steps.find((st) => st.id === p.id!.slice(2) && st.type === "revolve" && typeof st.params.gear === "string");
    const own = step ? gearsOf(s).find((g) => g.id === step.params.gear) : undefined;
    if (own) return own;
  }
  const refs: Ref[] = p?.kind === "face" ? [...p.loop, ...(p.disk ? [p.disk] : [])] : [ref];
  return gearsOf(s).find((g) => refs.some((r) => isMade(g.id, r)));
}
