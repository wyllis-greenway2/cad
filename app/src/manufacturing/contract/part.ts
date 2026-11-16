// What a manufacturing module is given (`dec_manufacturing_contract` point 6, `inv_manufacturing_boundary`): a part as plain data. No kernel or app objects, no handles, no ids a kernel made up: the mesh, the exact solid as STEP
// bytes if the kernel can make it, flat outlines in plane coordinates, and a name that stays when the model is edited. It survives `structuredClone`, so a module can run in a worker.

/** A point or a direction, in millimetres. (The contract imports nothing, so it has its own.) */
export type Point3 = readonly [number, number, number];
/** A point on a plane, in the plane's own coordinates (x along its first direction, y along its second), in millimetres. */
export type Point2 = readonly [number, number];

/** A fine triangle mesh as the kernel gives it: positions and normals (xyz), and triangle corner indices. Millimetres, Z up as modelled. */
export interface PartMesh {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
}

/** What a line is for (`in_563`): cut through, score (a shallow line, a fold) or engrave. A piece with no layer is cut. */
export type Layer = "cut" | "score" | "engrave";

/** One piece of a flat outline, as in the SVG and DXF files (`dec_export_flat`): a straight piece, an arc about a centre from `p` to `q`, or a whole circle. */
export type FlatPiece =
  | { kind: "line"; p: Point2; q: Point2; layer?: Layer }
  | { kind: "arc"; center: Point2; radius: number; p: Point2; q: Point2; ccw: boolean; layer?: Layer }
  | { kind: "circle"; center: Point2; radius: number; layer?: Layer };

/** The plane a flat outline lies on: a point on it, the direction of its x axis and its normal (a right-handed frame, y = normal x xDir). */
export interface PlaneFrame {
  origin: Point3;
  xDir: Point3;
  normal: Point3;
}

/** Flat pieces on one plane. Whether a piece is an outer edge or a hole is for the route to decide from how they nest. */
export interface FlatOutline {
  plane: PlaneFrame;
  pieces: FlatPiece[];
}

/** A solid body has a mesh (and maybe STEP bytes); a flat part is a drawing and has only outlines. */
export type PartKind = "solid" | "flat";

/** Where a module learns what it is making. `id` is the body's stable name (`dec_stable_references`), the same across edits; `material` is a material id from the libraries, if the model has one. */
export interface PartSnapshot {
  /** the contract version this was made for (`CONTRACT_VERSION`) */
  contract: number;
  id: string;
  name: string;
  kind: PartKind;
  /** always "mm": nothing else crosses the boundary */
  units: "mm";
  mesh?: PartMesh;
  /** the exact solid as STEP text, when the kernel can write it */
  step?: string;
  outlines?: FlatOutline[];
  material?: string;
  bbox: { min: Point3; max: Point3 };
}

/** A face, a line or a corner named by its geometry, as in the kernel's own results: never by an id a kernel made up (`inv_kernel_boundary`). */
export type GeometryRef =
  | { kind: "face"; n: Point3; d: number; point: Point3 }
  | { kind: "edge"; a: Point3; b: Point3; mid: Point3 }
  | { kind: "point"; at: Point3 };
