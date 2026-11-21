// What is selected, and what a click does to it (prototype: docs/rebuild/sketch_planes_requirements.md, S1 to S6).
// A click selects one item (a corner, a line, a face, a cut plane's border); a double click a whole body; Shift adds what is not selected and takes out what is.
import type { V3 } from "./vec.ts";
import type { Scene } from "./scene.ts";
import { cornersOf, EDGES, faceOf, keyOf, type Hit, type Item } from "./pick.ts";

export type Sel = Item[];
const itemOf = (h: Hit): Item => ({ kind: h.kind, ...(h.thing !== undefined ? { thing: h.thing } : {}), ...(h.index !== undefined ? { index: h.index } : {}), ...(h.id !== undefined ? { id: h.id } : {}) });
const without = (sel: Sel, i: Item): Sel => sel.filter((s) => keyOf(s) !== keyOf(i));
const has = (sel: Sel, i: Item): boolean => sel.some((s) => keyOf(s) === keyOf(i));

/** The selection after a click on `hit` (null: on nothing). */
export function apply(sel: Sel, hit: Hit | null, o: { shift: boolean; double: boolean }): Sel {
  if (!hit) return o.shift ? sel : [];
  if (o.double && hit.thing !== undefined && hit.kind !== "cut") {
    const body: Item = { kind: "body", thing: hit.thing };
    if (!o.shift) return [body];
    const rest = sel.filter((s) => s.thing !== hit.thing || s.kind === "cut"); // (a body takes its own corners, lines and faces with it)
    return has(sel, body) ? rest : [...rest, body];
  }
  const item = itemOf(hit);
  if (!o.shift) return [item];
  return has(sel, item) ? without(sel, item) : [...sel, item];
}

/** What to draw to show some items: faces as loops, lines as segments, corners as points. */
export interface Marks { faces: V3[][]; edges: Array<[V3, V3]>; points: V3[] }
export const noMarks = (): Marks => ({ faces: [], edges: [], points: [] });
export function marksOf(m: Scene, items: Item[]): Marks {
  const out = noMarks();
  for (const i of items) {
    const t = m.things.find((q) => q.id === i.thing);
    if (!t) continue;
    const cs = cornersOf(t);
    if (i.kind === "vertex") out.points.push(cs[i.index!]!);
    else if (i.kind === "edge") out.edges.push([cs[EDGES[i.index!]![0]]!, cs[EDGES[i.index!]![1]]!]);
    else if (i.kind === "face") out.faces.push(faceOf(t, i.index!));
    else if (i.kind === "body") { for (let f = 0; f < 6; f++) out.faces.push(faceOf(t, f)); for (const [a, b] of EDGES) out.edges.push([cs[a]!, cs[b]!]); }
  }
  return out;
}
