// The kernel interface as the app sees it (`inv_kernel_boundary`, `src/compiler/kernel/README.md`): an operation graph in, plain data out.
// Only files under compiler/kernel/occt/ may import OCCT or replicad; everything else talks to this interface.
export type Vec = [number, number, number];

export interface KernelOp { id: string; type: string; [key: string]: unknown }
export interface KernelGraph { params: Record<string, number>; ops: KernelOp[] }

export interface KernelEdge { type: string; body?: number; pts: Float32Array; a: Vec; b: Vec; mid: Vec; /** an edge that is (part of) a circle: its circle */ circle?: { center: Vec; normal: Vec; radius: number } }
export interface KernelFace { start: number; count: number; body?: number; type?: string; n?: Vec; d?: number; axis?: number; [key: string]: unknown }
export interface KernelResult {
  ops: { id: string; type: string; error: string | null; ms: number; /** a fillet or chamfer that could not be made: which of its edges (their places in the step) cannot take the size by themselves */ culprits?: number[] }[];
  finalId: string | null;
  volume: number | null;
  bbox: { min: Vec; max: Vec } | null;
  /** the bodies of the final shape, each with the name it keeps through the history (`dec_independent_bodies`); a face or an edge says which is its in `body` (its place in this list) when there are several */
  bodies?: { id: string; min: Vec; max: Vec; volume: number }[] | null;
  mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array } | null;
  faces: KernelFace[] | null;
  edges: KernelEdge[] | null;
  vertices: Vec[] | null;
  totalMs: number;
  /** where the time went (ms): working the operations out, meshing the body, classifying its faces, its edges (`in_216`) */
  perf?: { ops: number; box?: number; mesh: number; faces: number; edges: number };
  /** the kernel works on its own thread and has not answered this question yet: this is the last answer it gave, for an older model */
  stale?: boolean;
}
/** How fine an exported mesh is: the most a facet may be from the true surface (mm), and the most a curve may turn across one facet (radians). */
export interface ExportQuality { tolerance: number; angular: number; /** only these bodies (their names, `KernelResult.bodies`); absent: all of them, which is what the export does unless it is told otherwise (`in_271`) */ bodies?: string[] }
/** The body as a closed triangle mesh for a file (`dec_export_stl`): plain numbers, millimetres, in the world as modelled. */
export type ExportResult =
  | { ok: true; vertices: Float32Array; triangles: Uint32Array; volume: number; bbox: { min: Vec; max: Vec } }
  | { ok: false; error: string };
export interface Kernel {
  name: string;
  /** the answer may come later than the question (the kernel works on its own thread): `evaluate` then gives the last result until the new one is ready */
  lagging?: boolean;
  init(options?: object): Promise<unknown>;
  evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number; /** a rough mesh, quickly (while a size is being dragged) */ draft?: boolean }): KernelResult;
  /** the final body of the graph as a mesh made for a file at the given quality (not the screen's coarse one); answers later when the kernel works on its own thread */
  exportMesh(graph: KernelGraph, quality: ExportQuality): Promise<ExportResult>;
  /** ask for rough meshes (set while a size is being dragged, cleared when it is let go); a kernel that does not know it ignores it */
  draft?: boolean;
}
