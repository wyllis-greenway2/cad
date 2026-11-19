// A model of many parts apart, made in pieces (`dec_progressive_open`, `in_999`, `q_progressive_load`): which graphs can be, how they are cut, and the ghost of each part. Pure: a graph in, a plan out; nothing of the kernel is used.
// The class is the one whose independence the differential test (`prototypes/progressive`) has shown: every solid step is a push of a sketch of its own into a body of its own (`extrude`, mode new), and the bodies' boxes do not meet.
// A graph with anything else in it (a fillet, a move, a cut, a revolve, a gear) is not planned: it is made whole, as it always was.
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

/** The ghosts of the parts of a graph that can be made in pieces, or null when it cannot (it has more than pushes of sketches into bodies of their own, or too few parts). */
export function ghostsOf(graph: KernelGraph): { ghost: Ghost; ops: KernelOp[] }[] | null {
  const sketches = new Map<string, KernelOp>();
  const solids: KernelOp[] = [];
  for (const o of graph.ops) (o.type === "sketch" ? sketches.set(o.id, o) : solids.push(o));
  if (solids.length < MIN_PIECES) return null;
  const out: { ghost: Ghost; ops: KernelOp[] }[] = [];
  let prev: string | null = null;
  for (const [k, x] of solids.entries()) {
    if (x.type !== "extrude" || x.also || x.draft || (x.mode !== undefined && x.mode !== "new" && !(k === 0 && x.mode === "add"))) return null;
    if ((x.target ?? null) !== (k === 0 ? null : prev)) return null; // (the chain of the graph: each is made onto the one before)
    const sk = sketches.get(String(x.profile));
    if (!sk) return null;
    const holes = ((x.holes as string[] | undefined) ?? []).map((h) => sketches.get(h));
    if (holes.some((h) => !h)) return null;
    const box = ghostOf(sk, x);
    if (!box) return null;
    out.push({ ghost: { id: x.id, box }, ops: [sk, ...(holes as KernelOp[]), x] });
    prev = x.id;
  }
  return out;
}

/** The plan: the parts cut into groups where their boxes meet, the groups nearest `eye` first (or in their own order); null when the graph is not of the kind. */
export function planPieces(graph: KernelGraph, eye?: Vec): Plan | null {
  const parts = ghostsOf(graph);
  if (!parts) return null;
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const CELL = 20;
  const grid = new Map<string, number[]>();
  parts.forEach((p, i) => {
    const b = p.ghost.box;
    for (let cx = Math.floor((b.min[0]! - MARGIN) / CELL); cx <= Math.floor((b.max[0]! + MARGIN) / CELL); cx++) for (let cy = Math.floor((b.min[1]! - MARGIN) / CELL); cy <= Math.floor((b.max[1]! + MARGIN) / CELL); cy++) {
      const key = `${cx},${cy}`;
      for (const j of grid.get(key) ?? []) if (meet(b, parts[j]!.ghost.box)) parent[find(i)] = find(j);
      (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
    }
  });
  const by = new Map<number, number[]>();
  parts.forEach((_, i) => (by.get(find(i)) ?? by.set(find(i), []).get(find(i))!).push(i));
  const pieces: Piece[] = [...by.values()].map((ix) => {
    const ghosts = ix.map((i) => parts[i]!.ghost);
    const lo = [0, 1, 2].map((k) => Math.min(...ghosts.map((g) => g.box.min[k]!))), hi = [0, 1, 2].map((k) => Math.max(...ghosts.map((g) => g.box.max[k]!)));
    const ops: KernelOp[] = [];
    let before: string | null = null;
    for (const i of ix) {
      for (const o of parts[i]!.ops) {
        if (o.type !== "extrude") { ops.push(o); continue; }
        const { target: _t, mode: _m, ...rest } = o;
        ops.push({ ...rest, ...(before ? { target: before, mode: "new" } : { mode: "add" }) });
        before = o.id;
      }
    }
    return { ghosts, graph: { ...graph, ops }, centre: [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] as Vec };
  });
  if (eye) pieces.sort((a, b) => Math.hypot(a.centre[0] - eye[0], a.centre[1] - eye[1], a.centre[2] - eye[2]) - Math.hypot(b.centre[0] - eye[0], b.centre[1] - eye[1], b.centre[2] - eye[2]));
  return { pieces, ghosts: parts.map((p) => p.ghost) };
}
