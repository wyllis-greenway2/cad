// Spike 2: a mesh-boolean kernel (Manifold) with face ids, and fillets made by construction. Throwaway (CLAUDE.md rule 9).
import Module from "manifold-3d";
export const wasm = await Module();
wasm.setup();
export const { Manifold, CrossSection, Mesh } = wasm;

const K = (p) => p.map((v) => Math.round(v * 1e5)).join(",");
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1));

/** give every triangle of a manifold a face id from its own normal and first corner (our ids ride Manifold's faceID through booleans and turns) */
export function tag(man, idOf) {
  const m = man.getMesh(), np = m.numProp, n = m.triVerts.length / 3, ids = new Uint32Array(n);
  const P = (i) => [m.vertProperties[i * np], m.vertProperties[i * np + 1], m.vertProperties[i * np + 2]];
  for (let t = 0; t < n; t++) {
    const A = P(m.triVerts[t * 3]), B = P(m.triVerts[t * 3 + 1]), C = P(m.triVerts[t * 3 + 2]);
    ids[t] = idOf(unit(cross(sub(B, A), sub(C, A))), A, [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]);
  }
  return Manifold.ofMesh(new Mesh({ numProp: np, vertProperties: m.vertProperties, triVerts: m.triVerts, faceID: ids }));
}
/** planar faces by normal axis: base + 0..5 */
export const byAxis = (base) => (nn) => { const ax = [0, 1, 2].reduce((i, k) => (Math.abs(nn[k]) > Math.abs(nn[i]) ? k : i), 0); return base + ax * 2 + (nn[ax] > 0 ? 1 : 0); };
export const box = (x, y, z, base = 100) => tag(Manifold.cube([x, y, z]), byAxis(base));

/** the faces of a manifold: triangles with one faceID, split into connected pieces; with plane, area, centre, and the edges between pieces */
export function faces(man) {
  const m = man.getMesh(), np = m.numProp, nt = m.triVerts.length / 3;
  const P = (i) => [m.vertProperties[i * np], m.vertProperties[i * np + 1], m.vertProperties[i * np + 2]];
  const parent = Array.from({ length: nt }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const edgeTris = new Map(), tri = [];
  for (let t = 0; t < nt; t++) {
    const v = [0, 1, 2].map((k) => P(m.triVerts[t * 3 + k])), ks = v.map(K);
    const nn = cross(sub(v[1], v[0]), sub(v[2], v[0])), a = len(nn) / 2;
    tri.push({ v, ks, n: unit(nn), a, c: mul(add(add(v[0], v[1]), v[2]), 1 / 3), fid: m.faceID[t] });
    for (let k = 0; k < 3; k++) { const e = [ks[k], ks[(k + 1) % 3]].sort().join("|"); (edgeTris.get(e) ?? edgeTris.set(e, []).get(e)).push(t); }
  }
  for (const ts of edgeTris.values()) {
    if (ts.length !== 2) continue;
    const p = tri[ts[0]], q = tri[ts[1]];
    if (p.fid === q.fid && (dot(p.n, q.n) > 0.999 || curved.has(p.fid))) parent[find(ts[0])] = find(ts[1]);
  }
  const groups = new Map();
  for (let t = 0; t < nt; t++) (groups.get(find(t)) ?? groups.set(find(t), []).get(find(t))).push(t);
  const out = [];
  for (const ts of groups.values()) {
    let A = 0, c = [0, 0, 0], n = [0, 0, 0]; const verts = new Map();
    for (const t of ts) { A += tri[t].a; c = add(c, mul(tri[t].c, tri[t].a)); n = add(n, mul(tri[t].n, tri[t].a)); tri[t].v.forEach((p) => verts.set(K(p), p)); }
    out.push({ fid: tri[ts[0]].fid, tris: ts, area: A, c: mul(c, 1 / A), n: unit(n), verts: [...verts.values()] });
  }
  // canonical order of the pieces of one faceID: bigger first, then by centre (a ring and its island share a centre, not an area)
  out.sort((p, q) => p.fid - q.fid || q.area - p.area || p.c[0] - q.c[0] || p.c[1] - q.c[1] || p.c[2] - q.c[2]);
  const rank = new Map();
  for (const f of out) { const k = rank.get(f.fid) ?? 0; rank.set(f.fid, k + 1); f.k = k; f.id = `${f.fid}.${k}`; f.d = dot(f.n, f.c); }
  const owner = new Map(); out.forEach((f) => f.tris.forEach((t) => owner.set(t, f)));
  const edges = new Map();
  for (const [e, ts] of edgeTris) {
    if (ts.length !== 2) continue;
    const a = owner.get(ts[0]), b = owner.get(ts[1]);
    if (a === b) continue;
    const key = [a.id, b.id].sort().join("|"), [p, q] = e.split("|");
    const seg = [tri[ts[0]].v.find((x) => K(x) === p), tri[ts[0]].v.find((x) => K(x) === q)];
    (edges.get(key) ?? edges.set(key, { a, b, segs: [] }).get(key)).segs.push(seg);
  }
  return { list: out, byId: new Map(out.map((f) => [f.id, f])), edges, tri };
}
export const curved = new Set(); // faceIDs that are curved faces (one face of many facets)

const col = (x, y, z, o) => [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1];

/**
 * A fillet by construction on a straight edge between two flat faces. The corner piece (the part between the edge, the two tangent lines and the arc) is
 * extruded along the edge and removed (convex edge) or filled in (concave edge, kept between the planes of the faces at the two ends).
 * Returns { man, convex, t, removed } or throws RangeError when the radius does not fit.
 */
export function fillet(man, idA, idB, r, opts = {}) {
  const b = filletTool(man, faces(man), idA, idB, r, opts), out = b.convex ? man.subtract(b.tool) : man.add(b.fill);
  return { man: out, convex: b.convex, t: b.t, removed: Math.abs(man.volume() - out.volume()), length: b.length, gamma: b.gamma };
}

/** the piece to take away (convex edge) or add (concave edge) for one fillet; `mitres` trim it where a tangent neighbour continues the chain */
export function filletTool(man, F, idA, idB, r, { segs = 32, roundId = 9000, toolId = 9001, mitres = [] } = {}) {
  const _unused = 0; void _unused;
  const A = F.byId.get(idA), B = F.byId.get(idB), E = F.edges.get([idA, idB].sort().join("|"));
  if (!A || !B) throw new RangeError(`face ${!A ? idA : idB} not found`);
  if (!E) throw new RangeError(`faces ${idA} and ${idB} do not share an edge`);
  const pts = E.segs.flat();
  let best = [pts[0], pts[0]], bd = -1;
  for (const p of pts) for (const q of pts) { const d = len(sub(p, q)); if (d > bd) { bd = d; best = [p, q]; } }
  let P0 = best[0], P1 = best[1]; const e = unit(sub(P1, P0)), L = bd;
  // which way a face lies from the edge is read from the triangle of the face that touches the edge (a face of an L is not on one side of its centre)
  const inPlane = (f) => {
    const u = unit(cross(e, f.n)), s0 = E.segs[0];
    for (const t of f.tris) { const T = F.tri[t]; if (T.ks.includes(K(s0[0])) && T.ks.includes(K(s0[1]))) { const third = T.v.find((p) => K(p) !== K(s0[0]) && K(p) !== K(s0[1])); return dot(sub(third, s0[0]), u) < 0 ? mul(u, -1) : u; } }
    return dot(sub(f.c, P0), u) < 0 ? mul(u, -1) : u;
  };
  const u1 = inPlane(A), u2 = inPlane(B);
  const gamma = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
  const convex = dot(u1, B.n) < 0;
  const t = r / Math.tan(gamma / 2);
  // the radius must fit on both faces (their extent away from the edge, measured from the vertices that are off the edge line)
  const reach = (f, u) => Math.max(...f.verts.filter((p) => len(cross(sub(p, P0), e)) > 1e-6).map((p) => dot(sub(p, P0), u)));
  const wA = reach(A, u1), wB = reach(B, u2), rmax = Math.min(wA, wB) * Math.tan(gamma / 2);
  if (t > Math.min(wA, wB) + 1e-6) throw new RangeError(`radius ${r} does not fit: at most ${rmax.toFixed(3)}`);
  const ex = u1, ey = cross(e, u1);
  const to2 = (v) => [dot(v, ex), dot(v, ey)];
  const a2 = to2(u2), bis = unit2([1 + a2[0], a2[1]]);
  const C = [bis[0] * r / Math.sin(gamma / 2), bis[1] * r / Math.sin(gamma / 2)];
  const T1 = [t, 0], T2 = [a2[0] * t, a2[1] * t];
  const ang = (p) => Math.atan2(p[1] - C[1], p[0] - C[0]);
  let d = ang(T2) - ang(T1); while (d > Math.PI) d -= 2 * Math.PI; while (d <= -Math.PI) d += 2 * Math.PI;
  const poly = [[0, 0], T1];
  for (let k = 1; k < segs; k++) { const q = ang(T1) + d * k / segs; poly.push([C[0] + r * Math.cos(q), C[1] + r * Math.sin(q)]); }
  poly.push(T2);
  if (poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0) < 0) poly.reverse();
  const margin = 2 * (r + t) + 1, H = L + 2 * margin, M = col(ex, ey, e, sub(P0, mul(e, margin)));
  let tool = Manifold.extrude(CrossSection.ofPolygons([poly]), H).transform(M);
  // ids: arc facets carry the round's id, everything else the tool's
  tool = tag(tool, (nn, A0, c) => {
    const rel = sub(c, sub(P0, mul(e, margin))), q = to2(rel);
    return Math.abs(Math.hypot(q[0] - C[0], q[1] - C[1]) - r) < 0.05 * r + 1e-6 && Math.abs(dot(rel, e) - margin) < H ? (Math.abs(dot(nn, e)) < 1e-6 ? roundId : toolId) : toolId;
  });
  // a tangent neighbour continues the chain at an end: stop at the mitre plane there (normal along the path, keep the side of this edge)
  for (const mt of mitres) {
    const P = mt.end === 1 ? P1 : P0, m = mt.m; // m points along the walk; this edge lies behind the joint (keep dot <= ) or ahead of it (keep dot >= )
    const o = mt.overlap ?? 0; // let neighbouring pieces overlap a hair instead of meeting exactly: pieces that only touch can leave a fin of material between them
    tool = mt.side === "behind" ? tool.trimByPlane(mul(m, -1), -dot(m, P) - o) : tool.trimByPlane(m, dot(m, P) - o);
  }
  let fill = tool;
  if (!convex) {
    for (const [k, P] of [[0, P0], [1, P1]]) { // keep the fill between the planes of the faces at the two ends (unless a mitre already ends it)
      if (mitres.some((mt) => mt.end === k)) continue;
      const end = F.list.filter((f) => f !== A && f !== B && f.verts.some((p) => len(sub(p, P)) < 1e-5)).sort((p, q) => Math.abs(dot(q.n, e)) - Math.abs(dot(p.n, e)))[0];
      if (end) fill = fill.trimByPlane(mul(end.n, -1), -end.d);
    }
  }
  return { tool, fill, convex, t, length: L, gamma, P0, P1, e };
}

/**
 * Fillet every edge between one face and its neighbours at once (a chain that may turn corners, e.g. the top of a rounded rectangle): each edge's piece is
 * trimmed to the mitre plane where the next edge continues it, all pieces are made from the original body, and taken away together.
 */
export function filletLoop(man, topId, r, opts = {}, overlap = 0) {
  const F = faces(man), top = F.byId.get(topId);
  const E = [...F.edges.values()].filter((x) => x.a === top || x.b === top).map((x) => ({ x, other: x.a === top ? x.b : x.a }));
  const built = E.map(({ x, other }) => ({ ...filletTool(man, F, top.id, other.id, r, opts) }));
  // joints: where two edges share an end point, trim both at the mitre plane (normal = sum of the two path directions, taken along the path)
  const at = (p) => K(p);
  const ends = new Map();
  built.forEach((bt, i) => { for (const k of [0, 1]) { const p = k === 0 ? bt.P0 : bt.P1; (ends.get(at(p)) ?? ends.set(at(p), []).get(at(p))).push({ i, k }); } });
  const mitres = built.map(() => []);
  for (const list of ends.values()) {
    if (list.length !== 2) continue;
    const [a, b] = list, arrive = (x) => (x.k === 1 ? built[x.i].e : mul(built[x.i].e, -1)), leave = (x) => mul(arrive(x), -1);
    const m = unit(add(arrive(a), leave(b))); // the walk goes through edge a, the joint, then edge b
    mitres[a.i].push({ end: a.k, m, side: "behind", overlap });
    mitres[b.i].push({ end: b.k, m, side: "ahead", overlap });
  }
  const tools = built.map((bt, i) => (bt.convex ? filletTool(man, F, top.id, E[i].other.id, r, { ...opts, mitres: mitres[i] }).tool : null)).filter(Boolean);
  const out = tools.length ? man.subtract(Manifold.union(tools)) : man;
  return { man: out, edges: E.length, removed: Math.abs(man.volume() - out.volume()) };
}
const unit2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/** a fillet on a round rim: the flat top meeting a straight-walled cylinder about the z axis; the corner profile is revolved */
export function rimFillet(man, { R, h, r, segs = 64, x = 0, y = 0, roundId = 9000 }) {
  const prof = [[R, h], [R - r, h]];
  for (let k = 1; k < 16; k++) { const q = Math.PI / 2 * k / 16; prof.push([R - r + r * Math.sin(q), h - r + r * Math.cos(q)]); }
  prof.push([R, h - r]);
  const tool = tag(Manifold.revolve(CrossSection.ofPolygons([prof]), segs).translate([x, y, 0]), () => roundId);
  return man.subtract(tool);
}

/** drop the dust: separate pieces of a result that are far smaller than the part (a valid manifold can still carry a sliver of a few trillionths of a mm3) */
export function clean(man, eps = 1e-5) {
  const parts = man.decompose();
  if (parts.length === 1) return { man, dust: 0 };
  const keep = parts.filter((p) => Math.abs(p.volume()) > eps);
  const dust = parts.length - keep.length;
  return { man: keep.length ? Manifold.union(keep) : man, dust };
}
