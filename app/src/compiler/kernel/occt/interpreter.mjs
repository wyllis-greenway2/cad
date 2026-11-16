// THROWAWAY prototype: compiles a JSON operation graph into OCCT solids via replicad.
// Every op runs in a try/catch so one failure is local: independent ops still build,
// dependents report "upstream failed" (blueprint: failures are non-fatal).
import {
  drawRectangle,
  drawRoundedRectangle,
  drawCircle,
  draw,
  makeCylinder,
  makeSphere,
  makeBox,
  makeCompound,
  EdgeFinder,
  FaceFinder,
  measureVolume,
  getOC,
  Plane,
  Vector,
  basicFaceExtrusion,
  makeLine,
  makeThreePointArc,
  assembleWire,
  cast,
  makeAx3,
  genericSweep,
  revolution,
  Wire,
} from "replicad";
import { facesOf, edgesOf } from "./topo.mjs";
import { reshape } from "./reshape.mjs";
import { stage, beginStages, endStages } from "./stages.mjs";
import "./booleans.mjs"; // (the library's fuse, cut and intersect, made once instead of twice)
import { lumpsOf, lumpAt, lumpOf, lumpsByName, trackBodies, moveMarkers, box as boxOf } from "./bodies.mjs";

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

  /**
   * A figure carried along a path of lines and arcs (`dec_sweep`, `in_444`): the profile (and the figures drawn inside it, cut out) stays as it is and is carried along the path's shape, wherever the path is (`in_459`); added to the body, cut from it, or a body of its own, as an extrusion is (`mode`).
   */
  sweep(op, ctx) {
    const sketchOf = (id) => { const q = ctx.get(id, "sketch"); return q.drawing.sketchOnPlane(q.plane, q.origin); };
    const outer = sketchOf(op.profile);
    const face = outer.face();
    const pn = face.normalAt();
    const N = [pn.x, pn.y, pn.z];
    const p0 = edgesOf(face)[0].startPoint;
    const off = (q) => (q[0] - p0.x) * N[0] + (q[1] - p0.y) * N[1] + (q[2] - p0.z) * N[2];
    let segs = op.path;
    if (!segs?.length) throw new Error("there is no path");
    // the path may be anywhere: it is carried to the shape's plane along the plane's normal (its end that is nearer the plane lands on it), and the shape keeps its own place beside it (`in_459`)
    if (Math.abs(off(segs[segs.length - 1].b)) < Math.abs(off(segs[0].a))) segs = segs.map((q) => ({ a: q.b, b: q.a, m: q.m })).reverse();
    const lift = off(segs[0].a);
    const down = (q) => (q ? [q[0] - N[0] * lift, q[1] - N[1] * lift, q[2] - N[2] * lift] : q);
    segs = segs.map((q) => ({ a: down(q.a), b: down(q.b), m: down(q.m) }));
    const t0 = [segs[0].b[0] - segs[0].a[0], segs[0].b[1] - segs[0].a[1], segs[0].b[2] - segs[0].a[2]];
    const tl = Math.hypot(...t0) || 1;
    if (Math.abs(t0[0] * N[0] + t0[1] * N[1] + t0[2] * N[2]) / tl < 0.05) throw new Error("the path runs along the shape's plane where it starts: the shape would be carried edge on (draw the path leaving the plane)");
    const spine = assembleWire(segs.map((s) => (s.m ? makeThreePointArc(s.a, s.m, s.b) : makeLine(s.a, s.b))));
    const make = (sk) => {
      const solid = genericSweep(sk.wire, spine, { frenet: true, transitionMode: "right" });
      if (!isValidSolid(solid)) throw new Error("the shape could not be carried along that path (a path that bends tighter than the shape is wide folds it over itself)");
      return solid;
    };
    let solid = make(outer);
    for (const h of op.holes ?? []) solid = solid.cut(make(sketchOf(h)));
    if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("nothing was left of the sweep when its holes were cut");
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    if (!target) return { kind: "solid", shape: solid };
    if (op.mode === "cutOrAdd") {
      const before = measureVolume(target);
      try { const cut = target.clone().cut(solid.clone()); if (Math.abs(measureVolume(cut) - before) > 1e-6 * Math.max(1, before)) return { kind: "solid", shape: cut }; } catch { /* a join instead */ }
      return { kind: "solid", shape: target.fuse(solid) };
    }
    if (op.mode === "new") return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]) };
    return { kind: "solid", shape: op.mode === "cut" ? target.cut(solid) : target.fuse(solid) };
  },

  /** Sketches joined side to side (`dec_loft_sketches`): smooth through all of them, or ruled (straight between each two); holes are lofted the same way and cut out. */
  loft(op, ctx) {
    const sketchOf = (h) => {
      const q = ctx.get(h, "sketch");
      return typeof q.plane === "string" ? q.drawing.sketchOnPlane(q.plane, q.origin ?? 0) : q.drawing.sketchOnPlane(q.plane, q.origin);
    };
    const through = (ids) => { const sk = ids.map(sketchOf); return sk[0].loftWith(sk.slice(1), { ruled: !op.smooth }); };
    let solid = through(op.sections.map((s) => s.profile));
    if (!isValidSolid(solid)) throw new Error("the loft could not be made through those sketches (try turning an outline round with its start point, or reverse one)");
    const holes = op.sections[0].holes?.length ?? 0;
    for (let i = 0; i < holes; i++) solid = solid.cut(through(op.sections.map((s) => s.holes[i])));
    if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("nothing was left of the loft when its holes were cut");
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    if (!target) return { kind: "solid", shape: solid };
    if (op.mode === "cutOrAdd") {
      const before = measureVolume(target);
      try { const cut = target.clone().cut(solid.clone()); if (Math.abs(measureVolume(cut) - before) > 1e-6 * Math.max(1, before)) return { kind: "solid", shape: cut }; } catch { /* a join instead */ }
      return { kind: "solid", shape: target.fuse(solid) };
    }
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    return { kind: "solid", shape: op.mode === "cut" ? target.cut(solid) : target.fuse(solid) };
  },

  extrude(op, ctx) {
    const dist = resolve(op.distance, ctx.params);
    // a cut that starts on a face of the body (a figure drawn on the face and pushed in) has its tool begin a little behind that face, in the air: begun exactly on it, the kernel leaves the face as a skin over the pocket,
    // and the top of a hole stays shut (`in_426`)
    const BACK = 1e-3;
    const prism = (profile, holes, d = dist, back = 0) => {
      const dir = d < 0 ? -1 : 1;
      // the sketch's plane moved `back` against the way it is extruded (a named plane takes an offset along its normal; a plane of its own is moved along its normal)
      const sketch = (h) => {
        const q = ctx.get(h, "sketch");
        if (typeof q.plane === "string") return q.drawing.sketchOnPlane(q.plane, (q.origin ?? 0) - dir * back);
        const z = q.plane.zDir;
        return q.drawing.sketchOnPlane(back ? q.plane.translate(-dir * back * z.x, -dir * back * z.y, -dir * back * z.z) : q.plane, q.origin);
      };
      let solid = sketch(profile).extrude(d + dir * back);
      for (const h of holes ?? []) solid = solid.cut(sketch(h).extrude(d + dir * back)); // figures drawn inside this one are holes in it
      return solid;
    };
    const toolOf = (back) => {
      let sld = prism(op.profile, op.holes, dist, back);
      for (const f of op.also ?? []) sld = sld.fuse(prism(f.profile, f.holes, f.distance === undefined ? dist : resolve(f.distance, ctx.params), back)); // siblings extruded together (each may have a depth of its own, `in_351`)
      return sld;
    };
    let solid = toolOf(0);
    const targetValue = op.target ? (op.mode === "new" ? ctx.peek(op.target, "solid") : ctx.get(op.target, "solid")) : null; // (a piece of its own stands beside the body: no copy of it is needed)
    const target = targetValue ? targetValue.shape : null;
    if (!target) return { kind: "solid", shape: solid };
    // (only when the plane is on the boundary of the body: with material just behind it, as a hole begun inside the body under a skin, the tool begins where it was drawn)
    const cuts = op.mode === "cut" || op.mode === "cutOrAdd"; // (a piece added or of its own needs no start behind the plane, and the test costs a boolean on the whole body)
    const behind = !cuts || (() => { try { const slab = prism(op.profile, op.holes, dist < 0 ? BACK : -BACK, 0); return measureVolume(target.clone().intersect(slab.clone())) > 0.5 * measureVolume(slab); } catch { return false; } })(); // (mostly body in a slab behind the plane)
    const back = behind ? 0 : BACK;
    if (op.mode === "cutOrAdd") {
      // a figure pulled backwards: a pocket when it meets the body (drawn on a face and pushed in); drawn out in the open it is a new piece, not a cut that does nothing
      const [tb, sb] = [bounds(target), bounds(solid)];
      const meets = [0, 1, 2].every((i) => sb.min[i] < tb.max[i] - 1e-6 && sb.max[i] > tb.min[i] + 1e-6);
      if (meets) {
        const before = measureVolume(target);
        const tool = toolOf(back);
        const cut = target.clone().cut(tool.clone());
        if (Math.abs(measureVolume(cut) - before) > 1e-6 * Math.max(1, before)) return { kind: "solid", shape: cut, used: "cut", cutInto: cutInto(targetValue, tool) };
      }
      return joined(target, solid);
    }
    // "new" (`in_295`): a piece that stood apart when it was made stays a body of its own, however the others grow later: no join, one compound
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    if (op.mode === "cut") { const tool = toolOf(back); return { kind: "solid", shape: target.cut(tool.clone()), cutInto: cutInto(targetValue, tool) }; }
    return { kind: "solid", shape: target.fuse(solid) };
  },

  /**
   * Revolve a figure about an axis in its own plane, through `angle` degrees (any size, either way) while it advances `advance` mm along the axis over the whole angle (`dec_spiral_extrude`, `in_427`):
   * a ring or a bowl with no advance (at most one turn: more would lie on itself), a screw thread or a spring with one. Added to the body, cut from it, or a body of its own, as an extrusion is (`mode`).
   */
  revolve(op, ctx) {
    const angle = resolve(op.angle, ctx.params);
    const advance = resolve(op.advance ?? 0, ctx.params);
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) throw new Error("the turn must be more than nothing");
    const A = op.axis.p;
    const D = (() => { const l = Math.hypot(...op.axis.d); return op.axis.d.map((x) => x / l); })();
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    // the figure and the figures drawn inside it (holes), each a sketch in the same plane
    const sketchOf = (id) => { const q = ctx.get(id, "sketch"); return q.drawing.sketchOnPlane(q.plane, q.origin); };
    const outerSketch = sketchOf(op.profile);
    const face = outerSketch.face();
    const pn = face.normalAt();
    const N = [pn.x, pn.y, pn.z];
    const pts = [];
    for (const e of edgesOf(face)) for (const t of [0, 0.5, 1]) { const q = e.pointAt(t); pts.push([q.x, q.y, q.z]); }
    // what is made of one figure (the outer one, then each hole): the same turn for all, so the holes are cut from the figure
    let make;
    if (Math.abs(Math.abs(dot(N, D)) - 1) < 1e-6) {
      // the axis is the plane's normal: the figure is carried along it by `advance` while it turns about it, a twisted extrusion (a bar turned into an auger, a lobed section into a screw); the axis may stand off the figure (a coil)
      if (Math.abs(advance) < 1e-9) throw new Error("a twist needs a distance to be carried along the axis");
      const sgn = dot(N, D) > 0 ? 1 : -1;
      const v0 = pts[0];
      const o = sub(A, N.map((x) => x * dot(sub(A, v0), N))); // (the axis where it meets the figure's plane)
      const h = advance * sgn; // (the distance along the plane's normal)
      const twist = angle * sgn * (h > 0 ? 1 : -1); // (counter-clockwise about the axis whichever way it points and the figure is carried)
      make = (sk) => { const solid = sk.extrude(h, { twistAngle: twist, origin: o }); if (!isValidSolid(solid)) throw new Error("the twist could not be made at this size"); return solid; };
    } else {
      // the axis must lie in the plane of the figure, and the figure must be on one side of it
      if (Math.abs(dot(N, D)) > 1e-4) throw new Error("the axis must lie in the plane of the figure");
      const along = pts.map((q) => dot(sub(q, A), D));
      const rel = pts.map((q, i) => { const w = sub(q, A); return [w[0] - along[i] * D[0], w[1] - along[i] * D[1], w[2] - along[i] * D[2]]; });
      const far = rel.reduce((m, w) => (Math.hypot(...w) > Math.hypot(...m) ? w : m), [0, 0, 0]);
      const r0 = Math.hypot(...far);
      if (r0 < 1e-6) throw new Error("the figure lies on the axis");
      const U = far.map((x) => x / r0);
      const side = rel.map((w) => dot(w, U));
      if (side.some((x) => x < -1e-4)) throw new Error("the axis crosses the figure: draw the figure on one side of it");
      if (Math.abs(advance) < 1e-9) {
        if (Math.abs(angle) > 360 + 1e-6) throw new Error("a turn of more than 360 degrees with no advance lies on itself: give it an advance, or turn it once");
        make = (sk) => revolution(sk.face(), A, angle > 0 ? D : D.map((x) => -x), Math.abs(angle));
      } else {
        const turns = Math.abs(angle) / 360;
        const pitch = Math.abs(advance) / turns;
        const lo = Math.min(...along), hi = Math.max(...along);
        if (hi - lo > pitch + 1e-4) throw new Error(`the figure is ${Math.round((hi - lo) * 100) / 100} mm wide along the axis and the advance is ${Math.round(pitch * 100) / 100} mm a turn: the turns would overlap`);
        const [mid, r] = [(lo + hi) / 2, Math.max(...side)];
        // the helix runs through the middle of the figure, at its far side, about the axis; the figure is carried along it as one rigid screw motion (the kernel's frame of a helix does exactly that)
        const dir = advance > 0 ? D : D.map((x) => -x);
        const helixCcw = (angle > 0) === (advance > 0); // (a right hand helix turns counter-clockwise about its own direction)
        const centre = [A[0] + D[0] * mid, A[1] + D[1] * mid, A[2] + D[2] * mid];
        make = (sk) => {
          const solid = genericSweep(sk.wire, helix(pitch, pitch * turns, r, centre, dir, U, !helixCcw), { frenet: true });
          if (!isValidSolid(solid)) throw new Error("the spiral could not be made at this size");
          return solid;
        };
      }
    }
    let solid = make(outerSketch);
    for (const h of op.holes ?? []) solid = solid.cut(make(sketchOf(h)));
    if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("nothing was left of the figure when its holes were cut");
    const targetValue = op.target ? (op.mode === "new" ? ctx.peek(op.target, "solid") : ctx.get(op.target, "solid")) : null; // (a piece of its own stands beside the body: no copy of it is needed)
    const target = targetValue ? targetValue.shape : null;
    if (!target) return { kind: "solid", shape: solid };
    if (op.mode === "cutOrAdd") {
      const before = measureVolume(target);
      try { const cut = target.clone().cut(solid.clone()); if (Math.abs(measureVolume(cut) - before) > 1e-6 * Math.max(1, before)) return { kind: "solid", shape: cut, used: "cut", cutInto: cutInto(targetValue, solid) }; } catch { /* a join instead */ }
      return joined(target, solid);
    }
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    if (op.mode === "cut") return { kind: "solid", shape: target.cut(solid.clone()), cutInto: cutInto(targetValue, solid) };
    return { kind: "solid", shape: target.fuse(solid) };
  },

  /**
   * Push or pull a flat face of the target. ref = { axis, sign, offset, point } finds the face (flat, facing sign*axis, at that offset,
   * its box containing the point). Pulling out adds the prism the face sweeps; pushing in cuts it.
   */
  faceExtrude(op, ctx) {
    const t = stage("copying the body it works on", () => ctx.get(op.target, "solid").shape);
    const dist = resolve(op.distance, ctx.params);
    const best = stage("finding the face", () => findFace(t, op.ref));
    const fn = stage("the face's normal", () => best.normalAt()); // the face's own normal, exactly: a rounded one slants the prism and leaves slivers (an invalid solid)
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
    const prism = stage("the prism of the face", () => basicFaceExtrusion(best, new Vector(n.map((v) => v * dist))));
    // among several bodies the boolean is made on the body the face is on alone, when the prism comes nowhere near the others (a boolean on all of them takes as long as the biggest, `in_446`: a loft of a thousand faces)
    const lumps = stage("listing the bodies", () => lumpsOf(t));
    if (lumps.length > 1) {
      const mine = lumps.findIndex((l) => facesOf(l).some((f) => f.hashCode === best.hashCode));
      if (mine >= 0) {
        const pb = boxOf(prism);
        const near = lumps.some((l, i) => i !== mine && (() => { const lb = boxOf(l); return [0, 1, 2].every((k) => pb.min[k] <= lb.max[k] + 1e-3 && pb.max[k] >= lb.min[k] - 1e-3); })());
        if (!near) { const made = dist >= 0 ? lumps[mine].fuse(prism) : lumps[mine].cut(prism); return { kind: "solid", shape: makeCompound([...lumps.filter((_, i) => i !== mine), ...made.solids]) }; }
      }
    }
    return { kind: "solid", shape: dist >= 0 ? t.fuse(prism, { optimisation: "commonFace" }) : t.cut(prism) }; // (the prism stands on the face and nowhere else: the kernel is told the two only share that face, which spares it looking for every other crossing, `in_449`) // (the prism stands on the face and nowhere else: the kernel is told the two only share that face, which spares it looking for every other crossing, `in_449`)
  },

  /**
   * Move a flat face along its normal by `distance` and carry the faces next to it along as surfaces, until they meet (`in_405`, "extend"): the material added (pulled out) or taken (pushed in) is the slab between the
   * old and the new plane, kept to the side of each neighbouring face that the body is on (for a neighbour that lies across the face, the other side). A chamfered top pulled up grows as a pyramid; past the apex nothing
   * is left of the slab, so nothing is added and nothing fails. Needs flat neighbours; a push that leaves nothing of the body is refused.
   */
  faceExtend(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const dist = resolve(op.distance, ctx.params);
    if (!Number.isFinite(dist)) throw new Error("bad distance");
    if (Math.abs(dist) < 1e-6) return { kind: "solid", shape: t };
    const best = findFace(t, op.ref);
    const fn = best.normalAt();
    const fl = Math.hypot(fn.x, fn.y, fn.z);
    const n = [fn.x / fl, fn.y / fl, fn.z / fl];
    const c = best.center;
    const mine = new Set(edgesOf(best).map((e) => e.hashCode));
    const next = facesOf(t).filter((f) => f.hashCode !== best.hashCode && edgesOf(f).some((e) => mine.has(e.hashCode)));
    if (!next.length) throw new Error("this face has no neighbours to extend");
    const b = bounds(t);
    const big = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 2 + Math.abs(dist) + 50;
    const slab = (p, m, from, to) => {
      // the solid between the planes at `from` and `to` along m from the point p, wide enough to reach past the whole body
      const pick = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const xd = [m[1] * pick[2] - m[2] * pick[1], m[2] * pick[0] - m[0] * pick[2], m[0] * pick[1] - m[1] * pick[0]];
      const xl = Math.hypot(...xd);
      const origin = [p[0] + m[0] * from, p[1] + m[1] * from, p[2] + m[2] * from];
      return drawRectangle(2 * big, 2 * big).sketchOnPlane(new Plane(origin, xd.map((v) => v / xl), m)).extrude(to - from);
    };
    const [lo, hi] = dist > 0 ? [0, dist] : [dist, 0];
    let region = slab([c.x, c.y, c.z], n, lo, hi);
    const inner = best.innerWires().map((w) => new Set(edgesOf(w).map((e) => e.hashCode)));
    const wireOf = (f) => { const es = edgesOf(f).filter((e) => mine.has(e.hashCode)); const i = inner.findIndex((s) => es.some((e) => s.has(e.hashCode))); return i; }; // (-1: the outline of the face)
    /** the solid that bounds the slab for a neighbour: `inner` is the side of the neighbour the new material is on for a neighbour round the outside of the face, the side it is not on for one round a hole in it */
    const sideOf = (f, hole) => {
      const fc = f.center;
      if (/^CYLINDR/.test(f.geomType)) {
        // a round wall (a post, a hole, a round corner): the inside of its cylinder, kept for the outline of the face and taken away for a hole in it
        const cy = f._geomAdaptor().Cylinder();
        const [L, D] = [cy.Location(), cy.Axis().Direction()];
        const start = [L.X() - D.X() * big, L.Y() - D.Y() * big, L.Z() - D.Z() * big];
        return makeCylinder(cy.Radius(), 2 * big, start, [D.X(), D.Y(), D.Z()]);
      }
      if (f.geomType !== "PLANE") throw new Error("the faces next to this face are not all flat or round, so it cannot be extended (move it instead)");
      const m0 = f.normalAt();
      const ml = Math.hypot(m0.x, m0.y, m0.z);
      const m = [m0.x / ml, m0.y / ml, m0.z / ml];
      // a neighbour that goes down from this face (the body is below the edge) has the material behind it, one that rises above it (a wall round a pocket, a post) has the air
      const below = (fc.x - c.x) * n[0] + (fc.y - c.y) * n[1] + (fc.z - c.z) * n[2] <= 1e-9;
      const material = hole ? !below : below; // (round a hole the new material is on the side the wall faces away from: the hole is the side it faces)
      return material ? slab([fc.x, fc.y, fc.z], m, -big, 0) : slab([fc.x, fc.y, fc.z], m, 0, big);
    };
    const groups = new Map();
    for (const f of next) { const w = wireOf(f); groups.set(w, [...(groups.get(w) ?? []), f]); }
    for (const [w, fs] of groups) {
      if (w < 0) {
        for (const f of fs) { region = region.intersect(sideOf(f, false)); if (!(measureVolume(region) > 1e-6)) break; }
      } else {
        // a hole in the face (or a post standing on it): what is inside it is taken out of the new material
        let hole = null;
        for (const f of fs) { const s = sideOf(f, true); hole = hole ? hole.intersect(s) : s; }
        if (hole) region = region.cut(hole);
      }
      if (!(measureVolume(region) > 1e-6)) break;
    }
    const left = measureVolume(region);
    if (!(left > 1e-6)) {
      if (dist > 0) return { kind: "solid", shape: t }; // the neighbours have met: nothing more to add, and nothing is wrong
      throw new Error("nothing of the body would be left");
    }
    const made = dist > 0 ? t.fuse(region) : t.cut(region);
    if (!(measureVolume(made) > 1e-6)) throw new Error("nothing of the body would be left");
    return { kind: "solid", shape: made };
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
    // a fillet or chamfer that changes along its edges (`in_406`, `in_410`): sizes at places along each edge (0 its start, 1 its other end); smaller sizes keep the proportions
    const rel = op.stations && op.stations.length >= 2 ? op.stations.map(([x, s]) => [x, s / v]) : null;
    const stationsFor = (sz) => (rel ? rel.map(([x, r]) => [x, sz * r]) : undefined);
    const base = op.together && op.together.base ? ctx.get(op.together.base, "solid").shape : null;
    /** The body with this step's edges (`list`, refs) rounded or bevelled by `size`: on their own, else together with the steps just before it (`in_176`), else it throws. */
    let note = null;
    const make = (size, list, neighbours = true) => {
      const set = stage("finding the edges", () => resolveEdges(t, list));
      const pick = (ef) => ef.when(({ element }) => set.has(element.hashCode));
      try {
        if (!set) throw new Error("line not found (the model changed since this step was made)");
        if (rel && edgesOf(t).some((x) => set.has(x.hashCode) && x.geomType === "CIRCLE" && Math.hypot(x.startPoint.x - x.endPoint.x, x.startPoint.y - x.endPoint.y, x.startPoint.z - x.endPoint.z) > 1e-6)) throw Object.assign(new Error("a rim made of two halves cannot change its size round it yet: it can when it is one closed edge"), { final: true });
        if (rel && op.mode === "chamfer") throw new Error("the library has no chamfer that changes along the edge"); // (it is made as a region, below)
        if (op.dist2) { // a chamfer with a distance along each face (`dec_chamfer_two_distances`): `size` along the named face, `dist2` along the other
          const face = op.face ? findFace(t, op.face) : null;
          if (!face) throw Object.assign(new Error("the face the first distance is measured along is not there (the model changed since this step was made)"), { final: true });
          const { n: fn, d: fd } = refPlane(op.face);
          const off = (pt) => Math.abs(fn[0] * pt.x + fn[1] * pt.y + fn[2] * pt.z - fd);
          if (edgesOf(t).some((x) => set.has(x.hashCode) && (off(x.startPoint) > 1e-3 || off(x.endPoint) > 1e-3))) throw Object.assign(new Error("an edge selected does not lie on the face the first distance is measured along: select edges of one face"), { final: true });
          const second = resolve(op.dist2, ctx.params);
          const two = t.chamfer({ distances: [size, second], selectedFace: (ff) => ff.when(({ element }) => element.hashCode === face.hashCode) }, pick);
          if (!isValidSolid(two) || Math.abs(measureVolume(two) - measureVolume(t)) < 1e-9 * measureVolume(t)) throw new Error("the kernel made nothing of it");
          return two;
        }
        const made = stage("the kernel's round", () => op.mode === "chamfer" ? t.chamfer(size, pick) : rel && rel.length > 2 ? lawFillet(t, set, stationsFor(size)) : t.fillet(rel ? [size, size * rel[1][1]] : size, pick));
        if (!stage("checking the round", () => isValidSolid(made))) throw new Error("kernel returned an invalid solid"); // (a size the faces cannot take can come out as a broken solid, not an exception)
        if (stage("checking the round's volume", () => Math.abs(measureVolume(made) - measureVolume(t)) < 1e-9 * measureVolume(t))) throw new Error("the kernel made nothing of it"); // (a size it cannot take can come out as the body unchanged)
        return made;
      } catch (e) {
        // two distances have no region to fall back on (`dec_chamfer_two_distances`): refused, with the reason
        if (op.dist2) throw e.final ? e : Object.assign(new Error(`a chamfer of ${size} mm along that face and ${resolve(op.dist2, ctx.params)} mm along the other could not be made here (the kernel: ${e.message}); try smaller distances, or an edge that lies on that face`), { final: true });
        // straight edges between flat faces: the corner is made as a region that is cut or added, which has no size that fails (`in_405`, `dec_edits_saturate`)
        const region = neighbours && set ? regionRound(t, set, size, op.mode, stationsFor(size)) : null;
        if (region === "empty") throw Object.assign(new Error(`a ${op.mode === "chamfer" ? "chamfer" : "fillet"} of that size would take all of the body`), { final: true });
        const mixed = !region && neighbours && set ? mixedRound(t, set, list, size, op.mode, stationsFor(size)) : null;
        if (mixed) { note = `the ${op.mode === "chamfer" ? "chamfer" : "fillet"} could not be made all at once at this size, so the straight edges and rims were made as regions and the other edges by the kernel, one after the other`; return mixed; }
        if (rel && op.mode === "chamfer" && !region) {
          const approx = neighbours && set ? approximateRound(t, set, size, op.mode, stationsFor(size)) : null;
          if (approx) { note = "the chamfer was made as a region that follows the edge, as the kernel has no chamfer whose size changes along its edge (close, not exact)"; return approx; }
          throw Object.assign(new Error("a chamfer whose size changes along the edge could not be made on these edges"), { final: true });
        }
        if (region) { note = rel && op.mode === "chamfer" ? "the chamfer was made as a region, as the kernel has no chamfer whose size changes along its edge" : `the ${op.mode === "chamfer" ? "chamfer" : "fillet"} could not be made as a smooth round at this size (the faces next to it are not wide enough, or other rounding meets it), so it was made as a region: as large a round as the faces beside it allow, or cut across them where they end`; return region; }
        // on its own it cannot be made (next to fillets already made, a corner where three meet): the kernel can blend a corner when the edges that meet there are rounded in the same operation, so
        // this one is tried together with the ones just before it (each with its own size), from the body before them
        if (!base || op.together.mods.length < 2) {
          // else (`in_379`): together with the fewest of the edges that meet it at its ends, which the kernel needs rounded with it; only for a step made that way (`corner` on the step: the step said so when it was made, so a later change cannot start it rounding another edge) where they meet at a corner it cannot blend alone
          const more = neighbours && op.corner && set ? withNeighbours(t, set, size, op.mode) : null;
          if (more) { note = more.note; return more.shape; }
          const approx = neighbours && op.corner && set ? approximateRound(t, set, size, op.mode, stationsFor(size)) : null; // (the last thing tried, in the retry made with corner: the neighbours come first)
          if (approx) { note = `the ${op.mode === "chamfer" ? "chamfer" : "fillet"} could not be made by the kernel, so it was made as a region that follows the edge (the faces beside it are taken as flat across it: approximate, and it can take noticeably less than a true round where the faces curve strongly across its size)`; return approx; }
          throw e;
        }
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
      const shape = make(v, refs);
      return { kind: "solid", shape, ...(note ? { note } : {}) };
    } catch (e) {
      // on failing for good: which of the edges cannot take the size on their own, and the most they can take, so the step can say (and the page can flash the ones that are the problem, `in_266`)
      if (!e.final && found && found.size) e.detail = diagnose((size, list) => make(size, list, false), refs, found.size, v);
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
      const dirOf = (axis) => (op.frame ? op.frame[axis] : [0, 1, 2].map((k) => (k === axis ? 1 : 0))); // (the axes of the mover, if it was turned, `in_440`)
      const along = (axis, count, base) => {
        const parts = [];
        for (let i = 0; i < count; i++) { const v = dirOf(axis).map((c) => c * i * d[axis]); parts.push(i === 0 ? base : base.clone().translate(v)); }
        return fuseTree(parts);
      };
      // copies that stand apart (every direction they are repeated in, they are further apart than the body is wide) do not touch, so there is nothing to join: they are one compound at once
      const size = (() => { const b = bounds(t); return [0, 1, 2].map((i) => b.max[i] - b.min[i]); })();
      if (!op.frame && [0, 1, 2].every((i) => n[i] === 1 || Math.abs(d[i]) > size[i] + 1e-6)) {
        const copies = [];
        for (let i = 0; i < n[0]; i++) for (let j = 0; j < n[1]; j++) for (let k = 0; k < n[2]; k++) copies.push(i + j + k === 0 ? t.clone() : t.clone().translate([i * d[0], j * d[1], k * d[2]]));
        return { kind: "solid", shape: again(copies.length === 1 ? copies[0] : makeCompound(copies)) };
      }
      let row = along(0, n[0], t.clone());
      let plane = along(1, n[1], row);
      return { kind: "solid", shape: again(along(2, n[2], plane)) };
    }
    if (op.mode === "mirror") {
      // the body and its reflection in a plane (`in_433`): joined where they touch, else two bodies
      const l = Math.hypot(...op.normal);
      if (!(l > 1e-12)) throw new Error("the mirror plane has no direction");
      const copy = t.clone().mirror(op.normal.map((x) => x / l), op.point);
      const both = out.fuse(copy);
      if (!isValidSolid(both)) throw new Error("the mirror copy could not be joined to the body");
      return { kind: "solid", shape: again(both) };
    }
    if (op.mode === "circular") {
      const count = Math.max(1, Math.round(resolve(op.count, ctx.params)));
      const angle = resolve(op.angle, ctx.params);
      if (count > 200) throw new Error("that is more than 200 copies");
      const axis = op.frame ? op.frame[Math.round(resolve(op.axis, ctx.params))] : [0, 0, 0];
      if (!op.frame) axis[Math.round(resolve(op.axis, ctx.params))] = 1;
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
    if (op.mode === "rotate") { const pivot = op.pivot ?? middle(); const about = op.dir ?? axis; return { kind: "solid", shape: again(t.rotate(v, pivot, about)), tf: { mode: "rotate", axis: op.axis, dir: op.dir, v, pivot, only } }; } // (`op.dir`: a turn about any axis, `in_417`)
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
   * Shape one body by moving some of its corners (`dec_direct_shape_editing`): `moves` is [{ from, to }]. A face that stays flat stays whole, one that would not is split into flat pieces;
   * a move that leaves the body open, empty or crossing itself is refused with the reason.
   */
  reshape(op, ctx) {
    const target = ctx.get(op.target, "solid");
    const markers = target.markers ?? [];
    const one = op.body && markers.length > 1 ? lumpOf(target.shape, markers, op.body) : null;
    if (op.body && markers.length > 1 && !one) throw new Error("that body is not there any more");
    const t = one ? one.lump : target.shape.solids.length === 1 ? target.shape.solids[0] : target.shape;
    const made = reshape(t, op.moves);
    const b = bounds(made);
    return { kind: "solid", shape: one ? makeCompound([...one.rest, made]) : made, tf: { mode: "reshape", only: one ? op.body : null, at: [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2) }, checked: true };
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
    const drop = new Set(op.drop ?? []); // (tools that were kept but have been deleted since: the cut they made stays, they do not, `in_436`)
    const kept = op.keep && op.mode !== "add" ? others.filter((_, i) => !drop.has(op.bodies[i + 1])).map((o) => o.clone()) : []; // (a boolean uses up what it is given: the tools that stay are copied first)
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
    if (!(Math.abs(th) > 1e-6)) throw new Error("the wall must be thicker than nothing");
    // the faces left open (`in_391`, `in_393`): named by where they were (`op.refs`, as a push / pull names a face); or the faces named are the walls and every other is open (`op.keep`); or none is open (`op.closed`)
    let open;
    if (op.keep) { const keepH = new Set(op.keep.map((r) => findFace(t, r).hashCode)); open = facesOf(t).filter((f) => !keepH.has(f.hashCode)); }
    else if (op.closed) open = [];
    else open = (op.refs ?? []).map((r) => findFace(t, r));
    // the corners stay sharp whichever way the wall goes: the join is made by meeting the offset faces, not by rounding them
    const offset = thickSolid(t, open, th);
    if (!op.closed) return { kind: "solid", shape: offset };
    // no face open: the kernel's shell with nothing removed gives the offset solid alone, so the wall is what lies between that and the body
    // an outward offset of some bodies comes back turned inside out (a negative volume): turned right again before it is used
    const grown = measureVolume(offset) < 0 ? cast(offset.wrapped.Reversed()) : offset;
    const [outer, inner] = th > 0 ? [t, grown] : [grown, t];
    const expected = measureVolume(outer) - measureVolume(inner);
    let made = null;
    try { made = outer.cut(inner); if (!isValidSolid(made) || Math.abs(measureVolume(made) - expected) > 0.01 * Math.abs(expected)) made = null; } catch { made = null; }
    // the boolean can fail, or give the wrong body, where the two surfaces are close kin (a rolled edge whose rolling circle is nearly the radius of the cylinder, a torus that crosses its own axis, `in_425`): the wall is then
    // made as a solid of two shells, the outer one and the inner reversed, which asks for no boolean at all
    return { kind: "solid", shape: made ?? hollowByShells(outer, inner) };
  },
};

/** The bodies (their names) that a tool cuts into: the ones it takes material from (`in_436`: deleting a body takes out the cuts made only in it). */
function cutInto(value, tool) {
  const markers = value.markers ?? [];
  const lumps = lumpsOf(value.shape);
  if (lumps.length < 2) return markers.slice(0, 1).map((m) => m.id);
  const hit = [];
  for (const m of markers) {
    const l = lumps[m.lump];
    if (!l) continue;
    try { if (measureVolume(l.clone().intersect(tool.clone())) > 1e-7) hit.push(m.id); } catch { /* not this one */ }
  }
  return hit;
}

/** The body and a piece added to it, and what that was: a piece that stands apart is a body of its own (`new`), one that touches it joins it (`add`); said, so that a step that did not say can be made to (`in_436`). */
function joined(target, solid) {
  const shape = target.fuse(solid);
  const used = (shape.solids?.length ?? 1) > (target.solids?.length ?? 1) ? "new" : "add";
  return { kind: "solid", shape, used };
}

/** A solid whose boundary is the outer solid's shell and, as a void inside it, the inner solid's shell turned inside out. */
function hollowByShells(outer, inner) {
  const oc = getOC();
  const shellOf = (sh) => { const ex = new oc.TopExp_Explorer(sh.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SHELL, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); try { return oc.TopoDS.Shell(ex.Current()); } finally { ex.delete(); } };
  const maker = new oc.BRepBuilderAPI_MakeSolid(shellOf(outer), oc.TopoDS.Shell(shellOf(inner).Oriented(oc.TopAbs_Orientation.TopAbs_REVERSED)));
  const out = cast(maker.Shape());
  maker.delete();
  if (!isValidSolid(out)) throw new Error("the wall could not be made at this thickness");
  return out;
}

/** A helix about the axis through `centre` along `dir`, starting at `radius` from it in the direction `xDir`: `pitch` mm a turn, `height` mm long (the library's own helix always starts in a direction it picks). */
function helix(pitch, height, radius, centre, dir, xDir, left) {
  const oc = getOC();
  const turns = height / pitch;
  const line = new oc.Geom2d_Line(new oc.gp_Pnt2d(0, 0), new oc.gp_Dir2d(left ? -2 * Math.PI : 2 * Math.PI, pitch));
  const from = line.Value(0);
  const to = line.Value(turns * Math.sqrt((2 * Math.PI) ** 2 + pitch ** 2));
  const seg = new oc.GC_MakeSegment2d(from, to);
  const surface = new oc.Geom_CylindricalSurface(makeAx3(centre, dir, xDir), radius);
  const edge = new oc.BRepBuilderAPI_MakeEdge(seg.Value(), surface).Edge();
  const wire = new oc.BRepBuilderAPI_MakeWire(edge).Wire();
  oc.BRepLib.BuildCurves3d(wire);
  return new Wire(wire);
}

/** The solid thickened by `th` (inward when positive) with the faces `open` removed; the faces' offsets meet at sharp corners (`in_394`). */
function thickSolid(t, open, th) {
  const oc = getOC();
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const f of open) list.Append(f.wrapped);
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  builder.MakeThickSolidByJoin(t.wrapped, list, -th, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Intersection, false);
  const out = cast(builder.Shape());
  builder.delete();
  list.delete();
  return out;
}

/** The value at x of the curve through the points [x, y] that goes through them all and does not overshoot between them (a monotone cubic: Fritsch and Carlson); beyond the first and last it goes on in a straight line. */
function pchip(points, x) {
  const n = points.length;
  const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
  if (x <= xs[0]) return ys[0] + ((ys[1] - ys[0]) / (xs[1] - xs[0])) * (x - xs[0]);
  if (x >= xs[n - 1]) return ys[n - 1] + ((ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2])) * (x - xs[n - 1]);
  const h = xs.slice(1).map((v, i) => v - xs[i]);
  const d = h.map((hh, i) => (ys[i + 1] - ys[i]) / hh);
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const s = (x - xs[i]) / h[i];
  return (2 * s ** 3 - 3 * s ** 2 + 1) * ys[i] + (s ** 3 - 2 * s ** 2 + s) * h[i] * m[i] + (-2 * s ** 3 + 3 * s ** 2) * ys[i + 1] + (s ** 3 - s ** 2) * h[i] * m[i + 1];
}

/**
 * A fillet whose size goes through several sizes along the edge (`in_410`): the library's own fillet has a start and an end radius, the kernel has a radius law, made here from points (the place along the edge,
 * from 0 at its start to 1 at its other end, and the size there) for every edge in `set`.
 */
function lawFillet(t, set, points) {
  const oc = getOC();
  const maker = new oc.BRepFilletAPI_MakeFillet(t.wrapped, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  const arrays = [];
  try {
    for (const e of edgesOf(t).filter((x) => set.has(x.hashCode))) {
      const arr = new oc.NCollection_Array1_gp_Pnt2d(1, points.length);
      arrays.push(arr);
      points.forEach((p, i) => { const q = new oc.gp_Pnt2d(p[0], p[1]); arr.SetValue(i + 1, q); q.delete(); });
      maker.Add(arr, e.wrapped);
    }
    if (!arrays.length) throw new Error("no edge");
    return cast(maker.Shape());
  } finally {
    for (const a of arrays) a.delete();
    maker.delete();
  }
}

/**
 * A fillet or chamfer of straight edges between two flat faces made as a **region** (`in_405`, `dec_edits_saturate` B): the corner is the area between the two face lines and the rounding (the rolling circle, or the
 * bevel), made as a prism along the edge and cut from the body where the edge is convex, or added where it is concave. There is no size at which it fails: where the rounding would no longer touch the faces next to the
 * edge tangentially (they are narrower than the size) it simply crosses them. Every region is made from the body as it was, then all are applied. Null if an edge is not straight between two flat faces.
 */
/**
 * A selection that mixes edges a region can make (straight between flat faces, rims) with edges it cannot (`in_409`): the regions are made from the body as it is and the kernel rounds the others on the result, or
 * the other way about, whichever works. Null if the selection is not mixed, or neither order works.
 */
function mixedRound(t, set, list, size, mode, stations) {
  const byEdge = new Map();
  for (const f of facesOf(t)) for (const e of edgesOf(f)) byEdge.set(e.hashCode, [...(byEdge.get(e.hashCode) ?? []), f]);
  const regionable = (e) => { const fs = byEdge.get(e.hashCode) ?? []; return (e.geomType === "LINE" && fs.length === 2 && fs.every((f) => f.geomType === "PLANE")) || !!rimFaces(e, fs); };
  const [R, K] = [[], []];
  for (const e of edgesOf(t).filter((x) => set.has(x.hashCode))) (regionable(e) ? R : K).push(e.hashCode);
  if (!R.length || !K.length) return null;
  const refOf = new Map();
  for (const r of list) { const h = resolveEdges(t, [r]); if (h && h.size === 1) refOf.set([...h][0], r); }
  const [Rrefs, Krefs] = [R.map((h) => refOf.get(h)), K.map((h) => refOf.get(h))];
  if (Rrefs.some((r) => !r) || Krefs.some((r) => !r)) return null;
  const kernelRound = (body, refs) => {
    const s2 = resolveEdges(body, refs);
    if (!s2 || s2.size !== refs.length) return null;
    try {
      const pick = (ef) => ef.when(({ element }) => s2.has(element.hashCode));
      if (stations && mode === "chamfer") return null; // (the kernel has no chamfer that changes along its edge)
      const made = mode === "chamfer" ? body.chamfer(size, pick) : stations && stations.length > 2 ? lawFillet(body, s2, stations) : body.fillet(stations ? [stations[0][1], stations[1][1]] : size, pick);
      return isValidSolid(made) && Math.abs(measureVolume(made) - measureVolume(body)) > 1e-9 * measureVolume(body) ? made : null;
    } catch { return null; }
  };
  const regions = (body, refs) => { const s2 = resolveEdges(body, refs); if (!s2 || s2.size !== refs.length) return null; const r = regionRound(body, s2, size, mode, stations); return r && r !== "empty" ? r : null; };
  const first = regions(t, Rrefs);
  const a = first ? kernelRound(first, Krefs) : null;
  if (a) return a;
  const second = kernelRound(t, Krefs);
  return second ? regions(second, Rrefs) : null;
}

/** Every edge of `set` made by `curvedRegion` from the body as it was, all cut or added; null if any cannot be. */
function approximateRound(t, set, size, mode, stations) {
  const byEdge = new Map();
  for (const f of facesOf(t)) for (const e of edgesOf(f)) byEdge.set(e.hashCode, [...(byEdge.get(e.hashCode) ?? []), { f, rev: e.wrapped.Orientation() === getOC().TopAbs_Orientation.TopAbs_REVERSED }]); // (the edge as the face's own outline has it: forward or reversed)
  const tools = [];
  for (const e of edgesOf(t).filter((x) => set.has(x.hashCode))) {
    let r = null;
    const here = byEdge.get(e.hashCode) ?? [];
    try { r = curvedRegion(t, e, here.map((x) => x.f), here.map((x) => x.rev), size, mode, stations); } catch { r = null; }
    if (!r) return null;
    tools.push(r);
  }
  if (!tools.length) return null;
  try {
    let made = t;
    for (const { tool, convex } of tools) made = convex ? made.cut(tool) : made.fuse(tool);
    return isValidSolid(made) && measureVolume(made) > 1e-6 && Math.abs(measureVolume(made) - measureVolume(t)) > 1e-9 * measureVolume(t) ? made : null;
  } catch { return null; }
}

/**
 * The region of a **rim** (`in_406`, `dec_edits_saturate` B): the circle where a flat face meets a round wall about an axis at right angles to it, revolved. The corner area between the two faces and the rounding
 * (the rolling circle, or the bevel) is drawn in the half plane through the axis (radius across, height along) and turned once round. A rim saturates at the largest size the faces beside it allow (the wall's height; the
 * flat face's width, which for the end of a post is its radius: past that the round is a dome and no more), since a region crossing the axis or going past the foot of a post would cut into what is not the corner.
 * Returns null for anything that is not such a rim.
 */
/**
 * A fillet or chamfer of **any edge between two faces**, made as a region approximately (`in_411`): sections across the edge at places along it, each drawn as the corner profile (the two faces taken as the planes
 * tangent to them there, the rolling circle or the bevel between them) in the plane across the edge, and between each two sections a ruled piece; the pieces are joined and cut from the body (a convex edge) or added to it
 * (a concave one). It is exact where the faces are planes along the edge and near it where they curve slowly across the size; it is the last thing tried, for an edge the kernel cannot round, a rim a region cannot make
 * and an edge between faces that are not flat and not a round wall (a cone, a sphere, a torus, a free surface). A closed edge is made in two halves. Null if it cannot be made.
 */
function curvedRegion(t, e, fs, revs, size, mode, stations) {
  if (fs.length !== 2) return null;
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; };
  const closed = Math.hypot(e.startPoint.x - e.endPoint.x, e.startPoint.y - e.endPoint.y, e.startPoint.z - e.endPoint.z) < 1e-6;
  const N = 24;
  // the frame across the edge at a place along it: the directions along the two faces away from the edge, from the faces' own normals there
  const frameAt = (u) => {
    const P = e.pointAt(u);
    const T = unit([e.tangentAt(u).x, e.tangentAt(u).y, e.tangentAt(u).z]);
    if (!T) return null;
    const norm = fs.map((f) => { const n = f.normalAt(P); return unit([n.x, n.y, n.z]); });
    if (norm.some((n) => !n)) return null;
    // into each face from the edge: to the left of the way the face's own outline runs along the edge, seen from outside (so no guess is made from where the face's middle is)
    const a = fs.map((f, i) => unit(cross3(norm[i], revs[i] ? [-T[0], -T[1], -T[2]] : T)));
    if (a.some((d) => !d)) return null;
    const cosA = Math.max(-1, Math.min(1, dotp(a[0], a[1])));
    const alpha = Math.acos(cosA);
    if (alpha < 1e-3 || alpha > Math.PI - 1e-3) return null;
    const ey = unit([a[1][0] - a[0][0] * cosA, a[1][1] - a[0][1] * cosA, a[1][2] - a[0][2] * cosA]);
    return { P, a, alpha, cosA, ex: a[0], ey, normal: cross3(a[0], ey), convex: dotp(norm[0], a[1]) < 0 };
  };
  const section = (fr, sz) => {
    let reach = mode === "chamfer" ? sz : sz / Math.tan(fr.alpha / 2);
    let radius = sz;
    if (!fr.convex) {
      // added material past the end of the faces would stand out as a wing: no further than the faces go from the edge here (taken from the corners of each face)
      const far = fs.map((f, i) => { let m = 0; for (const p of faceVertices(f)) m = Math.max(m, dotp(fr.a[i], [p.x - fr.P.x, p.y - fr.P.y, p.z - fr.P.z])); return m; });
      const limit = Math.min(...far.map((x) => (x > 1e-9 ? x : Infinity)));
      if (reach > limit) { reach = limit; radius = mode === "chamfer" ? sz : limit * Math.tan(fr.alpha / 2); }
    }
    if (!(reach > 1e-6)) return null;
    const [t1, t2] = [[reach, 0], [reach * fr.cosA, reach * Math.sin(fr.alpha)]];
    const eps = 1e-4;
    const [o1, o2] = [[0, -1], [-Math.sin(fr.alpha), fr.cosA]];
    const k = eps / (1 + o1[0] * o2[0] + o1[1] * o2[1]);
    let outline = draw([k * (o1[0] + o2[0]), k * (o1[1] + o2[1])]).lineTo([t1[0] + eps * o1[0], t1[1] + eps * o1[1]]).lineTo(t1);
    if (mode === "chamfer") outline = outline.lineTo(t2);
    else { const m = radius / Math.sin(fr.alpha / 2) - radius; outline = outline.threePointsArcTo(t2, [m * Math.cos(fr.alpha / 2), m * Math.sin(fr.alpha / 2)]); }
    return outline.lineTo([t2[0] + eps * o2[0], t2[1] + eps * o2[1]]).close().sketchOnPlane(new Plane([fr.P.x, fr.P.y, fr.P.z], fr.ex, fr.normal));
  };
  const sizeAt = (u) => (stations ? Math.max(1e-3, pchip(stations, u)) : size);
  const halves = closed ? [[0, 0.5], [0.5, 1]] : [[0, 1]];
  let ring = null;
  let convex = null;
  for (const [lo, hi] of halves) {
    const us = Array.from({ length: N / halves.length + 1 }, (_, k) => lo + ((hi - lo) * k) / (N / halves.length));
    const frames = us.map(frameAt);
    if (frames.some((f) => !f)) return null;
    if (convex === null) convex = frames[0].convex;
    if (frames.some((f) => f.convex !== convex)) return null; // (an edge that is convex in one place and concave in another is not made this way)
    // one smooth loft through all the sections of the half (a ruled piece between each two, joined, was slow and left the bends short)
    const sections = frames.map((fr, i) => section(fr, sizeAt(us[i])));
    if (sections.some((s) => !s)) return null;
    const piece = sections[0].loftWith(sections.slice(1), { ruled: false });
    ring = ring ? ring.fuse(piece) : piece;
  }
  return ring ? { tool: ring, convex } : null;
}

function rimFaces(e, fs) {
  if (e.geomType !== "CIRCLE" || fs.length !== 2) return null;
  const plane = fs.find((f) => f.geomType === "PLANE");
  const wall = fs.find((f) => /^CYLINDR/.test(f.geomType)); // (the library names it CYLINDRE)
  if (!plane || !wall) return null;
  let ci;
  try { ci = e._geomAdaptor().Circle(); } catch { return null; }
  const [L, D] = [ci.Location(), ci.Axis().Direction()];
  const C = [L.X(), L.Y(), L.Z()];
  const ax = [D.X(), D.Y(), D.Z()];
  const R = ci.Radius();
  const pn = plane.normalAt();
  const n = [pn.x, pn.y, pn.z];
  const nl = Math.hypot(...n);
  if (Math.abs(n[0] * ax[0] + n[1] * ax[1] + n[2] * ax[2]) / nl < 1 - 1e-6) return null; // (the flat face is not across the axis: a cone, or a slanted cut)
  return { plane, wall, C, ax, R, n };
}
function rimTool(e, fs, size, mode, stations) {
  const rf = rimFaces(e, fs);
  if (!rf) return null;
  const { plane, wall, C, ax, R, n } = rf;
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const A = e.startPoint;
  const radial = [(A.x - C[0]) / R, (A.y - C[1]) / R, (A.z - C[2]) / R];
  const wn = wall.normalAt(A);
  const signW = dotp([wn.x, wn.y, wn.z], radial) >= 0 ? 1 : -1; // the wall faces out of the axis (a post) or towards it (a hole)
  const wc = wall.center;
  const along = dotp([wc.x - C[0], wc.y - C[1], wc.z - C[2]], ax);
  if (Math.abs(along) < 1e-9) return null;
  const sW = along > 0 ? 1 : -1; // the wall runs from the rim along +axis or -axis
  const convex = dotp([wc.x - C[0], wc.y - C[1], wc.z - C[2]], n) < 0; // the wall is on the body's side of the flat face: the rim is a corner of the body (the end of a post or a hole); else it is the foot of one
  const sRho = convex ? -signW : signW; // the flat face runs from the rim away from the axis (+1) or towards it (-1)
  // how far each face reaches from the rim
  let wallH = 0;
  for (const p of faceVertices(wall)) wallH = Math.max(wallH, Math.abs(dotp([p.x - C[0], p.y - C[1], p.z - C[2]], ax)));
  if (wallH < 1e-9) wallH = Infinity; // (a wall with no other edge in view: a closed round: no limit)
  let planeW = stations ? R * 0.99 : R; // (a size that changes round the rim stops a hair short of the axis: pieces that all meet on the axis cannot be cut)
  if (sRho > 0) { planeW = 0; for (const p of faceVertices(plane)) { const v = [p.x - C[0], p.y - C[1], p.z - C[2]]; const h = dotp(v, ax); planeW = Math.max(planeW, Math.hypot(v[0] - ax[0] * h, v[1] - ax[1] * h, v[2] - ax[2] * h) - R); } if (planeW < 1e-9) planeW = Infinity; }
  const outlineFor = (sz) => {
    const reach = Math.min(sz, planeW, wallH);
    if (!(reach > 1e-6)) return null;
    const T1 = [R + sRho * reach, 0];
    const T2 = [R, sW * reach];
    let outline = draw([R, 0]).lineTo(T1);
    if (mode === "chamfer") outline = outline.lineTo(T2);
    else { const m = reach * (Math.SQRT2 - 1); outline = outline.threePointsArcTo(T2, [R + (sRho * m) / Math.SQRT2, (sW * m) / Math.SQRT2]); }
    return outline.close();
  };
  const outline = outlineFor(size);
  if (!outline) return null;
  // the profile is drawn in the half plane through the axis that holds the start of the rim (radius across, height along the axis) and turned about the axis through the span of the rim: all the way round for a whole
  // rim, the span of the arc for a piece of one (the round then ends in a flat cut across it, as a round ends at a vertex)
  const M = e.pointAt(0.5);
  const B = e.endPoint;
  const rad = (p) => { const v = [p.x - C[0], p.y - C[1], p.z - C[2]]; const h = dotp(v, ax); const r = [v[0] - ax[0] * h, v[1] - ax[1] * h, v[2] - ax[2] * h]; const l = Math.hypot(...r); return r.map((x) => x / l); };
  const closed = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) < 1e-6;
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const [rA, rM] = [rad(A), rad(M)];
  const ccw = dotp(cross3(rA, rM), ax) >= 0; // the arc runs from its start round the axis in the positive sense
  const span = closed ? 360 : (2 * Math.acos(Math.max(-1, Math.min(1, dotp(rA, rM)))) * 180) / Math.PI;
  const rS = ccw ? rA : rad(B); // where the sweep starts: the start of the arc, or its other end when it runs the other way
  if (stations && !closed) throw Object.assign(new Error("a rim made of two halves cannot change its size round it yet: it can when it is one closed edge"), { final: true });
  if (stations && closed) {
    // a size that changes round the rim (`in_410`): sections at angles round it, each with the size there (the sizes at the places along the rim, 0 its start and 1 round again to it, joined in a smooth curve),
    // and between each two a ruled piece, so that no piece has to turn all the way round; the pieces are cut one after the other
    const N = 24;
    const turn = (r, phi) => r.map((x, i) => x * Math.cos(phi) + cross3(ax, r)[i] * Math.sin(phi));
    const section = (k) => {
      const phi = ((ccw ? 1 : -1) * 2 * Math.PI * k) / N;
      const o = outlineFor(Math.max(1e-3, pchip(stations, (k % N) / N)));
      const r = turn(rS, phi);
      return o ? o.sketchOnPlane(new Plane(C, r, cross3(r, ax))) : null;
    };
    // (a sketch is used up by the loft it is in, so each piece has sections of its own)
    const pieces = [];
    for (let k = 0; k < N; k++) { const [a, b] = [section(k), section(k + 1)]; if (!a || !b) return null; pieces.push(a.loftWith(b, { ruled: true })); }
    let ring = pieces[0];
    for (const piece of pieces.slice(1)) ring = ring.fuse(piece); // (joined into one ring before it is cut: pieces cut one after the other leave slivers where they meet)
    return { tool: ring, convex, R, length: e.length, partial: false, key: String(e.hashCode) };
  }
  const sketch = outline.sketchOnPlane(new Plane(C, rS, cross3(rS, ax)));
  const solid = sketch.revolve(ax, { origin: C, angle: span });
  return { tool: solid, convex, R, length: e.length, partial: !closed, key: String(e.hashCode) };
}
/** The solid between the planes at `from` and `to` along the unit vector m from the point p, square and `big` wide about it. */
function slabSolid(p, m, from, to, big) {
  const pick = Math.abs(m[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xd = [m[1] * pick[2] - m[2] * pick[1], m[2] * pick[0] - m[0] * pick[2], m[0] * pick[1] - m[1] * pick[0]];
  const xl = Math.hypot(...xd);
  const origin = [p[0] + m[0] * from, p[1] + m[1] * from, p[2] + m[2] * from];
  return drawRectangle(2 * big, 2 * big).sketchOnPlane(new Plane(origin, xd.map((v) => v / xl), m)).extrude(to - from);
}
/**
 * The corners where exactly three rounded straight edges meet, the same size for all, on three flat faces (`in_410`, `in_411`: not only at right angles): the corner point, the three unit directions into the edges, the three
 * inward normals of the faces, the centre of the ball of the size that touches all three faces, and the size. The cap that is taken off is the corner of the body between the faces, behind the planes through that centre across each
 * edge, without the ball.
 */
function sphereCorners(edges, mode) {
  const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
  const at = new Map();
  for (const e of edges) {
    if (e.size === null || !e.convex) continue;
    const ends = [[e.A, [e.u[0], e.u[1], e.u[2]]], [e.B, [-e.u[0], -e.u[1], -e.u[2]]]];
    for (const [p, d] of ends) at.set(key(p), [...(at.get(key(p)) ?? []), { p, d, e }]);
  }
  const dotp = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const out = [];
  for (const here of at.values()) {
    if (here.length !== 3) continue;
    const r = here[0].e.size;
    if (!here.every((x) => x.e.size === r)) continue;
    // the three faces: the outward normals of the edges' faces, each once
    const normals = [];
    for (const x of here) for (const n of x.e.norm) if (!normals.some((m) => dotp(m, n) > 1 - 1e-6)) normals.push(n);
    if (process.env.DBG && normals.length !== 3) console.log('NORMALS', normals.length);
    if (normals.length !== 3) continue;
    const m = normals.map((n) => [-n[0], -n[1], -n[2]]); // into the body
    if (mode === "chamfer" && [[0, 1], [0, 2], [1, 2]].some(([i, j]) => Math.abs(dotp(m[i], m[j])) > 1e-6)) continue; // (the kernel's corner of three chamfers is a flat triangle only where the faces are at right angles)
    // the point w with m_i . w = 1 for the three: the ball of size r touches the three faces when its centre is V + r w
    const det = dotp(m[0], cross3(m[1], m[2]));
    if (Math.abs(det) < 1e-6) continue;
    const [c12, c20, c01] = [cross3(m[1], m[2]), cross3(m[2], m[0]), cross3(m[0], m[1])];
    const w = [0, 1, 2].map((i) => (c12[i] + c20[i] + c01[i]) / det);
    if (process.env.DBG) console.log('CORNER', r, w.map((v) => v.toFixed(3)).join(','), here.map((x) => (dotp(w, x.d) * r).toFixed(3) + '/' + x.e.len.toFixed(2)).join(' '), normals.length);
    if (!here.every((x) => dotp(w, x.d) * r > 0 && dotp(w, x.d) * r <= x.e.len / 2 + 1e-9)) continue; // (the cap has to lie within the edges, and the rounds of the three not meet)
    out.push({ V: [here[0].p.x, here[0].p.y, here[0].p.z], d: here.map((x) => x.d), m, w, r });
  }
  return out;
}
export { regionRound, approximateRound };
const faceVertices = (f) => edgesOf(f).flatMap((e) => [e.startPoint, e.endPoint]);
function regionRound(t, set, size, mode, stations) {
  const faces = facesOf(t);
  const byEdge = new Map();
  for (const f of faces) for (const e of edgesOf(f)) byEdge.set(e.hashCode, [...(byEdge.get(e.hashCode) ?? []), f]);
  const dir = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crossp = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const tools = [];
  const straight = [];
  const rims = new Map();
  for (const e of edgesOf(t).filter((x) => set.has(x.hashCode))) {
    const fs = byEdge.get(e.hashCode) ?? [];
    if (rimFaces(e, fs)) {
      // a rim: a circle where a flat face meets a round wall about the same axis (the end of a post or a hole, the foot of a post): made by revolving the corner region about the axis (`rimTool`)
      const rim = rimTool(e, fs, size, mode, stations);
      if (!rim) return null;
      const key = rim.key;
      rims.set(key, rim);
      continue;
    }
    if (e.geomType !== "LINE" || fs.length !== 2 || fs.some((f) => f.geomType !== "PLANE")) return null;
    const [A, B] = [e.startPoint, e.endPoint];
    const len = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    if (!(len > 1e-6)) return null;
    const u = [(B.x - A.x) / len, (B.y - A.y) / len, (B.z - A.z) / len];
    const norm = fs.map((f) => { const n = f.normalAt(); return dir([n.x, n.y, n.z]); });
    // along each face, away from the edge and across it
    const a = fs.map((f, i) => {
      const d = dir(crossp(norm[i], u));
      const c = f.center;
      return dotp(d, [c.x - A.x, c.y - A.y, c.z - A.z]) >= 0 ? d : [-d[0], -d[1], -d[2]];
    });
    const cosA = Math.max(-1, Math.min(1, dotp(a[0], a[1])));
    const alpha = Math.acos(cosA);
    if (alpha < 1e-3 || alpha > Math.PI - 1e-3) return null; // (two faces in one plane: no edge to round)
    const convex = dotp(norm[0], a[1]) < 0;
    const ex = a[0];
    const ey = dir([a[1][0] - ex[0] * cosA, a[1][1] - ex[1] * cosA, a[1][2] - ex[2] * cosA]);
    const normal = crossp(ex, ey);
    const margin = convex ? 1 : 0; // (a region that is cut reaches past the ends of the edge; one that is added stops at them, or it would stand out)
    const along = (B.x - A.x) * normal[0] + (B.y - A.y) * normal[1] + (B.z - A.z) * normal[2];
    const lowest = Math.min(0, along) - margin;
    const at = (s) => [A.x + normal[0] * s, A.y + normal[1] * s, A.z + normal[2] * s]; // a point of the line of the edge, `s` along the normal of the profile
    // concave: material added past the end of the faces would stand out from the body as a wing, so it is filled as far as the faces go and no further
    let limit = Infinity;
    if (!convex) {
      const extent = fs.map((f, i) => { let far = 0; for (const p of faceVertices(f)) far = Math.max(far, dotp(a[i], [p.x - A.x, p.y - A.y, p.z - A.z])); return far; });
      limit = Math.min(extent[0], extent[1]);
    }
    /** the profile of the region for a size: the edge point, the two points where the rounding begins, and the arc of the rolling circle (a fillet) or the straight bevel (a chamfer) */
    const profile = (sz, where) => {
      let reach = mode === "chamfer" ? sz : sz / Math.tan(alpha / 2); // how far along each face the rounding begins
      let radius = sz;
      if (reach > limit) { reach = limit; radius = mode === "chamfer" ? sz : limit * Math.tan(alpha / 2); }
      const t1 = [reach, 0];
      const t2 = [reach * Math.cos(alpha), reach * Math.sin(alpha)];
      // the two lines of the region that lie along the faces are moved a hair out of the body (parallel to the faces), so that the region and the body do not share faces that are not quite the same plane (the
      // boolean then does nothing, or leaves slivers); the arc or the bevel itself is exact
      const eps = 1e-4;
      const [o1, o2] = [[0, -1], [-Math.sin(alpha), Math.cos(alpha)]];
      const k = eps / (1 + o1[0] * o2[0] + o1[1] * o2[1]);
      const q0 = [k * (o1[0] + o2[0]), k * (o1[1] + o2[1])];
      let outline = draw(q0).lineTo([t1[0] + eps * o1[0], t1[1] + eps * o1[1]]).lineTo(t1);
      if (mode === "chamfer") outline = outline.lineTo(t2);
      else {
        const m = radius / Math.sin(alpha / 2) - radius; // the nearest point of the rolling circle to the edge
        outline = outline.threePointsArcTo(t2, [m * Math.cos(alpha / 2), m * Math.sin(alpha / 2)]);
      }
      outline = outline.lineTo([t2[0] + eps * o2[0], t2[1] + eps * o2[1]]);
      return outline.close().sketchOnPlane(new Plane(at(where), ex, normal));
    };
    let tool;
    const extra = [];
    if (stations) {
      // a size that changes along the edge: the sizes at the places along it, joined in a smooth curve that does not overshoot (`pchip`); the region is made between profiles at places along the edge (two for a straight
      // change, which is the cone the rolling ball makes, ten for a curve) and the profile goes on in the same way past the ends where the edge is cut past them
      const sizeAt = (s) => Math.max(1e-3, pchip(stations, s / along));
      const [s0, s1] = [lowest, Math.max(0, along) + margin];
      const straightChange = stations.length === 2;
      const cuts = straightChange ? [s0, s1] : [s0, ...Array.from({ length: 9 }, (_, i) => ((i + 1) / 10) * along), s1].sort((p, q) => (along >= 0 ? p - q : q - p));
      // between each two profiles a ruled piece (a cone): a smooth loft through all of them can fold over itself where the sizes change a lot, and the pieces are cut one after the other
      const pieces = cuts.slice(1).map((s, i) => profile(sizeAt(cuts[i]), cuts[i]).loftWith(profile(sizeAt(s), s), { ruled: true }));
      tool = pieces[0];
      for (const piece of pieces.slice(1)) extra.push(piece);
    } else tool = profile(size, lowest).extrude(len + 2 * margin);
    tools.push({ tool, convex });
    for (const piece of extra) tools.push({ tool: piece, convex });
    straight.push({ A, B, u, len, convex, norm, size: !stations ? size : null });
  }
  for (const rim of rims.values()) {
    tools.push({ tool: rim.tool, convex: rim.convex });
    for (const piece of rim.pieces ?? []) tools.push({ tool: piece, convex: rim.convex });
  }
  if (!tools.length) return null;
  let made = t;
  for (const { tool, convex } of tools) made = convex ? made.cut(tool) : made.fuse(tool);
  // where three rounded edges meet at a corner of three faces at right angles (the corner of a block) and the size is small enough for the rounds not to meet, the corner is a piece of a sphere, as the kernel makes it
  // (the three regions leave the corner as the three rounds cross; the cube of the size at the corner without the ball is taken off)
  for (const corner of sphereCorners(straight, mode)) {
    try {
      const { V, d, m, w, r } = corner;
      const c = [V[0] + r * w[0], V[1] + r * w[1], V[2] + r * w[2]];
      const big = 4 * r * Math.max(1, Math.hypot(...w)) + 1;
      const wedge = m.map((mi) => slabSolid(V, mi, 0, big, big));
      const behind = d.map((di) => slabSolid(c, di, -big, 0, big));
      const cap = [...wedge, ...behind].reduce((a, b) => a.intersect(b));
      let next;
      if (mode === "chamfer") {
        // three chamfers at a corner of three faces at right angles meet in a flat triangle through the three points where they end on the other chamfers' faces: the corner of the body behind that plane is taken off
        const s = [m[0][0] + m[1][0] + m[2][0], m[0][1] + m[1][1] + m[2][1], m[0][2] + m[1][2] + m[2][2]];
        const sl = Math.hypot(...s);
        const flat = slabSolid(V, s.map((x) => x / sl), 0, (2 * r) / sl, big);
        next = made.cut(wedge.reduce((a, b) => a.intersect(b)).intersect(flat));
      } else next = made.cut(cap.cut(makeSphere(r).translate(c)));
      if (isValidSolid(next) && measureVolume(next) > 1e-6) made = next;
    } catch { /* the corner stays as the three rounds leave it */ }
  }
  if (!isValidSolid(made)) return null;
  return measureVolume(made) > 1e-6 ? made : "empty"; // (the size takes all of the body)
}

/**
 * A fillet or chamfer that the kernel cannot make on the chosen edges alone, made together with the edges that meet them at their ends (`in_379`): the kernel rounds a corner only when the edges that meet there are in
 * the same operation. The fewest are tried (one, then two, then all of them): the first that works is used, and the answer says which. Null if none works.
 */
function withNeighbours(t, set, size, mode) {
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-4;
  const all = edgesOf(t);
  const mine = all.filter((e) => set.has(e.hashCode));
  const ends = mine.flatMap((e) => [e.startPoint, e.endPoint]);
  const next = all.filter((e) => !set.has(e.hashCode) && ends.some((p) => near(p, e.startPoint) || near(p, e.endPoint))).slice(0, 6);
  if (!next.length) return null;
  const subsets = [...next.map((e) => [e]), ...next.flatMap((e, i) => next.slice(i + 1).map((f) => [e, f])), ...(next.length > 2 ? [next] : [])];
  for (const extra of subsets) {
    const hashes = new Set([...set, ...extra.map((e) => e.hashCode)]);
    try {
      const pick = (ef) => ef.when(({ element }) => hashes.has(element.hashCode));
      const made = mode === "chamfer" ? t.chamfer(size, pick) : t.fillet(size, pick);
      if (isValidSolid(made)) return { shape: made, note: `the ${mode === "chamfer" ? "chamfer" : "fillet"} was made together with ${extra.length === 1 ? "the edge" : `${extra.length} edges`} that meet${extra.length === 1 ? "s" : ""} it at a corner: the kernel cannot blend that corner with this edge alone` };
    } catch { /* the next */ }
  }
  return null;
}

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
  return { culprits, largest, searched: count <= 8, total: refs.length, size: v };
}

/** OCCT in WASM can throw opaque WebAssembly.Exception objects with no message; say so plainly. */
function describeError(e, op) {
  if (e?.detail && op?.type === "edgeMod") {
    const d = e.detail;
    const what = op.mode === "chamfer" ? "chamfer" : "fillet";
    const where = d.culprits && d.culprits.length && d.culprits.length < d.total ? `on ${d.culprits.length} of the ${d.total} edges (they flash red)` : d.total === 1 ? "on this edge" : "on these edges";
    if (!d.searched) return `a ${what} of ${Math.round(d.size * 100) / 100} mm cannot be made ${where}: the faces beside it are too small for that size, or a fillet or chamfer made earlier meets it`;
    if (!d.largest) return `a ${what} cannot be made ${where} at any size: the kernel cannot blend the corner where it meets the other edges, even with them (select the edges that meet it too, or change the shape there)`;
    return `a ${what} of ${Math.round(d.size * 100) / 100} mm cannot be made ${where}: the most that works here is about ${d.largest} mm (a fillet or chamfer made earlier next to it can also stop it)`;
  }
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  // the kernel says nothing when it cannot build a shape: say what was being done, and the usual reason
  if (op?.type === "edgeMod") return `the kernel could not make a ${op.mode === "chamfer" ? "chamfer" : "fillet"} of that size on this edge: it is probably too big for the faces beside it (try a smaller size)`;
  if (op?.type === "cylRadius" || op?.type === "faceExtrude" || op?.type === "faceExtend") return "the kernel could not make that size (it may be too small, too big, or run into another part of the model)";
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
  faceExtend: (op) => [op.ref?.point],
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
    /** The kept result itself, not a copy (a copy of a loft of a thousand faces takes a tenth of a second): only for an op that does nothing to it but stand beside it (`in_446`). */
    peek(id, kind) {
      const r = results.get(id);
      if (!r) throw new Error(`${id} not found (ops must be ordered after their dependencies)`);
      if (r.error) throw new Error(`upstream ${id} failed`);
      if (kind && r.value.kind !== kind) throw new Error(`${id} is a ${r.value.kind}, expected ${kind}`);
      return r.value;
    },
  };
  const pj = JSON.stringify(params);
  for (const op of graph.ops) {
    const t0 = performance.now();
    const key = fingerprint(JSON.stringify([op, pj, [op.target, op.profile, ...(op.holes ?? []), ...(op.also ?? []).flatMap((f) => [f.profile, ...f.holes]), ...(op.sections ?? []).flatMap((s) => [s.profile, ...(s.holes ?? [])])].map((d) => (d ? keys.get(d) ?? null : null))]));
    keys.set(op.id, key);
    const kept = memo.get(key);
    if (kept) {
      remember(key, kept);
      results.set(op.id, { value: kept.value, ms: 0, key, cached: true });
      continue;
    }
    let markMs = 0;
    let checkMs = 0;
    try {
      if (!OPS[op.type]) throw new Error(`unknown op type ${op.type}`);
      beginStages();
      const value = run(op, ctx, results);
      const stagesOf = endStages();
      if (value.kind === "solid") {
        // which bodies the result has, by the markers of the body it was made from (moved with it if this was a move)
        const from = op.target ? results.get(op.target)?.value : null;
        let prev = value.tf ? moveMarkers(from?.markers ?? [], value.tf) : from?.markers ?? [];
        if (value.first) prev = [...prev.filter((m) => m.id === value.first), ...prev.filter((m) => m.id !== value.first)]; // (the body that stays keeps its name when bodies are combined)
        const tM = performance.now();
        value.markers = trackBodies(prev, value.shape, op.id);
        markMs = performance.now() - tM;
      }
      const rigid = op.type === "transform" && (op.mode === "move" || op.mode === "rotate"); // (moving a valid body cannot make it invalid: the check is skipped, it costs as much as the move)
      const tC = performance.now();
      if (value.kind === "solid" && !rigid && !value.checked && !isValidSolid(value.shape)) throw new Error("kernel returned an invalid solid");
      checkMs = performance.now() - tC;
      results.set(op.id, { value, ms: performance.now() - t0, key, markMs, checkMs, ...(Object.keys(stagesOf).length ? { stages: Object.fromEntries(Object.entries(stagesOf).map(([n, v]) => [n, Math.round(v * 10) / 10])) } : {}) });
      remember(key, { value });
    } catch (e) {
      endStages();
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
