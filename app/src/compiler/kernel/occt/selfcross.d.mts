/** The first place a mesh passes through itself (by more than `depth`), or null. */
export function findCrossing(vertices: ArrayLike<number>, triangles: ArrayLike<number>, depth: number, budget?: number): { at: [number, number, number]; triangles: [number, number] } | null;
