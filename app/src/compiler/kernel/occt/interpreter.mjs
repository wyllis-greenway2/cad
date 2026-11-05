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
  EdgeFinder,
  FaceFinder,
  measureVolume,
  getOC,
  Plane,
  Vector,
  basicFaceExtrusion,
} from "replicad";

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
/** Apply an edge query to a replicad EdgeFinder (so fillet/chamfer can use it as their filter). */
export function edgeFinder(f, shape, query) {
  if (query.direction) f = f.inDirection(query.direction);
  if (query.inPlane) {
    const b = bounds(shape);
    const axis = { XY: 2, XZ: 1, YZ: 0 }[query.inPlane];
    const at = query.at === "min" ? b.min[axis] : b.max[axis];
    f = f.inPlane(query.inPlane, at);
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
    const b = bounds(shape);
    const axis = { XY: 2, XZ: 1, YZ: 0 }[query.inPlane];
    const at = query.at === "min" ? b.min[axis] : b.max[axis];
    f = f.inPlane(query.inPlane, at);
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

/** The flat face of `shape` described by ref: facing along n, on the plane n . p = d, its box containing the point. */
function findFace(shape, ref) {
  const { n, d } = refPlane(ref);
  const tol = 1e-3;
  let best = null;
  for (const f of shape.faces) {
    if (f.geomType !== "PLANE") continue;
    const fn = f.normalAt();
    const l = Math.hypot(fn.x, fn.y, fn.z);
    if ((fn.x * n[0] + fn.y * n[1] + fn.z * n[2]) / l < 1 - 1e-5) continue;
    const c = f.center;
    if (Math.abs(n[0] * c.x + n[1] * c.y + n[2] * c.z - d) > tol) continue;
    const [lo, hi] = f.boundingBox.bounds;
    if (ref.point.some((p, i) => p < lo[i] - tol || p > hi[i] + tol)) continue;
    const area = (hi[0] - lo[0] + 1e-6) * (hi[1] - lo[1] + 1e-6) * (hi[2] - lo[2] + 1e-6);
    if (!best || area < best.area) best = { f, area };
  }
  if (!best) throw new Error("face not found (the model changed since this step was made)");
  return best.f;
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
  for (const f of shape.faces) {
    if (f.geomType !== "CYLINDRE") continue;
    const cyl = f._geomAdaptor().Cylinder();
    const loc = cyl.Axis().Location();
    const dir = cyl.Axis().Direction();
    const d = [dir.X(), dir.Y(), dir.Z()];
    const l = [loc.X(), loc.Y(), loc.Z()];
    if (Math.abs(Math.abs(d[ref.axis]) - 1) > 1e-6 || Math.abs(cyl.Radius() - ref.radius) > tol) continue;
    if ([0, 1, 2].some((i) => i !== ref.axis && Math.abs(l[i] - ref.center[i]) > tol)) continue;
    const [lo, hi] = f.boundingBox.bounds;
    if (Math.abs(lo[ref.axis] - ref.lo) > tol || Math.abs(hi[ref.axis] - ref.hi) > tol) continue;
    const pt = f.pointOnSurface(0.25, 0.5);
    const n = f.normalAt(pt);
    const radial = [pt.x - (ref.axis === 0 ? pt.x : ref.center[0]), pt.y - (ref.axis === 1 ? pt.y : ref.center[1]), pt.z - (ref.axis === 2 ? pt.z : ref.center[2])];
    return { face: f, convex: n.x * radial[0] + n.y * radial[1] + n.z * radial[2] > 0 };
  }
  throw new Error("round face not found (the model changed since this step was made)");
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

const OPS = {
  sketch(op, ctx) {
    const p = (k) => resolve(op[k], ctx.params);
    let drawing;
    if (op.shape === "rect") drawing = drawRectangle(p("w"), p("d"));
    else if (op.shape === "rounded_rect") drawing = drawRoundedRectangle(p("w"), p("d"), p("r"));
    else if (op.shape === "circle") drawing = drawCircle(p("radius"));
    else if (op.shape === "polygon") {
      const pts = resolve(op.points, ctx.params);
      let pen = draw(pts[0]);
      for (let i = 1; i < pts.length; i++) pen = pen.lineTo(pts[i]);
      drawing = pen.close();
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
    const sk = ctx.get(op.profile, "sketch");
    const dist = resolve(op.distance, ctx.params);
    const solid = sk.drawing.sketchOnPlane(sk.plane, sk.origin).extrude(dist);
    const target = op.target ? ctx.get(op.target, "solid").shape : null;
    if (!target) return { kind: "solid", shape: solid };
    return { kind: "solid", shape: op.mode === "cut" ? target.cut(solid) : target.fuse(solid) };
  },

  /**
   * Push or pull a flat face of the target. ref = { axis, sign, offset, point } finds the face (flat, facing sign*axis, at that offset,
   * its box containing the point). Pulling out adds the prism the face sweeps; pushing in cuts it.
   */
  faceExtrude(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const { n } = refPlane(op.ref);
    const dist = resolve(op.distance, ctx.params);
    const best = findFace(t, op.ref);
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
    if (!refs.length || !refs.every((r) => t.edges.some((e) => edgeMatches(e, r)))) throw new Error("line not found (the model changed since this step was made)");
    const pick = (ef) => ef.when(({ element }) => refs.some((r) => edgeMatches(element, r)));
    return { kind: "solid", shape: op.mode === "chamfer" ? t.chamfer(v, pick) : t.fillet(v, pick) };
  },

  /** Change the radius of a full round face: material is added or removed in a ring (outside it for a post, inside it for a hole). */
  cylRadius(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const { face, convex } = findCylinder(t, op.ref);
    const R = op.ref.radius;
    const R2 = resolve(op.radius, ctx.params);
    if (!(R2 > 1e-6)) throw new Error("the radius must be positive");
    if (Math.abs(R2 - R) < 1e-9) return { kind: "solid", shape: t };
    const h = op.ref.hi - op.ref.lo;
    const at = [...op.ref.center];
    at[op.ref.axis] = op.ref.lo;
    const ring = revolved([[Math.min(R, R2), 0], [Math.max(R, R2), 0], [Math.max(R, R2), h], [Math.min(R, R2), h]], op.ref.axis, at);
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

  /** Move, rotate or scale the whole target. mode "move" (mm along axis), "rotate" (degrees about the axis through `pivot`, default the box centre), "scale" (factor about the box centre). */
  transform(op, ctx) {
    const t = ctx.get(op.target, "solid").shape;
    const v = resolve(op.value, ctx.params);
    if (!Number.isFinite(v)) throw new Error("bad number");
    const b = bounds(t);
    const c = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
    const axis = [0, 0, 0];
    axis[op.axis] = 1;
    if (op.mode === "move") return { kind: "solid", shape: t.translate(axis.map((a) => a * v)) };
    if (op.mode === "rotate") return { kind: "solid", shape: t.rotate(v, op.pivot ?? c, axis) };
    if (op.mode === "scale") {
      if (!(v > 1e-6)) throw new Error("scale must be positive");
      return { kind: "solid", shape: t.scale(v, c) };
    }
    throw new Error(`unknown transform ${op.mode}`);
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

/** OCCT in WASM can throw opaque WebAssembly.Exception objects with no message; say so plainly. */
function describeError(e) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return "OCCT kernel exception (opaque, no message available from the WASM build)";
}

/** Compile the whole graph. Returns per-op results; never throws for op-level failures. */
export function compile(graph) {
  const params = graph.params ?? {};
  const results = new Map(); // id -> {value?, error?, ms}
  const ctx = {
    params,
    get(id, kind) {
      const r = results.get(id);
      if (!r) throw new Error(`${id} not found (ops must be ordered after their dependencies)`);
      if (r.error) throw new Error(`upstream ${id} failed`);
      if (kind && r.value.kind !== kind) throw new Error(`${id} is a ${r.value.kind}, expected ${kind}`);
      return r.value;
    },
  };
  for (const op of graph.ops) {
    const t0 = performance.now();
    try {
      if (!OPS[op.type]) throw new Error(`unknown op type ${op.type}`);
      const value = OPS[op.type](op, ctx);
      if (value.kind === "solid" && !isValidSolid(value.shape)) throw new Error("kernel returned an invalid solid");
      results.set(op.id, { value, ms: performance.now() - t0 });
    } catch (e) {
      results.set(op.id, { error: describeError(e), ms: performance.now() - t0 });
    }
  }
  return results;
}

/** Last op that produced a solid without error. */
export function finalSolid(graph, results) {
  for (let i = graph.ops.length - 1; i >= 0; i--) {
    const r = results.get(graph.ops[i].id);
    if (r && !r.error && r.value.kind === "empty") return null; // the body was deleted
    if (r && !r.error && r.value.kind === "solid") return { id: graph.ops[i].id, shape: r.value.shape };
  }
  return null;
}

export function volume(shape) {
  return measureVolume(shape);
}

export { makeBox };
