// A planetary gear set that keeps its numbers (`dec_planetary_gears`, `in_736` to `in_762`): a sun, N planets and a ring that are ordinary gear records (`gearscene.ts`: their parts, bodies, meshing and numbers work as for any gear), a record that ties them together
// (`Scene.planetaries`), and an optional carrier: a plate with a pin at each planet, one body. Changing the numbers of the set changes every gear and the carrier; the set can be given by its tooth counts or by a ratio. Pure: scenes in, scenes out.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene, Step } from "./scene.ts";
import { nextId, bumpCounter } from "./scene.ts";
import type { Part } from "./part.ts";
import type { GearSpec } from "./gear.ts";
import { meshWith } from "./mesh.ts";
import { addGear, setGear, deleteGear, ownedSteps, gearOfPart } from "./gearscene.ts";
import type { GearRecord } from "./gearscene.ts";

/** The numbers of a set. The ring's teeth are the sun's and two planets' (`sun + 2 planet`); `width` is the thickness of every gear (mm) and `helix` the sun's (planets and ring take the hand that meshes). `pin` is the planets' pin (mm) and `pinGap` the room left round it (mm); a `carrier` (the plate's thickness, mm, 0 or none: no carrier) has a pin at each planet and a hole for the sun's shaft. */
export interface PlanetarySpec {
  sun: number; planet: number; planets: number; module: number; width: number;
  pressure?: number; backlash?: number; clearance?: number; helix?: number;
  /** the sun's bore, mm (0: none); default as for a gear of its size */ bore?: number;
  /** the ring's wall in modules */ rim?: number;
  pin?: number; pinGap?: number; carrier?: number;
}
export interface PlanetaryRecord {
  id: string; plane: Ref; at: Vec3; spec: PlanetarySpec; turn?: number;
  /** the gears it is made of (`gearscene.ts` records of their own) */ sunId: string; ringId: string; planetIds: string[];
  /** the step that makes the carrier, if there is one */ carrierStep?: string;
}
export type Hold = "ring" | "carrier" | "sun";
export interface Problem { fatal: boolean; text: string }
const TAU = 2 * Math.PI;

// ---- the maths ----
/** the speed ratio, input over output, of the usual arrangement for each part held (Willis: (ns - nc) / (nr - nc) = -zr / zs): ring held: sun in, carrier out; carrier held: sun in, ring out (reverses); sun held: ring in, carrier out */
export function ratios(s: { sun: number; planet: number }): Record<Hold, number> {
  const ring = s.sun + 2 * s.planet;
  return { ring: 1 + ring / s.sun, carrier: -ring / s.sun, sun: 1 + s.sun / ring };
}
const mt = (s: PlanetarySpec): number => (s.helix ? s.module / Math.cos((Math.abs(s.helix) * Math.PI) / 180) : s.module); // (the module of the section across the gear)
/** What is wrong with a set, and what is only worth a warning: whole numbers, the planets spaced evenly (sun + ring over planets whole), not touching each other, a width, undercut. */
export function problemsOf(s: PlanetarySpec): Problem[] {
  const out: Problem[] = [];
  const ring = s.sun + 2 * s.planet;
  if (![s.sun, s.planet, s.planets].every((n) => Number.isInteger(n) && n > 0)) return [{ fatal: true, text: "the tooth counts and the number of planets are whole numbers above zero" }];
  if (!(s.module > 0)) out.push({ fatal: true, text: "the module must be above zero" });
  if (!(s.width > 0)) out.push({ fatal: true, text: "the gears need a width above zero" });
  if (s.sun < 3 || s.planet < 3) out.push({ fatal: true, text: "a gear needs 3 or more teeth" });
  if ((s.sun + ring) % s.planets !== 0) out.push({ fatal: true, text: `(sun + ring) / planets = ${((s.sun + ring) / s.planets).toFixed(2)} is not whole: ${s.planets} planets cannot be spaced evenly and all mesh (change a tooth count or the number of planets)` });
  if (s.planets > 1) { // neighbouring planets: centres 2 a sin(pi / N) apart, a = (zs + zp) m / 2; a planet's tips reach zp m + 2 mn across
    const apart = (s.sun + s.planet) * mt(s) * Math.sin(Math.PI / s.planets);
    const across = s.planet * mt(s) + 2 * s.module;
    if (apart <= across + 1e-9) out.push({ fatal: true, text: `neighbouring planets would touch: ${apart.toFixed(2)} mm apart, their tips need ${across.toFixed(2)} mm (fewer planets, or fewer teeth on the planets)` });
  }
  const below = Math.ceil(2 / Math.sin(((s.pressure ?? 20) * Math.PI) / 180) ** 2);
  for (const [n, z] of [["sun", s.sun], ["planet", s.planet]] as const) if (z < below && !s.helix) out.push({ fatal: false, text: `the ${n} has ${z} teeth: under ${below} undercuts at ${s.pressure ?? 20} degrees` });
  return out;
}
/** Sets for a wanted ratio of the part held, nearest first (then fewer warnings, then fewer teeth): every sun and planet count in range with no fatal problem. */
export function fromRatio(ratio: number, hold: Hold, base: Pick<PlanetarySpec, "planets" | "module" | "width" | "helix" | "pressure">, opt: { minSun?: number; minPlanet?: number; maxTeeth?: number } = {}): { sun: number; planet: number; ratio: number; error: number }[] {
  const [minSun, minPlanet, maxTeeth] = [opt.minSun ?? 12, opt.minPlanet ?? 8, opt.maxTeeth ?? 200];
  const found: { sun: number; planet: number; ratio: number; error: number; warn: number }[] = [];
  for (let sun = minSun; sun + 2 * minPlanet <= maxTeeth; sun++) for (let planet = minPlanet; sun + 2 * planet <= maxTeeth; planet++) {
    const ps = problemsOf({ ...base, sun, planet });
    if (ps.some((p) => p.fatal)) continue;
    const r = ratios({ sun, planet })[hold];
    found.push({ sun, planet, ratio: r, error: Math.abs(r - ratio) / Math.abs(ratio), warn: ps.length });
  }
  return found.sort((a, b) => a.error - b.error || a.warn - b.warn || a.sun + 2 * a.planet - (b.sun + 2 * b.planet)).map(({ warn: _w, ...x }) => x);
}
/** The default pin: two fifths of a planet's root circle, to the half millimetre, between 2 and 8 mm. */
export const defaultPin = (s: Pick<PlanetarySpec, "planet" | "module">): number => Math.max(2, Math.min(8, Math.floor(0.4 * s.module * (s.planet - 2.5) * 2) / 2));
const defaultSunBore = (s: PlanetarySpec): number => { const d = Math.min(5, 0.4 * s.module * (s.sun - 2.5)); return d >= 1 ? Math.floor(d * 2) / 2 : 0; };

// ---- the layout ----
export interface Layout {
  sun: { spec: GearSpec; at: Vec3; turn: number };
  planets: { spec: GearSpec; at: Vec3; turn: number }[];
  ring: { spec: GearSpec; at: Vec3; turn: number };
  /** the carrier, in the plane's frame: the plate's radius, the hole for the sun's shaft (mm across, 0 none), and the pins (centre as a point in the world, diameter, length) */
  carrier?: { thickness: number; radius: number; hole: number; pins: { at: Vec3; diameter: number }[] };
}
/** The gears and the carrier of a set, placed: the sun at the centre, the planets `360 / N` apart (the first in the direction `turn`), each turned to mesh the sun, the ring turned to mesh the planets; null with the reason when the set cannot be made. */
export function layoutOf(spec: PlanetarySpec, plane: { u: Vec3; v: Vec3 }, at: Vec3, turn = 0): Result<Layout> {
  const bad = problemsOf(spec).find((p) => p.fatal);
  if (bad) return err(bad.text);
  const [u, v] = [plane.u, plane.v];
  const pin = spec.pin ?? defaultPin(spec), gap = spec.pinGap ?? 0.2;
  const common: GearSpec = { teeth: spec.sun, module: spec.module, width: spec.width, ...(spec.helix ? { helix: spec.helix } : {}), ...(spec.pressure !== undefined ? { pressure: spec.pressure } : {}), ...(spec.backlash ? { backlash: spec.backlash } : {}), ...(spec.clearance !== undefined ? { clearance: spec.clearance } : {}) };
  const bore = spec.bore ?? defaultSunBore(spec);
  const sunSpec: GearSpec = { ...common, ...(bore > 0 ? { bore } : {}) };
  const sun: GearRecord = { id: "sun", plane: "" as Ref, at, spec: sunSpec, ...(turn ? { turn } : {}) };
  const planets: Layout["planets"] = [];
  for (let k = 0; k < spec.planets; k++) {
    const r = meshWith(sun, u, v, { teeth: spec.planet }, turn + (TAU * k) / spec.planets);
    if (!r.ok) return err(r.error);
    planets.push({ spec: { ...r.value.spec, bore: pin + 2 * gap }, at: r.value.at, turn: r.value.turn });
  }
  const p0 = planets[0]!;
  const d = [at[0] - p0.at[0], at[1] - p0.at[1], at[2] - p0.at[2]] as const; // (from the first planet to the centre, in the plane: the direction the ring's middle lies from it)
  const around = meshWith({ id: "p", plane: "" as Ref, at: p0.at, spec: p0.spec, turn: p0.turn }, u, v, { teeth: spec.sun + 2 * spec.planet, ring: true }, Math.atan2(d[0] * v[0] + d[1] * v[1] + d[2] * v[2], d[0] * u[0] + d[1] * u[1] + d[2] * u[2]));
  if (!around.ok) return err(around.error);
  const ring = { spec: { ...around.value.spec, ...(spec.rim !== undefined ? { rim: spec.rim } : {}) }, at, turn: around.value.turn };
  const out: Layout = { sun: { spec: sunSpec, at, turn }, planets, ring };
  if ((spec.carrier ?? 0) > 0) {
    const ringPitchR = (mt(spec) * (spec.sun + 2 * spec.planet)) / 2;
    out.carrier = { thickness: spec.carrier!, radius: ringPitchR, hole: bore > 0 ? bore + 2 * gap : 0, pins: planets.map((p) => ({ at: p.at, diameter: pin })) };
    if (pin <= 0) return err("the pin needs a diameter");
  }
  return ok(out);
}

// ---- the scene ----
const planetariesOf = (s: Scene): readonly PlanetaryRecord[] => s.planetaries ?? [];
const gearIdsOf = (r: PlanetaryRecord): string[] => [r.sunId, ...r.planetIds, r.ringId];
const planeOf = (s: Scene, ref: Ref): { u: Vec3; v: Vec3 } | null => { const p = s.parts[ref]; return p && p.kind === "plane" ? { u: p.u, v: p.v } : null; };
const carrierRefs = (id: string, n: number): { centre: Ref; plate: Ref; hole: Ref; pins: { centre: Ref; circle: Ref }[] } => ({ centre: drawnRef(`${id}.c`), plate: drawnRef(`${id}.k`), hole: drawnRef(`${id}.h`), pins: Array.from({ length: n }, (_, i) => ({ centre: drawnRef(`${id}.pc${i}`), circle: drawnRef(`${id}.pk${i}`) })) });
/** The parts of every carrier ever made under this id are those with this prefix (the plate's circle and centre, the hole, each pin's centre and circle). */
const isCarrierPart = (id: string, ref: string): boolean => ref.startsWith(`d/${id}.`);

/** The gears' ids for a set: derived from its own (`q_001` makes `q_001s`, `q_001r`, `q_001p1`...). */
const idsFor = (id: string, planets: number): { sunId: string; ringId: string; planetIds: string[] } => ({ sunId: `${id}s`, ringId: `${id}r`, planetIds: Array.from({ length: planets }, (_, i) => `${id}p${i + 1}`) });

function carrierScene(s: Scene, rec: PlanetaryRecord, lay: Layout["carrier"] | undefined, keep: string | undefined): { scene: Scene; step?: string } {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (!(p.origin === "drawn" && isCarrierPart(rec.id, p.ref))) parts[p.ref] = p;
  const oldStep = keep ? s.steps.findIndex((x) => x.id === keep) : -1;
  const steps = s.steps.filter((x) => x.id !== keep);
  if (!lay) return { scene: { ...s, parts, steps } };
  const r = carrierRefs(rec.id, lay.pins.length);
  const base = { origin: "drawn" as const, plane: rec.plane, movable: false };
  parts[r.centre] = { ...base, ref: r.centre, kind: "corner", at: rec.at };
  parts[r.plate] = { ...base, ref: r.plate, kind: "circle", center: r.centre, radius: lay.radius };
  if (lay.hole > 0) parts[r.hole] = { ...base, ref: r.hole, kind: "circle", center: r.centre, radius: lay.hole / 2 };
  lay.pins.forEach((p, i) => {
    parts[r.pins[i]!.centre] = { ...base, ref: r.pins[i]!.centre, kind: "corner", at: p.at };
    parts[r.pins[i]!.circle] = { ...base, ref: r.pins[i]!.circle, kind: "circle", center: r.pins[i]!.centre, radius: p.diameter / 2 };
  });
  // one extrude: the plate below the plane (negative), the pins above it, each for the width of the planets (the figures of a step may each have their own depth)
  const pinLen = rec.spec.width;
  const step: Step = {
    id: keep ?? nextId(s, "s"), type: "extrude", parts: [r.plate],
    params: { depth: -lay.thickness, ...(lay.hole > 0 ? { holes: r.hole } : {}), also: r.pins.map((p) => p.circle).join("|"), alsoDepth: r.pins.map(() => pinLen).join("|"), mode: "new", planetary: rec.id },
  };
  const next = [...steps];
  next.splice(oldStep >= 0 ? Math.min(oldStep, next.length) : next.length, 0, step);
  return { scene: bumpCounter({ ...s, parts, steps: next }, step.id), step: step.id };
}

function gearRecord(id: string, plane: Ref, g: { spec: GearSpec; at: Vec3; turn: number }): GearRecord {
  return { id, plane, at: [...g.at] as unknown as Vec3, spec: g.spec, ...(g.turn ? { turn: g.turn } : {}) };
}

/** A set made: its gears (each with the steps that make its body), its carrier if it has one, and its record. */
export function addPlanetary(s: Scene, rec: Omit<PlanetaryRecord, "sunId" | "ringId" | "planetIds" | "carrierStep">): Result<Scene> {
  if (planetariesOf(s).some((p) => p.id === rec.id)) return err(`planetary set ${rec.id} already exists`);
  const plane = planeOf(s, rec.plane);
  if (!plane) return err(`plane ${rec.plane} does not exist`);
  const lay = layoutOf(rec.spec, plane, rec.at, rec.turn ?? 0);
  if (!lay.ok) return lay;
  const ids = idsFor(rec.id, rec.spec.planets);
  const full: PlanetaryRecord = { ...rec, at: [...rec.at] as unknown as Vec3, spec: { ...rec.spec }, ...ids };
  const gears: GearRecord[] = [gearRecord(ids.sunId, rec.plane, lay.value.sun), ...lay.value.planets.map((p, i) => gearRecord(ids.planetIds[i]!, rec.plane, p)), gearRecord(ids.ringId, rec.plane, lay.value.ring)];
  let cur = bumpCounter(s, rec.id);
  for (const g of gears) {
    const a = addGear(cur, g);
    if (!a.ok) return a;
    cur = ownedSteps(a.value, g).scene;
  }
  const c = carrierScene(cur, full, lay.value.carrier, undefined);
  return ok({ ...c.scene, planetaries: [...planetariesOf(s), { ...full, ...(c.step ? { carrierStep: c.step } : {}) }] });
}

/** New numbers (and, if given, a new centre or turn) for a set: every gear follows, planets are added or taken away when their number changes, and the carrier is made again (or taken away). Refused, with the reason, if the numbers make no set. */
export function setPlanetary(s: Scene, id: string, spec: PlanetarySpec, at?: Vec3, turn?: number): Result<Scene> {
  const rec = planetariesOf(s).find((p) => p.id === id);
  if (!rec) return err(`planetary set ${id} does not exist`);
  const plane = planeOf(s, rec.plane);
  if (!plane) return err(`plane ${rec.plane} does not exist`);
  const [at2, turn2] = [at ?? rec.at, turn !== undefined ? turn : rec.turn ?? 0];
  const lay = layoutOf(spec, plane, at2, turn2);
  if (!lay.ok) return lay;
  const have = rec.planetIds.length, want = spec.planets;
  const ids = idsFor(id, want);
  let cur = s;
  const set = (gid: string, g: { spec: GearSpec; at: Vec3; turn: number }): Result<Scene> => setGear(cur, gid, g.spec, g.at, g.turn);
  const steps: [string, { spec: GearSpec; at: Vec3; turn: number }][] = [[rec.sunId, lay.value.sun], [rec.ringId, lay.value.ring], ...lay.value.planets.slice(0, Math.min(have, want)).map((p, i): [string, typeof p] => [rec.planetIds[i]!, p])];
  for (const [gid, g] of steps) { const r = set(gid, g); if (!r.ok) return r; cur = r.value; }
  for (let i = have; i < want; i++) { // planets added
    const g = gearRecord(ids.planetIds[i]!, rec.plane, lay.value.planets[i]!);
    const a = addGear(cur, g);
    if (!a.ok) return a;
    cur = ownedSteps(a.value, g).scene;
  }
  for (let i = want; i < have; i++) { const r = deleteGear(cur, rec.planetIds[i]!); if (!r.ok) return r; cur = r.value; } // planets taken away
  const next: PlanetaryRecord = { ...rec, at: [...at2] as unknown as Vec3, spec: { ...spec }, ...(turn2 ? { turn: turn2 } : { turn: undefined }), ...ids };
  const c = carrierScene(cur, next, lay.value.carrier, rec.carrierStep);
  const { carrierStep: _c, ...bare } = next;
  return ok({ ...c.scene, planetaries: planetariesOf(s).map((p) => (p === rec ? { ...bare, ...(c.step ? { carrierStep: c.step } : {}) } : p)) });
}

/** A set taken away: its gears (with their bodies), its carrier and its record. */
export function deletePlanetary(s: Scene, id: string): Result<Scene> {
  const rec = planetariesOf(s).find((p) => p.id === id);
  if (!rec) return err(`planetary set ${id} does not exist`);
  let cur = s;
  for (const g of gearIdsOf(rec)) { const r = deleteGear(cur, g); if (!r.ok) return r; cur = r.value; }
  cur = carrierScene(cur, rec, undefined, rec.carrierStep).scene;
  const rest = planetariesOf(s).filter((p) => p.id !== id);
  return ok({ ...cur, planetaries: rest.length ? rest : undefined });
}
/** The set a gear belongs to (so editing a gear of a set edits the set), or the set a carrier part or body belongs to. */
export function planetaryOfGear(s: Scene, gearId: string): PlanetaryRecord | undefined {
  return planetariesOf(s).find((p) => gearIdsOf(p).includes(gearId));
}
/** The set whose carrier a step is, or whose gear a body made by a step is. */
function planetaryOfStep(s: Scene, step: { params: Record<string, number | string> }): PlanetaryRecord | undefined {
  const own = step.params.planetary;
  if (typeof own === "string") return planetariesOf(s).find((p) => p.id === own);
  return typeof step.params.gear === "string" ? planetaryOfGear(s, step.params.gear) : undefined;
}
/** The set a selected part belongs to: a gear's corner, side or body, or the carrier's body. */
export function planetaryOfPart(s: Scene, ref: Ref): PlanetaryRecord | undefined {
  const g = gearOfPart(s, ref);
  if (g) return planetaryOfGear(s, g.id);
  const p = s.parts[ref];
  const step = p?.kind === "body" && p.id?.startsWith("x_") ? s.steps.find((st) => st.id === p.id!.slice(2)) : undefined;
  return step ? planetaryOfStep(s, step) : undefined;
}
