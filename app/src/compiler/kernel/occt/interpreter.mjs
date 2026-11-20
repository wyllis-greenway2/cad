// THROWAWAY prototype: compiles a JSON operation graph into OCCT solids via replicad.
// Every op runs in a try/catch so one failure is local: independent ops still build,
// dependents report "upstream failed" (blueprint: failures are non-fatal).
import { unpack } from "./pack.mjs";
import { readIgesSolids } from "./igesio.mjs";
import {
  drawRectangle,
  drawRoundedRectangle,
  drawCircle,
  draw,
  makeCylinder,
  makeSphere,
  makeBox,
  makeCompound,
  makeSolid,
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
  localGC,
  makePolygon,
  twistExtrude,
  makeFace,
  addHolesInFace,
  loft,
  makeCircle,
} from "replicad";
import { decodeMesh } from "./meshdata.mjs";
import { facesOf, edgesOf, shellsOf, solidsOf } from "./topo.mjs";
import { reshape } from "./reshape.mjs";
import { findCrossing } from "./selfcross.mjs";
import { stage, beginStages, endStages } from "./stages.mjs";
import "./booleans.mjs"; // (the library's fuse, cut and intersect, made once instead of twice)
import { clearNameCaches, nameFaces, refOfName, namedEdgeRefs, figureRoles, edgeEnds, edgeRoles, revolveRoles, loftRoles, sweepRoles, endTangent, creaseOf } from "./facenames.mjs";
import { lumpsOf, lumpAt, lumpOf, lumpsByName, trackBodies, moveMarkers, box as boxOf, quickBox, solidKey } from "./bodies.mjs";

/** The imported solids scaled about the origin by `op.scale` and then placed: `op.place` "center" brings the middle of their box to the origin, "floor" brings the middle of the box to the z axis and the bottom to z = 0 (a part that sits on the build plate). */
function placedSolids(solids, op) {
  const k = Number(op.scale ?? 1);
  let out = solids;
  if (k !== 1) { if (!(k > 1e-6 && k < 1e4)) throw new Error("the scale of the import must be more than nothing"); out = out.map((x) => x.scale(k, [0, 0, 0])); }
  if (op.place === "center" || op.place === "floor") {
    const boxes = out.map(bounds);
    const [lo, hi] = [0, 1, 2].map((i) => [Math.min(...boxes.map((b) => b.min[i])), Math.max(...boxes.map((b) => b.max[i]))]).reduce((a, r) => [[...a[0], r[0]], [...a[1], r[1]]], [[], []]);
    const by = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, op.place === "floor" ? -lo[2] : -(lo[2] + hi[2]) / 2];
    out = out.map((x) => x.translate(by));
  }
  return out;
}

/** What an import makes: the solids beside the bodies already there (as a piece of its own each), or alone. */
function importedSolids(op, ctx, solids) {
  const target = op.target ? ctx.peek(op.target, "solid") : null;
  const all = [...(target ? target.shape.solids : []), ...solids];
  return { kind: "solid", shape: all.length === 1 ? all[0] : makeCompound(all), checked: true };
}

/**
 * A solid from a closed triangle mesh whose triangles all run the same way (counter-clockwise seen from outside): a face for each triangle, sewn into a shell and made a solid, then the neighbouring faces that lie in
 * one plane (and edges that run on in one line) are joined, so a flat face of the part is one face again. Throws with the reason when it does not make a valid solid.
 */
export function solidOfMesh(mesh) {
  const { vertices: v, triangles: t } = mesh;
  const at = (i) => [v[3 * i], v[3 * i + 1], v[3 * i + 2]];
  const faces = [];
  for (let i = 0; i < t.length; i += 3) faces.push(makePolygon([at(t[i]), at(t[i + 1]), at(t[i + 2])]));
  let solid = makeSolid(faces);
  try {
    const oc = getOC();
    const [r, gc] = localGC();
    const up = r(new oc.ShapeUpgrade_UnifySameDomain(solid.wrapped, true, true, false));
    up.Build();
    const joined = cast(up.Shape());
    gc();
    if ((joined.solids ?? []).length === 1 && isValidSolid(joined.solids[0])) solid = joined.solids[0];
  } catch { /* the triangles stay as faces: still a solid */ }
  if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("this mesh could not be made into a valid solid (its triangles do not close up cleanly)");
  return solid;
}

/**
 * A figure with figures inside it, carried along its normal by `h` while it turns `twist` degrees about the line through `origin`: one sweep for the figure and one for each hole, joined into a solid with the holes' walls turned
 * to face into the hole (the library's own joining leaves them the way of the outer wall, which gives a solid that measures as more than the figure, and that the validity check does not catch).
 */
function twistedSolid(outer, holes, h, twist, origin) {
  const sweep = (sk) => twistExtrude(sk.wire, twist, origin, new Vector(sk.defaultDirection).normalized().multiply(h), undefined, true);
  const [shell, start, end] = sweep(outer);
  const inner = holes.map(sweep);
  const reversed = inner.map(([sh]) => cast(sh.wrapped.Reversed()));
  const face = (outerWire, ws) => addHolesInFace(makeFace(outerWire), ws);
  return makeSolid([face(start, inner.map((x) => x[1])), shell, ...reversed, face(end, inner.map((x) => x[2]))]);
}

/** The solids in the text of a STEP file, in millimetres (the reader converts the file's own units); each is checked. Throws with the reason when there is none or one is not a valid solid. */
export function readStep(text) {
  if (!/^\s*ISO-10303-21/.test(text)) throw new Error("this is not a STEP file (it does not start with ISO-10303-21)");
  const oc = getOC();
  const [r, gc] = localGC();
  const file = `import-${Math.random().toString(36).slice(2)}.step`;
  oc.FS.writeFile(`/${file}`, new TextEncoder().encode(text));
  let shape;
  try {
    const reader = r(new oc.STEPControl_Reader());
    if (!reader.ReadFile(file)) throw new Error("the STEP file could not be read (it may be damaged, or not a version the kernel knows)");
    reader.TransferRoots();
    shape = cast(r(reader.OneShape()));
  } finally {
    try { oc.FS.unlink(`/${file}`); } catch { /* it was not written */ }
  }
  const solids = shape.solids ?? [];
  gc();
  if (!solids.length) throw new Error("this STEP file has no solid bodies in it (only surfaces or curves): the app imports solids");
  solids.forEach((sd, i) => { if (!isValidSolid(sd)) throw new Error(`body ${i + 1} of the STEP file is not a valid solid (it has gaps or folds)`); });
  return solids;
}

/** The solids in the text of a BREP file (OpenCASCADE's own format, also what FreeCAD keeps its shapes in), or in several, joined by a NUL: BREP has no unit, so the numbers are millimetres. Each is checked. Throws with the reason when there is none or one is not valid. */
export function readBrep(text) {
  const oc = getOC();
  const [r, gc] = localGC();
  const solids = [];
  let bad = 0;
  for (const part of String(text).split("\0")) {
    if (!part.trim()) continue;
    let shape;
    try { const raw = oc.BRepToolsWrapper.Read(part); if (raw.IsNull()) throw new Error("null"); shape = cast(r(raw)); } catch { bad++; continue; }
    solids.push(...(shape.solids ?? []));
  }
  gc();
  if (!solids.length) throw new Error(bad ? "this BREP data could not be read (it may be damaged)" : "this BREP data has no solid bodies in it (only surfaces or curves): the app imports solids");
  solids.forEach((sd, i) => { if (!isValidSolid(sd)) throw new Error(`body ${i + 1} of the BREP data is not a valid solid (it has gaps or folds)`); });
  return solids;
}

/** OCCT's own topology/geometry check. Operations can return garbage without throwing. */
export function isValidSolid(shape) {
  const oc = getOC();
  const analyzed = (sh) => { const a = new oc.BRepCheck_Analyzer(sh.wrapped, true, false); try { return a.IsValid(); } finally { a.delete(); } };
  // several bodies: a compound is valid when each of its solids is (the library checks each part of a compound on its own), so a solid that was found valid before (the same solid, found again by its identity) is not checked again,
  // and a new body costs what it is, not what all the others are (`dec_per_body_checks`)
  const type = oc.TopAbs_ShapeEnum ? shape.wrapped.ShapeType() : null;
  if (type === oc.TopAbs_ShapeEnum?.TopAbs_COMPOUND || type === oc.TopAbs_ShapeEnum?.TopAbs_SOLID) {
    const solids = shape.solids;
    if (solids.length > 1 || (solids.length === 1 && type === oc.TopAbs_ShapeEnum.TopAbs_SOLID)) {
      for (const s of solids) {
        const key = solidKey(s);
        if (validSolids.has(key)) continue;
        if (!(analyzed(s) && cavitiesInside(s))) return false;
        validSolids.add(key);
        while (validSolids.size > 200) validSolids.delete(validSolids.values().next().value);
      }
      return true;
    }
  }
  return analyzed(shape) && cavitiesInside(shape);
}
const validSolids = new Set(); // (the identities of solids that have passed the check)

/**
 * A hollow body's cavities lie inside its outer shell. The library's own check says a body is valid when its faces close up, even when a round or a bevel of a size larger than the wall has cut the
 * outer skin away past a cavity's corner and left the cavity sticking out through it (a chamfer of 1.7 mm on the corner of a hollow body with 0.5 mm walls). Each cavity (a shell inside the outer one)
 * must be wholly within the outer shell: the part of it that the outer shell holds is all of it.
 */
export function cavitiesInside(shape) {
  for (const solid of solidsOf(shape)) {
    const shells = shellsOf(solid);
    if (shells.length < 2) continue;
    let parts;
    try { parts = shells.map((sh) => { const s = makeSolid(facesOf(sh)); return { s, v: Math.abs(measureVolume(s)) }; }); } catch { continue; } // (a shell that does not close into a solid on its own: the check above has the say)
    const outer = parts.reduce((a, b) => (b.v > a.v ? b : a));
    for (const inner of parts) {
      if (inner === outer || !(inner.v > 1e-12)) continue;
      let held;
      try { held = Math.abs(measureVolume(outer.s.clone().intersect(inner.s.clone()))); } catch { continue; }
      if (Math.abs(held - inner.v) > 1e-6 * Math.max(inner.v, 1e-9) + 1e-9) return false;
    }
  }
  return true;
}

/**
 * Is what a fillet or a chamfer of `size` made of the selected edges (`set`: their hash codes) believable? A round takes material off a corner, or puts it in, and never more than about `size` squared
 * along the edge (a bevel of the legs `size` is half that, a round less); at the corners where edges meet there is a little more (`size` cubed). A body whose volume changed by far more than that is not
 * what the round makes: the kernel's round on a thin wall can come out "valid" and with the hollow of the body gone (a chamfer of 1.7 mm on a box with a 0.5 mm wall made by subtracting: 271 mm3 became 985).
 * The kernel carries a round on along the edges that continue the selected one smoothly (a rim, the edges of an arc), so the length counted is first that of the edges selected and, if that does not
 * hold the change, all the edges of the faces they bound (the most the round can follow).
 */
export function roundIsSane(before, after, size, set) {
  const [v0, v1] = [Math.abs(measureVolume(before)), Math.abs(measureVolume(after))];
  const room = (length) => 1.05 * size * size * (length + 2 * size) + 1e-9 * v0;
  const change = Math.abs(v1 - v0);
  const selected = edgesOf(before).filter((x) => set.has(x.hashCode));
  if (change <= room(selected.reduce((a, x) => a + x.length, 0))) return true;
  const seen = new Set();
  let around = 0;
  for (const f of facesOf(before)) {
    const edges = edgesOf(f);
    if (!edges.some((x) => set.has(x.hashCode))) continue;
    for (const x of edges) if (!seen.has(x.hashCode)) { seen.add(x.hashCode); around += x.length; }
  }
  return change <= room(around);
}

/**
 * Does a solid of `shape` that is not one of the solids of `before` pass through itself (`dec_self_crossing_check`, `in_500`)? The library's validity check does not say: a round larger than the wall of a hollow can leave the hollow sticking
 * out through the outer skin and the body is "valid". Each solid is meshed coarsely and its triangles looked at (`selfcross.mjs`); the first crossing is returned, as where it is, or null. A body of
 * more than `MAX_FACES_CHECKED` faces is not looked at (a body that large is a lot of work for a check, and nothing is lost by it but the check).
 */
const MAX_FACES_CHECKED = 600;
export function crossesItself(shape, before) {
  // (a solid the operation did not touch is the very same solid as before, copies of a shape share what they are made of: it was looked at when it was made, and a loft beside an edited block is not meshed again)
  const known = new Set(before ? solidsOf(before).map((s) => s.hashCode) : []);
  for (const solid of solidsOf(shape)) {
    if (known.has(solid.hashCode)) continue;
    const kept = solidKey(solid); // (a solid found to cross itself nowhere is not looked at again, however the steps round it change: a body rebuilt after an earlier step changed is the same solid)
    if (uncrossed.has(kept)) continue;
    if (facesOf(solid).length > MAX_FACES_CHECKED) continue;
    const [lo, hi] = solid.boundingBox.bounds;
    const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
    const tol = Math.max(0.005, diag * 0.003);
    const m = solid.mesh({ tolerance: tol, angularTolerance: 0.5 });
    getOC().BRepTools.Clean(solid.wrapped, true); // (the meshing leaves its triangles on the faces, which the shape is then checked and worked on with: they are taken off)
    const hit = findCrossing(m.vertices, m.triangles, 3 * tol + 1e-4 * diag);
    if (hit) return hit;
    uncrossed.add(kept);
    while (uncrossed.size > 200) uncrossed.delete(uncrossed.values().next().value);
  }
  return null;
}
const uncrossed = new Set(); // (the identities of solids that were looked at and cross themselves nowhere)

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

/** The face an operation names (`dec_stable_reference_mechanism`): by the name it carries when the body has names, else by the numbers it carries; a name the body no longer has is an error, not another face. */
function namedRef(op, ctx) {
  const name = op.ref?.name;
  if (!name) return op.ref;
  const names = op.target ? ctx.peek(op.target, "solid").faceNames : undefined;
  const found = refOfName(names, name);
  if (found) return found;
  if (!names) return op.ref; // (no names kept for this body: the numbers it carries)
  throw new Error(`face not found (${name} is not a face of the body any more)`);
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
    if (op.frame) return { kind: "sketch", drawing, plane: new Plane(op.frame.origin, op.frame.xDir, op.frame.normal), origin: undefined, sides: op.sides };
    return { kind: "sketch", drawing, plane: op.plane ?? "XY", origin: p("origin") ?? 0, sides: op.sides };
  },

  /**
   * A figure carried along a path of lines and arcs (`dec_sweep`, `in_444`): the profile (and the figures drawn inside it, cut out) stays as it is and is carried along the path's shape, wherever the path is (`in_459`); added to the body, cut from it, or a body of its own, as an extrusion is (`mode`).
   */
  sweep(op, ctx) {
    const { solid } = ownSolid(ctx, op, "sweep", [op.profile, ...(op.holes ?? [])], () => {
    const sketchOf = (id) => { const q = ctx.get(id, "sketch"); return q.drawing.sketchOnPlane(q.plane, q.origin); };
    const outer = sketchOf(op.profile);
    const endsOuter0 = edgeEnds(outer);
    const endsOuter = ctx.roleFigs ? endsOuter0 : null; // (the profile's edges, read before the sweep uses it up, for the names of its faces)
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
    if (ctx.roleFigs) { try { const last = segs[segs.length - 1]; ctx.roleFigs.set("sweep", sweepRoles(endsOuter, endTangent(last), last.b, true, ctx.get(op.profile, "sketch").sides, segs.length === 1 && !last.m ? Math.hypot(last.b[0] - last.a[0], last.b[1] - last.a[1], last.b[2] - last.a[2]) : 0)); } catch { ctx.roleFigs.set("sweep", []); } } // (`dec_stable_reference_mechanism`: the start cap and the end cap)
    // a profile that is not square to the path creases the sides where the path's curvature changes (`in_655`): said, with how much
    if (ctx.sweepNote && endsOuter0) {
      try {
        const pts = endsOuter0.edges.flatMap((q) => [q.a, q.b, ...(q.mid ? [q.mid] : [])]);
        const c = creaseOf(segs, pts, segs[0].a);
        if (c && c.deg >= 2) {
          const tilt = (Math.acos(Math.min(1, Math.abs(N[0] * c.T0[0] + N[1] * c.T0[1] + N[2] * c.T0[2]))) * 180) / Math.PI;
          ctx.sweepNote.note = `the shape is ${Math.round(tilt)}° off square to the path, so the sides crease by about ${Math.round(c.deg)}° where the path's curvature changes (the joint of its arcs): draw the shape square to the path, or give the path a curvature that changes smoothly, for a smooth sweep`;
        }
      } catch { /* no note */ }
    }
    const spine = assembleWire(segs.map((s) => (s.m ? makeThreePointArc(s.a, s.m, s.b) : makeLine(s.a, s.b))));
    const make = (sk) => {
      const solid = genericSweep(sk.wire, spine, { frenet: true, transitionMode: "right" });
      if (!isValidSolid(solid)) throw new Error("the shape could not be carried along that path (a path that bends tighter than the shape is wide folds it over itself)");
      return solid;
    };
    let solid = make(outer);
    for (const h of op.holes ?? []) solid = solid.cut(make(sketchOf(h)));
    if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("nothing was left of the sweep when its holes were cut");
      return { solid };
    });
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    if (!target) return { kind: "solid", shape: solid };
    if (op.mode === "cutOrAdd") {
      return { kind: "solid", shape: cutOrAdd(target, solid).shape };
    }
    if (op.mode === "new") return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]) };
    return { kind: "solid", shape: op.mode === "cut" ? cutFrom(target, solid) : fuseInto(target, solid) };
  },

  /** Sketches joined side to side (`dec_loft_sketches`): smooth through all of them, or ruled (straight between each two); holes are lofted the same way and cut out. */
  loft(op, ctx) {
    const { solid } = ownSolid(ctx, op, "loft", op.sections.flatMap((q) => [q.profile, ...(q.holes ?? [])]), () => {
    const sketchOf = (h) => {
      const q = ctx.get(h, "sketch");
      return typeof q.plane === "string" ? q.drawing.sketchOnPlane(q.plane, q.origin ?? 0) : q.drawing.sketchOnPlane(q.plane, q.origin);
    };
    const through = (ids, key, as = op) => {
      const sk = ids.map(sketchOf);
      // a worm wheel (`op.matched`): only its two end faces are named by their roles; its thousand flank faces get the names of new faces (the gear is one feature, `dec_gear_feature`, and the roles of a thousand sides cost 1 s of a 100 tooth wheel: a box for each side, every face looked against every box)
      if (ctx.roleFigs) { try { ctx.roleFigs.set(key, op.matched ? loftRoles([0, ids.length - 1].map((k) => ({ ends: edgeEnds(sk[k]), sides: [] })), key === "main", false, true) : loftRoles(ids.map((id, k) => ({ ends: edgeEnds(sk[k]), sides: ctx.get(id, "sketch").sides })), key === "main", !!op.smooth)); } catch { ctx.roleFigs.set(key, []); } } // (the roles of its faces by the sketches' own edges, read before they are used up: `dec_stable_reference_mechanism`)
      // sections that are known to match edge for edge (a worm wheel's: one gap turned, `op.matched`) need not be checked for it: that check is the larger half of the loft's time (100 teeth: 7.3 s to 3.7 s, the same solid to every digit)
      const made = as.matched && as.smooth ? matchedLoft(sk) : as.maxDegree && as.smooth ? limitedLoft(sk, as.maxDegree) : sk[0].loftWith(sk.slice(1), { ruled: !as.smooth });
      // a smooth loft through many sections can leave an edge whose 3D curve and whose curves on its two faces do not run at the same pace; the validity check refuses the whole solid for that (a wheel of 24 teeth was refused, one of 40 was not), though the
      // solid is whole and has the same volume to every digit. Making the edges run at the same pace again (`BRepLib.SameParameter`) is what the check asks for.
      if (op.smooth) getOC().BRepLib.SameParameter(made.wrapped, 1e-5, false);
      return made;
    };
    let solid = through(op.sections.map((s) => s.profile), "main");
    let whole = isValidSolid(solid);
    if (!whole && op.matched) { solid = through(op.sections.map((s) => s.profile), "main", { ...op, matched: false }); whole = isValidSolid(solid); } // (the sections were not as matched as said: the checked loft)
    if (!whole) throw new Error("the loft could not be made through those sketches (try turning an outline round with its start point, or reverse one)");
    const holes = op.sections[0].holes?.length ?? 0;
    for (let i = 0; i < holes; i++) solid = solid.cut(through(op.sections.map((s) => s.holes[i]), `hole${i}`));
    if (holes && (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9))) throw new Error("nothing was left of the loft when its holes were cut"); // (a loft without holes was found valid just above, and its volume is measured when it is described: measuring it here too was 0.35 s of a 100 tooth wheel)
      return { solid };
    });
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    const trusted = op.trusted ? { noCross: true } : {}; // (a gear's loft is made from sections worked out from the gear's numbers, which do not cross: the self-crossing check, a mesh and a search of two seconds for a worm wheel, is left out, `in_869`)
    if (!target) return { kind: "solid", shape: solid, ...trusted };
    if (op.mode === "cutOrAdd") {
      return { kind: "solid", shape: cutOrAdd(target, solid).shape };
    }
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true, ...trusted }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    return { kind: "solid", shape: op.mode === "cut" ? cutFrom(target, solid) : fuseInto(target, solid) };
  },

  /** The solids of a STEP file, as bodies of their own beside the ones already there (`dec_import`): read here, on this thread, from the text kept in the step. A file with no solid in it (only surfaces or curves) is refused with that. */
  import(op, ctx) {
    return importedSolids(op, ctx, placedSolids(op.format === "brep" ? readBrep(unpack(op.data)) : op.format === "iges" ? readIgesSolids(unpack(op.data), isValidSolid) : readStep(unpack(op.data)), op));
  },
  /** The closed meshes of a step (`dec_import_mesh`): each is sewn into a solid whose faces are its triangles, the flat ones that lie in one plane joined, as a body of its own beside the ones already there. */
  importMesh(op, ctx) {
    return importedSolids(op, ctx, String(op.data).split("|").filter(Boolean).map((m) => solidOfMesh(decodeMesh(m))));
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
      const sk0 = sketch(profile);
      const ends0 = ctx.roleFigs && !ctx.roleFigs.has(profile) ? edgeEnds(sk0) : null; // (the sketch is used up by the extrusion: its edges are read first)
      // a slanted extrusion (`op.slant`, `in_783`): sideways by this much for each mm of depth, in the sketch's own x and y (a helical rack: its section slid along the rack)
      const lean = op.slant && (op.slant[0] || op.slant[1]) ? { extrusionDirection: [op.slant[0], op.slant[1], 1] } : undefined;
      const reach = lean ? Math.hypot(op.slant[0], op.slant[1], 1) : 1;
      let solid = lean ? sk0.extrude((d + dir * back) * reach, lean) : sk0.extrude(d + dir * back);
      if (ctx.roleFigs && !ctx.roleFigs.has(profile)) ctx.roleFigs.set(profile, safeRoles(ends0, d, ctx.get(profile, "sketch").sides, profile === op.profile)); // (the roles of its faces by the sketch's own edges, worked out from the prism made here: `dec_stable_reference_mechanism`)
      for (const h of holes ?? []) { const skh = sketch(h); const endsH = ctx.roleFigs && !ctx.roleFigs.has(h) ? edgeEnds(skh) : null; const sh = lean ? skh.extrude((d + dir * back) * reach, lean) : skh.extrude(d + dir * back); if (endsH) ctx.roleFigs.set(h, safeRoles(endsH, d, ctx.get(h, "sketch").sides, false)); solid = solid.cut(sh); } // figures drawn inside this one are holes in it
      return solid;
    };
    const toolOf = (back) => {
      // the body's own solid, kept under a key that is its sketches' and its depth, not the steps before it: a change to an earlier step (another gear) leaves this body the very same solid, so everything that is kept for a solid
      // (its validity, its mesh, the details of its faces) is found again, and it is not built again (`dec_per_body_checks`). The roles of its faces by its sketches' own edges are kept with it.
      const ids = [op.profile, ...(op.holes ?? []), ...(op.also ?? []).flatMap((f) => [f.profile, ...(f.holes ?? [])])];
      const ownKey = ids.every((i) => ctx.keyOf?.(i)) ? fingerprint(JSON.stringify(["prism", back, dist, op.slant ?? null, ctx.params, op.profile, op.holes ?? [], op.also ?? [], ids.map((i) => ctx.keyOf(i))])) : null;
      const kept = ownKey ? prisms.get(ownKey) : null;
      if (kept && (!ctx.roleFigs || kept.roles)) {
        prisms.delete(ownKey); prisms.set(ownKey, kept);
        if (ctx.roleFigs) for (const [k, v] of kept.roles) if (!ctx.roleFigs.has(k)) ctx.roleFigs.set(k, v);
        kernelStats.prismsReused++;
        return kept.solid;
      }
      kernelStats.prismsBuilt++;
      const had = new Set(ctx.roleFigs ? ctx.roleFigs.keys() : []);
      let sld = prism(op.profile, op.holes, dist, back);
      for (const f of op.also ?? []) sld = sld.fuse(prism(f.profile, f.holes, f.distance === undefined ? dist : resolve(f.distance, ctx.params), back)); // siblings extruded together (each may have a depth of its own, `in_351`)
      if (ownKey) {
        prisms.set(ownKey, { solid: sld, roles: ctx.roleFigs ? [...ctx.roleFigs.entries()].filter(([k]) => !had.has(k)) : null });
        keepWithin(prisms, ownKey, sld);
      }
      return sld;
    };
    let solid = toolOf(0);
    const targetValue = op.target ? (op.mode === "new" ? ctx.peek(op.target, "solid") : ctx.get(op.target, "solid")) : null; // (a piece of its own stands beside the body: no copy of it is needed)
    const target = targetValue ? targetValue.shape : null;
    if (!target) return { kind: "solid", shape: solid };
    // (only when the plane is on the boundary of the body: with material just behind it, as a hole begun inside the body under a skin, the tool begins where it was drawn)
    const cuts = op.mode === "cut" || op.mode === "cutOrAdd"; // (a piece added or of its own needs no start behind the plane, and the test costs a boolean on the whole body)
    const behind = !cuts || (() => { try { const slab = prism(op.profile, op.holes, dist < 0 ? BACK : -BACK, 0); const met = partMet(target, slab); return !!met && !apartFrom(met, slab) && measureVolume(met.clone().intersect(slab.clone())) > 0.5 * measureVolume(slab); } catch { return false; } })(); // (mostly body in a slab behind the plane)
    const back = behind ? 0 : BACK;
    if (op.mode === "cutOrAdd") {
      // a figure pulled backwards: a pocket when it meets the body (drawn on a face and pushed in); drawn out in the open it is a new piece, not a cut that does nothing
      if (runsInto(target, solid)) { // (it runs into a body: the cut is tried on the bodies it meets, and the others are left as they are)
        const tool = toolOf(back);
        const r = cutOrAdd(target, tool);
        if (r.cut) return { kind: "solid", shape: r.shape, used: "cut", cutInto: cutInto(targetValue, tool) };
      }
      return joined(target, solid);
    }
    // "new" (`in_295`): a piece that stood apart when it was made stays a body of its own, however the others grow later: no join, one compound
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    if (op.mode === "cut") { const tool = toolOf(back); return { kind: "solid", shape: cutFrom(target, tool.clone()), cutInto: cutInto(targetValue, tool) }; }
    return { kind: "solid", shape: fuseInto(target, solid) };
  },

  /**
   * Revolve a figure about an axis in its own plane, through `angle` degrees (any size, either way) while it advances `advance` mm along the axis over the whole angle (`dec_spiral_extrude`, `in_427`):
   * a ring or a bowl with no advance (at most one turn: more would lie on itself), a screw thread or a spring with one. Added to the body, cut from it, or a body of its own, as an extrusion is (`mode`).
   */
  revolve(op, ctx) {
    const { solid, twisted } = ownSolid(ctx, op, "revolve", [op.profile, ...(op.holes ?? [])], () => {    const angle = resolve(op.angle, ctx.params);
    const advance = resolve(op.advance ?? 0, ctx.params);
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-6) throw new Error("the turn must be more than nothing");
    const A = op.axis.p;
    const D = (() => { const l = Math.hypot(...op.axis.d); return op.axis.d.map((x) => x / l); })();
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    // the figure and the figures drawn inside it (holes), each a sketch in the same plane
    const sketchOf = (id) => {
      const q = ctx.get(id, "sketch");
      const sk = q.drawing.sketchOnPlane(q.plane, q.origin);
      if (ctx.roleFigs && !ctx.roleFigs.has(id)) { try { ctx.roleFigs.set(id, revolveRoles(edgeEnds(sk), A, D, angle, advance, q.sides, id === op.profile)); } catch { ctx.roleFigs.set(id, []); } } // (the roles of its faces by the profile's own edges, read before the figure is made: `dec_stable_reference_mechanism`)
      return sk;
    };
    const outerSketch = sketchOf(op.profile);
    const face = outerSketch.face();
    const pn = face.normalAt();
    const N = [pn.x, pn.y, pn.z];
    const pts = [];
    for (const e of edgesOf(face)) for (const t of [0, 0.5, 1]) { const q = e.pointAt(t); pts.push([q.x, q.y, q.z]); }
    // what is made of one figure (the outer one, then each hole): the same turn for all, so the holes are cut from the figure
    let make, twistAll = null, twisted = false;
    if (Math.abs(Math.abs(dot(N, D)) - 1) < 1e-6) {
      // the axis is the plane's normal: the figure is carried along it by `advance` while it turns about it, a twisted extrusion (a bar turned into an auger, a lobed section into a screw); the axis may stand off the figure (a coil)
      if (Math.abs(advance) < 1e-9) throw new Error("a twist needs a distance to be carried along the axis");
      const dd = outerSketch.defaultDirection; // (the way the sketch is carried: a circle's is not always its face's normal, so a ring's wall would be carried the wrong way, `in_697`)
      const sgn = dot([dd.x, dd.y, dd.z], D) > 0 ? 1 : -1;
      const v0 = pts[0];
      const o = sub(A, N.map((x) => x * dot(sub(A, v0), N))); // (the axis where it meets the figure's plane)
      const h = advance * sgn; // (the distance along the plane's normal)
      const twist = angle * sgn * (h > 0 ? 1 : -1); // (counter-clockwise about the axis whichever way it points and the figure is carried)
      make = (sk) => sk.extrude(h, { twistAngle: twist, origin: o });
      // the figure and the figures inside it are one sweep (a hole is part of the profile, not a second sweep and a cut: `dec_speed_rules`); every layer is the figure turned at its own height, so the body cannot cross itself
      twistAll = (outer, holes) => twistedSolid(outer, holes, h, twist, o);
      twisted = true;
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
    let solid;
    if (twistAll) solid = twistAll(outerSketch, (op.holes ?? []).map(sketchOf));
    else solid = make(outerSketch);
    // (the figure itself came out empty or inside out: said by what was asked, not as if holes had cut it away, `in_649`)
    if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) {
      if (twisted) throw new Error(op.holes?.length ? "nothing was left of the figure when its holes were cut" : "the twist could not be made at this size");
      const r2 = (v) => Math.round(v * 100) / 100;
      throw new Error(Math.abs(advance) > 1e-9
        ? `the kernel could not make a spiral of ${r2(angle)}° with an advance of ${r2(advance)} mm: it fails for some pairs of turn and advance, and a small change to either (a little more advance, or a little more or less turn) usually makes it`
        : `the kernel could not turn the figure ${r2(angle)}° about that line (a line that touches or cuts across the figure can do this: move the line off it, or change the angle)`);
    }
    if (!twistAll) {
      for (const h of op.holes ?? []) solid = solid.cut(make(sketchOf(h)));
      if (!isValidSolid(solid) || !(measureVolume(solid) > 1e-9)) throw new Error("nothing was left of the figure when its holes were cut");
    }
      return { solid, twisted };
    });
    const targetValue = op.target ? (op.mode === "new" ? ctx.peek(op.target, "solid") : ctx.get(op.target, "solid")) : null; // (a piece of its own stands beside the body: no copy of it is needed)
    const target = targetValue ? targetValue.shape : null;
    if (!target) return { kind: "solid", shape: solid, checked: true, ...(twisted ? { noCross: true } : {}) }; // (checked just above; a twist cannot cross itself)
    if (op.mode === "cutOrAdd") {
      const r = cutOrAdd(target, solid);
      return r.cut ? { kind: "solid", shape: r.shape, used: "cut", cutInto: cutInto(targetValue, solid) } : { kind: "solid", shape: r.shape, used: r.used };
    }
    if (op.mode === "new") { if (!isValidSolid(solid)) throw new Error("kernel returned an invalid solid"); return { kind: "solid", shape: makeCompound([...target.solids, ...(solid.solids ?? [solid])]), checked: true }; } // (the bodies it stands beside were checked when they were made: only the new piece is)
    if (op.mode === "cut") return { kind: "solid", shape: cutFrom(target, solid.clone()), cutInto: cutInto(targetValue, solid) };
    return { kind: "solid", shape: fuseInto(target, solid) };
  },

  /**
   * Push or pull a flat face of the target. ref = { axis, sign, offset, point } finds the face (flat, facing sign*axis, at that offset,
   * its box containing the point). Pulling out adds the prism the face sweeps; pushing in cuts it.
   */
  faceExtrude(op, ctx) {
    const t = stage("copying the body it works on", () => ctx.get(op.target, "solid").shape);
    const dist = resolve(op.distance, ctx.params);
    const best = stage("finding the face", () => findFace(t, namedRef(op, ctx)));
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
    const best = findFace(t, namedRef(op, ctx));
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
    const best = findFace(t, namedRef(op, ctx));
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

  /**
   * The bodies of chains that were made apart, standing beside each other (`dec_gear_islands`): the target's and each of `others`'. What a gear is made of is its own numbers, so its steps are a chain of their own and do not depend on the gears before it
   * (deleting or changing one gear did not make the next ones again); here they meet. A chain that failed is left out (its own step says why). Nothing is worked out: the solids are put in one compound.
   */
  join(op, ctx) {
    const solids = [];
    for (const id of [op.target, ...(op.others ?? [])]) {
      let v;
      try { v = ctx.peek(id, "solid"); } catch { continue; }
      solids.push(...(v.shape.solids ?? [v.shape]));
    }
    if (!solids.length) throw new Error("none of the chains that were to be joined has a body");
    return { kind: "solid", shape: solids.length === 1 ? solids[0] : makeCompound(solids), checked: true, noCross: true };
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
    const refs = namedEdgeRefs(ctx.peek(op.target, "solid").edgeNames, [].concat(op.ref));
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
          if (!roundIsSane(t, two, Math.max(size, second), set)) throw new Error("kernel returned an invalid solid");
          return two;
        }
        if (!rel && stage("is a rim rounded past its end", () => rimCapped(t, set, size, op.mode))) throw new Error("the region makes this round (a rim rounded by more than the face or the wall it runs on)");
        const made = stage("the kernel's round", () => op.mode === "chamfer" ? t.chamfer(size, pick) : rel && rel.length > 2 ? lawFillet(t, set, stationsFor(size)) : t.fillet(rel ? [size, size * rel[1][1]] : size, pick));
        if (!stage("checking the round", () => isValidSolid(made))) throw new Error("kernel returned an invalid solid"); // (a size the faces cannot take can come out as a broken solid, not an exception)
        const reach = Math.max(size, rel ? size * Math.max(...rel.map(([, r]) => r)) : 0);
        if (!stage("checking the round's size", () => roundIsSane(t, made, reach, set))) throw new Error("kernel returned an invalid solid"); // (more taken or added than a round of this size can: the hollow of a thin body gone)
        if (stage("checking the round's volume", () => Math.abs(measureVolume(made) - measureVolume(t)) < 1e-9 * measureVolume(t))) throw new Error("the kernel made nothing of it"); // (a size it cannot take can come out as the body unchanged)
        if (stage("checking the round does not cross itself", () => crossesItself(made, t))) throw new Error("kernel returned an invalid solid"); // (the hollow of a thin body sticking out through the round)
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
          const hit = resolveEdges(base, last ? list : namedEdgeRefs(ctx.peek(op.together.base, "solid").edgeNames, [].concat(m.ref)));
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
    if (op.mode === "placed") {
      // the copies of a body repeated along a path (`dec_path_repeat`): each place is given (a turn about a point first, if there is one, then a move); the body is at the first place itself
      if (op.places.length + 1 > 200) throw new Error("that is more than 200 copies");
      const copies = [out];
      for (const q of op.places) { let c = t.clone(); if (q.turn) c = c.rotate(q.turn.angle, q.turn.pivot, q.turn.dir); copies.push(c.translate(q.move)); }
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
    const was = one ? quickBox(t) : undefined; // (where the body stood: the names of its faces move with it and no other body's do, `in_999`)
    // (a move by a vector, from dragging the body free, `in_291`: `op.vec`; else along one axis)
    if (op.mode === "move") { const by = op.vec ?? axis.map((a) => a * v); return { kind: "solid", shape: again(t.translate(by)), tf: { mode: "move", axis: op.axis, v, vec: op.vec, only, box: was } }; }
    if (op.mode === "rotate") { const pivot = op.pivot ?? middle(); const about = op.dir ?? axis; return { kind: "solid", shape: again(t.rotate(v, pivot, about)), tf: { mode: "rotate", axis: op.axis, dir: op.dir, v, pivot, only, box: was } }; } // (`op.dir`: a turn about any axis, `in_417`)
    if (op.mode === "scale") {
      if (!(v > 1e-6)) throw new Error("scale must be positive");
      // (a body made a hundred metres long or more is a slip of the keys, and the kernel does not come back from meshing it: `in_255`)
      if (v > 100) { const b = bounds(t); if (Math.max(...[0, 1, 2].map((i) => b.max[i] - b.min[i])) * v > 1e5) throw new Error("that scale would make the body more than 100 metres long"); }
      const pivot = op.pivot ?? middle();
      return { kind: "solid", shape: again(t.scale(v, pivot)), tf: { mode: "scale", axis: 0, v, pivot, only, box: was } };
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
      if (op.skip && op.skip.length) { const gone = new Set(op.skip); result = result.filter((_, i) => !gone.has(i)); if (!result.length && !found.rest.length) throw new Error("nothing would be left of the parts chosen"); } // (a part of the result that was deleted since: its number in the result, `in_1320`)
      return { kind: "solid", shape: makeCompound([...found.rest, ...result]), first: op.bodies[0] };
    }
    // a subtraction can cut several bodies at once (`in_1337`): the first `targets` bodies are each cut by all the others, which are the tools
    const nt = op.mode === "subtract" ? Math.max(1, Math.min(op.targets ?? 1, found.picked.length - 1)) : 1;
    const [first, ...others] = op.mode === "subtract" ? found.picked.slice(nt - 1) : found.picked;
    const targets = op.mode === "subtract" ? found.picked.slice(0, nt - 1) : [];
    const tools = op.mode === "subtract" ? found.picked.slice(nt) : others;
    const toolNames = op.mode === "subtract" ? op.bodies.slice(nt) : op.bodies.slice(1);
    const drop = new Set(op.drop ?? []); // (tools that were kept but have been deleted since: the cut they made stays, they do not, `in_436`)
    const kept = op.keep && op.mode !== "add" ? tools.filter((_, i) => !drop.has(toolNames[i])).map((o) => o.clone()) : []; // (a boolean uses up what it is given: the tools that stay are copied first)
    let made = first;
    if (op.mode === "subtract") {
      const cutters = tools.map((o) => o.clone());
      const cutAll = (b) => { let r = b; for (const o of cutters) r = r.cut(o.clone()); return r; };
      const done = [...targets.map(cutAll), cutAll(first)];
      const lumps = done.flatMap((d) => lumpsOf(d));
      if (!lumps.length) throw new Error("nothing would be left of the body");
      return { kind: "solid", shape: makeCompound([...found.rest, ...lumps, ...kept]), first: op.bodies[0] };
    }
    for (const o of others) made = op.mode === "intersect" ? made.intersect(o) : made.fuse(o, op.glue && op.mode === "add" ? { optimisation: "commonFace" } : {});
    const parts = lumpsOf(made);
    if (!parts.length) throw new Error(op.mode === "intersect" ? "those bodies have nothing in common" : "nothing would be left of the body");
    if (op.mode === "add" && parts.length > 1) throw new Error("those bodies do not touch or overlap, so they cannot become one body");
    return { kind: "solid", shape: makeCompound([...found.rest, ...parts, ...kept]), first: op.bodies[0] };
  },

  /**
   * Bodies that meet along flat faces joined into one without a boolean (`in_869`): every flat face across `axis` at one of `heights` (measured from `origin` along it) is left out of each body, and the faces that are left of all of them
   * are sewn into one solid, named as the first body is (the pieces of a worm wheel and its lands: their end faces are the same outline, drawn from the same sketch, and the fuse of them took eleven seconds).
   */
  sewBodies(op, ctx) {
    const t = ctx.get(op.target, "solid");
    const found = lumpsByName(t.shape, t.markers ?? [], op.bodies);
    if (!found || found.picked.length < 2) throw new Error("select two or more bodies (one of them is not there any more)");
    const l = Math.hypot(...op.axis) || 1, n = op.axis.map((x) => x / l);
    const faces = [];
    for (const lump of found.picked) for (const f of facesOf(lump)) {
      if (f.geomType === "PLANE") {
        const [c, nm] = [f.center, f.normalAt()];
        const h = (c.x - op.origin[0]) * n[0] + (c.y - op.origin[1]) * n[1] + (c.z - op.origin[2]) * n[2];
        const across = Math.abs(nm.x * n[0] + nm.y * n[1] + nm.z * n[2]);
        if (across > 1 - 1e-6 && op.heights.some((x) => Math.abs(h - x) < 1e-5)) continue;
      }
      faces.push(f);
    }
    const solid = makeSolid(faces);
    if (!isValidSolid(solid) || !(volume(solid) > 1e-9)) throw new Error("those pieces could not be joined into one body");
    return { kind: "solid", shape: makeCompound([...found.rest, solid]), first: op.bodies[0], checked: true, noCross: true };
  },

  /**
   * A gear body with the whole perimeter of both faces chamfered (`in_866`, `prototypes/perimeter-chamfer`): the outline inset by `edge` at the bottom face (height 0, along `axis` from `origin`), the full outline `edge` up, the full outline `edge` below
   * the top face (`width`) and the inset outline at the top face, joined by ruled lofts (between lines a plane, between arcs about the same axis a cone); a bore is a circle of radius bore/2 + edge at each face and bore/2 between, a ring's wall
   * (`wall` > 0, the hole being the outline) a circle of radius wall - edge at each face and wall between. The shells of the two lofts, the hole's turned inside out, and the two flat ends are sewn into one solid: no boolean on the gear.
   * `full` and `inset`: the outlines as `x y bulge` of each side joined by `;`, in the gear's own x and y (tooth 0 along `first`); a piece of its own beside the other bodies.
   */
  chamferBody(op, ctx) {
    const c = op.edge, W = op.width;
    const n = (() => { const l = Math.hypot(...op.axis) || 1; return op.axis.map((x) => x / l); })();
    const u = (() => { const l = Math.hypot(...op.first) || 1; return op.first.map((x) => x / l); })();
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const v = cr(n, u);
    const at = (x, y, h) => [0, 1, 2].map((i) => op.origin[i] + u[i] * x + v[i] * y + n[i] * h);
    const parse = (text) => text.split(";").filter(Boolean).map((s) => s.split(" ").map(Number));
    const wireOf = (pts, h) => assembleWire(pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length], k = a[2];
      if (!k) return makeLine(at(a[0], a[1], h), at(b[0], b[1], h));
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      return makeThreePointArc(at(a[0], a[1], h), at((a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k, h), at(b[0], b[1], h));
    }));
    const circle = (r, h) => assembleWire([makeCircle(r, at(0, 0, h), n)]);
    const [full, inset] = [parse(op.full), parse(op.inset)];
    // `one`: 1 chamfers only the top face and -1 only the bottom one (a worm wheel's land: its other face is where it joins the throated part, `in_935`); 0 both
    const one = op.one ?? 0;
    const [botC, topC] = [one <= 0, one >= 0];
    const marks = [...(botC ? [[0, true], [c, false]] : [[0, false]]), ...(topC ? [[W - c, false], [W, true]] : [[W, false]])]; // (the height of each section and whether it is the inset one)
    const heights = marks.map((m) => m[0]);
    const sections = marks.map((m) => (m[1] ? inset : full));
    const last = heights.length - 1;
    const ring = op.wall > 0;
    const outer = ring ? loft(marks.map((m, i) => circle(m[1] ? op.wall - c : op.wall, heights[i])), { ruled: true }, true) : loft(sections.map((s, i) => wireOf(s, heights[i])), { ruled: true }, true);
    const holes = ring ? sections.map((s, i) => wireOf(s, heights[i])) : op.bore > 0 ? marks.map((m, i) => circle(op.bore / 2 + (m[1] ? c : 0), heights[i])) : null;
    const capOuter = (k) => (ring ? circle(marks[k][1] ? op.wall - c : op.wall, heights[k]) : wireOf(sections[k], heights[k]));
    const faces = [outer];
    if (holes) {
      const inner = loft(holes, { ruled: true }, true);
      faces.push(cast(inner.wrapped.Reversed()));
      for (const k of [0, last]) faces.push(addHolesInFace(makeFace(capOuter(k)), [ring ? wireOf(sections[k], heights[k]) : holes[k]]));
    } else for (const k of [0, last]) faces.push(makeFace(capOuter(k)));
    const solid = makeSolid(faces);
    if (!isValidSolid(solid) || !(volume(solid) > 1e-9)) throw new Error("the edge chamfer could not be made at this size: a smaller chamfer");
    const targetValue = op.target ? ctx.peek(op.target, "solid") : null;
    const target = targetValue ? targetValue.shape : null;
    if (!target) return { kind: "solid", shape: solid, checked: true, noCross: true };
    return { kind: "solid", shape: makeCompound([...target.solids, solid]), checked: true };
  },

  /**
   * The tips of a gear's teeth broken at its two faces (`in_859`): at each tooth and each face one flat wedge is cut off, a plane at 45 degrees from `depth` inside the tip circle at the face to the tip circle `depth` in. The wedges are
   * made in one go and cut in one boolean; a flat cut meets a flank (a cylinder) in a curve the kernel knows exactly, where the turned cone it replaces had to be found by marching, which took 10 times as long. `first` is the direction of
   * tooth 0, `axis` the gear's axis from its first face (at `centre`) towards its second, `twist` how far the teeth at the second face are turned from those at the first (a helical gear), `side` +1 for an outside gear and -1 for a ring.
   */
  toothChamfer(op, ctx) {
    const t = ctx.get(op.target, "solid");
    const found = (t.markers?.length ?? 0) > 1 ? lumpsByName(t.shape, t.markers, [op.body]) : null;
    const body = found ? found.picked[0] : t.shape;
    const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
    const n = norm(op.axis), u0 = norm(op.first);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const turn = (v, a) => { const c = Math.cos(a), s = Math.sin(a), w = cross(n, v), d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2]; return [0, 1, 2].map((i) => v[i] * c + w[i] * s + n[i] * d * (1 - c)); };
    const [z, tip, c, W, s] = [op.teeth, op.tip, op.depth, op.width, op.side];
    const wt = (Math.PI * tip) / z; // (half a pitch at the tip circle: the wedges of neighbours meet and no more)
    const pieces = [];
    for (let k = 0; k < z; k++) {
      for (const top of [false, true]) {
        const x = turn(u0, (2 * Math.PI * k) / z + (top ? op.twist : 0)); // (the tooth's direction at this face)
        const tang = cross(x, n);
        const o = [0, 1, 2].map((i) => op.centre[i] - wt * tang[i]);
        const r = (v) => tip + s * v; // (v from the tip, away from the material)
        const h = (v) => (top ? W - v : v);
        const wedge = draw([r(-c - 1), h(-1)]).lineTo([r(1), h(c + 1)]).lineTo([r(1), h(-1)]).close();
        pieces.push(wedge.sketchOnPlane(new Plane(o, x, tang)).extrude(2 * wt));
      }
    }
    const made = body.cut(makeCompound(pieces));
    return { kind: "solid", shape: found ? makeCompound([...found.rest, ...lumpsOf(made)]) : made, first: op.body };
  },

  /**
   * The edges of the two end faces of a gear's body chamfered by the kernel (`in_924`): the faces across `axis`, the first at `centre` and the second `width` along it. With `tipDir` and `tip`, only the edges that lie along the tips of the
   * teeth (all their points `tip` from `centre` in that direction: a rack's). The kernel's chamfer takes a time that grows faster than the number of faces (`prototypes/perimeter-chamfer`): it is for a few teeth (a rack), or the wheel's end faces.
   */
  chamferEnds(op, ctx) {
    const t = ctx.get(op.target, "solid");
    const found = (t.markers?.length ?? 0) > 1 ? lumpsByName(t.shape, t.markers, [op.body]) : null;
    const body = found ? found.picked[0] : t.shape;
    const l = Math.hypot(...op.axis) || 1;
    const n = op.axis.map((x) => x / l);
    const along = (p, d) => (p.x - op.centre[0]) * d[0] + (p.y - op.centre[1]) * d[1] + (p.z - op.centre[2]) * d[2];
    const td = op.tipDir ? (() => { const m = Math.hypot(...op.tipDir) || 1; return op.tipDir.map((x) => x / m); })() : null;
    const wanted = (e) => {
      const pts = [e.startPoint, e.endPoint];
      if (!(pts.every((p) => Math.abs(along(p, n)) < 1e-3) || pts.every((p) => Math.abs(along(p, n) - op.width) < 1e-3))) return false;
      return !td || pts.every((p) => Math.abs(along(p, td) - op.tip) < 1e-3);
    };
    const made = body.chamfer(op.size, (ef) => ef.when(({ element }) => wanted(element)));
    if (!isValidSolid(made) || !(measureVolume(made) > 1e-9) || measureVolume(made) >= measureVolume(body)) throw new Error("the kernel could not chamfer the edges of the faces");
    return { kind: "solid", shape: found ? makeCompound([...found.rest, ...lumpsOf(made)]) : made, first: op.body };
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
    const offset = thickSolidChecked(t, open, th);
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

/**
 * The bodies of `target` whose box meets the box of `solid`, and the others, which it does not touch (`dec_per_body_checks`): a boolean with a piece works on the bodies it meets and leaves the rest as they are, the very same solids, so what
 * is kept for them is found again and a piece put beside five bodies is not fused with all five. Null when it meets all of them (the whole shape is the part) or the shape has no body.
 */
const NEAR = 1e-4;
function touching(target, solid) {
  const lumps = target.solids;
  if (!lumps.length) return null;
  const nb = boxOf(solid);
  const [hit, rest] = [[], []];
  for (const l of lumps) { const b = boxOf(l); ([0, 1, 2].some((i) => nb.min[i] > b.max[i] + NEAR || nb.max[i] < b.min[i] - NEAR) ? rest : hit).push(l); }
  if (rest.length) kernelStats.partialBooleans++;
  return rest.length ? { hit, rest } : null;
}
/** The part of `target` a boolean with `solid` works on: the bodies it meets (one, or a compound of them), the whole shape when it meets all, or null when it meets none. */
function partMet(target, solid) {
  const t = touching(target, solid);
  if (!t) return target;
  return t.hit.length ? (t.hit.length === 1 ? t.hit[0] : makeCompound(t.hit)) : null;
}
/** Whether the box of `solid` runs into the box of any body of `target` (not just touches it): only then is a cut tried for a figure pulled backwards (`in_295`). */
function runsInto(target, solid) {
  const nb = boxOf(solid);
  return target.solids.some((l) => { const b = boxOf(l); return [0, 1, 2].every((i) => nb.min[i] < b.max[i] - 1e-6 && nb.max[i] > b.min[i] + 1e-6); });
}
/** What a boolean on the part gave, put back with the bodies it did not touch. */
const putBack = (rest, done) => makeCompound([...rest, ...(done.solids ?? [done])]);
/**
 * What a boolean gave for these bodies and this piece, kept by the identity of each (`dec_per_body_checks`): a step that comes after a change to an earlier body finds the bodies it works on as they were (the same solids) and is
 * not worked out again; a worm's thread added to its core is the same boolean however many worms were changed before it.
 */
const booleans = new Map();
function keptBoolean(kind, lumps, tool, make) {
  const key = `${kind}|${lumps.map(solidKey).join(",")}|${solidKey(tool)}`;
  if (booleans.has(key)) { const hit = booleans.get(key); booleans.delete(key); booleans.set(key, hit); kernelStats.booleansKept++; return hit; }
  const made = make();
  booleans.set(key, made);
  keepWithin(booleans, key, made);
  return made;
}
/**
 * Whether two shapes are certainly apart: their surfaces meet nowhere (no point or curve of one is on the other), and neither lies in the box of the other so that one could be inside the other. Exact where it says yes; any doubt (touching,
 * a failed section, a box inside a box) says no and the real boolean is made. A figure drawn beside a body in the open, or over it with clearance (an arm round a pin), is apart: the boolean would give the two as they stand, and costs
 * as much as the whole body has faces (`in_1064`).
 */
const apartKept = new Map();
let apartOk = false; // (set while a marked preview of an extrusion is made: the made shape then has the pieces beside each other, whose edges are not those the boolean leaves, so a step made for good is not given it)
function apartFrom(a, b) {
  if (!apartOk) return false;
  const key = `${(a.solids ?? [a]).map(solidKey).join(",")}|${(b.solids ?? [b]).map(solidKey).join(",")}`; // (asked by the trial cut, the join and the start-behind test for the same pair: once)
  if (apartKept.has(key)) return apartKept.get(key);
  const answer = apartMade(a, b);
  apartKept.set(key, answer);
  if (apartKept.size > 400) apartKept.delete(apartKept.keys().next().value);
  return answer;
}
function apartMade(a, b) {
  try {
    const [ba, bb] = [boxOf(a), boxOf(b)];
    const inside = (p, q) => [0, 1, 2].every((i) => p.min[i] >= q.min[i] - NEAR && p.max[i] <= q.max[i] + NEAR);
    if (inside(ba, bb) || inside(bb, ba)) return false;
    const oc = getOC();
    const section = new oc.BRepAlgoAPI_Section();
    const args = new oc.NCollection_List_TopoDS_Shape();
    const tools = new oc.NCollection_List_TopoDS_Shape();
    try {
      args.Append(a.wrapped);
      tools.Append(b.wrapped);
      section.SetArguments(args);
      section.SetTools(tools);
      section.Build();
      if (!section.IsDone() || section.HasErrors()) return false;
      const ex = new oc.TopExp_Explorer(section.Shape(), oc.TopAbs_ShapeEnum.TopAbs_VERTEX, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
      try { return !ex.More(); } finally { ex.delete(); }
    } finally { args.delete(); tools.delete(); section.delete(); }
  } catch { return false; }
}
/** `target` with `solid` fused to it, on the bodies the piece meets only (a piece that meets none is a body of its own). */
function fuseInto(target, solid) {
  const t = touching(target, solid);
  if (!t) { if (apartFrom(target, solid)) { kernelStats.apartSkipped++; return makeCompound([...target.solids, ...(solid.solids ?? [solid])]); } return keptBoolean("fuse", target.solids, solid, () => target.fuse(solid)); }
  if (t.hit.length && apartFrom(partMet(target, solid), solid)) { kernelStats.apartSkipped++; return makeCompound([...target.solids, ...(solid.solids ?? [solid])]); } // (apart from the bodies it is near: they stand as they are)
  return putBack(t.rest, t.hit.length ? keptBoolean("fuse", t.hit, solid, () => partMet(target, solid).fuse(solid)) : solid);
}
/** `target` with `tool` cut out of it, on the bodies the tool meets only (one that meets none cuts nothing). */
function cutFrom(target, tool) {
  const t = touching(target, tool);
  if (!t) return keptBoolean("cut", target.solids, tool, () => target.cut(tool));
  return t.hit.length ? putBack(t.rest, keptBoolean("cut", t.hit, tool, () => (t.hit.length === 1 ? t.hit[0] : makeCompound(t.hit)).cut(tool))) : target;
}
/** A figure pulled out in the open or into the body: cut when it takes material from the bodies it meets, else added (a body of its own when it meets none). `cut` says which. */
function cutOrAdd(target, tool) {
  const t = touching(target, tool);
  const lumps = t ? t.hit : target.solids;
  if (lumps.length && !apartFrom(t ? partMet(target, tool) : target, tool)) { // (a tool apart from the bodies cuts nothing: no trial)
    const trial = keptBoolean("cutOrAdd", lumps, tool, () => {
      const part = t ? (t.hit.length === 1 ? t.hit[0] : makeCompound(t.hit)) : target;
      const before = measureVolume(part);
      try {
        const done = part.clone().cut(tool.clone());
        if (Math.abs(measureVolume(done) - before) > 1e-6 * Math.max(1, before)) return { cut: true, done };
      } catch { /* a join instead */ }
      return { cut: false };
    });
    if (trial.cut) return { cut: true, shape: t ? putBack(t.rest, trial.done) : trial.done };
  }
  return { cut: false, ...joined(target, tool) };
}
/** The body and a piece added to it, and what that was: a piece that stands apart is a body of its own (`new`), one that touches it joins it (`add`); said, so that a step that did not say can be made to (`in_436`). */
function joined(target, solid) {
  const before = target.solids?.length ?? 1;
  const shape = fuseInto(target, solid);
  const used = (shape.solids?.length ?? 1) > before ? "new" : "add";
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
function thickSolid(t, open, th, join = "Intersection", inter = false) {
  const oc = getOC();
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const f of open) list.Append(f.wrapped);
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  try {
    builder.MakeThickSolidByJoin(t.wrapped, list, -th, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, inter, false, oc.GeomAbs_JoinType[`GeomAbs_${join}`], false);
    return cast(builder.Shape());
  } finally {
    builder.delete();
    list.delete();
  }
}
/**
 * The wall's offset solid: by the way whose corners are sharp, and where the kernel cannot make that (a body with rounds and pockets comes back as a sliver of no volume, or "this shape has no type") by the other ways it has
 * (rounded corners, the intersection of the offset faces checked): the first that is a solid of the right size is the one. An inward offset stands inside the body's box and is not narrower than the box less a wall each side.
 */
function thickSolidChecked(t, open, th) {
  const tb = bounds(t);
  const fits = (o) => {
    if (!isValidSolid(o) || !(Math.abs(measureVolume(o)) > 1e-9)) return false;
    if (th <= 0) return true;
    const ob = bounds(o);
    return [0, 1, 2].every((i) => ob.min[i] >= tb.min[i] - 1e-3 && ob.max[i] <= tb.max[i] + 1e-3 && ob.max[i] - ob.min[i] >= tb.max[i] - tb.min[i] - 2 * th - 1e-3 - (open.length ? th : 0));
  };
  for (const [join, inter] of [["Intersection", false], ["Arc", true], ["Intersection", true], ["Arc", false]]) {
    try { const o = thickSolid(t, open, th, join, inter); if (fits(o)) return o; } catch { /* the next way */ }
  }
  return thickSolid(t, open, th);
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
/**
 * Where a round of a piece of a rim ends (`in_655`): at each end of the arc, the plane the tool is cut by. Where the next piece of the chain is rounded too (a rim that the kernel splits where two arcs of a sweep meet,
 * or two tangent arcs) both tools are cut by the plane that halves the angle between the pieces there (a mitre), so they meet and nothing is left standing between them; where the end is free it is cut by the plane of
 * the one flat face that closes the edge there (the end of a sweep, a cap), as the round of a straight edge is, not by the plane across the arc, which is another plane where the face is not square to the edge.
 * Returns [start, end], each `{ V, n }` (n pointing out of the piece, the tool keeps the side it is behind) or null for the flat cut across the arc.
 */
function rimEnds(t, e, set, faces, byEdge) {
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-6;
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : null; };
  const leaving = (edge, atStart) => { // the way the edge runs away from one of its ends, along the edge
    const [p, q] = atStart ? [edge.startPoint, edge.pointAt(0.02)] : [edge.endPoint, edge.pointAt(0.98)];
    return unit([q.x - p.x, q.y - p.y, q.z - p.z]);
  };
  const fsHere = new Set((byEdge.get(e.hashCode) ?? []).map((f) => f.hashCode));
  return [true, false].map((atStart) => {
    const V = atStart ? e.startPoint : e.endPoint;
    const others = edgesOf(t).filter((x) => x.hashCode !== e.hashCode && set.has(x.hashCode) && (near(x.startPoint, V) || near(x.endPoint, V)));
    if (others.length === 1) {
      const x = others[0];
      if (!rimFaces(x, byEdge.get(x.hashCode) ?? [])) return null; // (the next piece is not a rim: a straight side of the outline is cut by its own planes, and this end keeps the flat cut across the arc)
      const into = leaving(e, atStart); // (along the arc, away from this end: the way out of the piece is the other way)
      const tB = leaving(x, near(x.startPoint, V));
      if (!into || !tB) return null;
      const out = into.map((c) => -c);
      const n = unit([out[0] + tB[0], out[1] + tB[1], out[2] + tB[2]]);
      if (n && n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > Math.cos(0.5 * Math.PI / 180)) return null; // (tangent pieces: the mitre is the plane across the arc already, the flat cut stands)
      return n ? { V, n } : null;
    }
    if (others.length) return null;
    const third = faces.filter((f) => !fsHere.has(f.hashCode) && faceVertices(f).some((p) => near(p, V)));
    if (third.length !== 1 || third[0].geomType !== "PLANE") return null;
    const nn = third[0].normalAt();
    const n = unit([nn.x, nn.y, nn.z]);
    const into = leaving(e, atStart);
    if (n && into && -(n[0] * into[0] + n[1] * into[1] + n[2] * into[2]) > Math.cos(0.5 * Math.PI / 180)) return null; // (a face square to the arc: it is the plane across it already)
    return { V, n };
  });
}
function rimTool(e, fs, size, mode, stations, whole = false, ends = null) {
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
    // a concave round (an inside corner that is filled) at a tip of radius R smaller than the size, the flat face running toward the axis (the tip of a pocket): the kernel's surface is the profile of the round turned
    // through the axis, which is the profile clipped at the axis (the union of the turned profile and of its mirror image across the axis lies in the circle): the region is made so, and joins the kernel's round
    // where it takes over (`in_511`). A convex tip keeps the app's own rule, a dome at the tip's radius.
    if (!convex && sRho < 0 && !stations && sz > R + 1e-9 && Math.min(sz, wallH) > R + 1e-9) {
      const r = Math.min(sz, wallH);
      const h = Math.sqrt(Math.max(0, r * r - (r - R) * (r - R)));
      const d0 = r - h; // (the depth below the flat face at which the arc crosses the axis)
      let outline = draw([R, 0]).lineTo([0, 0]).lineTo([0, sW * d0]);
      if (mode === "chamfer") outline = outline.lineTo([R, sW * r]);
      else {
        const a0 = Math.atan2(-sW * h, r - R); // (the angle of the start of the arc about the centre of the rolling circle, at (R - r, sW r); the arc ends at angle 0, on the wall)
        const am = a0 / 2;
        outline = outline.threePointsArcTo([R, sW * r], [R - r + r * Math.cos(am), sW * r + r * Math.sin(am)]);
      }
      return outline.close();
    }
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
  const capped = Math.min(size, planeW, wallH) < size - 1e-9; // (the round is larger than the face or the wall it runs on: it saturates, as a dome at the end of a post)
  const tip = sRho < 0 && planeW < size - 1e-9; // (the flat face runs toward the axis and is shorter than the size: the end of a post, the tip of a pocket; a concave foot or a hole's rim, where the face runs away from the axis, has no such limit)
  // the profile is drawn in the half plane through the axis that holds the start of the rim (radius across, height along the axis) and turned about the axis through the span of the rim: all the way round for a whole
  // rim, the span of the arc for a piece of one (the round then ends in a flat cut across it, as a round ends at a vertex)
  const M = e.pointAt(0.5);
  const B = e.endPoint;
  const rad = (p) => { const v = [p.x - C[0], p.y - C[1], p.z - C[2]]; const h = dotp(v, ax); const r = [v[0] - ax[0] * h, v[1] - ax[1] * h, v[2] - ax[2] * h]; const l = Math.hypot(...r); return r.map((x) => x / l); };
  const closed = whole || Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z) < 1e-6; // (`whole`: the piece is one of the pieces of a circle that is closed by them all: the round goes all the way round)
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
    return { tool: ring, convex, R, length: e.length, partial: false, key: String(e.hashCode), capped, tip };
  }
  // the ends: where the arc ends against a plane (the next piece's mitre, the cap) the tool is turned a little further at that end and cut by the plane (`rimEnds`); else it ends in the flat cut across the arc
  const clipStart = ends && !closed ? (ccw ? ends[0] : ends[1]) : null;
  const clipEnd = ends && !closed ? (ccw ? ends[1] : ends[0]) : null;
  const room = Math.max(0, (360 - span) / 2 - 5);
  const extra = Math.min(60, room);
  const [e0, e1] = [clipStart && extra > 1 ? extra : 0, clipEnd && extra > 1 ? extra : 0];
  const turnBy = (r, deg) => { const phi = (deg * Math.PI) / 180; const k = cross3(ax, r); return r.map((x, i) => x * Math.cos(phi) + k[i] * Math.sin(phi)); };
  const rS2 = e0 ? turnBy(rS, -e0) : rS;
  const sketch = outline.sketchOnPlane(new Plane(C, rS2, cross3(rS2, ax)));
  let solid = sketch.revolve(ax, { origin: C, angle: span + e0 + e1 });
  const reachAll = (() => { const bb = bounds(solid); return 2 * Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) + 10; })();
  for (const [clip, did] of [[clipStart, e0], [clipEnd, e1]]) if (clip && did) solid = solid.intersect(slabSolid([clip.V.x, clip.V.y, clip.V.z], clip.n, -reachAll, 1e-3, reachAll));
  return { tool: solid, convex, R, length: e.length, partial: !closed, key: String(e.hashCode), capped, tip };
}
/** The solid between the planes at `from` and `to` along the unit vector m from the point p, square and `big` wide about it. */
/** The face pushed out along `v` (a vector of the length it goes): the solid of everything straight above it, to the height of the vector. */
function faceShadow(face, v) {
  const oc = getOC();
  const vec = new oc.gp_Vec(v[0], v[1], v[2]);
  const mk = new oc.BRepPrimAPI_MakePrism(face.wrapped, vec, false, true);
  try { return cast(mk.Shape()); } finally { mk.delete(); vec.delete(); }
}
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
/**
 * Is a rim of the selection (the named edges and the smooth chain they are on, a corner of the body or an inside corner that is filled) rounded by more than the face or the wall it runs on allows (`rimTool`'s reach is capped: the end of a post of a radius smaller
 * than the size)? The kernel's round of that size is some other surface than the dome the region makes there, and the two do not agree: the kernel's takes off more, so a bigger round took off less where the
 * region took over (`in_510`: a round tip of a teardrop-shaped post, a bigger round than the tip's radius). From that size the region's round is used, so there is one way of making it.
 */
function rimCapped(t, set, size, mode) {
  const { edges, byEdge } = topoOf(t);
  if (!edges.some((x) => x.geomType === "CIRCLE")) return false; // (a body with no round edge: nothing to look at; the smooth chain below may take one up)
  const chain = smoothChain(t, set, byEdge) ?? set;
  for (const e of edges.filter((x) => chain.has(x.hashCode))) {
    const fs = byEdge.get(e.hashCode) ?? [];
    if (!rimFaces(e, fs)) continue;
    // (a convex rim capped by its face or its wall; a concave one is not: the kernel's round of an inside corner is made as before, and where the region has to make it, `rimTool` makes the tip as the kernel's does)
    try { const rim = rimTool(e, fs, size, mode, undefined); if (rim && rim.convex && rim.capped) return true; } catch { /* (not a rim the region can make: the kernel's round is tried) */ }
  }
  return false;
}
/** The faces, the edges and the faces of each edge of a body, found once for the body (`rimCapped` and `regionRound` both want them: for a gear of two hundred and fifty faces, a second each). */
const topoMemo = new WeakMap();
function topoOf(t) {
  let m = topoMemo.get(t);
  if (!m) {
    const faces = facesOf(t);
    const edges = edgesOf(t);
    const byEdge = new Map();
    for (const f of faces) for (const e of edgesOf(f)) byEdge.set(e.hashCode, [...(byEdge.get(e.hashCode) ?? []), f]);
    m = { faces, edges, byEdge, chains: new Map() };
    topoMemo.set(t, m);
  }
  return m;
}

/**
 * The edges the kernel's round would carry on to from the edges `set` (hash codes): an edge that meets one of them at a corner and goes on in the same direction there (a straight side into the arc that
 * turns it, an arc into the next), is on the same flat face (the one whose boundary the chain is) and has beside it a face that goes on smoothly from the one beside the edge it follows (the same normal at the
 * corner). Returns the set with them, or null when none are found or one of them is an edge the region cannot make (a spline, an edge between faces that are not flat and round about an axis across the flat one).
 * The edges are found by their corners (one pass to put each end of each edge in a table, then a look at the edges at each corner), not by comparing every edge with every other: asking the kernel for the
 * tangent of every end of every pair of edges took a second for the sixty edges of a gear.
 */
function smoothChain(t, set, byEdge) {
  const memo = topoOf(t).chains;
  const memoKey = [...set].sort().join(",");
  if (memo.has(memoKey)) return memo.get(memoKey);
  const out = smoothChain0(t, set, byEdge);
  memo.set(memoKey, out);
  return out;
}
function smoothChain0(t, set, byEdge) {
  const all = topoOf(t).edges;
  const key = (p) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const supported = (e) => {
    const fs = byEdge.get(e.hashCode) ?? [];
    if (rimFaces(e, fs)) return true;
    return e.geomType === "LINE" && fs.length === 2 && fs.every((f) => f.geomType === "PLANE");
  };
  // the corners: each end of each edge (with two faces beside it) in a table by its place; the tangent of an end is asked for only when another edge is at that corner
  const atCorner = new Map();
  for (const e of all) {
    if ((byEdge.get(e.hashCode) ?? []).length !== 2) continue;
    for (const which of [0, 1]) {
      const at = which === 0 ? e.startPoint : e.endPoint;
      const k = key(at);
      const list = atCorner.get(k);
      if (list) list.push({ e, which, at }); else atCorner.set(k, [{ e, which, at }]);
    }
  }
  const outward = (end) => { if (end.out) return end.out; const v = end.e.tangentAt(end.which); end.out = unit(end.which === 0 ? v : { x: -v.x, y: -v.y, z: -v.z }); return end.out; };
  const chain = new Set(set);
  const added = [];
  const queue = all.filter((x) => chain.has(x.hashCode));
  while (queue.length) {
    const e = queue.pop();
    const fe = byEdge.get(e.hashCode) ?? [];
    if (fe.length !== 2) continue;
    for (const which of [0, 1]) {
      const here = atCorner.get(key(which === 0 ? e.startPoint : e.endPoint)) ?? [];
      const mine = here.find((h) => h.e.hashCode === e.hashCode && h.which === which);
      for (const there of here) {
        const x = there.e;
        if (!mine || chain.has(x.hashCode) || x.hashCode === e.hashCode) continue;
        const [a, b] = [outward(mine), outward(there)];
        if (dot(a, b) > -1 + 1e-6) continue; // (not the same direction on through the corner)
        const fx = byEdge.get(x.hashCode) ?? [];
        const shared = fe.find((f) => fx.some((g) => g.hashCode === f.hashCode)); // (the flat face both are on the boundary of)
        if (!shared) continue;
        const [oe, ox] = [fe.find((f) => f.hashCode !== shared.hashCode), fx.find((g) => g.hashCode !== shared.hashCode)];
        if (!oe || !ox) continue;
        const [ne, nx] = [oe.normalAt(mine.at), ox.normalAt(mine.at)];
        if (dot(unit(ne), unit(nx)) < 1 - 1e-4) continue; // (the face beside it does not go on smoothly)
        chain.add(x.hashCode);
        added.push(x);
        queue.push(x);
      }
    }
  }
  if (!added.length) return null;
  if (!added.every(supported)) return null; // (an edge the region cannot make: the round of the edges named is made as before)
  return chain;
}

function regionRound(t, set0, size, mode, stations) {
  const { faces, byEdge } = topoOf(t);
  // the kernel's round follows an edge on round the edges that carry it on smoothly (`in_508`: the chamfer of the one straight side of a stadium-shaped slot is the chamfer of the whole outline, two sides and two
  // arcs, for the kernel; the region of the one side took off a third, and a bigger chamfer took off less): the region does the same, when every edge it takes up is one it can make
  const set = stations ? set0 : smoothChain(t, set0, byEdge) ?? set0;
  const dir = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crossp = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const tools = [];
  const straight = [];
  const rims = new Map();
  // the kernel's round follows an edge round the rim: one half of a circle the kernel splits a rim into is rounded with the other half (`in_507`: a post's rim of which the step names one half went from the whole
  // rim to half of it where the region took over, and a bigger round took off less). Where the pieces between the same two faces on the same circle close it, the round goes all the way round, in one turn;
  // an arc that really ends (on a wall that cuts the round) is not one of them and ends in a flat cut.
  const wholeRim = new Map(); // hash code of the piece that makes the round -> true; the other pieces of its circle are in `skipped`
  const skipped = new Set();
  if (!stations) {
    const picked = edgesOf(t).filter((x) => set.has(x.hashCode));
    for (const e of picked) {
      if (skipped.has(e.hashCode)) continue;
      const fs = byEdge.get(e.hashCode) ?? [];
      const rf = rimFaces(e, fs);
      if (!rf) continue;
      const same = (x) => {
        if (x.geomType !== "CIRCLE") return false;
        const rx = rimFaces(x, byEdge.get(x.hashCode) ?? []); // (the other half is between the same flat face and the other half of the round wall, which the kernel may keep as two faces)
        if (!rx || rx.plane.hashCode !== rf.plane.hashCode) return false;
        try {
          const c = x._geomAdaptor().Circle();
          const [L, D] = [c.Location(), c.Axis().Direction()];
          return Math.hypot(L.X() - rf.C[0], L.Y() - rf.C[1], L.Z() - rf.C[2]) < 1e-6 * Math.max(1, rf.R) && Math.abs(c.Radius() - rf.R) < 1e-6 * Math.max(1, rf.R) && Math.abs(Math.abs(D.X() * rf.ax[0] + D.Y() * rf.ax[1] + D.Z() * rf.ax[2]) - 1) < 1e-6;
        } catch { return false; }
      };
      const pieces = edgesOf(t).filter((x) => x.hashCode !== e.hashCode && same(x));
      if (!pieces.length) continue;
      const around = e.length + pieces.reduce((a, x) => a + x.length, 0);
      if (Math.abs(around - 2 * Math.PI * rf.R) > 1e-4 * rf.R) continue; // (they do not close the circle: an arc that ends)
      wholeRim.set(e.hashCode, true);
      for (const x of pieces) skipped.add(x.hashCode);
    }
  }
  for (const e of edgesOf(t).filter((x) => set.has(x.hashCode) && !skipped.has(x.hashCode))) {
    const fs = byEdge.get(e.hashCode) ?? [];
    if (rimFaces(e, fs)) {
      // a rim: a circle where a flat face meets a round wall about the same axis (the end of a post or a hole, the foot of a post): made by revolving the corner region about the axis (`rimTool`)
      const rim = rimTool(e, fs, size, mode, stations, wholeRim.has(e.hashCode), !stations && !wholeRim.has(e.hashCode) ? rimEnds(t, e, set, faces, byEdge) : null);
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
    // a region that is cut ends where the kernel's round does: at the faces that close the edge at its two ends (the third face at each end corner), not in a flat cut across the edge a millimetre past it. The prism
    // is made long and cut off by the planes of those two faces, so a round bigger than the faces beside the edge are wide carries on, as a plane, across the corner (`in_504`: a prism that stopped a millimetre
    // past the ends of the edge was a strip that stopped short of the corner, and a bigger round took off less). Where an end has no one flat face (or the size changes along the edge) the old flat cut is kept.
    // One that is added stops at the ends, or it would stand out.
    const endPlanes = convex && !stations ? [A, B].map((V) => {
      const near = faces.filter((f) => faceVertices(f).some((p) => Math.hypot(p.x - V.x, p.y - V.y, p.z - V.z) < 1e-6) && !fs.some((g) => g.hashCode === f.hashCode));
      if (near.length !== 1 || near[0].geomType !== "PLANE") return null;
      const nn = near[0].normalAt();
      return { V, n: dir([nn.x, nn.y, nn.z]) };
    }) : [];
    const clipped = endPlanes.length === 2 && endPlanes.every(Boolean);
    const reachAll = (() => { const bb = bounds(t); return 2 * Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]) + 10; })();
    const margin = convex ? (clipped ? reachAll : 1) : 0;
    const along = (B.x - A.x) * normal[0] + (B.y - A.y) * normal[1] + (B.z - A.z) * normal[2];
    const lowest = Math.min(0, along) - margin;
    const at = (s) => [A.x + normal[0] * s, A.y + normal[1] * s, A.z + normal[2] * s]; // a point of the line of the edge, `s` along the normal of the profile
    // concave: material added past the end of the faces would stand out from the body as a wing, so it is filled as far as the faces go and no further
    let limit = Infinity;
    const clipFill = !convex && !stations && size > 0;
    if (!convex) {
      const extent = fs.map((f, i) => { let far = 0; for (const p of faceVertices(f)) far = Math.max(far, dotp(a[i], [p.x - A.x, p.y - A.y, p.z - A.z])); return far; });
      limit = Math.min(extent[0], extent[1]);
    }
    /** the profile of the region for a size: the edge point, the two points where the rounding begins, and the arc of the rolling circle (a fillet) or the straight bevel (a chamfer) */
    const profile = (sz, where) => {
      let reach = mode === "chamfer" ? sz : sz / Math.tan(alpha / 2); // how far along each face the rounding begins
      let radius = sz;
      if (reach > limit && !clipFill) { reach = limit; radius = mode === "chamfer" ? sz : limit * Math.tan(alpha / 2); }
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
    } else {
      tool = profile(size, lowest).extrude(len + 2 * margin);
      // concave: what is filled stays above the faces that are there, so where a face is narrower than the fill is wide (the floor of a flat cut on a round body, narrowing to nothing at the ends) the fill follows the
      // face's outline up and does not stand out past it, and a chamfer or fillet can go all the way across the face (`in_1340`: a chamfer of a flat cut stopped a sliver short of the face's widest part)
      if (clipFill) {
        try { for (let i = 0; i < 2; i++) { const h = size * 1.01 + 1e-3; tool = tool.intersect(faceShadow(fs[i], [norm[i][0] * h, norm[i][1] * h, norm[i][2] * h])); } } catch (err) { if (process.env.DBG2) console.log("clip failed", err.message); }
      }
      if (clipped) for (const { V, n } of endPlanes) tool = tool.intersect(slabSolid([V.x, V.y, V.z], n, -reachAll, 1e-3, reachAll)); // (the side of the end face the body is on, and a hair beyond the face)
    }
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
  const diag = (() => { const bb = bounds(t); return Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]); })();
  for (const { tool, convex } of tools) {
    const before = measureVolume(made);
    const toolVolume = measureVolume(tool);
    let next = convex ? made.cut(tool) : made.fuse(tool);
    // a boolean can do nothing and say nothing (`in_514`: at 10.75 mm one cut of a round of 10 mm took off nothing, at 10.5 and 11 the same cut took off 413 and 454 mm3, so a bigger round left more of the body):
    // the result is a valid body, so no check sees it. A cut or a fill of a tool that has volume and changed nothing is made again with the tool moved a hair, along each axis in turn.
    if (toolVolume > 1e-6 && Math.abs(measureVolume(next) - before) < 1e-9 * Math.max(1, before)) {
      for (const shift of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]]) {
        let moved;
        try { moved = tool.clone().translate(shift.map((x) => x * 1e-4 * Math.max(1, diag))); next = convex ? made.clone().cut(moved) : made.clone().fuse(moved); } catch { continue; }
        if (Math.abs(measureVolume(next) - before) >= 1e-9 * Math.max(1, before) && isValidSolid(next)) break;
        next = convex ? made.cut(tool) : made.fuse(tool); // (still nothing: the tool is perhaps not on the body; the first result stands)
      }
    }
    made = next;
  }
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
  if (op?.type === "loft") return "the kernel could not loft through those sections (it gave no reason): a side of one that is almost straight, or two sides that nearly touch, can do it; try a small change of a size";
  return "the kernel could not make this step (it gave no reason)";
}

/**
 * What was worked out before, by what it was worked out from: an op is the same op if its description and everything it is built on are the same. A move at the end of a long
 * model therefore only redoes the move. Kept: the newest ones. (Booleans use up what they are given, so an op is handed a copy of its input, never the kept one.)
 */
/**
 * What a kept-answer map holds is bounded by the faces of the solids it keeps, not by how many there are: a count of 64 was a cliff at forty or so plain parts (each part kept one or two), after which every step made
 * all of them again (50 parts: 0.1 s a step; 70: 2.5 s, `in_857`), and a heap of wheels of thousands of faces would have been more than the memory has. The oldest go first.
 */
const FACES_KEPT = 20000;
const weights = new WeakMap();
function keepWithin(map, key, solid) {
  let w = 1;
  try { w = Math.max(1, facesOf(solid).length); } catch { /* (not a solid: counted as one) */ }
  let w0 = weights.get(map);
  if (!w0) { w0 = new Map(); weights.set(map, w0); }
  w0.set(key, w);
  let total = 0;
  for (const v of w0.values()) total += v;
  while (map.size > 1 && (total > FACES_KEPT || map.size > 1500)) {
    const oldest = map.keys().next().value;
    total -= w0.get(oldest) ?? 0; w0.delete(oldest); map.delete(oldest);
  }
  for (const k of w0.keys()) if (!map.has(k)) w0.delete(k); // (an entry taken out by the map's own use)
}
const prisms = new Map(); // a body's own solid by what it was made from, not what came before it: key -> { solid, roles }
/**
 * The solid a revolve, loft or sweep makes of its own sketches, kept under a key made of those sketches' answers and its own settings, and not of the steps before it (as the extrude's is): a change to an earlier step leaves this body
 * the very same solid, so everything kept for a solid is found again and it is not built again (`dec_per_body_checks`). The roles of its faces by its sketches' own edges, and a sweep's note about a crease, are kept with it and replayed.
 */
function ownSolid(ctx, op, kind, ids, build) {
  const { id: _i, target: _t, mode: _m, together: _g, ...own } = op;
  const ownKey = ids.every((i) => ctx.keyOf?.(i)) ? fingerprint(JSON.stringify([kind, ctx.params, own, ids.map((i) => ctx.keyOf(i))])) : null;
  const kept = ownKey ? prisms.get(ownKey) : null;
  if (kept && (!ctx.roleFigs || kept.roles) && (!ctx.sweepNote || kept.note !== undefined)) {
    prisms.delete(ownKey); prisms.set(ownKey, kept);
    if (ctx.roleFigs) for (const [k, v] of kept.roles) if (!ctx.roleFigs.has(k)) ctx.roleFigs.set(k, v);
    if (ctx.sweepNote && kept.note) ctx.sweepNote.note = kept.note;
    kernelStats.prismsReused++;
    return kept.value;
  }
  kernelStats.prismsBuilt++;
  const had = new Set(ctx.roleFigs ? ctx.roleFigs.keys() : []);
  const value = build();
  if (ownKey) {
    prisms.set(ownKey, { value, solid: value.solid, roles: ctx.roleFigs ? [...ctx.roleFigs.entries()].filter(([k]) => !had.has(k)) : null, note: ctx.sweepNote ? ctx.sweepNote.note ?? null : undefined });
    keepWithin(prisms, ownKey, value.solid);
  }
  return value;
}

/** How many bodies' own solids were built and how many were kept ones (read by the tests, `dec_per_body_checks`). */
export const kernelStats = { prismsBuilt: 0, prismsReused: 0, partialBooleans: 0, booleansKept: 0, apartSkipped: 0 };
/** Forget what is kept of bodies, so that the next answer is worked out from nothing (for the tests: the kept and the worked-out answers are to be the same). */
export function clearKernelCaches() { prisms.clear(); booleans.clear(); validSolids.clear(); uncrossed.clear(); memo.clear(); clearNameCaches(); }
/** The size (MB) of the kernel's memory above which no step is made (`KERNEL_MEMORY_STOP_MB` in `kernel-async.ts` is the same number: a thread above it is restarted). */
let memoryStopMb = 3300;
export function setMemoryStop(mb) { memoryStopMb = mb; }
const heapMegabytes = () => { try { return Math.round((getOC().wasmMemory?.buffer.byteLength ?? 0) / 1048576); } catch { return 0; } };
const memo = new Map(); // key -> { value, own }
/**
 * The answers kept for the steps, the oldest forgotten first once they hold more than `MEMO_FACES` faces of their own (a step's own are the faces its answer has beyond its target's, the answers of a row of steps
 * sharing the solids of the bodies before them) or `MEMO_COUNT` answers. A count of 96 was a cliff at 48 plain parts (a sketch and a push each), after which every step made them all again (`in_857`).
 */
const MEMO_FACES = 150000, MEMO_COUNT = 2000;
const remember = (key, entry) => {
  memo.delete(key);
  memo.set(key, entry);
  let total = 0;
  for (const e of memo.values()) total += e.own ?? 1;
  while (memo.size > 1 && (total > MEMO_FACES || memo.size > MEMO_COUNT)) { const [k0, e0] = memo.entries().next().value; total -= e0.own ?? 1; memo.delete(k0); }
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
// a preview of an extrusion (`in_1064`) may leave out the boolean for a figure that is apart from the bodies it is near
{
  const extrude0 = OPS.extrude;
  OPS.extrude = (op, ctx) => { apartOk = !!op.preview; try { return extrude0(op, ctx); } finally { apartOk = false; } };
}
// a sweep may say that its sides crease (`in_655`): the note goes with its result like the notes of a fillet
{
  const sweep0 = OPS.sweep;
  OPS.sweep = (op, ctx) => { const sink = {}; ctx.sweepNote = sink; try { const v = sweep0(op, ctx); return sink.note && v?.kind === "solid" ? { ...v, note: sink.note } : v; } finally { ctx.sweepNote = null; } };
}

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

/** The roles of a figure's faces; never fails the step (with none, its faces are named by their rank). */
function safeRoles(...args) { try { return figureRoles(...args); } catch { return []; } }

/** Compile the whole graph. Returns per-op results; never throws for op-level failures. */
/** `quick`: a rough answer for a picture while a size is dragged (`dec_speed_rules`): the safety checks are left out, and what was made without them is kept as unchecked, so that a whole answer asked for later makes it again with them. */
export function compile(graph, quick = false) {
  const params = graph.params ?? {};
  const results = new Map(); // id -> {value?, error?, ms}
  const keys = new Map(); // id -> what it was worked out from
  const ctx = {
    params,
    /** What a step was worked out from (its kept answer's key), for a step that keeps part of its own work under a key of its own. */
    keyOf: (id) => keys.get(id) ?? null,
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
  const pj = JSON.stringify([params, !!graph.names]);
  for (const op of graph.ops) {
    const t0 = performance.now();
    const key = fingerprint(JSON.stringify([op, pj, [op.target, op.profile, ...(op.holes ?? []), ...(op.others ?? []), ...(op.also ?? []).flatMap((f) => [f.profile, ...f.holes]), ...(op.sections ?? []).flatMap((s) => [s.profile, ...(s.holes ?? [])])].map((d) => (d ? keys.get(d) ?? null : null))]));
    keys.set(op.id, key);
    const kept = memo.get(key);
    if (kept && !(kept.unchecked && !quick)) {
      remember(key, kept);
      results.set(op.id, { value: kept.value, ms: 0, key, cached: true, faces: kept.faces });
      continue;
    }
    // the kernel's memory is nearly its 4 GB: a step that went on would be the end of the page's tab (a model of 1100 bodies killed it after 46 s, `in_997`); this step and the ones after it say so and nothing more is made
    if (memoryStopMb > 0) { const mb = heapMegabytes(); if (mb > memoryStopMb) { results.set(op.id, { error: `the model is too big for the kernel's memory (${mb} MB of 4096 used): use fewer or simpler parts, or save it and open it in pieces`, ms: 0 }); continue; } }
    let markMs = 0;
    let checkMs = 0;
    try {
      if (!OPS[op.type]) throw new Error(`unknown op type ${op.type}`);
      beginStages();
      ctx.roleFigs = graph.names && (op.type === "extrude" || op.type === "revolve" || op.type === "loft" || op.type === "sweep") ? new Map() : null;
      const value = run(op, ctx, results);
      const stagesOf = endStages();
      if (value.kind === "solid") {
        // which bodies the result has, by the markers of the body it was made from (moved with it if this was a move)
        const from = op.target ? results.get(op.target)?.value : null;
        let prev = value.tf ? moveMarkers(from?.markers ?? [], value.tf) : from?.markers ?? [];
        const extras = (op.others ?? []).map((id) => results.get(id)).filter((r) => r && !r.error && r.value.kind === "solid").map((r) => r.value); // (a join: the bodies of the other chains keep their names and their faces' names)
        if (extras.length) prev = [...prev, ...extras.flatMap((v) => v.markers ?? [])];
        if (value.first) prev = [...prev.filter((m) => m.id === value.first), ...prev.filter((m) => m.id !== value.first)]; // (the body that stays keeps its name when bodies are combined)
        const tM = performance.now();
        value.markers = trackBodies(prev, value.shape, op.id);
        markMs = performance.now() - tM;
        if (graph.names) { const named = nameFaces(extras.length ? [...(from?.faceNames ?? []), ...extras.flatMap((v) => v.faceNames ?? [])] : from?.faceNames, value.tf, value.shape, op.id, (op.type === "extrude" || op.type === "revolve" || op.type === "loft" || op.type === "sweep") && ctx.roleFigs ? [...ctx.roleFigs.values()].flat() : op.type === "edgeMod" ? edgeRoles(op, from?.edgeNames) : null); value.faceNames = named.faces; Object.defineProperty(value, "edgeNames", { get: () => named.edges, enumerable: true, configurable: true }); } // (the names of the flat faces, carried from the body it was made from)
      }
      const rigid = op.type === "transform" && (op.mode === "move" || op.mode === "rotate"); // (moving a valid body cannot make it invalid: the check is skipped, it costs as much as the move)
      const tC = performance.now();
      const skipChecks = quick && value.kind === "solid" && !rigid;
      if (value.kind === "solid" && !rigid && !skipChecks && !value.checked && !isValidSolid(value.shape)) throw new Error("kernel returned an invalid solid");
      if (value.kind === "solid" && !rigid && !skipChecks && !value.noCross && crossesItself(value.shape, op.target && results.get(op.target)?.value?.kind === "solid" ? results.get(op.target).value.shape : null)) throw new Error("that would make the body pass through itself (one part of it goes through another)");
      checkMs = performance.now() - tC;
      results.set(op.id, { value, ms: performance.now() - t0, key, markMs, checkMs, ...(Object.keys(stagesOf).length ? { stages: Object.fromEntries(Object.entries(stagesOf).map(([n, v]) => [n, Math.round(v * 10) / 10])) } : {}) });
      const faces = value.kind === "solid" ? facesOf(value.shape).length : 0;
      results.get(op.id).faces = faces;
      remember(key, { value, faces, own: Math.max(1, faces - (op.target ? results.get(op.target)?.faces ?? 0 : 0)), ...(skipChecks && !value.checked ? { unchecked: true } : {}) });
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
    if (r && !r.error && r.value.kind === "solid") return { id: graph.ops[i].id, shape: r.value.shape, key: r.key, markers: r.value.markers ?? [], ...(r.value.faceNames ? { faceNames: r.value.faceNames, edgeNames: r.value.edgeNames } : {}) };
  }
  return null;
}

/** A smooth loft whose surfaces are of at most this degree (`op.maxDegree`): the kernel's own goes up to a degree one under the number of sections, and a boolean with a surface of degree six takes four times as long as with one of degree three (a spiral bevel ring gear of 42 teeth: 40 s to 16 s, the same fit, `in_988`). */
function limitedLoft(sk, maxDegree) {
  const oc = getOC();
  const b = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  try {
    b.SetMaxDegree(maxDegree);
    for (const s of sk) b.AddWire(s.wire.wrapped);
    b.Build();
    return cast(b.Shape());
  } finally { b.delete(); }
}
export function volume(shape) {
  return measureVolume(shape);
}

export { makeBox };

/** A smooth loft through sections whose edges match one to one (the same number, the same start, the same way round), without the kernel's check of that, which it does with every section's edges against every other's. */
function matchedLoft(sk) {
  const oc = getOC();
  const b = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  try {
    b.CheckCompatibility(false);
    for (const s of sk) b.AddWire(s.wire.wrapped);
    b.Build();
    return cast(b.Shape());
  } finally { b.delete(); }
}
