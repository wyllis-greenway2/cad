// What is selected on the page: ONE value (`in_1588`), either parts of a sketch (by plane, the ids the sketch uses) or what is picked on a body (a face, or edges, by the names the steps use, or the whole body), or nothing. The sketch controller and the body picker
// read and write it; selecting one kind puts the other away because there is only one value, so nothing has to clear the other. Pure but for the value it keeps.
import type { EdgeInfo, FaceInfo } from "./studio.ts";
import type { V3 } from "./vec.ts";

export interface BodyPick {
  body: string;
  faces: FaceInfo[];
  edges: EdgeInfo[];
  /** where it was picked (the bar stands beside it) */ at: V3;
}
/** A closed part of a drawing picked (`dec_body_look_and_feel`): the plane's key and a place inside it, which finds it again whatever else is drawn; where it was clicked, for the spread of its colour. */
export interface RegionPick {
  key: string;
  at: [number, number];
  click: V3;
}
export type Picked = { kind: "sketch"; key: string; ids: string[] } | ({ kind: "body" } & BodyPick) | ({ kind: "region" } & RegionPick);

export function createSelection() {
  let cur: Picked | null = null;
  return {
    /** what is selected (null: nothing) */
    get: (): Picked | null => cur,
    /** the ids selected in the sketch of this plane (none when something else is selected, or a sketch of another plane) */
    sketch: (key: string): readonly string[] => (cur?.kind === "sketch" && cur.key === key ? cur.ids : []),
    /** select parts of a sketch (none: nothing is selected) */
    setSketch(key: string, ids: readonly string[]): void {
      cur = ids.length ? { kind: "sketch", key, ids: [...ids] } : null;
    },
    /** what is picked on a body (null: nothing) */
    body: (): BodyPick | null => (cur?.kind === "body" ? cur : null),
    /** what is picked in a drawing as a closed part (null: nothing) */
    region: (): RegionPick | null => (cur?.kind === "region" ? cur : null),
    setRegion(pick: RegionPick | null): void {
      cur = pick ? { kind: "region", ...pick } : null;
    },
    setBody(pick: BodyPick | null): void {
      cur = pick ? { kind: "body", ...pick } : null; // (no faces and no edges: the whole body)
    },
    /** put the selection away; whether there was one */
    clear(): boolean {
      const had = cur !== null;
      cur = null;
      return had;
    },
  };
}
export type Selection = ReturnType<typeof createSelection>;
