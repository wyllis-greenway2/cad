/** The lines (two ends each, x y z) where the surface turns a corner by more than `thresholdDeg` degrees, by the smooth normals at the two ends of each edge two triangles share. */
export function cornerEdges(vertices: Float32Array, normals: Float32Array, triangles: Uint32Array, thresholdDeg: number): number[];
