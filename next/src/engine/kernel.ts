// The kernel adapter (E1, `inv_kernel_boundary`): the only file that touches OCCT or replicad. Everything it hands out is plain data or an opaque handle;
// the engine above it knows nothing of the kernel's own objects. Numbers it returns are exact (E11): rounding is for the screen only.
import initOC from "replicad-opencascadejs";
import { setOC, Face, Edge, downcast, HASH_CODE_MAX, draw, makeLine, makeCircle, makeThreePointArc, assembleWire, drawCircle } from "replicad";

export type V3 = readonly [number, number, number];
type Raw = any; // the kernel's own objects: they do not leave this file
export interface FaceH { readonly raw: Raw }
export interface EdgeH { readonly raw: Raw }
export interface Facts { type: string; ne: V3; ce: V3; lo: V3; hi: V3; area: number }
/** what a kernel operation says each face of its input became (the kernel's own history); it may say nothing for faces it did make (E7) */
export interface Report { modified(f: FaceH): FaceH[]; fromEdge(e: EdgeH): FaceH[]; fromFace(f: FaceH): FaceH[]; deleted(f: FaceH): boolean }

let oc: Raw = null;
export async function initKernel(): Promise<void> {
  if (oc) return;
  oc = await (initOC as unknown as () => Promise<Raw>)();
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
  proto.delete = function (this: Raw) { try { original.call(this); } catch (e) { if (!/already deleted/i.test(String((e as Error)?.message ?? e))) throw e; } };
  proto.__safeDelete = true;
}

// ---------------------------------------------------------------- temporaries: freed when the step that made them is done (E17)
const stack: Raw[][] = [];
const t = <T>(raw: T): T => { stack[stack.length - 1]?.push(raw); return raw; };
/** run `fn`; every temporary the kernel layer made inside it (makers, lists, copies) is deleted afterwards; handles a Solid owns live until it is released */
export function scoped<T>(fn: () => T): T {
  stack.push([]);
  try { return fn(); } finally { const mine = stack.pop()!; for (const r of mine) { try { r.delete?.(); } catch { /* already gone */ } } }
}
const progress = () => t(new oc.Message_ProgressRange());

/** a solid, and the face and edge handles taken from it (all freed with it) */
export class Solid {
  private owned: Raw[] = []; private fs: FaceH[] | null = null; private es: EdgeH[] | null = null;
  readonly raw: Raw;
  constructor(raw: Raw) { this.raw = raw; }
  private own<R>(r: R): R { this.owned.push(r); return r; }
  faces(): FaceH[] { return (this.fs ??= unique(this.raw, "TopAbs_FACE").map((r) => ({ raw: this.own(r) }))); }
  edges(): EdgeH[] { return (this.es ??= unique(this.raw, "TopAbs_EDGE").map((r) => ({ raw: this.own(r) }))); }
  release(): void { for (const r of this.owned) { try { r.delete?.(); } catch { /* */ } } try { this.raw.delete?.(); } catch { /* */ } this.owned = []; this.fs = this.es = null; }
}

function unique(shape: Raw, kind: string): Raw[] {
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const out: Raw[] = [], seen = new Map<number, Raw[]>();
  try {
    for (; ex.More(); ex.Next()) {
      const s = ex.Current(), h: number = oc.ReplicadShapeHasher.HashCode(s, HASH_CODE_MAX), l = seen.get(h) ?? seen.set(h, []).get(h)!;
      if (l.some((u) => u.IsSame(s))) { s.delete?.(); continue; }
      l.push(s); out.push(s);
    }
  } finally { ex.delete(); }
  return out;
}
const toArray = (list: Raw): FaceH[] => { const out: FaceH[] = []; while (list.Size() > 0) { const f = list.First(); out.push({ raw: t(f.Oriented(f.Orientation())) }); list.RemoveFirst(); } t(list); return out; };
const toList = (shapes: Raw[]): Raw => { const l = t(new oc.NCollection_List_TopoDS_Shape()); for (const s of shapes) l.Append(s); return l; };

export const sameFace = (a: FaceH, b: FaceH): boolean => a.raw.IsSame(b.raw);
export const sameEdge = (a: EdgeH, b: EdgeH): boolean => a.raw.IsSame(b.raw);

/** the kernel wrappers a reading makes are deleted at once (replicad's vectors and boxes hold kernel objects) */
const drop = (...xs: Raw[]) => { for (const x of xs) { try { x?.delete?.(); } catch { /* */ } } };
export function facts(f: FaceH): Facts {
  const face = new Face(downcast(f.raw)), q = face.normalAt(), c = face.center, bb = face.boundingBox, [lo, hi] = bb.bounds, l = Math.hypot(q.x, q.y, q.z) || 1;
  const props = t(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(f.raw, props, false, false);
  const out: Facts = { type: face.geomType as string, ne: [q.x / l, q.y / l, q.z / l], ce: [c.x, c.y, c.z], lo: [lo[0]!, lo[1]!, lo[2]!], hi: [hi[0]!, hi[1]!, hi[2]!], area: props.Mass() };
  drop(q, c, bb, face); return out;
}
export function edgeEnds(e: EdgeH): [V3, V3] { const E = new Edge(downcast(e.raw)), a = E.startPoint, b = E.endPoint, out: [V3, V3] = [[a.x, a.y, a.z], [b.x, b.y, b.z]]; drop(a, b, E); return out; }
export function edgeMid(e: EdgeH): V3 { const E = new Edge(downcast(e.raw)), c = E.pointAt(0.5), out: V3 = [c.x, c.y, c.z]; drop(c, E); return out; }
export const faceEdges = (f: FaceH): EdgeH[] => unique(f.raw, "TopAbs_EDGE").map((r) => ({ raw: t(r) }));
/** the area two faces share (a boolean common): used to recover ids where the kernel says nothing (E7) */
export function overlap(a: FaceH, b: FaceH): number {
  const op = t(new oc.BRepAlgoAPI_Common(a.raw, b.raw, progress()));
  if (!op.IsDone()) return 0;
  const s = op.Shape(); let sum = 0;
  for (const r of unique(s, "TopAbs_FACE")) { const p = t(new oc.GProp_GProps()); oc.BRepGProp.SurfaceProperties(r, p, false, false); sum += p.Mass(); r.delete?.(); }
  s.delete?.(); return sum;
}
export const volume = (s: Solid): number => { const p = t(new oc.GProp_GProps()); oc.BRepGProp.VolumeProperties(s.raw, p, false, false, false); return p.Mass(); };
export const valid = (s: Solid): boolean => t(new oc.BRepCheck_Analyzer(s.raw, true, false)).IsValid();

// ---------------------------------------------------------------- history of an operation
function reportOf(maker: Raw): Report {
  const safe = <R>(fn: () => R, otherwise: R): R => { try { return fn(); } catch { return otherwise; } };
  return {
    modified: (f) => safe(() => toArray(maker.Modified(f.raw)), []),
    fromEdge: (e) => safe(() => toArray(maker.Generated(e.raw)), []),
    fromFace: (f) => safe(() => toArray(maker.Generated(f.raw)), []),
    deleted: (f) => safe(() => !!maker.IsDeleted(f.raw), false),
  };
}

// ---------------------------------------------------------------- operations
export interface Made { solid: Solid; report: Report }
const fail = (what: string): never => { throw new Error(what); };

/** a closed polygon in the XY plane at z = 0 (a base sketch's face) */
export function polygonFace(points: readonly (readonly [number, number])[]): FaceH {
  let d = draw([points[0]![0], points[0]![1]]); for (const p of points.slice(1)) d = d.lineTo([p[0], p[1]]);
  return { raw: t((d.close().sketchOnPlane("XY") as unknown as { face(): { wrapped: Raw } }).face().wrapped) };
}
/** one closed loop of a profile: a polygon whose sides may be arcs (a mid point on the side), or a circle (a centre, a radius, the way it faces) */
export type Loop = { kind: "poly"; pts: readonly V3[]; mids: readonly (V3 | null)[] } | { kind: "circle"; c: V3; r: number; normal: V3 };
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
export const polygonFace3 = (points: readonly V3[]): FaceH => profileFace({ kind: "poly", pts: points, mids: points.map(() => null) });
/** a circle of radius r in a named plane (XY, XZ, YZ), centred on that plane's origin moved `offset` along its normal */
export function circleFace(r: number, plane: "XY" | "XZ" | "YZ", offset: number): FaceH {
  return { raw: t((drawCircle(r).sketchOnPlane(plane, offset) as unknown as { face(): { wrapped: Raw } }).face().wrapped) };
}
function loopWire(l: Loop): Raw {
  if (l.kind === "circle") return t(assembleWire([makeCircle(l.r, [l.c[0], l.c[1], l.c[2]], [l.normal[0], l.normal[1], l.normal[2]])]).wrapped);
  const edges = [];
  for (let i = 0; i < l.pts.length; i++) {
    const p = l.pts[i]!, q = l.pts[(i + 1) % l.pts.length]!, m = l.mids[i];
    edges.push(m ? makeThreePointArc([p[0], p[1], p[2]], [m[0], m[1], m[2]], [q[0], q[1], q[2]]) : makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]]));
  }
  return t(assembleWire(edges).wrapped);
}
const wireOf = (pts: readonly V3[], closed: boolean): Raw => {
  const n = closed ? pts.length : pts.length - 1, edges = [];
  for (let i = 0; i < n; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; edges.push(makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]])); }
  return t(assembleWire(edges).wrapped);
};
/** the kernel throws its own objects, not errors; what the engine shows is a sentence */
function guard<R>(what: string, fn: () => R): R { try { return fn(); } catch (e) { throw e instanceof Error ? e : new Error(`the kernel could not make ${what}`); } }
export interface Prism extends Made { first: FaceH; last: FaceH }
/** a face pulled along a vector; `first` and `last` are its start and end faces, the report's `fromEdge` gives the side each edge made */
export function prism(face: FaceH, v: V3): Prism {
  const mk = t(new oc.BRepPrimAPI_MakePrism(face.raw, t(new oc.gp_Vec(v[0], v[1], v[2])), false, true));
  return { solid: new Solid(mk.Shape()), report: reportOf(mk), first: { raw: t(mk.FirstShape()) }, last: { raw: t(mk.LastShape()) } };
}
/** a face turned about an axis (a point and a direction) through an angle; the flat faces made by edges across the axis are not in the kernel's report (E7) */
export function revolve(face: FaceH, point: V3, dir: V3, degrees: number): Prism {
  return guard("the revolve", () => {
    const ax = t(new oc.gp_Ax1(t(new oc.gp_Pnt(point[0], point[1], point[2])), t(new oc.gp_Dir(dir[0], dir[1], dir[2]))));
    const mk = t(new oc.BRepPrimAPI_MakeRevol(face.raw, ax, (degrees * Math.PI) / 180, false));
    return { solid: new Solid(mk.Shape()), report: reportOf(mk), first: { raw: t(mk.FirstShape()) }, last: { raw: t(mk.LastShape()) } };
  });
}
/** a solid through two or more sections (closed polygons of 3D points, the same number of points each); `side(i)` is the face made from the i-th segment of the first section */
export interface Lofted extends Prism { side(i: number): FaceH | null }
export function loft(sections: readonly (readonly V3[])[], ruled: boolean): Lofted {
  return guard("the loft", () => {
    const ts = t(new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6)); let firstWire: Raw = null;
    sections.forEach((pts, i) => { const w = wireOf(pts, true); if (i === 0) firstWire = w; ts.AddWire(w); });
    ts.Build(progress());
    const mids = sections[0]!.map((p, i) => { const q = sections[0]![(i + 1) % sections[0]!.length]!; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2]; });
    const edges = unique(firstWire, "TopAbs_EDGE").map((r) => ({ raw: t(r) }));
    const at = (e: EdgeH) => { const m = edgeMid(e); return mids.findIndex((q) => q.every((v, k) => Math.abs(v - m[k]!) < 1e-6)); };
    return { solid: new Solid(ts.Shape()), report: reportOf(ts), first: { raw: t(ts.FirstShape()) }, last: { raw: t(ts.LastShape()) },
      side: (i: number) => { const e = edges.find((x) => at(x) === i); if (!e) return null; try { return { raw: t(ts.GeneratedFace(e.raw)) }; } catch { return null; } } };
  });
}
/** a face swept along a path of straight legs (3D points); each edge of the profile makes a face for every leg */
export function pipe(spine: readonly V3[], profile: FaceH): Prism {
  return guard("the sweep", () => {
    const mk = t(new oc.BRepOffsetAPI_MakePipe(wireOf(spine, false), profile.raw));
    return { solid: new Solid(mk.Shape()), report: reportOf(mk), first: { raw: t(mk.FirstShape()) }, last: { raw: t(mk.LastShape()) } };
  });
}
/** the body hollowed: the face taken off, a wall of the thickness left (inward); the report's `fromFace` gives the inner face each face made */
export function shell(a: Solid, remove: FaceH, thickness: number): Made {
  return guard("the shell", () => {
    const th = t(new oc.BRepOffsetAPI_MakeThickSolid());
    th.MakeThickSolidByJoin(a.raw, toList([remove.raw]), -thickness, 1e-3, oc.BRepOffset_Mode.BRepOffset_Skin, false, false, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
    return { solid: new Solid(th.Shape()), report: reportOf(th) };
  });
}
export function fuse(a: Solid, b: Solid): Made { const op = t(new oc.BRepAlgoAPI_Fuse(a.raw, b.raw, progress())); if (!op.IsDone()) fail("the join failed"); return { solid: new Solid(op.Shape()), report: reportOf(op) }; }
export function cut(a: Solid, b: Solid): Made { const op = t(new oc.BRepAlgoAPI_Cut(a.raw, b.raw, progress())); if (!op.IsDone()) fail("the cut failed"); return { solid: new Solid(op.Shape()), report: reportOf(op) }; }
/** the body split along line segments lying on its faces (an imprint, E4); the kernel's splitter with history */
export function split(a: Solid, segments: readonly (readonly [V3, V3])[]): Made {
  const sp = t(new oc.BRepAlgoAPI_Splitter()), tools = segments.map(([p, q]) => t(makeLine([p[0], p[1], p[2]], [q[0], q[1], q[2]]).wrapped));
  sp.SetArguments(toList([a.raw])); sp.SetTools(toList(tools)); sp.SetToFillHistory(true); sp.Build(progress());
  if (sp.HasErrors()) fail("the imprint failed");
  return { solid: new Solid(sp.Shape()), report: reportOf(sp) };
}
/** `rounded`: the edges the kernel actually modified: it follows an edge along the ones that continue it (tangent), so this can be more than were asked for */
export interface Rounded extends Made { round(e: EdgeH): FaceH[]; rounded: EdgeH[] }
/** a round (`fillet`) or a flat cut (`chamfer`) of the given size on the given edges */
export function roundEdges(a: Solid, edges: readonly EdgeH[], size: number, mode: "fillet" | "chamfer"): Rounded {
  return guard(`the ${mode}`, () => {
    const mk = mode === "fillet" ? t(new oc.BRepFilletAPI_MakeFillet(a.raw, oc.ChFi3d_FilletShape.ChFi3d_Rational)) : t(new oc.BRepFilletAPI_MakeChamfer(a.raw));
    for (const e of edges) mk.Add(size, t(downcast(e.raw)));
    const rounded: EdgeH[] = [];
    for (let i = 1; i <= mk.NbContours(); i++) for (let j = 1; j <= mk.NbEdges(i); j++) rounded.push({ raw: t(mk.Edge(i, j)) });
    mk.Build(progress());
    if (!mk.IsDone()) fail(`the ${mode} could not be made at that size`);
    const rep = reportOf(mk);
    return { solid: new Solid(mk.Shape()), report: rep, round: (e: EdgeH) => rep.fromEdge(e), rounded };
  });
}
export function turn(a: Solid, axis: V3, degrees: number, pivot: V3 = [0, 0, 0]): Made {
  const tr = t(new oc.gp_Trsf()); tr.SetRotation(t(new oc.gp_Ax1(t(new oc.gp_Pnt(pivot[0], pivot[1], pivot[2])), t(new oc.gp_Dir(axis[0], axis[1], axis[2])))), (degrees * Math.PI) / 180);
  const mk = t(new oc.BRepBuilderAPI_Transform(a.raw, tr, true)); mk.Build(progress());
  return { solid: new Solid(mk.Shape()), report: reportOf(mk) };
}
/** the body moved by a vector */
export function move(a: Solid, by: V3): Made {
  const tr = t(new oc.gp_Trsf()); tr.SetTranslation(t(new oc.gp_Vec(by[0], by[1], by[2])));
  const mk = t(new oc.BRepBuilderAPI_Transform(a.raw, tr, true)); mk.Build(progress());
  return { solid: new Solid(mk.Shape()), report: reportOf(mk) };
}
export function common(a: Solid, b: Solid): Made { const op = t(new oc.BRepAlgoAPI_Common(a.raw, b.raw, progress())); if (!op.IsDone()) fail("the intersection failed"); return { solid: new Solid(op.Shape()), report: reportOf(op) }; }
/** join faces that lie in one surface; the kernel's history of this is not available, so the engine recovers ids by `overlap` (E7, E9) */
export function unify(a: Solid, keep: readonly EdgeH[] = []): Solid {
  const u = t(new oc.ShapeUpgrade_UnifySameDomain(a.raw, true, true, false));
  for (const e of keep) u.KeepShape(e.raw); // edges that are the person's own lines (an imprint's seam) are not merged away
  u.Build();
  return new Solid(u.Shape());
}

