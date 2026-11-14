// THROWAWAY prototype: compiles a JSON operation graph into OCCT solids via replicad.
// Every op runs in a try/catch so one failure is local: independent ops still build,
// dependents report "upstream failed" (blueprint: failures are non-fatal).
import {
  drawRectangle,
  drawRoundedRectangle,
  drawCircle,
  draw,
  makeCylinder,
  makeBox,
  makeCompound,
  EdgeFinder,
  FaceFinder,
  measureVolume,
  getOC,
  Plane,
  Vector,
  basicFaceExtrusion,
} from "replicad";
import { facesOf, edgesOf } from "./topo.mjs";
import { lumpsOf, lumpAt, lumpOf, lumpsByName, trackBodies, moveMarkers } from "./bodies.mjs";

/** OCCT's own topology/geometry check. Operations can return garbage without throwing. */
export function isValidSolid(shape) {
  return new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false).IsValid();
}

/** Resolve "$name" references against graph.params. Everything is a named parameter. */
function resolve(value, params) {
  if (typeof value === "string" && value.startsWith("$")) {
    const key = value.slice(1);
    if (!(key in params)) throw new Error(`unknown parameter ${value}`);
    return params[key];
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, params));
  return value;
}

/** bbox as {min:[x,y,z], max:[x,y,z]} */
export function bounds(shape) {
  const b = shape.boundingBox.bounds;
  return { min: b[0], max: b[1] };
}

const AXIS = { X: 0, Y: 1, Z: 2 };

/**
 * Edge query (JSON, not an index):
 *   { all: true }
 *   { direction: "Z" }                       edges parallel to an axis
 *   { direction: "Z", within: "outer" }      ...whose midpoint lies on the solid's outer XY boundary box
 *   { inPlane: "XY", at: "max" | "min" }     edges lying in the top/bottom plane of the target's bbox
 *   { index: 4 }                             FRAGILE index form, kept only to demonstrate why not
 */
/** A finder narrowed to the plane a query names (XY, XZ or YZ) at the top or the bottom of the shape's box: one copy for edges and for faces (`in_282`). */
const inQueryPlane = (f, shape, query) => {
  const b = bounds(shape);
  const axis = { XY: 2, XZ: 1, YZ: 0 }[query.inPlane];
  return f.inPlane(query.inPlane, query.at === "min" ? b.min[axis] : b.max[axis]);
};

/** Apply an edge query to a replicad EdgeFinder (so fillet/chamfer can use it as their filter). */
export function edgeFinder(f, shape, query) {
  if (query.direction) f = f.inDirection(query.direction);
  if (query.inPlane) {
    f = inQueryPlane(f, shape, query);
  }
  if (query.within === "outer") {
    const b = bounds(shape);
    const eps = 1e-6;
    f = f.when(({ element }) => {
      const c = element.boundingBox.center;
      return (
        Math.abs(Math.abs(c[0]) - Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]))) < eps &&
        Math.abs(Math.abs(c[1]) - Math.max(Math.abs(b.min[1]), Math.abs(b.max[1]))) < eps
      );
    });
  }
  return f;
}

export function selectEdges(shape, query) {
  if (query.index !== undefined) return [new EdgeFinder().find(shape)[query.index]];
  return edgeFinder(new EdgeFinder(), shape, query).find(shape);
}

export function selectFaces(shape, query) {
  let f = new FaceFinder();
  if (query.parallelTo) f = f.parallelTo(query.parallelTo);
  if (query.inPlane) {
    f = inQueryPlane(f, shape, query);
  }
  return f.find(shape);
}

/** The plane of a face reference: unit normal n and offset d (n . p = d). A ref is { n, d, point } (any angle) or the older { axis, sign, offset, point }. */
const refPlane = (ref) => {
  if (ref.n) return { n: ref.n, d: ref.d };
  const n = [0, 0, 0];
  n[ref.axis] = ref.sign;
  return { n, d: ref.sign * ref.offset };
};

/** The flat faces of `shape` that face along the unit normal n (turned by no more than a hair): one copy for both searches below (`in_282`). */
const flatFacing = (shape, n) => facesOf(shape).filter((f) => {
  if (f.geomType !== "PLANE") return false;
  const fn = f.normalAt();
  const l = Math.hypot(fn.x, fn.y, fn.z);
  return (fn.x * n[0] + fn.y * n[1] + fn.z * n[2]) / l >= 1 - 1e-5;
});

/** The flat face of `shape` described by ref: facing along n, on the plane n . p = d, its box containing the point. */
function findFace(shape, ref) {
  const { n, d } = refPlane(ref);
  const tol = 1e-3;
  let best = null;
  for (const f of flatFacing(shape, n)) {
    const c = f.center;
    if (Math.abs(n[0] * c.x + n[1] * c.y + n[2] * c.z - d) > tol) continue;
    const [lo, hi] = f.boundingBox.bounds;
    if (ref.point.some((p, i) => p < lo[i] - tol || p > hi[i] + tol)) continue;
    const area = (hi[0] - lo[0] + 1e-6) * (hi[1] - lo[1] + 1e-6) * (hi[2] - lo[2] + 1e-6);
    if (!best || area < best.area) best = { f, area };
  }
  if (best) return best.f;
  // not where it was: an earlier step (a sketch resized, a face pulled) moved it. The face facing the same way that is nearest to where it was and under the point it was found by,
  // if clearly the nearest, is the same face (`in_175`)
  const bb = shape.boundingBox.bounds;
  const diag = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]);
  const cands = [];
  for (const f of flatFacing(shape, n)) {
    const c = f.center;
    const off = n[0] * c.x + n[1] * c.y + n[2] * c.z - d; // how far it is from where it was, along its normal
    const p = ref.point.map((v, k) => v + n[k] * off); // the point carried along with it
    const [lo, hi] = f.boundingBox.bounds;
    if (p.some((v, k) => v < lo[k] - 0.05 * diag - 1e-3 || v > hi[k] + 0.05 * diag + 1e-3)) continue;
    cands.push({ f, dist: Math.abs(off) });
  }
  cands.sort((x, y) => x.dist - y.dist);
  if (!cands.length || cands[0].dist > 0.35 * diag || (cands[1] && cands[1].dist < cands[0].dist * 1.5)) throw new Error("face not found (the model changed since this step was made)");
  return cands[0].f;
}

/** A profile (points in the XZ plane: x = distance from the axis, y = height) revolved once about Z, then put on an axis (0 X, 1 Y, 2 Z) starting at `at`. */
function revolved(points, axis, at) {
  let pen = draw(points[0]);
  for (let i = 1; i < points.length; i++) pen = pen.lineTo(points[i]);
  let solid = pen.close().sketchOnPlane("XZ").revolve("Z");
  if (axis === 0) solid = solid.rotate(90, [0, 0, 0], [0, 1, 0]);
  else if (axis === 1) solid = solid.rotate(-90, [0, 0, 0], [1, 0, 0]);
  return solid.translate(at);
}

/** A full round (cylindrical) face described by ref = { axis, center (on the axis, at its low end), radius, lo, hi }; returns { face, convex }. */
function findCylinder(shape, ref) {
  const tol = 1e-3;
  const found = [];
  for (const f of facesOf(shape)) {
    if (f.geomType !== "CYLINDRE") continue;
    const cyl = f._geomAdaptor().Cylinder();
    const loc = cyl.Axis().Location();
    const dir = cyl.Axis().Direction();
    const d = [dir.X(), dir.Y(), dir.Z()];
    const l = [loc.X(), loc.Y(), loc.Z()];
    if (Math.abs(Math.abs(d[ref.axis]) - 1) > 1e-6) continue;
    if ([0, 1, 2].some((i) => i !== ref.axis && Math.abs(l[i] - ref.center[i]) > tol)) continue;
    const [lo, hi] = f.boundingBox.bounds;
    const exactly = Math.abs(cyl.Radius() - ref.radius) <= tol && Math.abs(lo[ref.axis] - ref.lo) <= tol && Math.abs(hi[ref.axis] - ref.hi) <= tol;
    const pt = f.pointOnSurface(0.25, 0.5);
    const nn = f.normalAt(pt);
    const rad = [pt.x - (ref.axis === 0 ? pt.x : l[0]), pt.y - (ref.axis === 1 ? pt.y : l[1]), pt.z - (ref.axis === 2 ? pt.z : l[2])];
    found.push({ f, cyl, l, lo: lo[ref.axis], hi: hi[ref.axis], exactly, off: Math.abs(cyl.Radius() - ref.radius), convex: nn.x * rad[0] + nn.y * rad[1] + nn.z * rad[2] > 0 });
  }
  // a post stays a post and a hole a hole: a wall that grew past its neighbour's size is not taken for the neighbour (a ring's outer wall for its bore)
  if (ref.convex !== undefined && found.some((c) => c.convex === ref.convex)) for (let i = found.length - 1; i >= 0; i--) if (found[i].convex !== ref.convex) found.splice(i, 1);
  // the one the step means; else a wall that is made of several faces one above another (a pull of the top of a post adds a new face of the same radius): all of them that lie within the step's
  // range, if they cover it; else the hole or post on the same axis whose size is not what the step remembers (an earlier step changed it), the nearest in size
  const whole = found.find((c) => c.exactly);
  const stacked = whole ? [] : found.filter((c) => Math.abs(c.cyl.Radius() - ref.radius) <= tol && c.lo >= ref.lo - tol && c.hi <= ref.hi + tol).sort((x, y) => x.lo - y.lo);
  const covers = stacked.length > 1 && Math.abs(stacked[0].lo - ref.lo) <= tol && Math.abs(stacked.at(-1).hi - ref.hi) <= tol && stacked.every((c, k) => k === 0 || Math.abs(c.lo - stacked[k - 1].hi) <= tol);
  const byNearness = found.sort((x, y) => x.off - y.off);
  const other = byNearness.find((c) => Math.abs(c.cyl.Radius() - byNearness[0].cyl.Radius()) > 1e-4); // (the two halves of one wall are one wall: only a wall of another size can be the rival)
  if (!whole && !covers && other && other.off < byNearness[0].off * 1.5) throw new Error("round face not found (two walls are about as near to where it was: the model changed since this step was made)"); // (better no answer than the wrong wall)
  const best = whole ?? (covers ? stacked[0] : byNearness[0]);
  if (covers) best.lo = stacked[0].lo, best.hi = stacked.at(-1).hi;
  if (!best) throw new Error("round face not found (the model changed since this step was made)");
  const pt = best.f.pointOnSurface(0.25, 0.5);
  const n = best.f.normalAt(pt);
  const radial = [pt.x - (ref.axis === 0 ? pt.x : ref.center[0]), pt.y - (ref.axis === 1 ? pt.y : ref.center[1]), pt.z - (ref.axis === 2 ? pt.z : ref.center[2])];
  // the face's own numbers, not the rounded ones of the reference: a radius or an end that is off by a hair leaves a paper-thin sheet when the ring is cut or fused
  return { face: best.f, convex: n.x * radial[0] + n.y * radial[1] + n.z * radial[2] > 0, exact: { radius: best.cyl.Radius(), center: best.l, lo: best.lo, hi: best.hi } };
}

/** Does this edge match ref = { a, b, mid } (its end points and its middle)? */
const edgeMatches = (e, ref) => {
  const m = e.pointAt(0.5);
  if (Math.hypot(m.x - ref.mid[0], m.y - ref.mid[1], m.z - ref.mid[2]) > 1e-3) return false;
  const a = e.startPoint;
  const b = e.endPoint;
  const d = (p, q) => Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
  return (d(a, ref.a) < 1e-3 && d(b, ref.b) < 1e-3) || (d(a, ref.b) < 1e-3 && d(b, ref.a) < 1e-3);
};

/** The signature of each edge of a body (`rims.ts` `edgeSignatures`): the outward normals of the two flat faces it lies between, sorted. */
function signaturesOf(shape) {
  const by = new Map();
  for (const f of facesOf(shape)) {
    if (f.geomType !== "PLANE") continue;
    const n = f.normalAt();
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    const key = [n.x / l, n.y / l, n.z / l].map((v) => (Math.round(v * 1e3) / 1e3 || 0).toString()).join(":");
    for (const e of f.edges) by.set(e.hashCode, [...(by.get(e.hashCode) ?? []), key]);
  }
  return new Map([...by].map(([h, ns]) => [h, ns.length === 2 ? ns.sort().join("/") : ""]));
}

/** A straight edge that a step meant, told by the two flat faces it lies between (and its direction): the one such edge of the body now, or, of several, the one nearest to where it was if clearly so. Null if that cannot be told. */
function edgeBySignature(shape, edges, ref) {
  const sigs = signaturesOf(shape);
  const dir = [ref.b[0] - ref.a[0], ref.b[1] - ref.a[1], ref.b[2] - ref.a[2]];
  const dl = Math.hypot(...dir);
  if (dl < 1e-9) return null;
  const same = edges.filter((e) => {
    if (sigs.get(e.hashCode) !== ref.sig) return false;
    const [a, z] = [e.startPoint, e.endPoint];
    const d = [z.x - a.x, z.y - a.y, z.z - a.z];
    const l = Math.hypot(...d);
    return l > 1e-9 && Math.abs((d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / (l * dl)) > 0.999;
  });
  if (same.length === 1) return same[0];
  if (same.length < 2) return null;
  const score = (e) => { const m = e.pointAt(0.5); return Math.hypot(m.x - ref.mid[0], m.y - ref.mid[1], m.z - ref.mid[2]); };
  same.sort((x, y) => score(x) - score(y));
  return score(same[1]) >= score(same[0]) * 1.5 ? same[0] : null;
}

/** A round edge: its centre, axis and radius. */
function circleOfEdge(e) {
  if (e.geomType !== "CIRCLE") return null;
  try {
    const ci = e._geomAdaptor().Circle();
    const [lc, ax] = [ci.Location(), ci.Axis().Direction()];
    return { c: [lc.X(), lc.Y(), lc.Z()], n: [ax.X(), ax.Y(), ax.Z()], r: ci.Radius() };
  } catch { return null; }
}

/**
 * A round rim that a step meant (ref.rank = "k/n": the k-th of n rims on one axis line, lowest first and, at one height, smallest first, when the step was made): after sizes changed it is the k-th of the
 * rims on that axis line now, if there are still n of them, whatever they have grown, shrunk or moved up to. Null if that cannot be told (then the nearest edge is looked for).
 */
function edgeByRank(edges, ref) {
  const [k, n] = ref.rank.split("/").map(Number);
  if (!(n >= 1)) return null;
  // the centre of the circle the ref lies on: a whole rim has one point for both ends, the middle is across from it; a half rim is found from three points
  const closed = Math.hypot(ref.a[0] - ref.b[0], ref.a[1] - ref.b[1], ref.a[2] - ref.b[2]) < 1e-6;
  const centre = closed ? ref.a.map((v, i) => (v + ref.mid[i]) / 2) : circumcentre3(ref.a, ref.mid, ref.b);
  if (!centre) return null;
  const all = edges.map((e) => ({ e, ci: circleOfEdge(e) })).filter((x) => x.ci);
  // the axis the rims share: a candidate's axis line passes through the centre the ref had (up to a slide along the axis)
  const onAxis = (x) => { const d = [centre[0] - x.ci.c[0], centre[1] - x.ci.c[1], centre[2] - x.ci.c[2]]; const t = d[0] * x.ci.n[0] + d[1] * x.ci.n[1] + d[2] * x.ci.n[2]; return Math.hypot(d[0] - t * x.ci.n[0], d[1] - t * x.ci.n[1], d[2] - t * x.ci.n[2]) < 1e-3; };
  const rim = all.filter(onAxis);
  if (!rim.length) return null;
  const ax = rim[0].ci.n.map(Math.abs).indexOf(Math.max(...rim[0].ci.n.map(Math.abs)));
  const same = rim.filter((x) => x.ci.n.map(Math.abs).indexOf(Math.max(...x.ci.n.map(Math.abs))) === ax && Math.abs(Math.abs(x.ci.n[ax]) - 1) < 1e-6);
  const slot = (x) => `${Math.round(x.ci.c[ax] * 1e3)}/${Math.round(x.ci.r * 1e3)}`;
  const places = [...new Map(same.map((x) => [slot(x), x])).values()].sort((a, b) => a.ci.c[ax] - b.ci.c[ax] || a.ci.r - b.ci.r);
  if (places.length !== n || k >= n) return null;
  const at = places[k];
  const rr = Math.hypot(ref.mid[0] - centre[0], ref.mid[1] - centre[1], ref.mid[2] - centre[2]);
  const want = at.ci.c.map((v, i) => v + ((ref.mid[i] - centre[i]) * at.ci.r) / (rr || 1)); // where the middle of the edge is, carried along as the rim grew and moved
  const here = same.filter((x) => slot(x) === slot(at));
  here.sort((x, y) => { const m = (e) => { const p = e.pointAt(0.5); return Math.hypot(p.x - want[0], p.y - want[1], p.z - want[2]); }; return m(x.e) - m(y.e); });
  return here[0]?.e ?? null;
}
/**
 * A round rim of a step made before ranks were kept, found again after the part was made taller or shorter: the rim of the same size on the same axis line, the nearest one along it if it is clearly the nearest.
 * Null if the rim is not a circle, or two are about as near.
 */
function edgeSlid(edges, ref) {
  const closed = Math.hypot(ref.a[0] - ref.b[0], ref.a[1] - ref.b[1], ref.a[2] - ref.b[2]) < 1e-6;
  const centre = closed ? ref.a.map((v, i) => (v + ref.mid[i]) / 2) : circumcentre3(ref.a, ref.mid, ref.b);
  if (!centre) return null;
  const radius = Math.hypot(ref.mid[0] - centre[0], ref.mid[1] - centre[1], ref.mid[2] - centre[2]);
  const found = [];
  for (const e of edges) {
    const ci = circleOfEdge(e);
    if (!ci || Math.abs(ci.r - radius) > 1e-3) continue;
    const d = [centre[0] - ci.c[0], centre[1] - ci.c[1], centre[2] - ci.c[2]];
    const t = d[0] * ci.n[0] + d[1] * ci.n[1] + d[2] * ci.n[2];
    if (Math.hypot(d[0] - t * ci.n[0], d[1] - t * ci.n[1], d[2] - t * ci.n[2]) > 1e-3) continue;
    // the ref's middle point must lie in a plane across the axis (it is a rim of that axis, not a circle of another direction)
    const m = [ref.mid[0] - centre[0], ref.mid[1] - centre[1], ref.mid[2] - centre[2]];
    if (Math.abs(m[0] * ci.n[0] + m[1] * ci.n[1] + m[2] * ci.n[2]) > 1e-3) continue;
    const p = e.pointAt(0.5);
    const want = [ci.c[0] + m[0], ci.c[1] + m[1], ci.c[2] + m[2]];
    found.push({ e, slide: Math.abs(t), off: Math.hypot(p.x - want[0], p.y - want[1], p.z - want[2]) });
  }
  if (!found.length) return null;
  found.sort((x, y) => x.off - y.off || x.slide - y.slide);
  const best = found[0];
  if (best.off > 1e-3) return null; // (a half rim: the half that is where the ref's half was)
  const rival = found.find((x) => x !== best && x.off <= 1e-3);
  return rival && rival.slide < best.slide * 1.5 ? null : best.e;
}
function circumcentre3(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const nn = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
  if (nn < 1e-12) return null;
  const cr = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const t1 = cr(cr(ab, ac), ab), t2 = cr(ac, cr(ab, ac)); // (n x ab) and (ac x n)
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2], ac2 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2];
  return [0, 1, 2].map((i) => a[i] + (t1[i] * ac2 + t2[i] * ab2) / (2 * nn));
}

/**
 * The edges of the body that `refs` mean: those that match exactly; for a ref that matches none (an earlier step changed the size of the model, so the edge is not where it was), the edge that
 * is nearest to where it was, if it is clearly the nearest (a step then still finds its edge after the sketch under it is resized: `in_173`). Returns the hash codes, or null if one cannot be found.
 */
function resolveEdges(t, refs) {
  const edges = edgesOf(t);
  const box = t.boundingBox.bounds;
  const diag = Math.hypot(box[1][0] - box[0][0], box[1][1] - box[0][1], box[1][2] - box[0][2]);
  const out = new Set();
  for (const r of refs) {
    const exact = edges.filter((e) => edgeMatches(e, r));
    if (exact.length) { exact.forEach((e) => out.add(e.hashCode)); continue; }
    const d = (p, q) => Math.hypot(p.x - q[0], p.y - q[1], p.z - q[2]);
    const byRank = r.rank ? edgeByRank(edges, r) : null;
    if (byRank) { out.add(byRank.hashCode); continue; }
    const slid = r.rank ? null : edgeSlid(edges, r);
    if (slid) { out.add(slid.hashCode); continue; }
    const bySig = r.sig ? edgeBySignature(t, edges, r) : null;
    if (bySig) { out.add(bySig.hashCode); continue; }
    const scored = edges.map((e) => {
      const [a, b, m] = [e.startPoint, e.endPoint, e.pointAt(0.5)];
      const ends = Math.min(d(a, r.a) + d(b, r.b), d(a, r.b) + d(b, r.a));
      return { e, score: (ends + 2 * d(m, r.mid)) / 4 };
    }).sort((x, y) => x.score - y.score);
    const [best, next] = scored;
    if (!best || best.score > 0.35 * diag || (next && next.score < best.score * 1.5)) return null;
    out.add(best.e.hashCode);
  }
  return out;
}

const OPS = {
  sketch(op, ctx) {
    const p = (k) => resolve(op[k], ctx.params);
    let drawing;
    if (op.shape === "rect") drawing = drawRectangle(p("w"), p("d"));
    else if (op.shape === "rounded_rect") drawing = drawRoundedRectangle(p("w"), p("d"), p("r"));
    else if (op.shape === "circle") drawing = drawCircle(p("radius"));
    else if (op.shape === "polygon") {
      const pts = resolve(op.points, ctx.params);
      const mids = op.mids; // a side that is an arc: its middle point, so it is drawn as a true arc (a curved wall), not as short straight sides
      const side = (pen, i) => {
        const end = pts[(i + 1) % pts.length];
        return mids && mids[i] ? pen.threePointsArcTo(end, mids[i]) : pen.lineTo(end);
      };
      let pen = draw(pts[0]);
      for (let i = 0; i < pts.length - 1; i++) pen = side(pen, i);
      const last = pts.length - 1;
      drawing = mids && mids[last] ? side(pen, last).close() : pen.close();
    }
    else throw new Error(`unknown sketch shape ${op.shape}`);
    if (op.at) {
      const [x, y] = resolve(op.at, ctx.params);
      drawing = drawing.translate(x, y);
    }
    // op.frame = { origin, xDir, normal }: an explicit plane (e.g. a face of the body); otherwise the named base plane
    if (op.frame) return { kind: "sketch", drawing, plane: new Plane(op.frame.origin, op.frame.xDir, op.frame.normal), origin: undefined };
    return { kind: "sketch", drawing, plane: op.plane ?? "XY", origin: p("origin") ?? 0 };
  },

  extrude(op, ctx) {
    const dist = resolve(op.distance, ctx.params);
    const prism = (profile, holes, d = dist) => {
      const p = ctx.get(profile, "sketch");
      let solid = p.drawing.sketchOnPlane(p.plane, p.origin).extrude(d);
      for (const h of holes ?? []) { // figures drawn inside this one are holes in it
        const hs = ctx.get(h, "sketch");
        solid = solid.cut(hs.drawing.sketchOnPlane(hs.plane, hs.origin).extrude(d));
      }
      return solid;
    };
    let solid = prism(op.profile, op.holes);
    for (const f of op.also ?? []) solid = solid.fuse(prism(f.profile, f.holes, f.distance === undefined ? dist : resolve(f.distance, ctx.params))); // siblings extruded together (each may have a depth of its own, `in_320`)
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    if (!target) return { kind: "solid", shape: solid };
    if (op.mode === "cutOrAdd") {
      // a figure pulled backwards: a pocket when it meets the body (drawn on a face and pushed in); drawn out in the open it is a new piece, not a cut that does nothing
      const [tb, sb] = [bounds(target), bounds(solid)];
      const meets = [0, 1, 2].every((i) => sb.min[i] < tb.max[i] - 1e-6 && sb.max[i] > tb.min[i] + 1e-6);
      if (meets) {
        const before = measureVolume(target);
        const cut = target.clone().cut(solid.clone());
        if (Math.abs(measureVolume(cut) - before) > 1e-6 * Math.max(1, before)) return { kind: "solid", shape: cut };
      }
      return { kind: "solid", shape: target.fuse(solid) };
    }
    // "new" (`in_295`): a piece that stood apart when it was made stays a body of its own, however the others grow later: no join, one compound
    if (op.mode === "new") return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]) };
    return { kind: "solid", shape: op.mode === "cut" ? target.cut(solid) : target.fuse(solid) };
  },

  /**
   * Push or pull a flat face of the target. ref = { axis, sign, offset, point } finds the face (flat, facing sign*axis, at that offset,
   * its box containing the point). Pulling out adds the prism the face sweeps; pushing in cuts it.
   */
  faceExtrude(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const dist = resolve(op.distance, ctx.params);
    const best = findFace(t, op.ref);
    const fn = best.normalAt(); // the face's own normal, exactly: a rounded one slants the prism and leaves slivers (an invalid solid)
    const fl = Math.hypot(fn.x, fn.y, fn.z);
    const n = [fn.x / fl, fn.y / fl, fn.z / fl];
    if (!Number.isFinite(dist)) throw new Error("bad distance");
    if (Math.abs(dist) < 1e-6) return { kind: "solid", shape: t }; // nothing to push
    if (dist < 0) {
      // pushing in: the body must be deeper than the push, else the cut leaves paper-thin leftovers (or nothing)
      const b = bounds(t);
      const c = best.center;
      let deepest = 0;
      for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
        deepest = Math.max(deepest, -((x - c.x) * n[0] + (y - c.y) * n[1] + (z - c.z) * n[2]));
      }
      if (-dist >= deepest - 1e-6) throw new Error("the push goes through the body");
    }
    const prism = basicFaceExtrusion(best, new Vector(n.map((v) => v * dist)));
    return { kind: "solid", shape: dist >= 0 ? t.fuse(prism) : t.cut(prism) };
  },

  /**
   * Tilt a flat face about an axis through its middle: material is added where the face lifts and removed where it dips.
   * ref finds the face (see faceExtrude); axis is a world axis (0..2) lying in the face; angle is in degrees.
   */
  faceTilt(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const best = findFace(t, op.ref);
    const angle = resolve(op.angle, ctx.params);
    if (!Number.isFinite(angle)) throw new Error("bad angle");
    const { n } = refPlane(op.ref);
    const b = bounds(t);
    const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    const L = size * 3 + 100; // long enough to reach past any part of the body
    const cm = best.center;
    const c = [cm.x, cm.y, cm.z]; // the face's middle: the tilt turns about a line through it
    // the world axis `op.axis`, squeezed into the face's plane, is the line the face turns about
    const e = [0, 0, 0];
    e[op.axis] = 1;
    const along = e[0] * n[0] + e[1] * n[1] + e[2] * n[2];
    const k = e.map((v, i) => v - along * n[i]);
    const kl = Math.hypot(...k);
    if (kl < 0.2) throw new Error("a face can only tilt about an axis lying in it");
    for (let i = 0; i < 3; i++) k[i] /= kl;
    // the new normal: n turned by `angle` about k
    const rad = (angle * Math.PI) / 180;
    const cross = [k[1] * n[2] - k[2] * n[1], k[2] * n[0] - k[0] * n[2], k[0] * n[1] - k[1] * n[0]];
    const dot = k[0] * n[0] + k[1] * n[1] + k[2] * n[2];
    const n2 = n.map((v, i) => v * Math.cos(rad) + cross[i] * Math.sin(rad) + k[i] * dot * (1 - Math.cos(rad)));
    // a big box with one face on the new plane, extending along (+1) or against (-1) the new normal
    const halfSpace = (dir) => {
      const M = L * 2;
      let box = dir > 0 ? makeBox([-M, -M, 0], [M, M, M]) : makeBox([-M, -M, -M], [M, M, 0]); // one face on z = 0, extending along +z (dir 1) or -z
      const ax = [-n2[1], n2[0], 0]; // z x n2
      const al = Math.hypot(...ax);
      const ang = (Math.acos(Math.max(-1, Math.min(1, n2[2]))) * 180) / Math.PI;
      if (al > 1e-9) box = box.rotate(ang, [0, 0, 0], ax); // turn +z onto the new normal
      else if (n2[2] < 0) box = box.rotate(180, [0, 0, 0], [1, 0, 0]);
      return box.translate(c);
    };
    const out = basicFaceExtrusion(best, new Vector(n.map((v) => v * L)));
    const inn = basicFaceExtrusion(best, new Vector(n.map((v) => -v * L)));
    let shape = t;
    const below = halfSpace(-1); // the side of the new plane facing into the body
    const above = halfSpace(1); // the side facing out
    if (Math.abs(angle) > 1e-9) {
      const add = out.intersect(below);
      const remove = inn.intersect(above);
      shape = shape.fuse(add).cut(remove);
    }
    return { kind: "solid", shape };
  },

  /** Keep only the part of the target inside an axis-aligned box (min, max). Used to measure a shape piece by piece. */
  cropBox(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    return { kind: "solid", shape: t.intersect(makeBox(op.min, op.max)) };
  },

  /** Delete the whole body: later steps start a new one. */
  clear() {
    return { kind: "empty" };
  },

  /** Round (fillet) or bevel (chamfer) one or several lines of the target at once. ref = { a, b, mid } finds a line (or an array of them: all are done together); value is the size in mm. */
  edgeMod(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const v = resolve(op.value, ctx.params);
    if (!(v > 1e-6)) throw new Error("the size must be positive");
    const refs = [].concat(op.ref);
    const found = refs.length ? resolveEdges(t, refs) : null;
    const base = op.together && op.together.base ? ctx.get(op.together.base, "solid").shape : null;
    /** The body with this step's edges (`list`, refs) rounded or bevelled by `size`: on their own, else together with the steps just before it (`in_176`), else it throws. */
    const make = (size, list) => {
      const set = resolveEdges(t, list);
      const pick = (ef) => ef.when(({ element }) => set.has(element.hashCode));
      try {
        if (!set) throw new Error("line not found (the model changed since this step was made)");
        const made = op.mode === "chamfer" ? t.chamfer(size, pick) : t.fillet(size, pick);
        if (!isValidSolid(made)) throw new Error("kernel returned an invalid solid"); // (a size the faces cannot take can come out as a broken solid, not an exception)
        return made;
      } catch (e) {
        // on its own it cannot be made (next to fillets already made, a corner where three meet): the kernel can blend a corner when the edges that meet there are rounded in the same operation, so
        // this one is tried together with the ones just before it (each with its own size), from the body before them
        if (!base || op.together.mods.length < 2) throw e;
        const sizes = new Map();
        op.together.mods.forEach((m, i) => {
          const last = i === op.together.mods.length - 1; // (this step's own edges and size: the ones being tried)
          const hit = resolveEdges(base, last ? list : [].concat(m.ref));
          if (!hit) throw e;
          for (const h of hit) sizes.set(h, last ? size : resolve(m.value, ctx.params));
        });
        const by = (el) => sizes.get(el.hashCode) ?? null;
        const made = op.mode === "chamfer" ? base.chamfer(by) : base.fillet(by);
        if (!isValidSolid(made)) throw e;
        return made;
      }
    };
    try {
      return { kind: "solid", shape: make(v, refs) };
    } catch (e) {
      // on failing for good: which of the edges cannot take the size on their own, and the most they can take, so the step can say (and the page can flash the ones that are the problem, `in_266`)
      if (found && found.size) e.detail = diagnose(make, refs, found.size, v);
      throw e;
    }
  },

  /** Change the radius of a full round face: material is added or removed in a ring (outside it for a post, inside it for a hole). */
  cylRadius(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const { convex, exact } = findCylinder(t, op.ref);
    const R = exact.radius;
    // `delta`: how far the face moves along its own outward normal (a post grows, a hole shrinks): positive adds material either way
    const R2 = op.delta !== undefined ? (convex ? R + resolve(op.delta, ctx.params) : R - resolve(op.delta, ctx.params)) : resolve(op.radius, ctx.params);
    if (!(R2 > 1e-6)) throw new Error("the radius must be positive");
    if (Math.abs(R2 - R) < 1e-9) return { kind: "solid", shape: t };
    const h = exact.hi - exact.lo;
    const at = [...exact.center];
    at[op.ref.axis] = exact.lo;
    // the ring runs from the old wall to the new one, and reaches a hair past the old wall on the side where the old wall is, so no paper-thin sheet of the old wall is left behind
    const eps = 1e-3;
    const [inner, outer] = R2 > R ? [R - eps, R2] : [R2, R + eps];
    const ring = revolved([[inner, 0], [outer, 0], [outer, h], [inner, h]], op.ref.axis, at);
    const add = convex ? R2 > R : R2 < R;
    return { kind: "solid", shape: add ? t.fuse(ring) : t.cut(ring) };
  },

  /** Taper (draft) a full round face by an angle, keeping the low end where it is. */
  cylDraft(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const { convex } = findCylinder(t, op.ref);
    const R = op.ref.radius;
    const angle = resolve(op.angle, ctx.params);
    if (!Number.isFinite(angle)) throw new Error("bad angle");
    const h = op.ref.hi - op.ref.lo;
    const R2 = R + h * Math.tan((angle * Math.PI) / 180);
    if (!(R2 > 1e-6)) throw new Error("that angle closes the shape to a point before the other end");
    if (Math.abs(R2 - R) < 1e-9) return { kind: "solid", shape: t };
    const at = [...op.ref.center];
    at[op.ref.axis] = op.ref.lo;
    const wedge = revolved([[R, 0], [R, h], [R2, h]], op.ref.axis, at);
    const add = convex ? R2 > R : R2 < R;
    return { kind: "solid", shape: add ? t.fuse(wedge) : t.cut(wedge) };
  },

  /**
   * Repeat the whole target and join the copies to it. mode "linear": `nx` `ny` `nz` copies along X, Y and Z, `dx` `dy` `dz` apart (a line, a grid or a block of them);
   * mode "circular": `count` copies turned about the axis `axis` through `pivot`, spread over `angle` degrees (a full turn is shared out evenly, less is from the first to the last).
   */
  pattern(op, ctx) {
    const fuseTree = (parts) => { let level = parts; while (level.length > 1) { const next = []; for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? level[i].fuse(level[i + 1]) : level[i]); level = next; } return level[0]; };
    // one body of several (`op.body`): only it is repeated, the copies are bodies of their own, and the others stay (`in_271`)
    const target = ctx.get(op.target, "solid");
    const one = op.body && (target.markers?.length ?? 0) > 1 ? lumpOf(target.shape, target.markers, op.body) : null;
    if (op.body && (target.markers?.length ?? 0) > 1 && !one) throw new Error("that body is not there any more");
    const t = one ? one.lump : target.shape;
    const again = (shape) => (one ? makeCompound([...one.rest, ...lumpsOf(shape)]) : shape);
    let out = t.clone(); // (a boolean uses up what it is given, so the body is copied for every copy that is joined)
    if (op.mode === "linear") {
      const n = [op.nx, op.ny, op.nz].map((v) => Math.max(1, Math.round(resolve(v, ctx.params))));
      const d = [op.dx, op.dy, op.dz].map((v) => resolve(v, ctx.params));
      if (n[0] * n[1] * n[2] > 200) throw new Error("that is more than 200 copies");
      // joined in pairs, then pairs of pairs (a row, then a grid of rows): each join is between pieces of the same size, so the work grows with the number of copies and not with its square
      const along = (axis, count, base) => {
        const parts = [];
        for (let i = 0; i < count; i++) { const v = [0, 0, 0]; v[axis] = i * d[axis]; parts.push(i === 0 ? base : base.clone().translate(v)); }
        return fuseTree(parts);
      };
      // copies that stand apart (every direction they are repeated in, they are further apart than the body is wide) do not touch, so there is nothing to join: they are one compound at once
      const size = (() => { const b = bounds(t); return [0, 1, 2].map((i) => b.max[i] - b.min[i]); })();
      if ([0, 1, 2].every((i) => n[i] === 1 || Math.abs(d[i]) > size[i] + 1e-6)) {
        const copies = [];
        for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) copies.push(i + j + k === 0 ? t.clone() : t.clone().translate([i * d[0], j * d[1], k * d[2]]));
        return { kind: "solid", shape: again(copies.length === 1 ? copies[0] : makeCompound(copies)) };
      }
      let row = along(0, n[0], t.clone());
      let plane = along(1, n[1], row);
      return { kind: "solid", shape: again(along(2, n[2], plane)) };
    }
    if (op.mode === "circular") {
      const count = Math.max(1, Math.round(resolve(op.count, ctx.params)));
      const angle = resolve(op.angle, ctx.params);
      if (count > 200) throw new Error("that is more than 200 copies");
      const axis = [0, 0, 0];
      axis[Math.round(resolve(op.axis, ctx.params))] = 1;
      const step = Math.abs(angle) >= 360 ? angle / count : count > 1 ? angle / (count - 1) : 0;
      const copies = [out];
      for (let i = 1; i < count; i++) copies.push(t.clone().rotate(step * i, op.pivot, axis));
      return { kind: "solid", shape: again(fuseTree(copies)) };
    }
    throw new Error(`unknown repeat ${op.mode}`);
  },

  /** Move, rotate or scale the whole target. mode "move" (mm along axis), "rotate" (degrees about the axis through `pivot`, default the box centre), "scale" (factor about the box centre). */
  transform(op, ctx) {
    const target = ctx.get(op.target, "solid");
    const markers = target.markers ?? [];
    // one body of several: only that solid is moved, turned or scaled (`op.body`: the body's name); a step with no body does the whole shape, as before (`in_270`)
    const one = op.body && markers.length > 1 ? lumpOf(target.shape, markers, op.body) : null;
    if (op.body && markers.length > 1 && !one) throw new Error("that body is not there any more");
    const t = one ? one.lump : target.shape;
    const v = resolve(op.value, ctx.params);
    if (!Number.isFinite(v)) throw new Error("bad number");
    // the middle of the body's box is only asked for when there is no pivot to turn or scale about: finding a box takes as long as the move itself (`in_251`: it was most of the time of a history of moves)
    const middle = () => { const b = bounds(t); return [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2); };
    const axis = [0, 0, 0];
    axis[op.axis] = 1;
    const again = (moved) => (one ? makeCompound([...one.rest, moved]) : moved);
    const only = one ? op.body : null;
    // (a move by a vector, from dragging the body free, `in_291`: `op.vec`; else along one axis)
    if (op.mode === "move") { const by = op.vec ?? axis.map((a) => a * v); return { kind: "solid", shape: again(t.translate(by)), tf: { mode: "move", axis: op.axis, v, vec: op.vec, only } }; }
    if (op.mode === "rotate") { const pivot = op.pivot ?? middle(); return { kind: "solid", shape: again(t.rotate(v, pivot, axis)), tf: { mode: "rotate", axis: op.axis, v, pivot, only } }; }
    if (op.mode === "scale") {
      if (!(v > 1e-6)) throw new Error("scale must be positive");
      // (a body made a hundred metres long or more is a slip of the keys, and the kernel does not come back from meshing it: `in_255`)
      if (v > 100) { const b = bounds(t); if (Math.max(...[0, 1, 2].map((i) => b.max[i] - b.min[i])) * v > 1e5) throw new Error("that scale would make the body more than 100 metres long"); }
      const pivot = op.pivot ?? middle();
      return { kind: "solid", shape: again(t.scale(v, pivot)), tf: { mode: "scale", axis: 0, v, pivot, only } };
    }
    throw new Error(`unknown transform ${op.mode}`);
  },

  /**
   * Add or subtract bodies (`in_270`): `bodies` are the names of the bodies, the first is the one that stays. Add joins them all into the first (they must touch or overlap, or they could not be one solid);
   * Subtract takes the others away from the first, and they are used up. The other bodies of the model are left as they are.
   */
  combine(op, ctx) {
    const t = ctx.get(op.target, "solid");
    const found = lumpsByName(t.shape, t.markers ?? [], op.bodies);
    if (!found || found.picked.length < 2) throw new Error("select two or more bodies (one of them is not there any more)");
    // "regions" (`in_294`): the parts the bodies make (only A, only B, where they overlap...: a number whose bits say which bodies a part is in) that are kept; they are joined into one body where they touch, or kept as they are
    if (op.mode === "regions") {
      const picked = found.picked;
      const parts = [];
      for (const mask of op.regions) {
        let region = null;
        try {
          for (let i = 0; i < picked.length; i++) if ((mask >> i) & 1) region = region ? region.intersect(picked[i].clone()) : picked[i].clone();
          for (let i = 0; i < picked.length; i++) if (region && !((mask >> i) & 1)) region = region.cut(picked[i].clone());
        } catch { region = null; } // (a part that is not there: nothing)
        if (region) for (const l of lumpsOf(region)) parts.push(l);
      }
      if (!parts.length) throw new Error("nothing would be left of the parts chosen");
      let result = parts;
      if (op.join && parts.length > 1) { let f = parts[0]; for (const p of parts.slice(1)) f = f.fuse(p); result = lumpsOf(f); }
      return { kind: "solid", shape: makeCompound([...found.rest, ...result]), first: op.bodies[0] };
    }
    const [first, ...others] = found.picked;
    const kept = op.keep && op.mode !== "add" ? others.map((o) => o.clone()) : []; // (a boolean uses up what it is given: the tools that stay are copied first)
    let made = first;
    for (const o of others) made = op.mode === "subtract" ? made.cut(o) : op.mode === "intersect" ? made.intersect(o) : made.fuse(o);
    const parts = lumpsOf(made);
    if (!parts.length) throw new Error(op.mode === "intersect" ? "those bodies have nothing in common" : "nothing would be left of the body");
    if (op.mode === "add" && parts.length > 1) throw new Error("those bodies do not touch or overlap, so they cannot become one body");
    return { kind: "solid", shape: makeCompound([...found.rest, ...parts, ...kept]), first: op.bodies[0] };
  },

  /** Cylindrical hole cut from the top of the target, at (x, y). depth omitted = through. */
  hole(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const [x, y] = resolve(op.at, ctx.params);
    const dia = resolve(op.diameter, ctx.params);
    const b = bounds(t);
    const depth = op.depth !== undefined ? resolve(op.depth, ctx.params) : b.max[2] - b.min[2] + 2;
    const cyl = makeCylinder(dia / 2, depth, [x, y, b.max[2] - depth + (op.depth === undefined ? 1 : 0)], [0, 0, 1]);
    return { kind: "solid", shape: t.cut(cyl) };
  },

  fillet(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const r = resolve(op.radius, ctx.params);
    const edges = selectEdges(t, op.edges);
    if (!edges.length) throw new Error("edge query matched nothing");
    if (op.edges.index !== undefined) throw new Error("index queries are only for the fragility demo (selectEdges)");
    return { kind: "solid", shape: t.fillet(r, (e) => edgeFinder(e, t, op.edges)), edgeCount: edges.length };
  },

  chamfer(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const r = resolve(op.distance, ctx.params);
    const edges = selectEdges(t, op.edges);
    if (!edges.length) throw new Error("edge query matched nothing");
    return { kind: "solid", shape: t.chamfer(r, (e) => edgeFinder(e, t, op.edges)), edgeCount: edges.length };
  },

  shell(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const th = resolve(op.thickness, ctx.params);
    const faces = selectFaces(t, op.remove);
    const picked = new Set(faces);
    return { kind: "solid", shape: t.shell({ filter: (f) => f.when(({ element }) => picked.has(element)), thickness: th }) };
  },
};

/** Why a fillet or chamfer failed: the edges (their numbers in `refs`) that cannot take the size even alone, and the largest size the edges together can take (about; a few tries). Only for a few edges: each try costs a fillet. */
function diagnose(make, refs, count, v) {
  const takes = (size, list) => { try { make(size, list); return true; } catch { return false; } };
  let culprits = null;
  if (refs.length > 1 && refs.length <= 12) culprits = refs.flatMap((r, i) => (takes(v, [r]) ? [] : [i]));
  let largest = null;
  if (count <= 8) {
    let [lo, hi] = [0, v];
    for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (takes(mid, refs)) lo = mid; else hi = mid; }
    if (lo >= 0.02) largest = Math.floor(lo * 20) / 20; // (a size that was seen to work, to 0.05)
  }
  return { culprits, largest, total: refs.length, size: v };
}

/** OCCT in WASM can throw opaque WebAssembly.Exception objects with no message; say so plainly. */
function describeError(e, op) {
  if (e?.detail && op?.type === "edgeMod") {
    const d = e.detail;
    const what = op.mode === "chamfer" ? "chamfer" : "fillet";
    const where = d.culprits && d.culprits.length && d.culprits.length < d.total ? `on ${d.culprits.length} of the ${d.total} edges (they flash red)` : d.total === 1 ? "on this edge" : "on these edges";
    const most = d.largest ? `; the most that works here is about ${d.largest} mm` : "";
    return `a ${what} of ${Math.round(d.size * 100) / 100} mm cannot be made ${where}${most}: the faces beside it are too small for that size, or a fillet or chamfer made earlier meets it`;
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  // the kernel says nothing when it cannot build a shape: say what was being done, and the usual reason
  if (op?.type === "edgeMod") return `the kernel could not make a ${op.mode === "chamfer" ? "chamfer" : "fillet"} of that size on this edge: it is probably too big for the faces beside it (try a smaller size)`;
  if (op?.type === "cylRadius" || op?.type === "faceExtrude") return "the kernel could not make that size (it may be too small, too big, or run into another part of the model)";
  return "the kernel could not make this step (it gave no reason)";
}

/**
 * What was worked out before, by what it was worked out from: an op is the same op if its description and everything it is built on are the same. A move at the end of a long
 * model therefore only redoes the move. Kept: the newest ones. (Booleans use up what they are given, so an op is handed a copy of its input, never the kept one.)
 */
const KEEP = 96;
const memo = new Map(); // key -> { value, ms }
const remember = (key, entry) => {
  memo.delete(key);
  memo.set(key, entry);
  while (memo.size > KEEP) memo.delete(memo.keys().next().value);
};

/**
 * A short name for a long text (two 32-bit hashes together). What an operation was worked out from includes what the operations it uses were worked out from, so written out in full a key is as long as
 * the chain behind it, and the keys of a chain of a hundred operations are the square of that (`in_252`: most of the time of a history of moves was spent writing and comparing them).
 */
function fingerprint(text) {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 2654435761);
    b = Math.imul(b ^ c, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}:${text.length}`;
}

/** Operations that change a face, an edge or a round wall of one body: with several bodies they work on the body that holds it and leave the others alone, even when what is pulled goes into another body (`in_270`). */
const LOCAL = {
  faceExtrude: (op) => [op.ref?.point],
  faceTilt: (op) => [op.ref?.point],
  cylRadius: (op) => [op.ref?.center],
  cylDraft: (op) => [op.ref?.center],
  edgeMod: (op) => [].concat(op.ref ?? []).map((r) => r.mid),
};
function run(op, ctx, results) {
  const probes = (LOCAL[op.type]?.(op) ?? []).filter(Boolean);
  const from = op.target ? results.get(op.target)?.value : null;
  if (probes.length && from?.kind === "solid" && (from.markers?.length ?? 0) > 1) {
    const here = lumpAt(from.shape, probes[0]);
    // (only when everything the step names is in that one body: edges of two bodies are rounded together, on the whole shape)
    if (here && probes.every((p) => lumpAt(from.shape, p)?.lump.hashCode === here.lump.hashCode)) {
      const only = { ...ctx, get: (id, kind) => (id === op.target ? { kind: "solid", shape: here.lump.clone(), markers: [] } : ctx.get(id, kind)) };
      const value = OPS[op.type](op.together ? { ...op, together: undefined } : op, only);
      return value.kind === "solid" ? { ...value, shape: makeCompound([...here.rest.map((l) => l.clone()), ...lumpsOf(value.shape)]) } : value;
    }
  }
  return OPS[op.type](op, ctx);
}

/** Compile the whole graph. Returns per-op results; never throws for op-level failures. */
export function compile(graph) {
  const params = graph.params ?? {};
  const results = new Map(); // id -> {value?, error?, ms}
  const keys = new Map(); // id -> what it was worked out from
  const ctx = {
    params,
    get(id, kind) {
      const r = results.get(id);
      if (!r) throw new Error(`${id} not found (ops must be ordered after their dependencies)`);
      if (r.error) throw new Error(`upstream ${id} failed`);
      if (kind && r.value.kind !== kind) throw new Error(`${id} is a ${r.value.kind}, expected ${kind}`);
      return r.value.kind === "solid" ? { ...r.value, shape: r.value.shape.clone() } : r.value; // a copy: what an op does to it must not touch the kept one
    },
  };
  const pj = JSON.stringify(params);
  for (const op of graph.ops) {
    const t0 = performance.now();
    const key = fingerprint(JSON.stringify([op, pj, [op.target, op.profile, ...(op.holes ?? []), ...(op.also ?? []).flatMap((f) => [f.profile, ...f.holes])].map((d) => (d ? keys.get(d) ?? null : null))]));
    keys.set(op.id, key);
    const kept = memo.get(key);
    if (kept) {
      remember(key, kept);
      results.set(op.id, { value: kept.value, ms: 0, key });
      continue;
    }
    try {
      if (!OPS[op.type]) throw new Error(`unknown op type ${op.type}`);
      const value = run(op, ctx, results);
      if (value.kind === "solid") {
        // which bodies the result has, by the markers of the body it was made from (moved with it if this was a move)
        const from = op.target ? results.get(op.target)?.value : null;
        let prev = value.tf ? moveMarkers(from?.markers ?? [], value.tf) : from?.markers ?? [];
        if (value.first) prev = [...prev.filter((m) => m.id === value.first), ...prev.filter((m) => m.id !== value.first)]; // (the body that stays keeps its name when bodies are combined)
        value.markers = trackBodies(prev, value.shape, op.id);
      }
      const rigid = op.type === "transform" && (op.mode === "move" || op.mode === "rotate"); // (moving a valid body cannot make it invalid: the check is skipped, it costs as much as the move)
      if (value.kind === "solid" && !rigid && !isValidSolid(value.shape)) throw new Error("kernel returned an invalid solid");
      results.set(op.id, { value, ms: performance.now() - t0, key });
      remember(key, { value });
    } catch (e) {
      results.set(op.id, { error: describeError(e, op), ms: performance.now() - t0, ...(e?.detail?.culprits?.length ? { culprits: e.detail.culprits } : {}) });
    }
  }
  return results;
}

/** Last op that produced a solid without error. */
export function finalSolid(graph, results) {
  for (let i = graph.ops.length - 1; i >= 0; i--) {
    const r = results.get(graph.ops[i].id);
    if (r && !r.error && r.value.kind === "empty") return null; // the body was deleted
    if (r && !r.error && r.value.kind === "solid") return { id: graph.ops[i].id, shape: r.value.shape, key: r.key, markers: r.value.markers ?? [] };
  }
  return null;
}

export function volume(shape) {
  return measureVolume(shape);
}

export { makeBox };
