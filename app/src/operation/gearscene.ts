// A gear that keeps its numbers (`dec_gear_tool`, `in_545`): the scene holds a record (the plane, the centre, the numbers) and the gear's parts are made from it each time the scene is derived, as the copies of a repeat are
// (`repeat.ts`), so changing the numbers changes the gear and the bodies made from it. The parts are locked (they are the gear's, not drawn); they are named by the gear and their place in the outline
// (`d/g_003.s17`), so a step made from them finds them again; when the numbers change the count of sides, the steps that use the whole outline are given the new sides. Pure: scenes in, scenes out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, Step } from "./scene.ts";
import type { Part } from "./part.ts";
import { gearOutline } from "./gear.ts";
import type { GearSpec, GearOutline } from "./gear.ts";

/** `at`: the centre, in the world; `spec`: the numbers (`gear.ts`) */
export interface GearRecord { id: string; plane: Ref; at: Vec3; spec: GearSpec }

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
/** The sides of a gear's outline, in order (what a step that extrudes it names), and, for a ring, the circle of its wall; empty if the numbers make no gear. */
export function gearRefs(rec: GearRecord): { lines: Ref[]; wall?: Ref } {
  const o = outlineOf(rec.spec);
  if (!o.ok) return { lines: [] };
  return { lines: o.value.points.map((_, i) => lineRef(rec.id, i)), ...(o.value.outerRadius !== undefined ? { wall: drawnRef(`${rec.id}.k`) } : {}) };
}

/** The parts of a gear: the corners and sides of its outline and, for a ring, its wall's circle. Locked. Empty if its plane is not there or the numbers make no gear. */
function partsOf(s: Scene, rec: GearRecord): Part[] {
  const plane = s.parts[rec.plane];
  const o = outlineOf(rec.spec);
  if (!plane || plane.kind !== "plane" || !o.ok) return [];
  const g = o.value;
  const at = (p: readonly [number, number]): Vec3 => [rec.at[0] + plane.u[0] * p[0] + plane.v[0] * p[1], rec.at[1] + plane.u[1] * p[0] + plane.v[1] * p[1], rec.at[2] + plane.u[2] * p[0] + plane.v[2] * p[1]];
  const base = { origin: "drawn" as const, plane: rec.plane, movable: false };
  const n = g.points.length;
  const out: Part[] = g.points.map((p, i): Part => ({ ...base, ref: cornerRef(rec.id, i), kind: "corner", at: at(p) }));
  for (let i = 0; i < n; i++) out.push({ ...base, ref: lineRef(rec.id, i), kind: "line", a: cornerRef(rec.id, i), b: cornerRef(rec.id, (i + 1) % n), ...(g.bulges[i] ? { bulge: g.bulges[i]! } : {}) });
  if (g.outerRadius !== undefined) {
    out.push({ ...base, ref: drawnRef(`${rec.id}.c`), kind: "corner", at: rec.at });
    out.push({ ...base, ref: drawnRef(`${rec.id}.k`), kind: "circle", center: drawnRef(`${rec.id}.c`), radius: g.outerRadius });
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
/** New numbers (and, if given, a new centre) for a gear. Refused if the numbers make no gear, or a constraint stands on a corner or side that would be gone. */
export function setGear(s: Scene, id: string, spec: GearSpec, at?: Vec3): Result<Scene> {
  const rec = gearsOf(s).find((g) => g.id === id);
  if (!rec) return err(`gear ${id} does not exist`);
  const o = outlineOf(spec);
  if (!o.ok) return err(o.error);
  const next: GearRecord = { ...rec, spec: { ...spec }, ...(at ? { at: [...at] as unknown as Vec3 } : {}) };
  const [was, now] = [gearRefs(rec), gearRefs(next)];
  const after = new Set(partsOf(s, next).map((p) => p.ref));
  const lost = new Set(Object.keys(s.parts).filter((r) => isMade(id, r as Ref) && !after.has(r as Ref)));
  const rel = s.relations.find((r) => r.parts.some((q) => lost.has(q)));
  if (rel) return err(`that would take away a corner or side that a constraint (${rel.kind}) stands on`);
  const same = was.lines.length === now.lines.length;
  const steps = same ? s.steps : s.steps.map((st) => swapRun(st, was.lines, now.lines));
  return ok({ ...s, steps, gears: gearsOf(s).map((g) => (g === rec ? next : g)) });
}
/** A gear taken away: its record and its parts, and the constraints on them. A step made from it stays and is reported broken, as one made from a deleted figure is. */
export function deleteGear(s: Scene, id: string): Result<Scene> {
  if (!gearsOf(s).some((g) => g.id === id)) return err(`gear ${id} does not exist`);
  const parts = Object.fromEntries(Object.entries(s.parts).filter(([k]) => !isMade(id, k as Ref)));
  const rest = gearsOf(s).filter((g) => g.id !== id);
  return ok({ ...s, parts, relations: s.relations.filter((r) => !r.parts.some((q) => isMade(id, q))), gears: rest.length ? rest : undefined });
}
/** The gear a part belongs to: one of its corners, sides or its wall, or a face made of them. */
export function gearOfPart(s: Scene, ref: Ref): GearRecord | undefined {
  const p = s.parts[ref];
  const refs: Ref[] = p?.kind === "face" ? [...p.loop, ...(p.disk ? [p.disk] : [])] : [ref];
  return gearsOf(s).find((g) => refs.some((r) => isMade(g.id, r)));
}
