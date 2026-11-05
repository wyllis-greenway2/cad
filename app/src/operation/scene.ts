// The scene: planes, drawn parts, steps and the relations list (`dec_clean_engine_design` section 3). This is the graph that is saved (`prin_graph_is_truth`):
// body parts are derived from the kernel result and are not saved; world parts are rebuilt on load. Scenes are plain data and never mutated: commands return new ones.
import type { Ref } from "../shared/ref.ts";
import { worldRef, formatId } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part, Lookup } from "./part.ts";

/** A relation between parts. `parts` are in selection order: the first moves, the second is the reference (`in_090`). `kind` is a row id of the actions table. */
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
  type: "extrude" | "edgeMod" | "move" | "rotate" | "scale" | "delete";
  parts: Ref[];
  params: Record<string, number | string>;
}
export interface Scene {
  parts: Readonly<Record<string, Part>>;
  relations: readonly Relation[];
  steps: readonly Step[];
  /** Id counter: ids are never reused, so replaying a command list gives the same names. */
  counter: number;
}

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const O: Vec3 = [0, 0, 0];

/** The world: the three planes, the three axes and the origin. Always references (origin "world", not movable). */
export function worldParts(): Part[] {
  const w = (name: string) => worldRef(name);
  const base = { origin: "world" as const, plane: null, movable: false };
  return [
    { ...base, ref: w("O"), kind: "corner", at: O },
    { ...base, ref: w("X"), kind: "axis", at: O, dir: X },
    { ...base, ref: w("Y"), kind: "axis", at: O, dir: Y },
    { ...base, ref: w("Z"), kind: "axis", at: O, dir: Z },
    { ...base, ref: w("XY"), kind: "plane", at: O, u: X, v: Y }, // normal +Z
    { ...base, ref: w("XZ"), kind: "plane", at: O, u: X, v: Z }, // normal -Y
    { ...base, ref: w("YZ"), kind: "plane", at: O, u: Y, v: Z }, // normal +X
  ];
}

export function emptyScene(): Scene {
  const parts: Record<string, Part> = {};
  for (const p of worldParts()) parts[p.ref] = p;
  return { parts, relations: [], steps: [], counter: 0 };
}

export const lookup = (s: Scene): Lookup => (r) => s.parts[r];
export const partOf = (s: Scene, r: Ref): Part | undefined => s.parts[r];
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
}
export function toJSON(s: Scene): SceneJson {
  return {
    version: 1,
    counter: s.counter,
    parts: Object.values(s.parts).filter((p) => p.origin === "drawn"),
    relations: [...s.relations],
    steps: [...s.steps],
  };
}
export function fromJSON(j: SceneJson): Scene {
  if (j.version !== 1) throw new Error(`unknown scene version ${String(j.version)}`);
  const s = emptyScene();
  const parts: Record<string, Part> = { ...s.parts };
  for (const p of j.parts) parts[p.ref] = p;
  return { parts, relations: [...j.relations], steps: [...j.steps], counter: j.counter };
}
