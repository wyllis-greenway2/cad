// The kernel interface as the app sees it (`inv_kernel_boundary`, `src/compiler/kernel/README.md`): an operation graph in, plain data out.
// Only files under compiler/kernel/occt/ may import OCCT or replicad; everything else talks to this interface.
export type Vec = [number, number, number];

export interface KernelOp { id: string; type: string; [key: string]: unknown }
export interface KernelGraph { params: Record<string, number>; ops: KernelOp[]; /** the flat faces of the body are given names that last through the steps (`dec_stable_reference_mechanism`) */ names?: boolean }

export interface KernelEdge { type: string; body?: number; pts: Float32Array; a: Vec; b: Vec; mid: Vec; /** an edge that is (part of) a circle: its circle */ circle?: { center: Vec; normal: Vec; radius: number } }
export interface KernelFace { start: number; count: number; body?: number; type?: string; n?: Vec; d?: number; axis?: number; [key: string]: unknown }
export interface KernelResult {
  ops: { id: string; type: string; error: string | null; ms: number; /** a fillet or chamfer that could not be made: which of its edges (their places in the step) cannot take the size by themselves */ culprits?: number[]; /** something worth saying about a step that was made (a fillet made together with the edges at its corner, `in_379`) */ note?: string; /** an extrusion or revolve onto the body that did not say what it is: what it came to (a cut, a piece joined on, a piece of its own) */ used?: "cut" | "add" | "new"; /** a cut: the bodies it took material from (`in_436`) */ cutInto?: string[]; /** worked out before and kept (this evaluation did not make it again) */ cached?: boolean; /** ms of the validity check and of finding the bodies again, when they took a millisecond or more */ checkMs?: number; markMs?: number; /** where the step's own time went, by stage (ms), for the steps that say */ stages?: Record<string, number> }[];
  finalId: string | null;
  /** with `graph.names`: the flat faces of the final body with the names they were given (`dec_stable_reference_mechanism`): a unit normal and a point of the face */
  faceNames?: { name: string; /** `cyl`: a round face; its `n` is the axis, `o` a point of it, `r` the radius, `c` a point on the surface */ kind?: "cyl" | "surf"; n: Vec; c: Vec; o?: Vec; r?: number; /** `surf`: a surface of another kind (a cone, a sphere, a torus, a spline): what it is and the box it lies in */ type?: string; lo?: Vec; hi?: Vec }[];
  /** with `graph.names`: the edges between two flat faces, named by the two (`dec_stable_reference_mechanism`), with their ends and middle */
  edgeNames?: { name: string; a: Vec; b: Vec; mid: Vec }[];
  volume: number | null;
  bbox: { min: Vec; max: Vec } | null;
  /** the bodies of the final shape, each with the name it keeps through the history (`dec_independent_bodies`); a face or an edge says which is its in `body` (its place in this list) when there are several */
  bodies?: { id: string; min: Vec; max: Vec; /** NaN in a lite answer with several bodies: it takes a while to work out, and a preview does not use it */ volume: number }[] | null;
  /** `sharp`: the lines (two ends each, xyz) where the surface of each body turns a corner by more than `sharpDeg` degrees, found once for each body in the kernel's thread (`dec_sharp_edges_once`) */
  mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; sharp?: Float32Array; sharpDeg?: number } | null;
  faces: KernelFace[] | null;
  edges: KernelEdge[] | null;
  vertices: Vec[] | null;
  /** the kernel's own thread (the browser): how long the request waited for the thread, and the round trip to the answer; what the thread's own work took is `totalMs`, the rest of the trip (`messageMs`) is the messages and the copies of the graph and the answer */
  trip?: { waitMs: number; tripMs: number; messageMs: number; /** the request on its way to the thread (the graph copied, and the thread busy with something else), what the thread itself took from taking the request to sending the answer, and the answer on its way back (the copy, and the page's own thread busy drawing) */ toThreadMs?: number; threadMs?: number; backMs?: number };
  /** with several bodies: for each corner, the place of the body it is a corner of in `bodies` (the first, where two bodies share a place) */
  vertexBodies?: number[];
  totalMs: number;
  /** where the time went (ms): working the operations out, meshing the body, classifying its faces, its edges (`in_216`) */
  perf?: { ops: number; box?: number; mesh: number; faces: number; edges: number };
  /** the bodies of the final shape: how many, and how many were found as they were (not meshed and classified again) */
  describe?: { bodies: number; reused: number; fingerprintMs?: number; describedMs?: number };
  /** this answer was kept from an earlier session (`dec_description_cache`): the kernel's own answer for the same graph, shown while the thread works the model out */
  fromCache?: boolean;
  /** the kernel works on its own thread and has not answered this question yet: this is the last answer it gave, for an older model */
  stale?: boolean;
}
/** How fine an exported mesh is: the most a facet may be from the true surface (mm), and the most a curve may turn across one facet (radians). */
export interface ExportQuality { tolerance: number; angular: number; /** ask for the exact solid as a STEP file (`exportStep`), not a mesh: the worker takes both through the one queue of exports (`dec_export_formats`) */ step?: boolean; /** with `step`: the file's unit, inches (the model is in millimetres either way) */ unit?: "in"; /** only these bodies (their names, `KernelResult.bodies`); absent: all of them, which is what the export does unless it is told otherwise (`in_271`) */ bodies?: string[] }
/** The body as a closed triangle mesh for a file (`dec_export_stl`): plain numbers, millimetres, in the world as modelled. */
export type ExportResult =
  | { ok: true; vertices: Float32Array; triangles: Uint32Array; volume: number; bbox: { min: Vec; max: Vec } }
  | { ok: false; error: string };
/** The exact body as a STEP file (`dec_export_formats`): the bytes of the text file, millimetres, in the world as modelled. */
export type StepResult =
  | { ok: true; bytes: Uint8Array; volume: number; bbox: { min: Vec; max: Vec } }
  | { ok: false; error: string };
export interface Kernel {
  name: string;
  /** the answer may come later than the question (the kernel works on its own thread): `evaluate` then gives the last result until the new one is ready */
  lagging?: boolean;
  init(options?: object): Promise<unknown>;
  evaluate(graph: KernelGraph, tess?: { tolerance: number; angular: number; /** a rough mesh, quickly (while a size is being dragged) */ draft?: boolean; /** the mesh, volume and box only: no faces, edges or corners (the picture of a size being dragged, `in_358`) */ lite?: boolean }): KernelResult;
  /** the final body of the graph as a mesh made for a file at the given quality (not the screen's coarse one); answers later when the kernel works on its own thread */
  exportMesh(graph: KernelGraph, quality: ExportQuality): Promise<ExportResult>;
  /** the final body (or only the bodies named) as a STEP file; answers later when the kernel works on its own thread */
  exportStep(graph: KernelGraph, bodies?: string[], unit?: "in"): Promise<StepResult>;
  /** nothing is being made now (a scene with no steps): the picture the kernel last gave is not the picture of what comes next, so it is forgotten (`in_830`: deleted gears showed for a moment while new ones were made); a kernel that keeps no last picture ignores it */
  clear?(): void;
  /** ask for rough meshes (set while a size is being dragged, cleared when it is let go); a kernel that does not know it ignores it */
  draft?: boolean;
  /** ask for the mesh only, no faces, edges or corners: for a preview, a quarter of the time (`in_358`) */
  lite?: boolean;
}
