// The scene: planes, drawn parts, steps and the relations list (`dec_clean_engine_design` section 3). This is the graph that is saved (`prin_graph_is_truth`):
// body parts are derived from the kernel result and are not saved; world parts are rebuilt on load. Scenes are plain data and never mutated: commands return new ones.
import type { Ref } from "../shared/ref.ts";
import { worldRef, formatId } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part, Lookup } from "./part.ts";
import { derivedFaces } from "./loops.ts";
import type { Group } from "./groups.ts";
import type { PatternRecord } from "./repeat.ts";
import { withPatterns } from "./repeat.ts";
import type { GearRecord } from "./gearscene.ts";
import type { PlanetaryRecord } from "./planetary.ts";
import { withGears, madeByAGear } from "./gearscene.ts";

/** A relation between parts. `parts` are listed mover first, then the references (held in place): the part selected FIRST moves and the ones selected before it stay (`in_196`, which reversed `in_90`). `kind` is a row id of the actions table. */
/** How a circular edge of the body looked when a relation was made to it (`in_309`): its centre, radius and facing, and how far along its facing it stood in the body's box (0 bottom, 1 top). The relation names the edge by where it was; if the body changes and that edge is gone, the edge that looks most like this one now is taken (`anchors.ts`). */
export interface EdgeAnchor {
  /** a circular edge (the default), a straight edge (`center` is its middle, `radius` half its length, `normal` its direction), a corner (`radius` 0) or a flat face (`center` its middle, `normal` which way it faces; `in_313`); the last two are judged across `axis`, the facing of the sketch's plane (`in_310`) */
  kind?: "line" | "point" | "face";
  center: [number, number, number]; radius: number; normal: [number, number, number]; t: number;
  axis?: [number, number, number];
}
export interface Relation {
  id: string;
  kind: string;
  parts: Ref[];
  value?: number;
  locked?: boolean;
  /** Small extra numbers a relation keeps (for example which side of a line, so a gap does not flip over). */
  params?: Record<string, number>;
  /** for each part that is a circular edge of the body: how it looked when the relation was made, to find it again when the body changes (`in_309`) */
  anchors?: Record<string, EdgeAnchor>;
}
/** A step of the history of building: extrude, round or bevel, move, rotate, scale, delete. It names the parts it uses by ref. */
export interface Step {
  id: string;
  type: "extrude" | "pushPull" | "edgeMod" | "move" | "rotate" | "scale" | "pattern" | "combine" | "hollow" | "reshape" | "revolve" | "loft" | "sweep" | "delete" | "import" | "importMesh";
  parts: Ref[];
  params: Record<string, number | string>;
  /** numbers of this step that are tied to a formula of named parameters (`dec_named_parameters`): key → formula; `params[key]` holds its value now */
  links?: Record<string, string>;
}
/** A figure an extrude uses: the refs of its sides (or its circle), and those of each figure drawn inside it, which are holes. */
export interface Figure { outer: Ref[]; holes: Ref[][] }
const group = (t: unknown, sep: string): string[][] => String(t ?? "").split(sep).filter(Boolean).map((g) => g.split(",").filter(Boolean));
/** The figures an extrude step uses: `parts` with its `holes` (`a,b;c`), then each of `also` (figures joined by `|`, each `outer>hole;hole`): sibling figures extruded together. */
export function figuresOf(st: Step): Figure[] {
  const out: Figure[] = [{ outer: st.parts, holes: group(st.params.holes, ";") as Ref[][] }];
  for (const f of String(st.params.also ?? "").split("|").filter(Boolean)) {
    const [o, h] = f.split(">");
    out.push({ outer: (o ?? "").split(",").filter(Boolean) as Ref[], holes: group(h, ";") as Ref[][] });
  }
  return out;
}
/** The depth of each figure of an extrude step: the first uses `depth`; a sibling uses its own number in `alsoDepth` (`a|b`, in the order of `also`) when it has one, else the step's depth (`in_351`: two blocks made together can then be pulled apart). */
export function figureDepths(st: Step): number[] {
  const d = Number(st.params.depth ?? 0);
  const own = String(st.params.alsoDepth ?? "").split("|");
  return figuresOf(st).map((_, i) => { if (i === 0) return d; const n = own[i - 1] === undefined || own[i - 1] === "" ? NaN : Number(own[i - 1]); return Number.isFinite(n) ? n : d; });
}
/** The step's figures as its two params (`holes` for the first, `also` for the rest). */
export function figureParams(figs: Figure[]): Record<string, string> {
  const enc = (f: Figure) => f.holes.map((h) => h.join(",")).join(";");
  const out: Record<string, string> = {};
  if (figs[0] && figs[0].holes.length) out.holes = enc(figs[0]);
  if (figs.length > 1) out.also = figs.slice(1).map((f) => f.outer.join(",") + (f.holes.length ? ">" + enc(f) : "")).join("|");
  return out;
}
/** A step made from drawn figures (an extrude, a revolve): its figures are used up by it. */
export const usesFigures = (st: Step): boolean => st.type === "extrude" || st.type === "revolve" || st.type === "loft" || st.type === "sweep";
/** Every ref an extrude step stands on: its figures' sides and circles, holes and siblings too. */
export const figureRefs = (st: Step): Ref[] => figuresOf(st).flatMap((f) => [...f.outer, ...f.holes.flat()]);
export interface Scene {
  parts: Readonly<Record<string, Part>>;
  relations: readonly Relation[];
  steps: readonly Step[];
  /** selection groups, layered (`in_257`, `groups.ts`); absent when there are none */
  groups?: readonly Group[];
  /** the bodies (by the name they keep through the history) that are hard: they collide with each other while they are moved by hand (`dec_hard_bodies`, `in_473`) */
  hard?: readonly string[];
  /** what each body is made of (`in_565`, `dec_manufacturing_definitions`): body name (as for `hard`) to a material id, which the material libraries will check; a body with nothing here has no material */
  materials?: Readonly<Record<string, string>>;
  /** the project's manufacturing section (`in_571`, `dec_manufacturing_definitions` point 4): copies of the machines (and later materials) the project used, by `kind/id@version`, so it reproduces its output when the library changes, and the plans (one per part, route and machine). Plain data; the manufacturing contract's types are not the operation layer's, so the interaction layer checks them. */
  manufacturing?: { definitions?: Readonly<Record<string, unknown>>; plans?: readonly unknown[]; /** a route's own roles for the lines of a drawing, by `part|route` and then by the line's ref (`in_603`): not the model's, which knows nothing of how a part will be made */ marks?: Readonly<Record<string, Readonly<Record<string, string>>>> };
  /** how close hard bodies may come to each other, mm: nearer than this counts as a collision; 0 (absent): only going into each other does (`dec_hard_bodies`) */
  clearance?: number;
  /** repeats of drawn figures that keep their numbers: their copies are made from these (`repeat.ts`) */
  patterns?: readonly PatternRecord[];
  /** gears that keep their numbers: their parts are made from these (`gearscene.ts`) */
  gears?: readonly GearRecord[];
  /** planetary sets that keep their numbers: each ties a sun, planets and a ring (gear records of their own) and a carrier together (`planetary.ts`) */
  planetaries?: readonly PlanetaryRecord[];
  /** the plane whose hidden sketch (what extrusions used up) is shown and snapped to while sketching in it (not part of the model, only of how it is looked at, `in_211`) */
  reveal?: Ref;
  /** A figure moved on a plane of its own keeps that plane under its own name; the name the command gave to a new plane is kept here as another name for it, so a history made when a move made a new plane (more parts were left on the old plane then) still replays (`in_372`) */
  planeAlias?: Readonly<Record<string, Ref>>;
  /** the bodies (their refs, `b/<name>/o`) that are hidden (`dec_hidden_bodies`): drawn very faintly, not hoverable, selectable or snapped to; how the model is looked at, not a step; absent when none is hidden */
  hiddenBodies?: readonly Ref[];
  /** the named parameters (`dec_named_parameters`): name → formula text (a number is a formula) */
  parameters?: Readonly<Record<string, string>>;
  /** derived, not saved: for each cut step, the bodies (their names) it took material from, as the kernel found when it made them (`in_436`): deleting a body takes out the cuts made only in it */
  cutOf?: Readonly<Record<string, readonly string[]>>;
  /** the number each drawn figure was given when it first appeared (`dec_sketch_recipe_synced`, `sketchnames.ts`): by the ref of its derived face; made again when commands are replayed, not saved */
  sketchNames?: Readonly<Record<string, number>>;
  sketchCount?: number;
  /** Id counter: ids are never reused, so replaying a command list gives the same names. */
  counter: number;
}

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const O: Vec3 = [0, 0, 0];

/** The world: the three planes, the three axes and the origin. Always references (origin "world", not movable). */
function worldParts(): Part[] {
  const w = (name: string) => worldRef(name);
  const base = { origin: "world" as const, plane: null, movable: false };
  return [
    { ...base, ref: w("O"), kind: "corner", at: O },
    { ...base, ref: w("X"), kind: "axis", at: O, dir: X },
    { ...base, ref: w("Y"), kind: "axis", at: O, dir: Y },
    { ...base, ref: w("Z"), kind: "axis", at: O, dir: Z },
    { ...base, ref: w("XY"), kind: "plane", at: O, u: X, v: Y, infinite: true }, // normal +Z
    { ...base, ref: w("XZ"), kind: "plane", at: O, u: X, v: Z, infinite: true }, // normal -Y
    { ...base, ref: w("YZ"), kind: "plane", at: O, u: Y, v: Z, infinite: true }, // normal +X
  ];
}

export function emptyScene(): Scene {
  const parts: Record<string, Part> = {};
  for (const p of worldParts()) parts[p.ref] = p;
  return { parts, relations: [], steps: [], counter: 0 };
}

export const lookup = (s: Scene): Lookup => (r) => s.parts[r];
export const hasPart = (s: Scene, r: Ref): boolean => r in s.parts;

/** The next id with a prefix ("e" for shapes, "r" for relations, "s" for steps). */
export const nextId = (s: Scene, prefix: string): string => formatId(prefix, s.counter + 1);
export const bumpCounter = (s: Scene, id: string): Scene => {
  const n = Number(id.slice(id.lastIndexOf("_") + 1));
  return Number.isFinite(n) && n > s.counter ? { ...s, counter: n } : s;
};

// ---- JSON in and out ----
export interface SceneJson {
  version: 1;
  counter: number;
  parts: Part[]; // drawn parts only
  relations: Relation[];
  steps: Step[];
  groups?: Group[];
  patterns?: PatternRecord[];
  gears?: GearRecord[];
  planetaries?: PlanetaryRecord[];
  hard?: string[];
  materials?: Record<string, string>;
  manufacturing?: { definitions?: Record<string, unknown>; plans?: unknown[]; marks?: Record<string, Record<string, string>> };
  clearance?: number;
  hiddenBodies?: Ref[];
  parameters?: Record<string, string>;
}
export function toJSON(s: Scene): SceneJson {
  return {
    version: 1,
    counter: s.counter,
    parts: Object.values(s.parts).filter((p) => p.origin === "drawn" && p.kind !== "face" && !madeByAGear(s, p.ref)), // faces are derived, and so are a gear's parts
    relations: [...s.relations],
    steps: [...s.steps],
    ...(s.groups?.length ? { groups: s.groups.map((g) => ({ id: g.id, items: [...g.items] })) } : {}),
    ...(s.patterns?.length ? { patterns: s.patterns.map((r) => ({ ...r, parts: [...r.parts], params: [...r.params], ...(r.path ? { path: [...r.path] } : {}) })) } : {}),
    ...(s.gears?.length ? { gears: s.gears.map((g) => ({ ...g, at: [...g.at] as unknown as Vec3, spec: { ...g.spec } })) } : {}),
    ...(s.planetaries?.length ? { planetaries: s.planetaries.map((p) => ({ ...p, at: [...p.at] as unknown as Vec3, spec: { ...p.spec }, planetIds: [...p.planetIds] })) } : {}),
    ...(s.hard?.length ? { hard: [...s.hard] } : {}),
    ...(s.materials && Object.keys(s.materials).length ? { materials: { ...s.materials } } : {}),
    ...(s.manufacturing && (Object.keys(s.manufacturing.definitions ?? {}).length || s.manufacturing.plans?.length || Object.keys(s.manufacturing.marks ?? {}).length) ? { manufacturing: { ...(s.manufacturing.definitions ? { definitions: { ...s.manufacturing.definitions } } : {}), ...(s.manufacturing.plans ? { plans: [...s.manufacturing.plans] } : {}), ...(s.manufacturing.marks && Object.keys(s.manufacturing.marks).length ? { marks: Object.fromEntries(Object.entries(s.manufacturing.marks).map(([k, v]) => [k, { ...v }])) } : {}) } } : {}),
    ...(s.clearance ? { clearance: s.clearance } : {}),
    ...(s.hiddenBodies?.length ? { hiddenBodies: [...s.hiddenBodies] } : {}),
    ...(s.parameters && Object.keys(s.parameters).length ? { parameters: { ...s.parameters } } : {}),
  };
}
export function fromJSON(j: SceneJson): Scene {
  if (j.version !== 1) throw new Error(`unknown scene version ${String(j.version)}`);
  const s = emptyScene();
  const parts: Record<string, Part> = { ...s.parts };
  for (const p of j.parts) parts[p.ref] = p;
  return { parts, relations: [...j.relations], steps: [...j.steps], counter: j.counter, ...(j.hard?.length ? { hard: [...j.hard] } : {}), ...(j.materials && Object.keys(j.materials).length ? { materials: { ...j.materials } } : {}), ...(j.manufacturing ? { manufacturing: { ...(j.manufacturing.definitions ? { definitions: { ...j.manufacturing.definitions } } : {}), ...(j.manufacturing.plans ? { plans: [...j.manufacturing.plans] } : {}), ...(j.manufacturing.marks ? { marks: Object.fromEntries(Object.entries(j.manufacturing.marks).map(([k, v]) => [k, { ...v }])) } : {}) } } : {}), ...(j.clearance ? { clearance: j.clearance } : {}), ...(j.groups?.length ? { groups: j.groups.map((g) => ({ id: g.id, items: [...g.items] })) } : {}), ...(j.patterns?.length ? { patterns: j.patterns.map((r) => ({ ...r, parts: [...r.parts], params: [...r.params] })) } : {}), ...(j.planetaries?.length ? { planetaries: j.planetaries.map((p) => ({ ...p, at: [...p.at] as unknown as Vec3, spec: { ...p.spec }, planetIds: [...p.planetIds] })) } : {}), ...(j.gears?.length ? { gears: j.gears.map((g) => ({ ...g, at: [...g.at] as unknown as Vec3, spec: { ...g.spec } })) } : {}), ...(j.hiddenBodies?.length ? { hiddenBodies: [...j.hiddenBodies] } : {}), ...(j.parameters && Object.keys(j.parameters).length ? { parameters: { ...j.parameters } } : {}) };
}

/** The scene with its body parts replaced by these (derived from the kernel result; never saved). */
export function withBody(s: Scene, body: readonly Part[]): Scene {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.origin !== "body") parts[p.ref] = p;
  for (const p of body) parts[p.ref] = p;
  return { ...s, parts };
}

/**
 * The faces derived from a scene's drawn parts, kept for the last few scenes (`in_727`): they depend on the parts and the steps only, and a change that leaves them as they were (a constraint, a number bubble, a body drawn again) had
 * every loop of every gear grouped and traced again. The same objects and the same steps are the same answer.
 */
const derivedKept: { input: Map<string, Part>; steps: readonly Step[]; out: ReturnType<typeof derivedFaces> }[] = [];
function derivedFor(s: Scene): ReturnType<typeof derivedFaces> {
  const input = Object.values(s.parts);
  const hit = derivedKept.find((k) => k.steps === s.steps && k.input.size === input.length && input.every((p) => k.input.get(p.ref) === p)); // (the same parts, in whatever order)
  if (hit) return hit.out;
  const out = derivedFaces(s);
  derivedKept.unshift({ input: new Map(input.map((p) => [p.ref, p])), steps: s.steps, out });
  if (derivedKept.length > 4) derivedKept.pop();
  return out;
}

/** The scene with its derived faces (closed loops, disks) rebuilt. */
export function withDerived(s0: Scene): Scene {
  const s = withGears(withPatterns(s0)); // (the copies of the repeats that keep their numbers, made from the originals as they are now, and the gears made from their numbers)
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.kind !== "face" && !((p.kind === "line" || p.kind === "corner") && p.derived)) parts[p.ref] = p;
  const { faces, parts: made } = derivedFor({ ...s, parts });
  for (const a of made) parts[a.ref] = a;
  for (const f of faces) parts[f.ref] = f;
  return { ...s, parts };
}
