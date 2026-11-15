// Shaping a body by moving some of its corners (`dec_direct_shape_editing`, `in_457`, `in_458`): the corners named are moved, a face that is no longer flat is split into flat pieces (a face that still is, is kept whole, and pieces
// that lie in one plane are joined again), and the body is built again from its faces. Only for bodies whose faces are all flat and have no holes. Plain geometry on the library's shapes; nothing here leaves the kernel folder.
import { getOC, cast, makeSolid, makePolygon, measureVolume } from "replicad";
import { facesOf, edgesOf } from "./topo.mjs";
import { isValidSolid } from "./interpreter.mjs";

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const key = (p) => p.map((v) => Math.round(v * 1e4)).join(",");

/** The corners of a flat face in order round its outline, turning counter-clockwise about the way the face looks out of the body. Null if the face is not flat or has a hole. */
function loopOf(face) {
  if (face.geomType !== "PLANE") return { why: "this body has a round face: only a body of flat faces can be shaped by its corners" };
    // the corners in order round the outline: the edges joined end to end (the direction of the loop is put right below, from the way the face looks)
  const edges = edgesOf(face).map((e) => ({ a: [e.startPoint.x, e.startPoint.y, e.startPoint.z], b: [e.endPoint.x, e.endPoint.y, e.endPoint.z] }));
  if (edges.length < 3) return { why: "a round edge: only a body of flat faces with straight edges can be shaped by its corners" };
  const pts = [edges[0].a];
  let at = edges[0].b;
  const used = new Set([0]);
  while (used.size < edges.length) {
    pts.push(at);
    const next = edges.findIndex((e, i) => !used.has(i) && (key(e.a) === key(at) || key(e.b) === key(at)));
    if (next < 0) return { why: "the outline of a face does not close" };
    used.add(next);
    at = key(edges[next].a) === key(at) ? edges[next].b : edges[next].a;
  }
  if (used.size < edges.length || key(at) !== key(pts[0])) return { why: "a face with a hole in it cannot be reshaped by its corners" };
  const n = face.normalAt();
  const out = [n.x, n.y, n.z];
  return { pts: newell(pts) && dot(newell(pts), out) < 0 ? pts.reverse() : pts };
}
/** The area vector of a polygon (its normal times twice its area). */
function newell(p) {
  let n = [0, 0, 0];
  for (let i = 0; i < p.length; i++) { const c = cross(p[i], p[(i + 1) % p.length]); n = [n[0] + c[0], n[1] + c[1], n[2] + c[2]]; }
  return n;
}
/** Is the polygon flat to within `tol`? */
function flat(p, tol) {
  const n = newell(p);
  const l = len(n);
  if (l < 1e-12) return false;
  const u = [n[0] / l, n[1] / l, n[2] / l];
  return p.every((q) => Math.abs(dot(sub(q, p[0]), u)) <= tol);
}
/** A polygon cut into triangles by ear clipping, in the plane of its area vector (the triangles keep the polygon's turning). */
function triangles(p) {
  const n = newell(p);
  const l = len(n);
  const u = [n[0] / l, n[1] / l, n[2] / l];
  const e1 = len(sub(p[1], p[0])) > 1e-12 ? sub(p[1], p[0]) : sub(p[2], p[0]);
  const x = (() => { const d = dot(e1, u); const v = [e1[0] - u[0] * d, e1[1] - u[1] * d, e1[2] - u[2] * d]; const k = len(v); return [v[0] / k, v[1] / k, v[2] / k]; })();
  const y = cross(u, x);
  const q = p.map((r) => [dot(sub(r, p[0]), x), dot(sub(r, p[0]), y)]);
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (a, b, c, d) => area2(a, b, d) >= -1e-12 && area2(b, c, d) >= -1e-12 && area2(c, a, d) >= -1e-12;
  let idx = p.map((_, i) => i);
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const [i, j, m] = [idx[(k + idx.length - 1) % idx.length], idx[k], idx[(k + 1) % idx.length]];
      if (area2(q[i], q[j], q[m]) <= 1e-12) continue; // (a reflex or flat corner is not an ear)
      if (idx.some((t) => t !== i && t !== j && t !== m && inside(q[i], q[j], q[m], q[t]))) continue;
      out.push([i, j, m]);
      idx = idx.filter((t) => t !== j);
      cut = true;
      break;
    }
    if (!cut) return null; // (not a simple polygon)
  }
  if (idx.length === 3 && area2(q[idx[0]], q[idx[1]], q[idx[2]]) > 1e-12) out.push(idx);
  return out.map((t) => t.map((i) => p[i]));
}

/**
 * `body` with each corner in `moves` ([{ from, to }]) moved. Returns the new solid, or throws with the reason it cannot be made.
 */
export function reshape(body, moves) {
  const diag = (() => { const b = body.boundingBox.bounds; return Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]); })();
  const tol = Math.max(1e-6, diag * 1e-6);
  const go = new Map(moves.map((m) => [key(m.from), m.to]));
  const faces = facesOf(body);
  const loops = faces.map(loopOf);
  const bad = loops.find((l) => l.why);
  if (bad) throw new Error(bad.why);
  const seen = new Set();
  for (const l of loops) for (const q of l.pts) seen.add(key(q));
  for (const m of moves) if (!seen.has(key(m.from))) throw new Error("a corner it was told to move is not a corner of this body");
  const pieces = [];
  for (const l of loops) {
    const moved = l.pts.map((q) => go.get(key(q)) ?? q);
    // a face the move did not touch stays as it was; one that is still flat is kept whole; the rest is split into flat pieces
    const dedup = moved.filter((q, i) => len(sub(q, moved[(i + 1) % moved.length])) > tol); // (two corners that were brought together are one)
    if (dedup.length < 3) continue; // (the face has gone)
    if (len(newell(dedup)) < 1e-9) continue;
    if (flat(dedup, tol * 100)) pieces.push(dedup);
    else {
      const t = triangles(dedup);
      if (!t) throw new Error("a face would cross itself");
      pieces.push(...t);
    }
  }
  const faces3 = pieces.map((p) => makePolygon(p));
  let solid;
  try { solid = makeSolid(faces3); } catch { throw new Error("the faces do not close into a body (the move would break the body open)"); }
  // pieces that lie in one plane are joined again
  const oc = getOC();
  const unify = new oc.ShapeUpgrade_UnifySameDomain(solid.wrapped, true, true, true);
  unify.Build();
  const joined = cast(unify.Shape());
  unify.delete();
  const result = joined.solids?.length === 1 ? joined.solids[0] : joined;
  if (!isValidSolid(result)) throw new Error("the move would make the body cross itself");
  const v = measureVolume(result);
  if (!(v > 1e-9)) throw new Error("the move would turn the body inside out or leave nothing of it");
  return result;
}
