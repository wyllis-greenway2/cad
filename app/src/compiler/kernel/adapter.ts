// The kernel interface as the app sees it (`inv_kernel_boundary`, `src/compiler/kernel/README.md`): an operation graph in, plain data out.
// Only files under compiler/kernel/occt/ may import OCCT or replicad; everything else talks to this interface.
export type Vec = [number, number, number];

export interface KernelOp { id: string; type: string; [key: string]: unknown }
export interface KernelGraph { params: Record<string, number>; ops: KernelOp[] }

export interface KernelEdge { type: string; pts: Float32Array; a: Vec; b: Vec; mid: Vec }
export interface KernelFace { start: number; count: number; type?: string; n?: Vec; d?: number; axis?: number; [key: string]: unknown }
export interface KernelResult {
  ops: { id: string; type: string; error: string | null; ms: number }[];
  finalId: string | null;
  volume: number | null;
  bbox: { min: Vec; max: Vec } | null;
  mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array } | null;
  faces: KernelFace[] | null;
  edges: KernelEdge[] | null;
  vertices: Vec[] | null;
  totalMs: number;
  /** the kernel works on its own thread and has not answered this question yet: this is the last answer it gave, for an older model */
  stale?: boolean;
}
export interface Kernel {
  name: string;
  /** the answer may come later than the question (the kernel works on its own thread): `evaluate` then gives the last result until the new one is ready */
  lagging?: boolean;
  init(options?: object): Promise<unknown>;
  evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number }): KernelResult;
}
