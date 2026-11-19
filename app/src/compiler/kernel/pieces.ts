// A model of many parts apart, made in pieces (`dec_progressive_open`, `in_1002`, `q_progressive_load`): which graphs can be, how they are cut, and the ghost of each part. Pure: a graph in, a plan out; nothing of the kernel is used.
// The class is the one whose independence the differential test (`prototypes/progressive`) has shown: pushes of sketches of their own into bodies of their own (`extrude`, mode new), and the steps that change one such body by what they name: a fillet or
// chamfer (by the names of the faces of its edges, else by where they are), a hole (a push that cuts, by where its tool is) and a move along an axis (by the body it names); the groups are the bodies that such a step ties together and the bodies whose
// boxes meet (a moved body's box is taken where it began and where it ends). A graph with anything else in it (a revolve, a turn, a scale, a gear, a pattern, a fillet whose edges go together, a hole where there is no body) is not planned: it is made whole, as it always was.
import type { KernelGraph, KernelOp, Vec } from "./adapter.ts";

export interface Box { min: Vec; max: Vec }
/** A part's ghost: the body it will be (`id` is the name the body keeps), where it stands, and the box of it. */
export interface Ghost { id: string; box: Box }
/** A group of parts that are built together (their boxes meet): the ghosts, and the graph of their own steps alone. */
export interface Piece { ghosts: Ghost[]; graph: KernelGraph; centre: Vec }
export interface Plan { pieces: Piece[]; ghosts: Ghost[] }

/** The fewest parts for which a model is made in pieces: a few parts are quicker as they are. */
export const MIN_PIECES = 24;
const MARGIN = 0.5; // (mm: parts nearer than this are one group)

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const isVec = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));
interface Frame { origin: Vec; xDir: Vec; normal: Vec }
const frameOf = (sk: KernelOp): Frame | null => {
  const f = sk.frame as Partial<Frame> | undefined;
  return f && isVec(f.origin) && isVec(f.xDir) && isVec(f.normal) ? { origin: f.origin as Vec, xDir: f.xDir as Vec, normal: f.normal as Vec } : null;
};
/** The corners of a sketch's outline in the sketch's plane (a polygon's, or the box of a circle). */
const outline = (sk: KernelOp): number[][] | null => {
  if (sk.shape === "polygon" && Array.isArray(sk.points) && sk.points.length >= 3) return (sk.points as number[][]).every((p) => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)) ? (sk.points as number[][]) : null;
  if (sk.shape === "circle" && typeof sk.radius === "number" && isVec([...(sk.at as number[] ?? [0, 0]), 0])) { const [x, y] = (sk.at as number[] | undefined) ?? [0, 0]; const r = sk.radius as number; return [[x! - r, y! - r], [x! + r, y! - r], [x! + r, y! + r], [x! - r, y! + r]]; }
  return null;
};

/** The ghost of a push, from its sketch and depth alone; null when the numbers are not plain. */
function ghostOf(sk: KernelOp, x: KernelOp): Box | null {
  const f = frameOf(sk), pts = outline(sk), d = x.distance;
  if (!f || !pts || typeof d !== "number" || !Number.isFinite(d)) return null;
  const v = cross(f.normal, f.xDir);
  const min: Vec = [Infinity, Infinity, Infinity], max: Vec = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (const h of [0, d]) for (let k = 0; k < 3; k++) { const c = f.origin[k]! + p[0]! * f.xDir[k]! + p[1]! * v[k]! + h * f.normal[k]!; if (c < min[k]!) min[k] = c; if (c > max[k]!) max[k] = c; }
  return { min, max };
}
const meet = (a: Box, b: Box): boolean => [0, 1, 2].every((i) => a.min[i]! - MARGIN <= b.max[i]! && b.min[i]! - MARGIN <= a.max[i]!);

interface Creator { ghost: Ghost; swept: Box; ops: KernelOp[]; index: number }
interface Mod { ops: KernelOp[]; index: number; with: number[] }
interface Analysed { creators: Creator[]; mods: Mod[] }

const hull = (a: Box, b: Box): Box => ({ min: [0, 1, 2].map((k) => Math.min(a.min[k]!, b.min[k]!)) as Vec, max: [0, 1, 2].map((k) => Math.max(a.max[k]!, b.max[k]!)) as Vec });
const shifted = (b: Box, by: Vec): Box => ({ min: [0, 1, 2].map((k) => b.min[k]! + by[k]!) as Vec, max: [0, 1, 2].map((k) => b.max[k]! + by[k]!) as Vec });
const holds = (b: Box, p: number[]): boolean => [0, 1, 2].every((k) => p[k]! >= b.min[k]! - MARGIN && p[k]! <= b.max[k]! + MARGIN);

/** What a graph is made of for the pieces: the parts (a push of a sketch into a body of its own) and the steps that change them, each with the parts it is tied to; null when it is not of the kind or has fewer than `MIN_PIECES` parts. */
function analyse(graph: KernelGraph): Analysed | null {
  const sketches = new Map<string, KernelOp>();
  const solids: KernelOp[] = [];
  for (const o of graph.ops) (o.type === "sketch" ? sketches.set(o.id, o) : solids.push(o));
  if (solids.length < MIN_PIECES) return null;
  const creators: Creator[] = [], mods: Mod[] = [];
  const byId = new Map<string, number>(); // (a part's body, by the name of the step that made it)
  const owner = new Map<string, number[]>(); // (a step that changes a body: the parts it is tied to, for a later step that names its faces)
  let prev: string | null = null;
  for (const [k, x] of solids.entries()) {
    if ((x.target ?? null) !== (k === 0 ? null : prev)) return null; // (the chain of the graph: each is made onto the one before)
    prev = x.id;
    const pushes = x.type === "extrude" && !x.also && !x.draft;
    if (pushes && (x.mode === undefined || x.mode === "new" || (k === 0 && x.mode === "add"))) {
      const sk = sketches.get(String(x.profile));
      const holes = ((x.holes as string[] | undefined) ?? []).map((h) => sketches.get(h));
      if (!sk || holes.some((h) => !h)) return null;
      const box = ghostOf(sk, x);
      if (!box) return null;
      byId.set(x.id, creators.length);
      creators.push({ ghost: { id: x.id, box }, swept: box, ops: [sk, ...(holes as KernelOp[]), x], index: k });
    } else if (x.type === "edgeMod") {
      const refs = x.ref as { a?: unknown; b?: unknown; mid?: unknown; name?: unknown }[] | undefined;
      if (x.together || !Array.isArray(refs) || !refs.length) return null;
      const w = new Set<number>();
      for (const r of refs) {
        let found = false;
        for (const id of String(r.name ?? "").split("|").map((n) => n.split(":")[0]!)) { // (the faces an edge lies between are named by the step that made them)
          if (byId.has(id)) { w.add(byId.get(id)!); found = true; } else if (owner.has(id)) { for (const c of owner.get(id)!) w.add(c); found = true; }
        }
        if (found) continue;
        const pts = [r.a, r.b, r.mid].filter(isVec);
        if (!pts.length) return null;
        const held = creators.map((c, i) => [c, i] as const).filter(([c]) => pts.some((p) => holds(c.swept, p)));
        if (!held.length) return null;
        for (const [, i] of held) w.add(i);
      }
      mods.push({ ops: [x], index: k, with: [...w] });
      owner.set(x.id, [...w]);
    } else if (pushes && (x.mode === "cut" || x.mode === "cutOrAdd")) { // a hole: the bodies its tool meets
      const sk = sketches.get(String(x.profile));
      const holes = ((x.holes as string[] | undefined) ?? []).map((h) => sketches.get(h));
      if (!sk || holes.some((h) => !h)) return null;
      const tool = ghostOf(sk, x);
      if (!tool) return null;
      const w = creators.map((c, i) => [c, i] as const).filter(([c]) => meet(c.swept, tool)).map(([, i]) => i);
      if (!w.length) return null; // (a cut that meets no body may add one)
      mods.push({ ops: [sk, ...(holes as KernelOp[]), x], index: k, with: w });
      owner.set(x.id, w);
    } else if (x.type === "transform" && x.mode === "move" && typeof x.body === "string" && byId.has(x.body)) { // a body moved along an axis, or by a vector
      const axis = x.axis, v = x.value, vec = x.vec;
      const by: Vec | null = isVec(vec) ? (vec as Vec) : typeof v === "number" && Number.isFinite(v) && (axis === 0 || axis === 1 || axis === 2) ? ([0, 1, 2].map((q) => (q === axis ? v : 0)) as Vec) : null;
      if (!by) return null;
      const c = creators[byId.get(x.body)!]!;
      c.ghost = { id: c.ghost.id, box: shifted(c.ghost.box, by) }; // (the picture is of the model as it ends)
      c.swept = hull(c.swept, c.ghost.box); // (and the parts that it may meet are those it passes)
      mods.push({ ops: [x], index: k, with: [byId.get(x.body)!] });
    } else return null;
  }
  return creators.length >= MIN_PIECES ? { creators, mods } : null;
}

/** The ghosts of the parts of a graph that can be made in pieces, or null when it cannot. */
export function ghostsOf(graph: KernelGraph): { ghost: Ghost; ops: KernelOp[] }[] | null {
  const a = analyse(graph);
  return a ? a.creators.map((c) => ({ ghost: c.ghost, ops: c.ops })) : null;
}

/** The plan: the parts cut into groups where their boxes meet or a step ties them, the groups nearest `eye` first (or in their own order); null when the graph is not of the kind. */
export function planPieces(graph: KernelGraph, eye?: Vec): Plan | null {
  const a = analyse(graph);
  if (!a) return null;
  const { creators, mods } = a;
  const parent = creators.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const CELL = 20;
  const grid = new Map<string, number[]>();
  creators.forEach((p, i) => {
    const b = p.swept;
    for (let cx = Math.floor((b.min[0]! - MARGIN) / CELL); cx <= Math.floor((b.max[0]! + MARGIN) / CELL); cx++) for (let cy = Math.floor((b.min[1]! - MARGIN) / CELL); cy <= Math.floor((b.max[1]! + MARGIN) / CELL); cy++) {
      const key = `${cx},${cy}`;
      for (const j of grid.get(key) ?? []) if (meet(b, creators[j]!.swept)) parent[find(i)] = find(j);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
    }
  });
  for (const m of mods) for (const c of m.with.slice(1)) parent[find(c)] = find(m.with[0]!);
  const by = new Map<number, number[]>();
  creators.forEach((_, i) => (by.get(find(i)) ?? by.set(find(i), []).get(find(i))!).push(i));
  const modsOf = new Map<number, Mod[]>();
  for (const m of mods) (modsOf.get(find(m.with[0]!)) ?? modsOf.set(find(m.with[0]!), []).get(find(m.with[0]!))!).push(m);
  const pieces: Piece[] = [...by.entries()].map(([root, ix]) => {
    const ghosts = ix.map((i) => creators[i]!.ghost);
    const lo = [0, 1, 2].map((k) => Math.min(...ghosts.map((g) => g.box.min[k]!))), hi = [0, 1, 2].map((k) => Math.max(...ghosts.map((g) => g.box.max[k]!)));
    const steps = [...ix.map((i) => ({ index: creators[i]!.index, ops: creators[i]!.ops })), ...(modsOf.get(root) ?? []).map((m) => ({ index: m.index, ops: m.ops }))].sort((p, q) => p.index - q.index);
    const ops: KernelOp[] = [];
    let before: string | null = null;
    for (const st of steps) {
      for (const o of st.ops) {
        if (o.type === "sketch") { ops.push(o); continue; }
        const { target: _t, ...rest } = o;
        const first = before === null; // (the first of a piece is made on its own; the rest onto the one before)
        ops.push({ ...rest, ...(first ? { mode: "add" } : { target: before }) });
        before = o.id;
      }
    }
    return { ghosts, graph: { ...graph, ops }, centre: [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] as Vec };
  });
  if (eye) pieces.sort((p, q) => Math.hypot(p.centre[0] - eye[0], p.centre[1] - eye[1], p.centre[2] - eye[2]) - Math.hypot(q.centre[0] - eye[0], q.centre[1] - eye[1], q.centre[2] - eye[2]));
  return { pieces, ghosts: creators.map((c) => c.ghost) };
}
