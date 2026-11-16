// Where to draw a thin line on the body (`in_164`): along the edges where the surface turns a corner. This looks at the kernel's smooth normals at the two ends of each edge shared by two
// (the search itself is in the kernel's files: the kernel's thread finds the edges of each body once and sends them, `dec_sharp_edges_once`; this is for a mesh that came without them)
import { cornerEdges } from "../../shared/sharp.mjs";
export { cornerEdges };

const kept = new WeakMap<Float32Array, { normals: Float32Array; triangles: Uint32Array; deg: number; edges: number[] }>();
/**
 * The same as `cornerEdges`, remembered by the mesh it was made from (`dec_sharp_edges_once`, step 1): the picture is built again when the scene changes and the mesh did not (a sketch moved, a
 * selection), and the edges of an unchanged mesh are the same edges. The list returned is shared: it must not be changed.
 */
export function cornerEdgesOf(mesh: { vertices: Float32Array; normals: Float32Array; triangles: Uint32Array; sharp?: Float32Array; sharpDeg?: number }, thresholdDeg: number): { edges: number[]; again: boolean } {
  if (mesh.sharp && mesh.sharpDeg === thresholdDeg) return { edges: mesh.sharp as unknown as number[], again: true }; // (found by the kernel's thread, once for each body)
  const k = kept.get(mesh.vertices);
  if (k && k.normals === mesh.normals && k.triangles === mesh.triangles && k.deg === thresholdDeg) return { edges: k.edges, again: true };
  const edges = cornerEdges(mesh.vertices, mesh.normals, mesh.triangles, thresholdDeg);
  kept.set(mesh.vertices, { normals: mesh.normals, triangles: mesh.triangles, deg: thresholdDeg, edges });
  return { edges, again: false };
}
