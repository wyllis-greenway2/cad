// The binary STL file (`dec_export_stl`): 80 bytes of header, a count (uint32), then for each triangle its normal and three corners as float32 and a 2 byte attribute of zero (50 bytes a triangle).
// Pure data in, bytes out: units are what the mesh is in (millimetres), the axes are the model's (Z up).

/** The file for a mesh: `vertices` x y z for each corner, `triangles` three corner numbers for each triangle (counter-clockwise seen from outside, so the normal points out). */
export function stlBytes(vertices: ArrayLike<number>, triangles: ArrayLike<number>, title: string): Uint8Array {
  const at3 = (i: number): [number, number, number] => [vertices[i] as number, vertices[i + 1] as number, vertices[i + 2] as number];
  const n = Math.floor(triangles.length / 3);
  const out = new Uint8Array(84 + 50 * n);
  const view = new DataView(out.buffer);
  const head = `CAD binary STL: ${title}, mm, Z up`.replace(/[^\x20-\x7e]/g, "?").slice(0, 80); // (a header that starts with "solid" makes some programs read the file as text: this does not)
  for (let i = 0; i < head.length; i++) out[i] = head.charCodeAt(i);
  for (let i = head.length; i < 80; i++) out[i] = 0x20;
  view.setUint32(80, n, true);
  let at = 84;
  for (let t = 0; t < n; t++) {
    const p = [0, 1, 2].map((k) => at3((triangles[3 * t + k] as number) * 3)) as [[number, number, number], [number, number, number], [number, number, number]];
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]] as [number, number, number];
    const v = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]] as [number, number, number];
    const nx = u[1] * v[2] - u[2] * v[1];
    const ny = u[2] * v[0] - u[0] * v[2];
    const nz = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const x of [nx / len, ny / len, nz / len]) { view.setFloat32(at, x, true); at += 4; }
    for (const q of p) for (const x of q) { view.setFloat32(at, x, true); at += 4; }
    at += 2; // (the attribute: zero)
  }
  return out;
}

/** How many edges of the mesh belong to other than two triangles (corners that are the same point count as one): 0 for a closed solid. */
export function openEdges(vertices: ArrayLike<number>, triangles: ArrayLike<number>): number {
  // corners that are the same point: found in the cells round their own (two of them can fall either side of the edge of a cell, `in_267`)
  const cells = new Map<string, { p: [number, number, number]; id: number }[]>();
  let count = 0;
  const id = (i: number): number => {
    const p: [number, number, number] = [vertices[3 * i] as number, vertices[3 * i + 1] as number, vertices[3 * i + 2] as number];
    const c = p.map((v) => Math.floor(v / 1e-3)) as [number, number, number];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const q of cells.get(`${c[0] + dx},${c[1] + dy},${c[2] + dz}`) ?? []) if (Math.hypot(q.p[0] - p[0], q.p[1] - p[1], q.p[2] - p[2]) < 5e-4) return q.id;
    }
    const made = { p, id: count++ };
    const k = c.join(",");
    cells.set(k, [...(cells.get(k) ?? []), made]);
    return made.id;
  };
  const uses = new Map<string, number>();
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const c = [id(triangles[t] as number), id(triangles[t + 1] as number), id(triangles[t + 2] as number)] as [number, number, number];
    for (let k = 0; k < 3; k++) {
      const a = c[k] as number, b = c[(k + 1) % 3] as number;
      if (a === b) continue; // (a sliver that has shrunk to a line)
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const n of uses.values()) if (n !== 2) open++;
  return open;
}
