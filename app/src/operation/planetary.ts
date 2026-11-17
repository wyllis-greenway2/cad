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
import { gearOutline } from "./gear.ts";
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
  /** the room between the planets and the carrier's plate along the axis, mm (0: they touch); with some the carrier is made on a plane of its own that far below the gears' */ plateGap?: number;
  /** 1: the planets stand at the meshing positions nearest to equal spacing, which works for any count of planets (each is a whole number of tooth steps `2 pi / (sun + ring)` from the first, so they all mesh) though the spacing is then not quite even; 0 or none: equal, which needs `(sun + ring) / planets` whole */ spacing?: number;
  /** the housing: a tube round the ring, `housing` mm thick, a snug `housingFit` mm (0.2 if none) outside it, and an end cap `housingCap` mm thick on the side away from the carrier, a body each (0 or none: no housing) */ housing?: number; housingCap?: number; housingFit?: number;
}
export interface PlanetaryRecord {
  id: string; plane: Ref; at: Vec3; spec: PlanetarySpec; turn?: number;
  /** the gears it is made of (`gearscene.ts` records of their own) */ sunId: string; ringId: string; planetIds: string[];
  /** the step that makes the carrier, if there is one */ carrierStep?: string; /** the steps that make the housing's tube and its end cap */ shellStep?: string; capStep?: string;
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
  const nearest = s.spacing === 1;
  if (!nearest && (s.sun + ring) % s.planets !== 0) out.push({ fatal: true, text: `(sun + ring) / planets = ${((s.sun + ring) / s.planets).toFixed(2)} is not whole: ${s.planets} planets cannot be spaced evenly and all mesh (change a tooth count or the number of planets, or set Spacing to 1 for the nearest meshing positions)` });
  const steps = planetSteps(s);
  if (nearest && s.planets > s.sun + ring) out.push({ fatal: true, text: "more planets than meshing positions" });
  if (nearest && steps.some((t, i) => i > 0 && t === steps[i - 1])) out.push({ fatal: true, text: "two planets would stand in one place" });
  if (nearest && (s.sun + ring) % s.planets !== 0) out.push({ fatal: false, text: "the planets are not evenly spaced (each is a whole number of tooth steps from the first, so they all mesh), so the load on them is not balanced" });
  if (s.planets > 1) { // neighbouring planets: centres 2 a sin(angle / 2) apart for the nearest pair, a = (zs + zp) m / 2; a planet's tips reach zp m + 2 mn across
    const total = s.sun + ring;
    const closest = Math.min(...steps.map((t, i) => (i === 0 ? total - steps[steps.length - 1]! + t : t - steps[i - 1]!)));
    const apart = (s.sun + s.planet) * mt(s) * Math.sin((Math.PI * closest) / total);
    const across = s.planet * mt(s) + 2 * s.module;
    if (apart <= across + 1e-9) out.push({ fatal: true, text: `neighbouring planets would touch: ${apart.toFixed(2)} mm apart, their tips need ${across.toFixed(2)} mm (fewer planets, or fewer teeth on the planets)` });
  }
  const below = Math.ceil(2 / Math.sin(((s.pressure ?? 20) * Math.PI) / 180) ** 2);
  for (const [n, z] of [["sun", s.sun], ["planet", s.planet]] as const) if (z < below && !s.helix) out.push({ fatal: false, text: `the ${n} has ${z} teeth: under ${below} undercuts at ${s.pressure ?? 20} degrees` });
  return out;
}
/** Where each planet stands, in tooth steps (`2 pi / (sun + ring)`) from the first: equally spaced when `(sun + ring) / planets` is whole, else (with `spacing` 1) the nearest whole steps to equal spacing. */
export function planetSteps(s: Pick<PlanetarySpec, "sun" | "planet" | "planets" | "spacing">): number[] {
  const total = s.sun + 2 * s.planet + s.sun;
  return Array.from({ length: s.planets }, (_, k) => Math.round((k * total) / s.planets));
}
/** Sets for a wanted ratio of the part held, nearest first (then fewer warnings, then fewer teeth): every sun and planet count in range with no fatal problem. */
export function fromRatio(ratio: number, hold: Hold, base: Pick<PlanetarySpec, "planets" | "module" | "width" | "helix" | "pressure" | "spacing">, opt: { minSun?: number; minPlanet?: number; maxTeeth?: number } = {}): { sun: number; planet: number; ratio: number; error: number }[] {
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
  /** the housing: the tube's inside and outside radius, its depth along the axis, and the end cap (its thickness, mm, 0 none, and the hole for the sun's shaft, mm across, 0 none) */
  housing?: { inner: number; outer: number; depth: number; cap: number; hole: number };
  carrier?: { thickness: number; gap: number; radius: number; hole: number; pins: { at: Vec3; diameter: number }[] };
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
  const ring0 = spec.sun + 2 * spec.planet;
  const steps = planetSteps(spec);
  const planets: Layout["planets"] = [];
  for (let k = 0; k < spec.planets; k++) {
    const r = meshWith(sun, u, v, { teeth: spec.planet }, turn + (TAU * steps[k]!) / (spec.sun + ring0));
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
    out.carrier = { thickness: spec.carrier!, gap: spec.plateGap ?? 0, radius: ringPitchR, hole: bore > 0 ? bore + 2 * gap : 0, pins: planets.map((p) => ({ at: p.at, diameter: pin })) };
    if (pin <= 0) return err("the pin needs a diameter");
    if (!((spec.plateGap ?? 0) >= 0)) return err("the gap between the planets and the plate cannot be below zero");
  }
  if ((spec.housing ?? 0) > 0) {
    const o = gearOutline(ring.spec);
    if (!o.ok || o.value.outerRadius === undefined) return err("the ring has no outer wall for a housing to go round");
    const fit = spec.housingFit ?? 0.2;
    if (!(fit >= 0)) return err("the housing's fit cannot be below zero");
    out.housing = { inner: o.value.outerRadius + fit, outer: o.value.outerRadius + fit + spec.housing!, depth: spec.width + (spec.plateGap ?? 0), cap: spec.housingCap ?? 0, hole: bore > 0 ? bore + 2 * gap : 0 };
  } else if ((spec.housingCap ?? 0) > 0) return err("an end cap needs a housing: type the housing's wall too");
  return ok(out);
}

// ---- the scene ----
const planetariesOf = (s: Scene): readonly PlanetaryRecord[] => s.planetaries ?? [];
const gearIdsOf = (r: PlanetaryRecord): string[] => [r.sunId, ...r.planetIds, r.ringId];
const planeOf = (s: Scene, ref: Ref): { u: Vec3; v: Vec3 } | null => { const p = s.parts[ref]; return p && p.kind === "plane" ? { u: p.u, v: p.v } : null; };
/** The parts of every carrier ever made under this id are those with this prefix (the plate's circle and centre, the hole, each pin's centre and circle). */
const isCarrierPart = (id: string, ref: string): boolean => ref.startsWith(`d/${id}.`);

/** The gears' ids for a set: derived from its own (`q_001` makes `q_001s`, `q_001r`, `q_001p1`...). */
const idsFor = (id: string, planets: number): { sunId: string; ringId: string; planetIds: string[] } => ({ sunId: `${id}s`, ringId: `${id}r`, planetIds: Array.from({ length: planets }, (_, i) => `${id}p${i + 1}`) });

/** The steps that make the carrier, the housing's tube and its cap: kept by name through edits. */
interface Extras { carrierStep?: string; shellStep?: string; capStep?: string }
/**
 * The carrier and the housing made again (or taken away) for a layout: their drawn circles (named `d/<id>.*`, all taken out first) and one extrude each, in the places the old ones had, with the names they had. The carrier is one extrude with the plate below the gears' plane
 * (negative) and the pins above it, each figure with its own depth; the housing's tube is an annulus up the gears' width; its cap a disc on a plane of its own above the gears. With a plate gap the carrier is on a plane of its own that far below.
 */
function extrasScene(s: Scene, rec: PlanetaryRecord, lay: Layout | undefined, old: Extras): { scene: Scene } & Extras {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (!(p.origin === "drawn" && isCarrierPart(rec.id, p.ref))) parts[p.ref] = p;
  const oldIds = [old.carrierStep, old.shellStep, old.capStep].filter((x): x is string => !!x);
  const firstAt = Math.min(...oldIds.map((id) => s.steps.findIndex((x) => x.id === id)).filter((i) => i >= 0), Infinity);
  const steps = s.steps.filter((x) => !oldIds.includes(x.id));
  let cur: Scene = { ...s, parts, steps };
  const made: Step[] = [];
  const out: Extras = {};
  if (lay && (lay.carrier || lay.housing)) {
    const base0 = s.parts[rec.plane];
    const n: Vec3 = base0 && base0.kind === "plane" ? (() => { const c: Vec3 = [base0.u[1] * base0.v[2] - base0.u[2] * base0.v[1], base0.u[2] * base0.v[0] - base0.u[0] * base0.v[2], base0.u[0] * base0.v[1] - base0.u[1] * base0.v[0]]; const l = Math.hypot(...c) || 1; return [c[0] / l, c[1] / l, c[2] / l]; })() : [0, 0, 1];
    const shift = (p: Vec3, dz: number): Vec3 => [p[0] + n[0] * dz, p[1] + n[1] * dz, p[2] + n[2] * dz];
    const planeAt = (tag: string, dz: number): Ref => {
      if (dz === 0 || !base0 || base0.kind !== "plane") return rec.plane;
      const ref = drawnRef(`${rec.id}.${tag}`);
      parts[ref] = { ref, kind: "plane", origin: "drawn", plane: null, movable: false, at: shift(base0.at, dz), u: base0.u, v: base0.v };
      return ref;
    };
    const circle = (plane: Ref, tag: string, c: Vec3, r: number, dz: number): Ref => { // a circle of its own with its centre, on `plane`, its centre `dz` along the normal from the gears' plane
      const [cc, k] = [drawnRef(`${rec.id}.${tag}c`), drawnRef(`${rec.id}.${tag}k`)];
      const base = { origin: "drawn" as const, plane, movable: false };
      parts[cc] = { ...base, ref: cc, kind: "corner", at: shift(c, dz) };
      parts[k] = { ...base, ref: k, kind: "circle", center: cc, radius: r };
      return k;
    };
    const step = (kind: keyof Extras, params: Record<string, number | string>, partsOf: Ref[]): void => {
      const id = old[kind] ?? nextId(cur, "s");
      const st: Step = { id, type: "extrude", parts: partsOf, params: { ...params, mode: "new", planetary: rec.id } };
      cur = bumpCounter(cur, id);
      made.push(st); out[kind] = id;
    };
    const W = rec.spec.width;
    if (lay.carrier) {
      const c = lay.carrier, plane = planeAt("pl", -c.gap);
      const plate = circle(plane, "pt", rec.at, c.radius, -c.gap);
      const hole = c.hole > 0 ? circle(plane, "ph", rec.at, c.hole / 2, -c.gap) : null;
      const pins = c.pins.map((p, i) => circle(plane, `pn${i}`, p.at, p.diameter / 2, -c.gap));
      step("carrierStep", { depth: -c.thickness, ...(hole ? { holes: hole } : {}), also: pins.join("|"), alsoDepth: pins.map(() => W + c.gap).join("|") }, [plate]);
    }
    if (lay.housing) {
      const h = lay.housing;
      const outer = circle(rec.plane, "so", rec.at, h.outer, 0), inner = circle(rec.plane, "si", rec.at, h.inner, 0);
      step("shellStep", { depth: h.depth, holes: inner }, [outer]);
      if (h.cap > 0) {
        const plane = planeAt("hp", h.depth);
        const co = circle(plane, "co", rec.at, h.outer, h.depth);
        const ch = h.hole > 0 ? circle(plane, "ch", rec.at, h.hole / 2, h.depth) : null;
        step("capStep", { depth: h.cap, ...(ch ? { holes: ch } : {}) }, [co]);
      }
    }
  }
  const next = [...cur.steps];
  next.splice(Number.isFinite(firstAt) ? Math.min(firstAt, next.length) : next.length, 0, ...made);
  return { scene: { ...cur, steps: next }, ...out };
}

function gearRecord(id: string, plane: Ref, g: { spec: GearSpec; at: Vec3; turn: number }): GearRecord {
  return { id, plane, at: [...g.at] as unknown as Vec3, spec: g.spec, ...(g.turn ? { turn: g.turn } : {}) };
}

/** A set made: its gears (each with the steps that make its body), its carrier if it has one, and its record. */
export function addPlanetary(s: Scene, rec: Omit<PlanetaryRecord, "sunId" | "ringId" | "planetIds" | "carrierStep" | "shellStep" | "capStep">): Result<Scene> {
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
  const { scene: done, ...extras } = extrasScene(cur, full, lay.value, {});
  return ok({ ...done, planetaries: [...planetariesOf(s), { ...full, ...extras }] });
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
  const { scene: done, ...extras } = extrasScene(cur, next, lay.value, { carrierStep: rec.carrierStep, shellStep: rec.shellStep, capStep: rec.capStep });
  const { carrierStep: _c, shellStep: _h, capStep: _p, ...bare } = next;
  return ok({ ...done, planetaries: planetariesOf(s).map((p) => (p === rec ? { ...bare, ...extras } : p)) });
}

/** A set taken away: its gears (with their bodies), its carrier and its record. */
export function deletePlanetary(s: Scene, id: string): Result<Scene> {
  const rec = planetariesOf(s).find((p) => p.id === id);
  if (!rec) return err(`planetary set ${id} does not exist`);
  let cur = s;
  for (const g of gearIdsOf(rec)) { const r = deleteGear(cur, g); if (!r.ok) return r; cur = r.value; }
  cur = extrasScene(cur, rec, undefined, { carrierStep: rec.carrierStep, shellStep: rec.shellStep, capStep: rec.capStep }).scene;
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
