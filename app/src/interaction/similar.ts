// Select similar (`in_257`, `dec_selection_tools` section 4): from the selected edges, faces or sketch parts, everything of the same kind in the same body (or sketch) that matches by a few fixed rules.
// The rules are values that do not change when a copy is turned or moved, so the teeth of a gear match whichever way they point; "direction" is the one rule that does care, and it starts off.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, sub, dot, cross, normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Part, Line } from "../operation/part.ts";
import { pointOf } from "../operation/part.ts";

export type SimilarRule = "kind" | "size" | "angle" | "direction";
export const SIMILAR_RULES: { id: SimilarRule; label: string; title: string }[] = [
  { id: "kind", label: "kind", title: "the same kind: straight, arc or circle; flat or round" },
  { id: "size", label: "size", title: "the same length, radius or area" },
  { id: "angle", label: "angle", title: "the same angle between the two faces an edge lies between, convex or concave" },
  { id: "direction", label: "direction", title: "pointing the same way (off: a turned copy matches)" },
];
export const DEFAULT_RULES: readonly SimilarRule[] = ["kind", "size", "angle"];

type Face = Extract<Part, { kind: "plane" }>;
/** What an example and a candidate are compared by. `null` for a value that does not apply to the kind (a sketch part has no angle). */
interface Props { category: string; kind: string; size: number[]; angle: number | null; convex: boolean | null; dir: Vec3 | null; tol: number }

const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
/** The cell of a point on a grid of 2 mm thousandths: two corners that are the same point can fall either side of a cell's edge, so a corner is looked for in the cells round its own (`in_267`). */
const CELL = 2e-3;
const cellOf = (m: readonly number[], i: number): [number, number, number] => [Math.floor(m[i]! / CELL), Math.floor(m[i + 1]! / CELL), Math.floor(m[i + 2]! / CELL)];
const key = (m: readonly number[], i: number) => cellOf(m, i).join(",");
const angleOf = (a: Vec3, b: Vec3) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

/** The body's faces with their corners looked up by position, so the faces an edge lies between are found by the two ends. */
interface Faces { list: Face[]; byVertex: Map<string, Face[]> }
function facesOf(scene: Scene): Faces {
  const list = Object.values(scene.parts).filter((p): p is Face => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.length >= 9);
  const byVertex = new Map<string, Face[]>();
  for (const f of list) {
    const seen = new Set<string>();
    for (let i = 0; i + 2 < f.mesh!.length; i += 3) { const k = key(f.mesh!, i); if (!seen.has(k)) { seen.add(k); (byVertex.get(k) ?? byVertex.set(k, []).get(k)!).push(f); } }
  }
  return { list, byVertex };
}
/** The outward normal of a face where it touches the point `p` (a corner of its mesh): the mean of its triangles there (the kernel's triangles face outward), and a corner of those triangles that is not `p`. */
function normalAt(f: Face, p: Vec3, away: Vec3[]): { n: Vec3; far: Vec3 } | null {
  const m = f.mesh!;
  let n: Vec3 = [0, 0, 0];
  let far: Vec3 | null = null;
  for (let i = 0; i + 8 < m.length; i += 9) {
    const t = [0, 3, 6].map((o) => [m[i + o]!, m[i + o + 1]!, m[i + o + 2]!] as Vec3);
    if (!t.some((q) => Math.hypot(...sub(q, p)) < 2e-3)) continue;
    n = add(n, cross(sub(t[1]!, t[0]!), sub(t[2]!, t[0]!)));
    far ??= t.find((q) => Math.hypot(...sub(q, p)) > 2e-3 && away.every((w) => Math.hypot(...sub(q, w)) > 2e-3)) ?? null;
  }
  const len = Math.hypot(...n);
  return len < 1e-12 || !far ? null : { n: normalize(n), far };
}

function lineProps(scene: Scene, l: Line, faces: Faces): Props | null {
  const get = (q: Ref) => scene.parts[q];
  const [a, b] = [pointOf(get, l.a), pointOf(get, l.b)];
  if (!a || !b) return null;
  const closed = Math.hypot(...sub(a, b)) < 1e-6;
  let kind = "line";
  let size = [Math.hypot(...sub(a, b))];
  if (l.mid && !l.circle) {
    // a curve that is not a circle (`in_344`): its length along itself, nothing like a radius
    const path = l.path && l.path.length > 1 ? l.path : [a, l.mid, b];
    kind = "curve";
    size = [path.slice(1).reduce((t, q, i) => t + Math.hypot(q[0] - path[i]![0], q[1] - path[i]![1], q[2] - path[i]![2]), 0)];
  } else if (l.circle || l.mid) {
    if (l.circle && (closed || l.twin)) { kind = "circle"; size = [l.circle.radius]; } // (a whole rim, in one piece or in halves: the radius is what it is)
    else {
      kind = "arc";
      const m = l.mid ?? null;
      const centre = l.circle ? l.circle.center : null; // (only a circle is an arc here: another curve was dealt with above, `in_344`)
      if (!m) return { category: "edge", kind: "line", size: [Math.hypot(...sub(a, b))], angle: null, convex: null, dir: normalize(sub(b, a)), tol: 1e-3 };
      if (!centre) return { category: "edge", kind: "line", size: [Math.hypot(...sub(a, b))], angle: null, convex: null, dir: normalize(sub(b, a)), tol: 1e-3 }; // (a "curve" that is straight)
      const span = angleOf(sub(a, centre), sub(m, centre)) + angleOf(sub(m, centre), sub(b, centre));
      size = [Math.hypot(...sub(a, centre)), (span * 180) / Math.PI];
    }
  }
  // the two faces it lies between: the faces that have both its ends (a whole rim has one end: the faces that have it)
  const at = (p: Vec3): Face[] => {
    const [cx, cy, cz] = cellOf(p, 0);
    const out = new Set<Face>();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const f of faces.byVertex.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) out.add(f);
    return [...out];
  };
  const fa = at(a);
  const fb = closed ? fa : at(b);
  const both = fa.filter((f) => fb.includes(f));
  let angle: number | null = null;
  let convex: boolean | null = null;
  if (both.length === 2) {
    const [n1, n2] = [normalAt(both[0]!, a, closed ? [] : [b]), normalAt(both[1]!, a, closed ? [] : [b])];
    if (n1 && n2) {
      angle = r((angleOf(n1.n, n2.n) * 180) / Math.PI, 1);
      convex = angle < 0.05 ? null : dot(sub(n2.far, a), n1.n) < -1e-6; // (the other face lies behind this face's plane: a corner that points out)
    }
  }
  const dir = closed || kind !== "line" ? (l.circle ? normalize(l.circle.normal) : null) : normalize(sub(b, a));
  return { category: "edge", kind, size, angle, convex, dir, tol: 1e-3 };
}

function faceProps(f: Face): Props | null {
  const m = f.mesh!;
  let area = 0;
  for (let i = 0; i + 8 < m.length; i += 9) {
    const p = [0, 3, 6].map((o) => [m[i + o]!, m[i + o + 1]!, m[i + o + 2]!] as Vec3);
    area += Math.hypot(...cross(sub(p[1]!, p[0]!), sub(p[2]!, p[0]!))) / 2;
  }
  const round = !!(f.curved || f.rounded);
  const radius = f.curved?.radius ?? f.radius ?? 0;
  return { category: "face", kind: round ? "round" : "flat", size: round ? [radius, area] : [area], angle: null, convex: null, dir: round ? (f.curved?.dir ?? f.round?.dir ?? null) : normalizeOrNull(f), tol: round ? 2e-2 : 5e-3 };
}
const normalizeOrNull = (f: Face): Vec3 | null => { const n = cross(f.u, f.v); return Math.hypot(...n) > 1e-12 ? normalize(n) : null; };

/** A sketch part: a line or an arc, or a circle, on its plane. */
function drawnProps(scene: Scene, p: Part): Props | null {
  const get = (q: Ref) => scene.parts[q];
  if (p.kind === "circle") return { category: `sketch:${p.plane ?? ""}`, kind: "circle", size: [p.radius], angle: null, convex: null, dir: null, tol: 1e-3 };
  if (p.kind !== "line") return null;
  const [a, b] = [pointOf(get, p.a), pointOf(get, p.b)];
  if (!a || !b) return null;
  if (p.center) {
    const c = pointOf(get, p.center);
    if (!c) return null;
    const R = Math.hypot(...sub(a, c));
    const span = angleOf(sub(a, c), sub(b, c));
    return { category: `sketch:${p.plane ?? ""}`, kind: "arc", size: [R, (span * 180) / Math.PI], angle: null, convex: null, dir: null, tol: 1e-3 };
  }
  return { category: `sketch:${p.plane ?? ""}`, kind: "line", size: [Math.hypot(...sub(a, b))], angle: null, convex: null, dir: normalize(sub(b, a)), tol: 1e-3 };
}

function propsOf(scene: Scene, p: Part, faces: Faces): Props | null {
  if (p.kind === "line") return p.origin === "body" ? lineProps(scene, p, faces) : drawnProps(scene, p);
  if (p.kind === "circle") return drawnProps(scene, p);
  if (p.kind === "plane" && p.origin === "body" && p.mesh && p.mesh.length >= 9) return faceProps(p);
  return null;
}

const close = (x: number, y: number, tol: number) => Math.abs(x - y) <= Math.max(tol, 1e-4 * Math.max(Math.abs(x), Math.abs(y)));
function matches(a: Props, b: Props, rules: ReadonlySet<SimilarRule>): boolean {
  if (a.category !== b.category) return false;
  if (rules.has("kind") && a.kind !== b.kind) return false;
  // a size means the same only for the same kind (a length is not a radius): across kinds it is not compared
  if (rules.has("size") && a.kind === b.kind && !(a.size.length === b.size.length && a.size.every((v, i) => close(v, b.size[i]!, a.kind === "arc" && i === 1 ? 0.1 : a.tol)))) return false;
  if (rules.has("angle") && a.category === "edge" && (a.angle !== b.angle || a.convex !== b.convex)) return false;
  if (rules.has("direction") && a.dir && b.dir && Math.abs(Math.abs(dot(a.dir, b.dir)) - 1) > 1e-4) return false;
  return true;
}

export type SimilarResult = { ok: true; refs: Ref[]; noun: string } | { ok: false; why: string };

/**
 * Everything like the selected parts. The selected parts must all be of one category (edges of the body, flat or round faces of the body, or parts of one sketch); the match is made against every part of that
 * category. The selected parts are always in the result. A rim of two halves comes with both halves.
 */
export function similarTo(scene: Scene, selection: readonly Ref[], rules: readonly SimilarRule[] = DEFAULT_RULES): SimilarResult {
  const faces = facesOf(scene);
  const set = new Set(rules);
  const examples = selection.map((q) => scene.parts[q]).filter((p): p is Part => !!p);
  if (!examples.length) return { ok: false, why: "select an edge, a face or a sketch line first" };
  const eProps = examples.map((p) => propsOf(scene, p, faces));
  if (eProps.some((p) => !p)) return { ok: false, why: "select edges or faces of the body, or lines and circles of a sketch (not a mix with anything else)" };
  const cats = new Set(eProps.map((p) => p!.category));
  if (cats.size !== 1) return { ok: false, why: "select things of one kind: edges, faces, or the parts of one sketch" };
  const cat = [...cats][0]!;
  const out = new Set<Ref>(selection);
  for (const p of Object.values(scene.parts)) {
    if (out.has(p.ref)) continue;
    const pr = propsOf(scene, p, faces);
    if (pr && eProps.some((e) => matches(e!, pr, set))) out.add(p.ref);
  }
  for (const q of [...out]) { const p = scene.parts[q]; if (p?.kind === "line" && p.twin) out.add(p.twin); }
  const noun = cat === "edge" ? "edge" : cat === "face" ? "face" : "sketch part";
  return { ok: true, refs: [...out], noun };
}
