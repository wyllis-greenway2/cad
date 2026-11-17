// What a picture asks of a scene by the kind of its parts, found once for the scene (`in_765`): the bodies, the sheets that cut or can, and the parts as a list. A picture is made at every move of the pointer and every step of an orbit,
// and a scene of eight gears has five thousand parts: looking through them all for the three that are bodies was done many times a frame. Pure: a scene in, lists out; the same scene gives the same lists.
import type { Scene } from "./scene.ts";
import type { Part } from "./part.ts";

export interface PartIndex {
  /** every part, in the order of the scene */
  all: readonly Part[];
  /** the parts that are a body */
  bodies: readonly Extract<Part, { kind: "body" }>[];
  /** the planes that are sheets (a cross section, `in_459`) */
  sections: readonly Extract<Part, { kind: "plane" }>[];
}
const kept = new WeakMap<Scene, PartIndex>();
export function partIndex(sc: Scene): PartIndex {
  let ix = kept.get(sc);
  if (!ix) {
    const all = Object.values(sc.parts);
    ix = {
      all,
      bodies: all.filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body"),
      sections: all.filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && !!p.section),
    };
    kept.set(sc, ix);
  }
  return ix;
}
