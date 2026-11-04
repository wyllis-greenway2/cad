// THROWAWAY prototype: compiles a JSON operation graph into OCCT solids via replicad.
// Every op runs in a try/catch so one failure is local: independent ops still build,
// dependents report "upstream failed" (blueprint: failures are non-fatal).
import {
  drawRectangle,
  drawRoundedRectangle,
  drawCircle,
  makeCylinder,
  makeBox,
  EdgeFinder,
  FaceFinder,
  measureVolume,
  getOC,
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

const OPS = {
  sketch(op, ctx) {
    const p = (k) => resolve(op[k], ctx.params);
    let drawing;
    if (op.shape === "rect") drawing = drawRectangle(p("w"), p("d"));
    else if (op.shape === "rounded_rect") drawing = drawRoundedRectangle(p("w"), p("d"), p("r"));
    else if (op.shape === "circle") drawing = drawCircle(p("radius"));
    else throw new Error(`unknown sketch shape ${op.shape}`);
    if (op.at) {
      const [x, y] = resolve(op.at, ctx.params);
      drawing = drawing.translate(x, y);
    }
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
    if (r && !r.error && r.value.kind === "solid") return { id: graph.ops[i].id, shape: r.value.shape };
  }
  return null;
}

export function volume(shape) {
  return measureVolume(shape);
}

export { makeBox };
