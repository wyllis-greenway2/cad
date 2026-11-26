// The kernel adapter (E1, `inv_kernel_boundary`): the only file that touches OCCT or replicad. Everything it hands out is plain data or an opaque handle;
// the engine above it knows nothing of the kernel's own objects. Numbers it returns are exact (E11): rounding is for the screen only.
import {
  Edge,
  Face,
  HASH_CODE_MAX,
  assembleWire,
  cast,
  downcast,
  makeCircle,
  makeLine,
  makeThreePointArc,
  setOC,
} from "replicad";
import initOC from "replicad-opencascadejs";

export type V3 = readonly [number, number, number];
type Raw = any; // the kernel's own objects: they do not leave this file
export interface FaceH {
  readonly raw: Raw;
}
export interface EdgeH {
  readonly raw: Raw;
}
export interface Facts {
  type: string;
  ne: V3;
  ce: V3;
  lo: V3;
  hi: V3;
  area: number;
}
/** what a kernel operation says each face of its input became (the kernel's own history); it may say nothing for faces it did make (E7) */
export interface Report {
  modified(f: FaceH): FaceH[];
  fromEdge(e: EdgeH): FaceH[];
  fromFace(f: FaceH): FaceH[];
  deleted(f: FaceH): boolean;
}

let oc: Raw = null;
/** `wasm`: where the kernel's WebAssembly file is, when the page (a browser's worker) has to say; Node finds it by itself */
export async function initKernel(wasm?: string): Promise<void> {
  if (oc) return;
  oc = await (initOC as unknown as (o?: { locateFile?: (f: string) => string }) => Promise<Raw>)(
    wasm ? { locateFile: () => wasm } : undefined,
  );
  setOC(oc);
  makeDeleteSafe();
}
/**
 * Every kernel object has one `delete`; deleting twice throws. replicad also deletes its wrappers from a finalizer that only runs when the event loop turns, so a long synchronous run
 * holds them all; this makes a second delete harmless, so the engine can free what it made at once (E17) and the finalizer's later delete does nothing.
 */
function makeDeleteSafe(): void {
  let proto = Object.getPrototypeOf(new oc.gp_Pnt(0, 0, 0));
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "delete")) proto = Object.getPrototypeOf(proto);
  if (!proto || proto.__safeDelete) return;
  const original = proto.delete;
  proto.delete = function (this: Raw) {
    try {
      original.call(this);
    } catch (e) {
      if (!/already deleted/i.test(String((e as Error)?.message ?? e))) throw e;
    }
  };
  proto.__safeDelete = true;
}

// ---------------------------------------------------------------- temporaries: freed when the step that made them is done (E17)
const stack: Raw[][] = [];
const t = <T>(raw: T): T => {
  stack[stack.length - 1]?.push(raw);
  return raw;
};
/** run `fn`; every temporary the kernel layer made inside it (makers, lists, copies) is deleted afterwards; handles a Solid owns live until it is released */
export function scoped<T>(fn: () => T): T {
  stack.push([]);
  try {
    return fn();
  } finally {
    const mine = stack.pop()!;
    for (const r of mine) {
      try {
        r.delete?.();
      } catch {
        /* already gone */
      }
    }
  }
}
/** a boolean that leaves its arguments as they were: the kernel's own constructor works in place, and after one push the shape it was given was no longer valid (found by the stress run), so the next step on that shape failed */
const boolean = (Op: Raw, a: Raw, b: Raw): Raw => {
  const op = t(new Op());
  op.SetArguments(toList([a]));
  op.SetTools(toList([b]));
  op.SetNonDestructive(true);
  op.SetToFillHistory(true);
  op.Build(progress());
  return op;
};
const progress = () => t(new oc.Message_ProgressRange());

/** a solid, and the face and edge handles taken from it (all freed with it) */
export class Solid {
  private owned: Raw[] = [];
  private fs: FaceH[] | null = null;
  private es: EdgeH[] | null = null;
  readonly raw: Raw;
  constructor(raw: Raw) {
    this.raw = raw;
  }
  private own<R>(r: R): R {
    this.owned.push(r);
    return r;
  }
  faces(): FaceH[] {
    return (this.fs ??= unique(this.raw, "TopAbs_FACE").map((r) => ({ raw: this.own(r) })));
  }
  edges(): EdgeH[] {
    return (this.es ??= unique(this.raw, "TopAbs_EDGE").map((r) => ({ raw: this.own(r) })));
  }
  release(): void {
    for (const r of this.owned) {
      try {
        r.delete?.();
      } catch {
        /* */
      }
    }
    try {
      this.raw.delete?.();
    } catch {
      /* */
    }
    this.owned = [];
    this.fs = this.es = null;
  }
}

function unique(shape: Raw, kind: string): Raw[] {
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const out: Raw[] = [],
    seen = new Map<number, Raw[]>();
  try {
    for (; ex.More(); ex.Next()) {
      const s = ex.Current(),
        h: number = oc.ReplicadShapeHasher.HashCode(s, HASH_CODE_MAX),
        l = seen.get(h) ?? seen.set(h, []).get(h)!;
      if (l.some((u) => u.IsSame(s))) {
        s.delete?.();
        continue;
      }
      l.push(s);
      out.push(s);
    }
  } finally {
    ex.delete();
  }
  return out;
}
const toArray = (list: Raw): FaceH[] => {
  const out: FaceH[] = [];
  while (list.Size() > 0) {
    const f = list.First();
    out.push({ raw: t(f.Oriented(f.Orientation())) });
    list.RemoveFirst();
  }
  t(list);
  return out;
};
const toList = (shapes: Raw[]): Raw => {
  const l = t(new oc.NCollection_List_TopoDS_Shape());
  for (const s of shapes) l.Append(s);
  return l;
};

export const sameFace = (a: FaceH, b: FaceH): boolean => a.raw.IsSame(b.raw);
export const sameEdge = (a: EdgeH, b: EdgeH): boolean => a.raw.IsSame(b.raw);

/** the kernel wrappers a reading makes are deleted at once (replicad's vectors and boxes hold kernel objects) */
const drop = (...xs: Raw[]) => {
  for (const x of xs) {
    try {
      x?.delete?.();
    } catch {
      /* */
    }
  }
};
const factsOf = new WeakMap<FaceH, Facts>(); // a face never changes, so what is read of it is read once (the fingerprint, the checks, the mesh and the pulls all ask)
export function facts(f: FaceH): Facts {
  const known = factsOf.get(f);
  if (known) return known;
  const face = new Face(downcast(f.raw)),
    q = face.normalAt(),
    c = face.center,
    bb = face.boundingBox,
    [lo, hi] = bb.bounds,
    l = Math.hypot(q.x, q.y, q.z) || 1;
  const props = t(new oc.GProp_GProps());
  oc.BRepGProp.SurfaceProperties(f.raw, props, false, false);
  const out: Facts = {
    type: face.geomType as string,
    ne: [q.x / l, q.y / l, q.z / l],
    ce: [c.x, c.y, c.z],
    lo: [lo[0]!, lo[1]!, lo[2]!],
    hi: [hi[0]!, hi[1]!, hi[2]!],
    area: props.Mass(),
  };
  drop(q, c, bb, face);
  factsOf.set(f, out);
  return out;
}
export function edgeEnds(e: EdgeH): [V3, V3] {
  const E = new Edge(downcast(e.raw)),
    a = E.startPoint,
    b = E.endPoint,
    out: [V3, V3] = [
      [a.x, a.y, a.z],
      [b.x, b.y, b.z],
    ];
  drop(a, b, E);
  return out;
}
export function edgeMid(e: EdgeH): V3 {
  const E = new Edge(downcast(e.raw)),
    c = E.pointAt(0.5),
    out: V3 = [c.x, c.y, c.z];
  drop(c, E);
  return out;
}
/** the point of an edge at a fraction (0 to 1) of its length-parameter */
export function edgeAt(e: EdgeH, u: number): V3 {
  const E = new Edge(downcast(e.raw)),
    c = E.pointAt(u),
    out: V3 = [c.x, c.y, c.z];
  drop(c, E);
  return out;
}
/** the circle an edge lies on (a whole circle or an arc of one: its centre, radius, the way its plane faces, whether it is closed), or null for any other edge (a line, an ellipse, a spline) */
export function edgeCircle(e: EdgeH): { c: V3; r: number; normal: V3; closed: boolean } | null {
  const [s, f] = edgeEnds(e),
    closed = Math.hypot(s[0] - f[0], s[1] - f[1], s[2] - f[2]) < 1e-9,
    us = closed ? [0, 1 / 3, 2 / 3, 1 / 6, 5 / 6] : [0, 0.5, 1, 0.25, 0.75],
    P = us.map((u) => edgeAt(e, u));
  const a = P[0]!,
    b = P[1]!,
    c = P[2]!,
    ab: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    ac: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]],
    n2 = n[0] * n[0] + n[1] * n[1] + n[2] * n[2];
  if (n2 < 1e-18) return null; // three points in a line
  const d1 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2],
    d2 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2];
  // the centre of the circle through three points: a + (|ac|2 (n x ab) + |ab|2 (ac x n)) / (2 |n|2), n = ab x ac
  const k = 1 / (2 * n2),
    ctr: V3 = [
      a[0] + k * (d2 * (n[1] * ab[2] - n[2] * ab[1]) + d1 * (ac[1] * n[2] - ac[2] * n[1])),
      a[1] + k * (d2 * (n[2] * ab[0] - n[0] * ab[2]) + d1 * (ac[2] * n[0] - ac[0] * n[2])),
      a[2] + k * (d2 * (n[0] * ab[1] - n[1] * ab[0]) + d1 * (ac[0] * n[1] - ac[1] * n[0])),
    ];
  const r = Math.hypot(a[0] - ctr[0], a[1] - ctr[1], a[2] - ctr[2]),
    L = Math.sqrt(n2);
  for (const q of P.slice(3))
    if (Math.abs(Math.hypot(q[0] - ctr[0], q[1] - ctr[1], q[2] - ctr[2]) - r) > 1e-7 * Math.max(1, r)) return null;
  return { c: ctr, r, normal: [n[0] / L, n[1] / L, n[2] / L], closed };
}
export function edgeLength(e: EdgeH): number {
  return scoped(() => {
    const p = t(new oc.GProp_GProps());
    oc.BRepGProp.LinearProperties(e.raw, p, false, false);
    return p.Mass();
  });
}
/** the vertices of a solid, as points (in the order the kernel walks them) */
export function vertexPoints(a: Solid): V3[] {
  return scoped(() =>
    unique(a.raw, "TopAbs_VERTEX").map((v) => {
      const p = t(oc.BRep_Tool.Pnt(t(downcast(v))));
      return [p.X(), p.Y(), p.Z()] as V3;
    }),
  );
}
/** the vertices of a face, as points */
export function faceVertexPoints(f: FaceH): V3[] {
  return scoped(() =>
    unique(f.raw, "TopAbs_VERTEX").map((v) => {
      const p = t(oc.BRep_Tool.Pnt(t(downcast(v))));
      return [p.X(), p.Y(), p.Z()] as V3;
    }),
  );
}
export const faceEdges = (f: FaceH): EdgeH[] => unique(f.raw, "TopAbs_EDGE").map((r) => ({ raw: t(r) }));
/** the area two faces share (a boolean common): used to recover ids where the kernel says nothing (E7) */
export function overlap(a: FaceH, b: FaceH): number {
  const op = boolean(oc.BRepAlgoAPI_Common, a.raw, b.raw);
  if (!op.IsDone()) return 0;
  const s = op.Shape();
  let sum = 0;
  for (const r of unique(s, "TopAbs_FACE")) {
    const p = t(new oc.GProp_GProps());
    oc.BRepGProp.SurfaceProperties(r, p, false, false);
    sum += p.Mass();
    r.delete?.();
  }
  s.delete?.();
  return sum;
}
export const volume = (s: Solid): number => {
  const p = t(new oc.GProp_GProps());
  oc.BRepGProp.VolumeProperties(s.raw, p, false, false, false);
  return p.Mass();
};
/** a solid that cannot be right: a volume or a face area that is not a number or is beyond any part (a kilometre across), which the kernel's own validity check passes (the shell once gave a face of 1e101 mm squared) */
export function absurd(s: Solid): boolean {
  const v = volume(s);
  if (!Number.isFinite(v) || Math.abs(v) > 1e12) return true;
  return s.faces().some((f) => {
    const q = facts(f);
    return !Number.isFinite(q.area) || q.area > 1e10 || q.hi.some((x, i) => !Number.isFinite(x) || x - q.lo[i]! > 1e6);
  });
}
export const valid = (s: Solid): boolean => t(new oc.BRepCheck_Analyzer(s.raw, true, false)).IsValid();

// ---------------------------------------------------------------- history of an operation
function reportOf(maker: Raw, via: (raw: Raw) => Raw = (r) => r): Report {
  const safe = <R>(fn: () => R, otherwise: R): R => {
    try {
      return fn();
    } catch {
      return otherwise;
    }
  };
  return {
    modified: (f) =>
      safe(() => {
        const c = via(f.raw),
          m = toArray(maker.Modified(c));
        return m.length || c === f.raw || maker.IsDeleted(c) ? m : [{ raw: c }];
      }, []), // on a copy a face the kernel left alone is the copy's own face
    fromEdge: (e) => safe(() => toArray(maker.Generated(via(e.raw))), []),
    fromFace: (f) => safe(() => toArray(maker.Generated(via(f.raw))), []),
    deleted: (f) => safe(() => !!maker.IsDeleted(via(f.raw)), false),
  };
}

// ---------------------------------------------------------------- operations
/** a deep copy of a shape (its own geometry), and where each part of the original went in it: an operation that works in place on what it is given (a fillet changes tolerances) is given the copy */
function deepCopy(raw: Raw): { shape: Raw; to: (part: Raw) => Raw } {
  const mk = t(new oc.BRepBuilderAPI_Transform(raw, t(new oc.gp_Trsf()), true));
  mk.Build(progress());
  return {
    shape: mk.Shape(),
    to: (part) => {
      const q = mk.ModifiedShape(part);
      return q.IsNull() ? part : q;
    },
  };
}
export interface Made {
  solid: Solid;
  report: Report;
}
const fail = (what: string): never => {
  throw new Error(what);
};

/** one closed loop of a profile: a polygon whose sides may be arcs (a mid point on the side), or a circle (a centre, a radius, the way it faces) */
export type Loop =
  { kind: "poly"; pts: readonly V3[]; mids: readonly (V3 | null)[] } | { kind: "circle"; c: V3; r: number; normal: V3 };
/** a face bounded by a loop, with holes cut in it by the other loops (a profile with holes, E4) */
export function profileFace(outer: Loop, holes: readonly Loop[] = []): FaceH {
  const mk = t(new oc.BRepBuilderAPI_MakeFace(loopWire(outer), true));
  let face = mk.Face();
  if (holes.length) {
    const withHoles = t(new oc.BRepBuilderAPI_MakeFace(face));
    for (const h of holes) withHoles.Add(downcast(t(loopWire(h).Reversed()))); // a hole runs the other way round; the kernel wants a wire, not a shape
    face = withHoles.Face();
  }
  return { raw: t(face) };
}
/** a closed polygon through 3D points (a sketch on any plane) */
export const polygonFace3 = (points: readonly V3[]): FaceH =>
  profileFace({ kind: "poly", pts: points, mids: points.map(() => null) });
function loopWire(l: Loop): Raw {
  if (l.kind === "circle")
    return t(
      assembleWire([makeCircle(l.r, [l.c[0], l.c[1], l.c[2]], [l.normal[0], l.normal[1], l.normal[2]])]).wrapped,
    );
  const edges = [];
  for (let i = 0; i < l.pts.length; i++) {
    const p = l.pts[i]!,
      q = l.pts[(i + 1) % l.pts.length]!,
      m = l.mids[i];
    edges.push(
      m
        ? makeThreePointArc([p[0], p[1], p[2]], [m[0], m[1], m[2]], [q[0], q[1], q[2]])
        : makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]]),
    );
  }
  return t(assembleWire(edges).wrapped);
}
const wireOf = (pts: readonly V3[], closed: boolean): Raw => {
  const n = closed ? pts.length : pts.length - 1,
    edges = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i]!,
      q = pts[(i + 1) % pts.length]!;
    edges.push(makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]]));
  }
  return t(assembleWire(edges).wrapped);
};
/** the kernel throws its own objects, not errors; what the engine shows is a sentence */
function guard<R>(what: string, fn: () => R): R {
  try {
    return fn();
  } catch (e) {
    throw e instanceof Error ? e : new Error(`the kernel could not make ${what}`);
  }
}
export interface Prism extends Made {
  first: FaceH;
  last: FaceH;
}
/** a face pulled along a vector; `first` and `last` are its start and end faces, the report's `fromEdge` gives the side each edge made */
export function prism(face: FaceH, v: V3): Prism {
  const mk = t(new oc.BRepPrimAPI_MakePrism(face.raw, t(new oc.gp_Vec(v[0], v[1], v[2])), false, true));
  return {
    solid: new Solid(mk.Shape()),
    report: reportOf(mk),
    first: { raw: t(mk.FirstShape()) },
    last: { raw: t(mk.LastShape()) },
  };
}
/** a face turned about an axis (a point and a direction) through an angle; the flat faces made by edges across the axis are not in the kernel's report (E7) */
export function revolve(face: FaceH, point: V3, dir: V3, degrees: number): Prism {
  return guard("the revolve", () => {
    const ax = t(
      new oc.gp_Ax1(t(new oc.gp_Pnt(point[0], point[1], point[2])), t(new oc.gp_Dir(dir[0], dir[1], dir[2]))),
    );
    const mk = t(new oc.BRepPrimAPI_MakeRevol(face.raw, ax, (degrees * Math.PI) / 180, false));
    return {
      solid: new Solid(mk.Shape()),
      report: reportOf(mk),
      first: { raw: t(mk.FirstShape()) },
      last: { raw: t(mk.LastShape()) },
    };
  });
}
/** a solid through two or more sections (closed polygons of 3D points, the same number of points each); `side(i)` is the face made from the i-th segment of the first section */
export interface Lofted extends Prism {
  side(i: number): FaceH | null;
}
export function loft(sections: readonly (readonly V3[])[], ruled: boolean): Lofted {
  return guard("the loft", () => {
    const ts = t(new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6));
    let firstWire: Raw = null;
    sections.forEach((pts, i) => {
      const w = wireOf(pts, true);
      if (i === 0) firstWire = w;
      ts.AddWire(w);
    });
    ts.Build(progress());
    const mids = sections[0]!.map((p, i) => {
      const q = sections[0]![(i + 1) % sections[0]!.length]!;
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    });
    const edges = unique(firstWire, "TopAbs_EDGE").map((r) => ({ raw: t(r) }));
    const at = (e: EdgeH) => {
      const m = edgeMid(e);
      return mids.findIndex((q) => q.every((v, k) => Math.abs(v - m[k]!) < 1e-6));
    };
    return {
      solid: new Solid(ts.Shape()),
      report: reportOf(ts),
      first: { raw: t(ts.FirstShape()) },
      last: { raw: t(ts.LastShape()) },
      side: (i: number) => {
        const e = edges.find((x) => at(x) === i);
        if (!e) return null;
        try {
          return { raw: t(ts.GeneratedFace(e.raw)) };
        } catch {
          return null;
        }
      },
    };
  });
}
/** a face swept along a path of straight legs (3D points); each edge of the profile makes a face for every leg */
export function pipe(spine: readonly V3[], profile: FaceH): Prism {
  return guard("the sweep", () => {
    const mk = t(new oc.BRepOffsetAPI_MakePipe(wireOf(spine, false), profile.raw));
    return {
      solid: new Solid(mk.Shape()),
      report: reportOf(mk),
      first: { raw: t(mk.FirstShape()) },
      last: { raw: t(mk.LastShape()) },
    };
  });
}
/** the body hollowed: the face taken off, a wall of the thickness left (inward); the report's `fromFace` gives the inner face each face made */
export function shell(a: Solid, remove: FaceH, thickness: number): Made {
  return guard("the shell", () => {
    const th = t(new oc.BRepOffsetAPI_MakeThickSolid());
    th.MakeThickSolidByJoin(
      a.raw,
      toList([remove.raw]),
      -thickness,
      1e-3,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
    );
    return { solid: new Solid(th.Shape()), report: reportOf(th) };
  });
}
export function fuse(a: Solid, b: Solid): Made {
  const op = boolean(oc.BRepAlgoAPI_Fuse, a.raw, b.raw);
  if (!op.IsDone()) fail("the join failed");
  return { solid: new Solid(op.Shape()), report: reportOf(op) };
}
export function cut(a: Solid, b: Solid): Made {
  const op = boolean(oc.BRepAlgoAPI_Cut, a.raw, b.raw);
  if (!op.IsDone()) fail("the cut failed");
  return { solid: new Solid(op.Shape()), report: reportOf(op) };
}
/** the body split along line segments lying on its faces (an imprint, E4); the kernel's splitter with history */
export function split(a: Solid, segments: readonly (readonly [V3, V3])[]): Made {
  const sp = t(new oc.BRepAlgoAPI_Splitter()),
    tools = segments.map(([p, q]) => t(makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]]).wrapped));
  sp.SetArguments(toList([a.raw]));
  sp.SetTools(toList(tools));
  sp.SetToFillHistory(true);
  sp.Build(progress());
  if (sp.HasErrors()) fail("the imprint failed");
  return { solid: new Solid(sp.Shape()), report: reportOf(sp) };
}
/** `rounded`: the edges the kernel actually modified: it follows an edge along the ones that continue it (tangent), so this can be more than were asked for */
export interface Rounded extends Made {
  round(e: EdgeH): FaceH[];
  rounded: EdgeH[];
}
/** a round (`fillet`) or a flat cut (`chamfer`) of the given size on the given edges */
/** a size that varies along an edge: the size at fractions (0 to 1) of the edge, in order: exact at the points, a straight law between two, a smooth one through three or more (spike 7, E36) */
export type SizeLaw = readonly (readonly [number, number])[];
export function roundEdges(
  a: Solid,
  edges: readonly EdgeH[],
  size: number | SizeLaw | ((e: EdgeH) => SizeLaw),
  mode: "fillet" | "chamfer",
  shape: "Rational" | "QuasiAngular" | "Polynomial" = "Rational",
): Rounded {
  return guard(`the ${mode}`, () => {
    if (typeof size !== "number" && mode === "chamfer")
      throw new Error("a chamfer cannot vary along its edge yet (only a round can)");
    const cp = deepCopy(a.raw);
    const mk =
      mode === "fillet"
        ? t(new oc.BRepFilletAPI_MakeFillet(cp.shape, oc.ChFi3d_FilletShape[`ChFi3d_${shape}`]))
        : t(new oc.BRepFilletAPI_MakeChamfer(cp.shape));
    for (const e of edges) {
      if (typeof size === "number") {
        mk.Add(size, t(downcast(cp.to(e.raw))));
        continue;
      }
      const law = typeof size === "function" ? size(e) : size,
        arr = t(new oc.NCollection_Array1_gp_Pnt2d(1, law.length));
      law.forEach((q, k) => arr.SetValue(k + 1, t(new oc.gp_Pnt2d(q[0], q[1]))));
      (mk as unknown as { Add(law: unknown, e: unknown): void }).Add(arr, t(downcast(cp.to(e.raw))));
    }
    const inCopy: EdgeH[] = []; // the kernel's edges are those of the copy: said back as the edges of the shape that was given
    for (let i = 1; i <= mk.NbContours(); i++)
      for (let j = 1; j <= mk.NbEdges(i); j++) inCopy.push({ raw: t(mk.Edge(i, j)) });
    const rounded = a.edges().filter((o) => inCopy.some((x) => sameEdge(x, { raw: cp.to(o.raw) })));
    mk.Build(progress());
    if (!mk.IsDone()) fail(`the ${mode} could not be made at that size`);
    const rep = reportOf(mk, cp.to);
    return { solid: new Solid(mk.Shape()), report: rep, round: (e: EdgeH) => rep.fromEdge(e), rounded };
  });
}
export function turn(a: Solid, axis: V3, degrees: number, pivot: V3 = [0, 0, 0]): Made {
  const tr = t(new oc.gp_Trsf());
  tr.SetRotation(
    t(new oc.gp_Ax1(t(new oc.gp_Pnt(pivot[0], pivot[1], pivot[2])), t(new oc.gp_Dir(axis[0], axis[1], axis[2])))),
    (degrees * Math.PI) / 180,
  );
  const mk = t(new oc.BRepBuilderAPI_Transform(a.raw, tr, true));
  mk.Build(progress());
  return { solid: new Solid(mk.Shape()), report: reportOf(mk) };
}
/** the body moved by a vector */
export function move(a: Solid, by: V3): Made {
  const tr = t(new oc.gp_Trsf());
  tr.SetTranslation(t(new oc.gp_Vec(by[0], by[1], by[2])));
  const mk = t(new oc.BRepBuilderAPI_Transform(a.raw, tr, true));
  mk.Build(progress());
  return { solid: new Solid(mk.Shape()), report: reportOf(mk) };
}
export function common(a: Solid, b: Solid): Made {
  const op = boolean(oc.BRepAlgoAPI_Common, a.raw, b.raw);
  if (!op.IsDone()) fail("the intersection failed");
  return { solid: new Solid(op.Shape()), report: reportOf(op) };
}
/** join faces that lie in one surface; the kernel's history of this is not available, so the engine recovers ids by `overlap` (E7, E9) */
/** the faces of one surface joined into one. Joining can itself make an invalid solid out of a valid one (`dev/pull-equivalence-check.ts`, case 236 of seed 7), so the joined solid is checked and, when it is not valid, `joined` is false and the caller keeps what it had */
export function unify(a: Solid, keep: readonly EdgeH[] = []): { solid: Solid; joined: boolean } {
  const once = (raw: Raw): Raw => {
    const u = t(new oc.ShapeUpgrade_UnifySameDomain(raw, true, true, false));
    for (const e of keep) u.KeepShape(e.raw); // edges that are the person's own lines (an imprint's seam) are not merged away
    u.Build();
    return u.Shape();
  };
  // one pass does not always join faces on a surface that wraps round (a cylinder's seam); a second pass does, and stops when nothing more joins
  let raw = once(a.raw),
    n = unique(raw, "TopAbs_FACE").length;
  for (let pass = 0; pass < 2; pass++) {
    const next = once(raw),
      m = unique(next, "TopAbs_FACE").length;
    if (m >= n) {
      next.delete?.();
      break;
    }
    raw = next;
    n = m;
  }
  const solid = new Solid(raw);
  if (!valid(solid) && valid(a)) {
    solid.release();
    return { solid: a, joined: false };
  }
  return { solid, joined: true };
}

// ---------------------------------------------------------------- moving a face with its neighbours (spike 8, `prototypes/face-modes`)
const common2 = (a: Raw, b: Raw): Raw => t(new oc.BRepAlgoAPI_Common(a, b, progress())).Shape();
const volumeOf = (raw: Raw): number => {
  const p = t(new oc.GProp_GProps());
  oc.BRepGProp.VolumeProperties(raw, p, false, false, false);
  return p.Mass();
};
/** the half-space on the side of the plane (a point and a normal) where `ref` lies. It is infinite: only ever cut from a finite shape, never intersected with another half-space (the kernel gives garbage) */
function halfSpace(p: V3, n: V3, ref: V3): Raw {
  const pl = t(new oc.gp_Pln(t(new oc.gp_Pnt(p[0], p[1], p[2])), t(new oc.gp_Dir(n[0], n[1], n[2])))),
    f = t(new oc.BRepBuilderAPI_MakeFace(pl, -1e4, 1e4, -1e4, 1e4)).Face();
  return t(new oc.BRepPrimAPI_MakeHalfSpace(f, t(new oc.gp_Pnt(ref[0], ref[1], ref[2])))).Solid();
}
const add3 = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** a finite box around a body and far beyond it: the start of every region, so that nothing infinite is intersected with anything infinite */
function bigBox(a: Solid, pad: number): Raw {
  const all = a.faces().map(facts),
    lo = [0, 1, 2].map((i) => Math.min(...all.map((q) => q.lo[i]!)) - pad),
    hi = [0, 1, 2].map((i) => Math.max(...all.map((q) => q.hi[i]!)) + pad);
  const base = polygonFace3([
    [lo[0]!, lo[1]!, lo[2]!],
    [hi[0]!, lo[1]!, lo[2]!],
    [hi[0]!, hi[1]!, lo[2]!],
    [lo[0]!, hi[1]!, lo[2]!],
  ]);
  return prism(base, [0, 0, hi[2]! - lo[2]!]).solid.raw;
}
const sizeOf = (a: Solid): number => {
  const all = a.faces().map(facts);
  return Math.max(
    ...[0, 1, 2].map((i) => Math.max(...all.map((q) => q.hi[i]!)) - Math.min(...all.map((q) => q.lo[i]!))),
  );
};
export interface Region {
  tool: Solid;
  /** the face at the new place has gone: the neighbours meet before it gets there (the distance `d` is past the limit) */ collapsed: boolean;
}
/**
 * The region a flat face sweeps when it is moved by `d` along its outward normal and the faces `around` it (all flat) are carried on as planes: the slab between the old and the new plane, kept on the side of each
 * neighbour's plane where the face lies. Add it (d > 0) or take it (d < 0). `collapsed`: the face at the new plane no longer exists, because the neighbours have met.
 */
export function moveRegion(a: Solid, face: FaceH, around: readonly FaceH[], d: number): Region {
  return guard("the move", () => {
    const f = facts(face);
    if (f.type !== "PLANE") fail(`the face is ${f.type}, not flat`);
    const s = Math.sign(d),
      pad = 10 * (sizeOf(a) + Math.abs(d)),
      n = f.ne,
      c = f.ce;
    let tool = common2(bigBox(a, pad), halfSpace(c, [n[0] * s, n[1] * s, n[2] * s], add3(c, n, s * Math.abs(d) * 0.5)));
    tool = common2(tool, halfSpace(add3(c, n, d), [-n[0] * s, -n[1] * s, -n[2] * s], c));
    for (const g of around) {
      const q = facts(g);
      if (q.type === "CYLINDRE") {
        // a round wall along the move (the wall of a hole or a boss): the region is kept inside it or outside it, on the side the moved face lies
        const cy = cylinderOf(g);
        if (Math.abs(dot3(cy.dir, n)) < 0.999) fail("a round face beside it has its axis across the move");
        const radial = (p: V3) => {
          const w: V3 = [p[0] - cy.point[0], p[1] - cy.point[1], p[2] - cy.point[2]],
            al = dot3(w, cy.dir);
          return Math.hypot(w[0] - cy.dir[0] * al, w[1] - cy.dir[1] * al, w[2] - cy.dir[2] * al);
        };
        const outside = faceVertexPoints(face).some((p) => radial(p) > cy.r + 1e-6),
          mid = dot3(c, cy.dir),
          cyl = cylinderSolid(cy, cy.r, mid - pad, mid + pad);
        tool = outside ? t(new oc.BRepAlgoAPI_Cut(tool, cyl, progress())).Shape() : common2(tool, cyl);
        if (!(volumeOf(tool) > 1e-9)) return { tool: new Solid(tool), collapsed: true };
        continue;
      }
      if (q.type !== "PLANE") fail(`a face beside it is ${q.type}, not flat or a round wall along the move`);
      if (Math.abs(dot3([c[0] - q.ce[0], c[1] - q.ce[1], c[2] - q.ce[2]], q.ne)) < 1e-9)
        fail("the face's centre lies in the plane of a face beside it");
      tool = common2(tool, halfSpace(q.ce, q.ne, c));
      if (!(volumeOf(tool) > 1e-9)) return { tool: new Solid(tool), collapsed: true };
    }
    const newPlane = add3(c, n, d),
      solid = new Solid(tool);
    const here = solid.faces().some((h) => {
      const q = facts(h);
      return (
        q.type === "PLANE" &&
        Math.abs(dot3(q.ne, n)) > 0.999 &&
        Math.abs(dot3([q.ce[0] - newPlane[0], q.ce[1] - newPlane[1], q.ce[2] - newPlane[2]], n)) < 1e-6 &&
        q.area > 1e-6
      );
    });
    return { tool: solid, collapsed: !here };
  });
}
/** a solid cylinder about a cylinder's axis, of radius `r`, from axis coordinate `x0` to `x1` (the coordinate is the distance along the axis direction from the origin) */
function cylinderSolid(cy: Cylinder, r: number, x0: number, x1: number): Raw {
  const base = dot3(cy.point, cy.dir),
    at = (x: number): V3 => add3(cy.point, cy.dir, x - base);
  return prism(profileFace({ kind: "circle", c: at(x0), r, normal: cy.dir }), [
    cy.dir[0] * (x1 - x0),
    cy.dir[1] * (x1 - x0),
    cy.dir[2] * (x1 - x0),
  ]).solid.raw;
}
export interface Cylinder {
  r: number;
  point: V3;
  dir: V3;
}
export const cylinderOf = (face: FaceH): Cylinder =>
  scoped(() => {
    const c = t(new oc.BRepAdaptor_Surface(t(downcast(face.raw)), true)).Cylinder(),
      ax = t(c.Axis()),
      p = t(ax.Location()),
      d = t(ax.Direction());
    return { r: c.Radius(), point: [p.X(), p.Y(), p.Z()] as V3, dir: [d.X(), d.Y(), d.Z()] as V3 };
  });
/** the face's outward normal at a point on its edge: for a cylinder wall it says whether the wall is a boss's (away from the axis) or a hole's (toward it) */
export function outwardAtEdge(face: FaceH): { at: V3; normal: V3 } {
  const e = faceEdges(face)[0]!,
    m = edgeMid(e),
    F = new Face(downcast(face.raw)),
    p = new oc.gp_Pnt(m[0], m[1], m[2]),
    q = F.normalAt(p),
    l = Math.hypot(q.x, q.y, q.z) || 1,
    out = { at: m, normal: [q.x / l, q.y / l, q.z / l] as V3 };
  drop(p, q, F);
  return out;
}
/** the angle in degrees between the outward normals of the two faces beside an edge, at the edge's middle: 0 for a smooth edge (a fillet's seam, a tangent join), 90 for a square corner */
export function edgeTurn(e: EdgeH, a: FaceH, b: FaceH): number {
  return scoped(() => {
    const m = edgeMid(e),
      p = t(new oc.gp_Pnt(m[0], m[1], m[2])),
      n = [a, b].map((f) => {
        const F = new Face(downcast(f.raw)),
          q = F.normalAt(p),
          l = Math.hypot(q.x, q.y, q.z) || 1,
          v: V3 = [q.x / l, q.y / l, q.z / l];
        drop(q, F);
        return v;
      });
    return (Math.acos(Math.max(-1, Math.min(1, dot3(n[0]!, n[1]!)))) * 180) / Math.PI;
  });
}
export interface Ring {
  tool: Solid;
  boss: boolean;
  r: number;
  r2: number;
}
/** the region a cylinder wall sweeps when it moves by `d` along its outward normal (its radius changes: a boss grows, a hole shrinks for d > 0): the ring between the radii, kept on the side of each flat neighbour's plane where the wall lies */
export function ringRegion(a: Solid, wall: FaceH, around: readonly FaceH[], d: number): Ring {
  return guard("the offset", () => {
    const q = facts(wall);
    if (q.type !== "CYLINDRE") fail(`the face is ${q.type}, not a cylinder`);
    const cy = cylinderOf(wall),
      out = outwardAtEdge(wall),
      rel: V3 = [out.at[0] - cy.point[0], out.at[1] - cy.point[1], out.at[2] - cy.point[2]],
      along = dot3(rel, cy.dir),
      radial: V3 = [rel[0] - cy.dir[0] * along, rel[1] - cy.dir[1] * along, rel[2] - cy.dir[2] * along];
    const boss = dot3(out.normal, radial) > 0,
      r2 = boss ? cy.r + d : cy.r - d;
    if (!(r2 > 1e-6)) fail("the radius would not be above nothing");
    const corners = a.faces().flatMap((h) => {
      const b = facts(h);
      return [0, 1].flatMap((i) =>
        [0, 1].flatMap((j) =>
          [0, 1].map((k) => dot3([[b.lo, b.hi][i]![0], [b.lo, b.hi][j]![1], [b.lo, b.hi][k]![2]], cy.dir)),
        ),
      );
    });
    const a0 = Math.min(...corners) - 5 - Math.abs(d),
      a1 = Math.max(...corners) + 5 + Math.abs(d),
      R1 = Math.min(cy.r, r2),
      R2 = Math.max(cy.r, r2);
    const base = dot3(cy.point, cy.dir),
      at = (x: number): V3 => add3(cy.point, cy.dir, x - base);
    const tube = (r: number, x0: number, x1: number) => cylinderSolid(cy, r, x0, x1);
    let tool = t(new oc.BRepAlgoAPI_Cut(tube(R2, a0, a1), tube(R1, a0 - 1, a1 + 1), progress())).Shape();
    for (const g of around) {
      const b = facts(g);
      if (b.type !== "PLANE") fail(`a face beside it is ${b.type}, not flat`);
      tool = common2(tool, halfSpace(b.ce, b.ne, q.ce));
    }
    if (!(volumeOf(tool) > 1e-9)) fail("there is nothing between the old wall and the new one");
    return { tool: new Solid(tool), boss, r: cy.r, r2 };
  });
}

/** the points of `a` (six places on it) all lie on the surface of `b`: for the surfaces whose own numbers the kernel build does not give (a cone, a torus) the surfaces are compared by where their points are */
function onSurface(a: FaceH, b: FaceH): boolean {
  return scoped(() => {
    const F = new Face(downcast(a.raw)),
      surf = t(oc.BRep_Tool.Surface(t(downcast(b.raw))));
    for (const [u, v] of [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.5, 0.5],
      [0.2, 0.8],
      [0.8, 0.8],
      [0.35, 0.65],
    ] as const) {
      const p = F.pointOnSurface(u, v),
        proj = t(new oc.GeomAPI_ProjectPointOnSurf(t(new oc.gp_Pnt(p.x, p.y, p.z)), surf));
      drop(p);
      if (!proj.NbPoints() || proj.LowerDistance() > 1e-6) return false;
    }
    return true;
  });
}
/** two faces lie on one surface (a plane; a cylinder of the same axis and radius; a cone, sphere or torus that the points of each lie on): the kernel may keep them apart as two faces, but to the person they are one face */
export function sameSurface(a: FaceH, b: FaceH, pa?: Facts, pb?: Facts): boolean {
  const p = pa ?? facts(a),
    q = pb ?? facts(b);
  if (p.type !== q.type) return false;
  if (p.type === "PLANE")
    return (
      dot3(p.ne, q.ne) > 1 - 1e-9 &&
      Math.abs(dot3([p.ce[0] - q.ce[0], p.ce[1] - q.ce[1], p.ce[2] - q.ce[2]], p.ne)) < 1e-7
    );
  if (p.type === "CYLINDRE") {
    const c = cylinderOf(a),
      d = cylinderOf(b),
      par = Math.abs(Math.abs(dot3(c.dir, d.dir)) - 1) < 1e-9,
      w: V3 = [d.point[0] - c.point[0], d.point[1] - c.point[1], d.point[2] - c.point[2]],
      along = dot3(w, c.dir);
    return (
      par &&
      Math.abs(c.r - d.r) < 1e-7 &&
      Math.hypot(w[0] - c.dir[0] * along, w[1] - c.dir[1] * along, w[2] - c.dir[2] * along) < 1e-7
    );
  }
  if (p.type === "CONE" || p.type === "SPHERE" || p.type === "TORUS") return onSurface(a, b) && onSurface(b, a);
  return false;
}

// ---------------------------------------------------------------- several bodies (E38 to E43): a shape may hold more than one solid
/** each solid of a shape, as a solid of its own (the faces of it are the same faces: `sameFace` tells them) */
export function solidsOf(a: Solid): Solid[] {
  return unique(a.raw, "TopAbs_SOLID").map((r) => new Solid(r));
}
/** several solids held together, none fused to another (bodies that touch or overlap stay apart); the faces are the same faces */
export function compoundOf(parts: readonly Solid[]): Solid {
  const c = new oc.TopoDS_Compound(),
    b = new oc.TopoDS_Builder();
  b.MakeCompound(c);
  for (const p of parts) b.Add(c, p.raw);
  b.delete?.();
  return new Solid(c);
}
/** for each face of the solid (in the order `faces()` gives them), which of its solids it lies in */
export function solidIndexOfFaces(a: Solid): number[] {
  const solids = unique(a.raw, "TopAbs_SOLID"),
    faces = a.faces();
  const per = solids.map((s) => unique(s, "TopAbs_FACE")),
    out = faces.map((f) => per.findIndex((fs) => fs.some((g) => g.IsSame(f.raw))));
  for (const s of solids) s.delete?.();
  for (const fs of per) for (const g of fs) g.delete?.();
  return out;
}

/** a copy of the solid mirrored in a plane (a point on it and its normal); the report says which face each face became */
export function mirror(a: Solid, point: V3, normal: V3): Made {
  const tr = t(new oc.gp_Trsf());
  tr.SetMirror(
    t(new oc.gp_Ax2(t(new oc.gp_Pnt(point[0], point[1], point[2])), t(new oc.gp_Dir(normal[0], normal[1], normal[2])))),
  );
  const mk = t(new oc.BRepBuilderAPI_Transform(a.raw, tr, true));
  mk.Build(progress());
  return { solid: new Solid(mk.Shape()), report: reportOf(mk) };
}

/**
 * The pointed ("gothic") end of a rod, our own construction past the kernel's limit (E34, spike 7A): the rod's flat end at `c` (the way out is `outward`, the rod has radius `r`) is cut by the surface made by
 * turning an arc of radius `s` about the axis: the arc is tangent to the wall `t = sqrt(2 r s - r^2)` below the end and reaches the axis at the end's own height. At s = r it is the dome; above it a point.
 * Exact and valid (no rolling ball); needs `r < s` and `t` no longer than the wall.
 */
export function pointedEnd(a: Solid, c: V3, outward: V3, r: number, s: number): Made {
  return guard("the pointed end", () => {
    const tt = Math.sqrt(2 * r * s - r * r),
      n = outward,
      ref: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const dotn = ref[0] * n[0] + ref[1] * n[1] + ref[2] * n[2],
      u0: V3 = [ref[0] - dotn * n[0], ref[1] - dotn * n[1], ref[2] - dotn * n[2]],
      ul = Math.hypot(...u0),
      u: V3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
    const P = (rho: number, z: number): V3 => [
      c[0] + u[0] * rho + n[0] * z,
      c[1] + u[1] * rho + n[1] * z,
      c[2] + u[2] * rho + n[2] * z,
    ];
    const cc = [r - s, -tt],
      phi = Math.atan2(tt, s - r),
      mid = P(cc[0]! + s * Math.cos(phi / 2), cc[1]! + s * Math.sin(phi / 2));
    const face = profileFace({
      kind: "poly",
      pts: [P(r, -tt), P(0, 0), P(0, 2), P(r + 2, 2), P(r + 2, -tt)],
      mids: [mid, null, null, null, null],
    });
    const tool = revolve(face, c, outward, 360);
    return cut(a, tool.solid);
  });
}

// ---------------------------------------------------------------- exchange and the derived mesh (E21, E70, E71): the mesh is made here and leaves as plain numbers; the exact body is the model, the mesh is only for the screen and for STL
export interface MeshData {
  /** x y z per vertex */ positions: number[];
  /** a normal per vertex */ normals: number[];
  /** three vertex numbers per triangle */ indices: number[];
  /** the triangles of each face: `count` indices from `start` (in `indices`), in the order of `Solid.faces()` */ faces: {
    face: FaceH;
    start: number;
    count: number;
  }[];
  /** the polylines of the edges: x y z per point, one polyline per edge */ lines: number[];
  edges: { edge: EdgeH; start: number; count: number }[];
}
/** the triangles of a solid, by face, and the polylines of its edges; `tolerance` is the largest distance a triangle may lie from the surface (mm), `angle` the largest turn between neighbours (radians) */
export function mesh(a: Solid, tolerance = 0.02, angle = 0.25): MeshData {
  const shape = cast(a.raw),
    m = shape.mesh({ tolerance, angularTolerance: angle }),
    e = shape.meshEdges({ tolerance, angularTolerance: angle });
  const byFace = new Map<number, FaceH>(),
    byEdge = new Map<number, EdgeH>();
  for (const f of a.faces()) byFace.set(oc.ReplicadShapeHasher.HashCode(f.raw, HASH_CODE_MAX), f);
  for (const x of a.edges()) byEdge.set(oc.ReplicadShapeHasher.HashCode(x.raw, HASH_CODE_MAX), x);
  const faces = m.faceGroups.flatMap((g) => {
    const f = byFace.get(g.faceId);
    return f ? [{ face: f, start: g.start, count: g.count }] : [];
  });
  const edges = e.edgeGroups.flatMap((g) => {
    const x = byEdge.get(g.edgeId);
    return x ? [{ edge: x, start: g.start, count: g.count }] : [];
  });
  return { positions: m.vertices, normals: m.normals, indices: m.triangles, faces, lines: e.lines, edges };
}
/** the exact body as a STEP file (text, as bytes) */
export function stepBytes(a: Solid): Uint8Array {
  const file = "/out.step",
    w = new oc.STEPControl_Writer();
  try {
    oc.Interface_Static.SetIVal("write.step.schema", 5);
    const status = w.Transfer(
      a.raw,
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      true,
      new oc.Message_ProgressRange(),
    );
    void status;
    if (w.Write(file) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone)
      throw new Error("the kernel could not write the STEP file");
    return oc.FS.readFile(file) as Uint8Array;
  } finally {
    try {
      oc.FS.unlink(file);
    } catch {
      /* */
    }
    try {
      w.delete?.();
    } catch {
      /* */
    }
  }
}
/** the solids of a STEP file, in the file's own order (E21); nothing else in the file is kept */
export function stepSolids(bytes: Uint8Array): Solid[] {
  const file = "/in.step";
  oc.FS.writeFile(file, bytes);
  const r = new oc.STEPControl_Reader();
  try {
    if (r.ReadFile(file) !== oc.IFSelect_ReturnStatus.IFSelect_RetDone)
      throw new Error("this is not a STEP file the kernel can read");
    r.TransferRoots(new oc.Message_ProgressRange());
    const shape = r.OneShape(),
      out = unique(shape, "TopAbs_SOLID").map((x) => new Solid(x));
    shape.delete?.();
    if (!out.length) throw new Error("the STEP file has no solid in it (only surfaces or curves are not read yet)");
    return out;
  } finally {
    try {
      oc.FS.unlink(file);
    } catch {
      /* */
    }
    try {
      r.delete?.();
    } catch {
      /* */
    }
  }
}
