// Names for the flat faces of a body that last through the steps (`dec_stable_reference_mechanism`, option C, `in_559`): each flat face of a solid has a name made when an operation first made it (`<op id>:<rank>`)
// and keeps it through the operations after, found again by matching (the same plane, and the same place on it) after the motion the operation is known to have made. Nothing here is OCCT's own history.
// Plain numbers and replicad faces; nothing leaves the kernel folder.
import { facesOf, edgesOf } from "./topo.mjs";
import { moveMarkers } from "./bodies.mjs";

const TOL = 1e-3;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The flat faces of a shape: unit normal, a point of the face's mass, and its box. */
export function planesOf(shape) {
  const out = [];
  for (const f of facesOf(shape)) {
    if (f.geomType !== "PLANE") continue;
    const q = f.normalAt();
    const l = Math.hypot(q.x, q.y, q.z) || 1;
    const c = f.center;
    const [lo, hi] = f.boundingBox.bounds;
    out.push({ n: [q.x / l, q.y / l, q.z / l], c: [c.x, c.y, c.z], lo: [...lo], hi: [...hi], face: f });
  }
  return out;
}

/** A name moved with the body: the point and the end of its normal are carried by the same motion (`tf`, as `moveMarkers` takes it). */
function carried(names, tf) {
  if (!tf) return names;
  const at = moveMarkers(names.map((m) => ({ id: m.name, at: m.c })), tf);
  const tip = moveMarkers(names.map((m) => ({ id: m.name, at: [m.c[0] + m.n[0], m.c[1] + m.n[1], m.c[2] + m.n[2]] })), tf);
  return names.map((m, i) => {
    const d = [tip[i].at[0] - at[i].at[0], tip[i].at[1] - at[i].at[1], tip[i].at[2] - at[i].at[2]];
    const l = Math.hypot(...d) || 1;
    return { name: m.name, n: d.map((v) => v / l), c: at[i].at };
  });
}

const near = (p, lo, hi, t) => [0, 1, 2].every((k) => p[k] >= lo[k] - t && p[k] <= hi[k] + t);

/**
 * The names of the faces of `shape` after an operation: `prev` are the names before it (`tf`: the motion the operation made of the whole body, if it was one). A face that is on the plane of a name, with the name's
 * point inside its box, is that name's (of two, the nearer); a face that matches none is new and is named `<opId>:<rank>`, the rank by the order of its normal and then of its place, so a change of a size makes the
 * same names. Returns the names in the order of the faces of `shape`, each with its normal and a point.
 */
export function nameFaces(prev, tf, shape, opId) {
  const faces = planesOf(shape);
  const old = carried(prev ?? [], tf);
  const diag = (() => { let m = 0; for (const f of faces) m = Math.max(m, Math.hypot(f.hi[0] - f.lo[0], f.hi[1] - f.lo[1], f.hi[2] - f.lo[2])); return m || 1; })();
  const tol = TOL + 1e-6 * diag;
  const taken = new Set();
  const given = new Array(faces.length).fill(null);
  // the names that match a face exactly, in the order they were made; the faces are looked up by their normal's main direction and the offset of their plane (a body of a thousand faces would otherwise be a million comparisons)
  const bucket = (n, d) => { const a = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2; return `${a}${n[a] < 0 ? "-" : "+"}${Math.round(d / 0.05)}`; };
  const buckets = new Map();
  faces.forEach((f, i) => { const k = bucket(f.n, dot(f.n, f.c)); buckets.set(k, [...(buckets.get(k) ?? []), i]); });
  for (const m of old) {
    let best = -1, bestGap = Infinity;
    const d0 = Math.round(dot(m.n, m.c) / 0.05);
    const a0 = bucket(m.n, 0).slice(0, 2);
    for (const dk of [d0 - 1, d0, d0 + 1]) for (const i of buckets.get(`${a0}${dk}`) ?? []) {
      const f = faces[i];
      if (taken.has(i) || dot(f.n, m.n) < 1 - 1e-6) continue;
      if (Math.abs(dot(f.n, [m.c[0] - f.c[0], m.c[1] - f.c[1], m.c[2] - f.c[2]])) > tol) continue; // not on its plane
      const inBox = near(m.c, f.lo, f.hi, tol);
      const gap = Math.hypot(m.c[0] - f.c[0], m.c[1] - f.c[1], m.c[2] - f.c[2]);
      const score = inBox ? gap : gap + 1e6; // (a face the name's point is in, else the nearest on the plane: a face that was split, or grew round it)
      if (score < bestGap) { best = i; bestGap = score; }
    }
    if (best >= 0) { taken.add(best); given[best] = m.name; }
  }
  // the faces no name matched: new, named by the operation and their order
  const fresh = faces.map((f, i) => ({ f, i })).filter((x) => given[x.i] === null);
  const key = (f) => [...f.n.map((v) => Math.round(v * 1e4)), Math.round(dot(f.n, f.c) * 1e3), ...f.c.map((v) => Math.round(v * 1e3))];
  fresh.sort((a, b) => { const ka = key(a.f), kb = key(b.f); for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] - kb[k]; return 0; });
  fresh.forEach((x, rank) => { given[x.i] = `${opId}:${rank}`; });
  const names = faces.map((f, i) => ({ name: given[i], n: f.n, c: f.c }));
  return { faces: names, edges: nameEdges(faces, given) };
}

/**
 * The names of the straight and curved edges that lie between two flat faces (`dec_stable_reference_mechanism`): an edge is named by the names of its two faces, `<a>|<b>` (sorted); where several edges lie between the
 * same two faces (a face cut in two by a hole), each also gets its rank by place, `#k`. An edge with a curved face beside it has no name yet. Each comes with its ends and middle as the shape has them now.
 */
function nameEdges(faces, given) {
  const sides = new Map(); // edge hash -> { edge, names }
  faces.forEach((f, i) => {
    for (const e of edgesOf(f.face)) {
      const h = e.hashCode;
      const have = sides.get(h) ?? { edge: e, names: [] };
      have.names.push(given[i]);
      sides.set(h, have);
    }
  });
  const groups = new Map();
  for (const { edge, names } of sides.values()) {
    if (names.length !== 2 || names[0] === names[1]) continue;
    const key = [...names].sort().join("|");
    const [a, b, m] = [edge.startPoint, edge.endPoint, edge.pointAt(0.5)];
    const item = { a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], mid: [m.x, m.y, m.z] };
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const out = [];
  for (const [key, list] of groups) {
    list.sort((p, q) => { for (let k = 0; k < 3; k++) { const d = Math.round(p.mid[k] * 1e3) - Math.round(q.mid[k] * 1e3); if (d) return d; } return 0; });
    list.forEach((it, k) => out.push({ name: list.length > 1 ? `${key}#${k}` : key, ...it }));
  }
  return out;
}

/** The edges a step names, as the lines they are now (`dec_stable_reference_mechanism`): a reference with a `name` takes the ends and middle the body has for that name; a name the body has lost is an error, never another edge; a body with no names leaves the reference as it is. */
export function namedEdgeRefs(names, refs) {
  if (!names) return refs;
  return refs.map((r) => {
    if (!r?.name) return r;
    const m = names.find((x) => x.name === r.name);
    if (!m) throw new Error(`line not found (${r.name} is not an edge of the body any more)`);
    const { rank: _rank, sig: _sig, ...rest } = r;
    return { ...rest, a: m.a, b: m.b, mid: m.mid };
  });
}

/** The place a name stands for in a shape now: the plane and a point of the face, as the face references of the operations take it ({ n, d, point }); null when the name is not there (it was cut away). */
export function refOfName(names, name) {
  const m = (names ?? []).find((x) => x.name === name);
  return m ? { n: m.n, d: dot(m.n, m.c), point: m.c } : null;
}
