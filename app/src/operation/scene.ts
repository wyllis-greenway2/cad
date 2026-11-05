// The scene: planes, drawn parts, steps and the relations list (`dec_clean_engine_design` section 3). This is the graph that is saved (`prin_graph_is_truth`):
// body parts are derived from the kernel result and are not saved; world parts are rebuilt on load. Scenes are plain data and never mutated: commands return new ones.
import type { Ref } from "../shared/ref.ts";
import { worldRef, formatId } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Part, Lookup } from "./part.ts";
import { derivedFaces } from "./loops.ts";

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
/** The side of a world plane's pane (mm), from the origin along its two axes: the little squares you select a world plane by. */
const PANE = 22;

/** The world: the three planes, the three axes and the origin. Always references (origin "world", not movable). */
function worldParts(): Part[] {
  const w = (name: string) => worldRef(name);
  const base = { origin: "world" as const, plane: null, movable: false };
  return [
    { ...base, ref: w("O"), kind: "corner", at: O },
    { ...base, ref: w("X"), kind: "axis", at: O, dir: X },
    { ...base, ref: w("Y"), kind: "axis", at: O, dir: Y },
    { ...base, ref: w("Z"), kind: "axis", at: O, dir: Z },
    { ...base, ref: w("XY"), kind: "plane", at: O, u: X, v: Y, extent: PANE }, // normal +Z
    { ...base, ref: w("XZ"), kind: "plane", at: O, u: X, v: Z, extent: PANE }, // normal -Y
    { ...base, ref: w("YZ"), kind: "plane", at: O, u: Y, v: Z, extent: PANE }, // normal +X
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
}
export function toJSON(s: Scene): SceneJson {
  return {
    version: 1,
    counter: s.counter,
    parts: Object.values(s.parts).filter((p) => p.origin === "drawn" && p.kind !== "face"), // faces are derived
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

/** The scene with its body parts replaced by these (derived from the kernel result; never saved). */
export function withBody(s: Scene, body: readonly Part[]): Scene {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.origin !== "body") parts[p.ref] = p;
  for (const p of body) parts[p.ref] = p;
  return { ...s, parts };
}

/** The scene with its derived faces (closed loops, disks) rebuilt. */
export function withDerived(s: Scene): Scene {
  const parts: Record<string, Part> = {};
  for (const p of Object.values(s.parts)) if (p.kind !== "face") parts[p.ref] = p;
  for (const f of derivedFaces({ ...s, parts })) parts[f.ref] = f;
  return { ...s, parts };
}
