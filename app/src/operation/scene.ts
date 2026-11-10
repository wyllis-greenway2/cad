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

/** A relation between parts. `parts` are listed mover first, then the references (held in place): the part selected FIRST moves and the ones selected before it stay (`in_196`, which reversed `in_090`). `kind` is a row id of the actions table. */
export interface Relation {
  id: string;
  kind: string;
  parts: Ref[];
  value?: number;
  locked?: boolean;
  /** Small extra numbers a relation keeps (for example which side of a line, so a gap does not flip over). */
  params?: Record<string, number>;
}
/** A step of the history of building: extrude, round or bevel, move, rotate, scale, delete. It names the parts it uses by ref. */
export interface Step {
  id: string;
  type: "extrude" | "pushPull" | "edgeMod" | "move" | "rotate" | "scale" | "pattern" | "combine" | "delete";
  parts: Ref[];
  params: Record<string, number | string>;
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
/** The step's figures as its two params (`holes` for the first, `also` for the rest). */
export function figureParams(figs: Figure[]): Record<string, string> {
  const enc = (f: Figure) => f.holes.map((h) => h.join(",")).join(";");
  const out: Record<string, string> = {};
  if (figs[0] && figs[0].holes.length) out.holes = enc(figs[0]);
  if (figs.length > 1) out.also = figs.slice(1).map((f) => f.outer.join(",") + (f.holes.length ? ">" + enc(f) : "")).join("|");
  return out;
}
/** Every ref an extrude step stands on: its figures' sides and circles, holes and siblings too. */
export const figureRefs = (st: Step): Ref[] => figuresOf(st).flatMap((f) => [...f.outer, ...f.holes.flat()]);
export interface Scene {
  parts: Readonly<Record<string, Part>>;
  relations: readonly Relation[];
  steps: readonly Step[];
  /** selection groups, layered (`in_257`, `groups.ts`); absent when there are none */
  groups?: readonly Group[];
  /** repeats of drawn figures that keep their numbers: their copies are made from these (`repeat.ts`) */
  patterns?: readonly PatternRecord[];
  /** the plane whose hidden sketch (what extrusions used up) is shown and snapped to while sketching in it (not part of the model, only of how it is looked at, `in_211`) */
  reveal?: Ref;
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
}
export function toJSON(s: Scene): SceneJson {
  return {
    version: 1,
    counter: s.counter,
    parts: Object.values(s.parts).filter((p) => p.origin === "drawn" && p.kind !== "face"), // faces are derived
    relations: [...s.relations],
    steps: [...s.steps],
    ...(s.groups?.length ? { groups: s.groups.map((g) => ({ id: g.id, items: [...g.items] })) } : {}),
    ...(s.patterns?.length ? { patterns: s.patterns.map((r) => ({ ...r, parts: [...r.parts], params: [...r.params] })) } : {}),
  };
}
export function fromJSON(j: SceneJson): Scene {
  if (j.version !== 1) throw new Error(`unknown scene version ${String(j.version)}`);
  const s = emptyScene();
  const parts: Record<string, Part> = { ...s.parts };
  for (const p of j.parts) parts[p.ref] = p;
  return { parts, relations: [...j.relations], steps: [...j.steps], counter: j.counter, ...(j.groups?.length ? { groups: j.groups.map((g) => ({ id: g.id, items: [...g.items] })) } : {}), ...(j.patterns?.length ? { patterns: j.patterns.map((r) => ({ ...r, parts: [...r.parts], params: [...r.params] })) } : {}) };
}

/** The scene with its body parts replaced by these (derived from the kernel result; never saved). */
export function withBody(s: Scene, body: readonly Part[]): Scene {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.origin !== "body") parts[p.ref] = p;
  for (const p of body) parts[p.ref] = p;
  return { ...s, parts };
}

/** The scene with its derived faces (closed loops, disks) rebuilt. */
export function withDerived(s0: Scene): Scene {
  const s = withPatterns(s0); // (the copies of the repeats that keep their numbers, made from the originals as they are now)
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.kind !== "face" && !((p.kind === "line" || p.kind === "corner") && p.derived)) parts[p.ref] = p;
  const { faces, parts: made } = derivedFaces({ ...s, parts });
  for (const a of made) parts[a.ref] = a;
  for (const f of faces) parts[f.ref] = f;
  return { ...s, parts };
}
