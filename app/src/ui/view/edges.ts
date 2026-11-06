// Where to draw a thin line on the body (`in_164`): along the edges where the surface turns a corner. This looks at the kernel's smooth normals at the two ends of each edge shared by two
// triangles and draws it where those normals differ by more than `thresholdDeg`. (Looking at the flat triangles' own normals, as the library's edge finder does, put black lines in the
// middle of a fillet, where a long thin triangle next to a short one differs a lot though the surface is smooth.)
export function cornerEdges(vertices: Float32Array, normals: Float32Array, triangles: Uint32Array, thresholdDeg: number): number[] {
  const cos = Math.cos((thresholdDeg * Math.PI) / 180);
  const key = (i: number) => `${Math.round(vertices[i * 3]! * 1000)},${Math.round(vertices[i * 3 + 1]! * 1000)},${Math.round(vertices[i * 3 + 2]! * 1000)}`;
  type End = { k: string; i: number };
  const seen = new Map<string, { a: End; b: End }>();
  const out: number[] = [];
  const dot = (i: number, j: number) => normals[i * 3]! * normals[j * 3]! + normals[i * 3 + 1]! * normals[j * 3 + 1]! + normals[i * 3 + 2]! * normals[j * 3 + 2]!;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      let a: End = { i: triangles[t + e]!, k: "" };
      let b: End = { i: triangles[t + ((e + 1) % 3)]!, k: "" };
      a.k = key(a.i);
      b.k = key(b.i);
      if (a.k === b.k) continue;
      if (a.k > b.k) [a, b] = [b, a];
      const id = `${a.k}|${b.k}`;
      const first = seen.get(id);
      if (!first) { seen.set(id, { a, b }); continue; }
      seen.delete(id); // (each edge is looked at once, when its second triangle comes)
      if (dot(first.a.i, a.i) < cos || dot(first.b.i, b.i) < cos) out.push(vertices[a.i * 3]!, vertices[a.i * 3 + 1]!, vertices[a.i * 3 + 2]!, vertices[b.i * 3]!, vertices[b.i * 3 + 1]!, vertices[b.i * 3 + 2]!);
    }
  }
  return out;
}
