// The Wavefront OBJ file (`dec_export_obj`): text, one `o` object, the points (`v`, in the units asked, Z up as modelled) and the triangles (`f`, counter-clockwise seen from outside, corner numbers from 1).
// An OBJ says nothing of its units or its up axis, so the first comment line says them.

/** The file for a mesh: `vertices` x y z for each corner, `triangles` three corner numbers for each triangle. */
export function objBytes(vertices: ArrayLike<number>, triangles: ArrayLike<number>, title: string, units: "mm" | "in" = "mm"): Uint8Array {
  const rows: string[] = [`# CAD OBJ: ${title.replace(/[^\x20-\x7e]/g, "?")}, ${units}, Z up`, `o ${title.replace(/[^\x21-\x7e]/g, "_") || "model"}`];
  const num = (x: number) => String(+x.toFixed(6) || 0); // (no "-0", no trailing zeros)
  // The kernel's mesh has its own corners for each face (so a block has 24); an OBJ is read as a mesh whose triangles share corners, so corners at the same place (to the 6 decimals written) are one point.
  const at = new Map<string, number>();
  const number = new Int32Array(Math.floor(vertices.length / 3));
  for (let i = 0; i < number.length; i++) {
    const key = `${num(vertices[3 * i]!)} ${num(vertices[3 * i + 1]!)} ${num(vertices[3 * i + 2]!)}`;
    let n = at.get(key);
    if (n === undefined) { n = at.size + 1; at.set(key, n); rows.push(`v ${key}`); }
    number[i] = n;
  }
  for (let t = 0; t + 2 < triangles.length; t += 3) rows.push(`f ${number[triangles[t]!]} ${number[triangles[t + 1]!]} ${number[triangles[t + 2]!]}`);
  return new TextEncoder().encode(rows.join("\n") + "\n");
}
