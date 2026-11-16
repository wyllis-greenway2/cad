// Where to draw a thin line on the body (`in_164`; plain JS because the kernel's thread finds them too, `dec_sharp_edges_once`): along the edges where the surface turns a corner. This looks at the kernel's smooth normals at the two ends of each edge shared by two
// triangles and draws it where those normals differ by more than `thresholdDeg`. (Looking at the flat triangles' own normals, as the library's edge finder does, put black lines in the
// middle of a fillet, where a long thin triangle next to a short one differs a lot though the surface is smooth.)
export function cornerEdges(vertices, normals, triangles, thresholdDeg) {
  const cos = Math.cos((thresholdDeg * Math.PI) / 180);
  const key = (i) => `${Math.round(vertices[i * 3] * 1000)},${Math.round(vertices[i * 3 + 1] * 1000)},${Math.round(vertices[i * 3 + 2] * 1000)}`;
  const seen = new Map();
  const out = [];
  const dot = (i, j) => normals[i * 3] * normals[j * 3] + normals[i * 3 + 1] * normals[j * 3 + 1] + normals[i * 3 + 2] * normals[j * 3 + 2];
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      let a = { i: triangles[t + e], k: "" };
      let b = { i: triangles[t + ((e + 1) % 3)], k: "" };
      a.k = key(a.i);
      b.k = key(b.i);
      if (a.k === b.k) continue;
      if (a.k > b.k) [a, b] = [b, a];
      const id = `${a.k}|${b.k}`;
      const first = seen.get(id);
      if (!first) { seen.set(id, { a, b }); continue; }
      seen.delete(id); // (each edge is looked at once, when its second triangle comes)
      if (dot(first.a.i, a.i) < cos || dot(first.b.i, b.i) < cos) out.push(vertices[a.i * 3], vertices[a.i * 3 + 1], vertices[a.i * 3 + 2], vertices[b.i * 3], vertices[b.i * 3 + 1], vertices[b.i * 3 + 2]);
    }
  }
  return out;
}

