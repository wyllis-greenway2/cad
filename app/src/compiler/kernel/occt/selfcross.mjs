// Does a mesh pass through itself? (`dec_self_crossing_check`, `in_472`, `in_473`.) The library's check says a body is valid when its faces close up, however the faces lie: a round that cuts the
// outer skin away past the corner of a hollow leaves the hollow sticking out through it, and the body is "valid". This looks at the triangles themselves, whatever made them.
//
// Two triangles that do not touch at a corner cross when each has corners on both sides of the other's plane, by more than `depth`, and the stretches of the line where the planes meet that lie in
// them overlap by more than `depth`. `depth` is a few times the error of the meshing (a curved face is made of flat triangles that lie inside it by that much, so neighbours may overlap by that much
// without the body being wrong). Triangles that share a corner are neighbours and are not compared. Triangles in one plane are not compared (a face lying on another face is a contact, not a crossing).
// Returns the first crossing found, as the centre of the overlap and the two triangle numbers, or null; `null` too when the search would take too long (a mesh of tens of thousands of triangles all
// stacked in one place), so a check never holds the kernel up for good.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Where the plane of the triangle `tri` (corners p, distances d to it) cuts the triangle: the two ends of the cut, along `dir`, as numbers. */
function stretch(p, d, dir) {
  const ends = [];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if ((d[i] >= 0) !== (d[j] >= 0)) {
      const f = d[i] / (d[i] - d[j]);
      ends.push(dot([p[i][0] + (p[j][0] - p[i][0]) * f, p[i][1] + (p[j][1] - p[i][1]) * f, p[i][2] + (p[j][2] - p[i][2]) * f], dir));
    }
  }
  return ends.length >= 2 ? [Math.min(...ends), Math.max(...ends)] : null;
}

export function findCrossing(vertices, triangles, depth, budget = 3e7) {
  const n = Math.floor(triangles.length / 3);
  if (n < 2) return null;
  // corners that are in one place are one corner (a mesh keeps one for each face it is a corner of)
  const q = Math.max(depth * 0.05, 1e-7);
  const ids = new Map();
  const vid = (i) => { const k = `${Math.round(vertices[i * 3] / q)},${Math.round(vertices[i * 3 + 1] / q)},${Math.round(vertices[i * 3 + 2] / q)}`; let v = ids.get(k); if (v === undefined) ids.set(k, (v = ids.size)); return v; };
  const tri = [];
  for (let t = 0; t < n; t++) {
    const idx = [triangles[t * 3], triangles[t * 3 + 1], triangles[t * 3 + 2]];
    const p = idx.map((i) => [vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]]);
    const nrm = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const l = len(nrm);
    if (l < 1e-14) continue; // (no area)
    const u = [nrm[0] / l, nrm[1] / l, nrm[2] / l];
    const lo = [0, 1, 2].map((a) => Math.min(p[0][a], p[1][a], p[2][a]));
    const hi = [0, 1, 2].map((a) => Math.max(p[0][a], p[1][a], p[2][a]));
    tri.push({ t, p, ids: idx.map(vid), u, d0: dot(u, p[0]), lo, hi });
  }
  // the sweep runs along the axis the mesh is longest in
  const span = [0, 1, 2].map((a) => Math.max(...tri.map((x) => x.hi[a])) - Math.min(...tri.map((x) => x.lo[a])));
  const ax = span.indexOf(Math.max(...span));
  tri.sort((a, b) => a.lo[ax] - b.lo[ax]);
  let work = 0;
  for (let i = 0; i < tri.length; i++) {
    const A = tri[i];
    for (let j = i + 1; j < tri.length; j++) {
      const B = tri[j];
      if (B.lo[ax] > A.hi[ax] + depth) break;
      if (++work > budget) return null;
      let apart = true;
      for (let a = 0; a < 3 && apart; a++) if (B.lo[a] > A.hi[a] + depth || A.lo[a] > B.hi[a] + depth) apart = false;
      if (!apart) continue;
      if (A.ids.some((v) => B.ids.includes(v))) continue; // (neighbours)
      const dB = B.p.map((x) => dot(A.u, x) - A.d0); // B's corners against A's plane
      if (!(Math.min(...dB) < -depth && Math.max(...dB) > depth)) continue;
      const dA = A.p.map((x) => dot(B.u, x) - B.d0);
      if (!(Math.min(...dA) < -depth && Math.max(...dA) > depth)) continue;
      const dir = cross(A.u, B.u);
      const l = len(dir);
      if (l < 1e-9) continue; // (planes that are one: a contact)
      const D = [dir[0] / l, dir[1] / l, dir[2] / l];
      const sa = stretch(A.p, dA, D);
      const sb = stretch(B.p, dB, D);
      if (!sa || !sb) continue;
      if (Math.min(sa[1], sb[1]) - Math.max(sa[0], sb[0]) > depth) {
        const c = [0, 1, 2].map((a) => (A.p[0][a] + A.p[1][a] + A.p[2][a] + B.p[0][a] + B.p[1][a] + B.p[2][a]) / 6);
        return { at: c, triangles: [A.t, B.t] };
      }
    }
  }
  return null;
}
