// Spike 1 harness: faces with lineage ids, carried through OCCT operations by the operations' own history
// (Generated / Modified / IsDeleted). Throwaway (CLAUDE.md rule 9). Nothing here is production code.
import { loadOC } from "../../app/src/compiler/kernel/occt/oc.mjs";
import { Face, Edge, downcast, HASH_CODE_MAX, draw, makeLine } from "replicad";

export const oc = await loadOC();
export { draw, makeLine, downcast };
const pr = () => new oc.Message_ProgressRange();
const R = (v) => Math.round(v * 1e4) / 1e4;

/** every distinct sub-shape of a kind (raw TopoDS_Shape copies) */
export function sub(shape, kind) {
  const ex = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const out = [], seen = new Map();
  for (; ex.More(); ex.Next()) {
    const s = ex.Current(), h = oc.ReplicadShapeHasher.HashCode(s, HASH_CODE_MAX);
    const l = seen.get(h) ?? seen.set(h, []).get(h);
    if (l.some((t) => t.IsSame(s))) continue;
    l.push(s); out.push(s);
  }
  ex.delete();
  return out;
}
export const facesOf = (s) => sub(s, "TopAbs_FACE");
export const edgesOf = (s) => sub(s, "TopAbs_EDGE");
export const same = (a, b) => a.IsSame(b);

/** a kernel list as an array of shapes */
export function arr(list) {
  const out = [];
  while (list.Size() > 0) { { const f = list.First(); out.push(f.Oriented(f.Orientation())); } list.RemoveFirst(); }
  return out;
}
export function toList(shapes) { const l = new oc.NCollection_List_TopoDS_Shape(); for (const s of shapes) l.Append(s); return l; }

/** facts about a face: normal, centre, box */
export function facts(raw) {
  const f = new Face(downcast(raw));
  const q = f.normalAt(), c = f.center, [lo, hi] = f.boundingBox.bounds;
  const l = Math.hypot(q.x, q.y, q.z) || 1;
  return { ne: [q.x / l, q.y / l, q.z / l], n: [R(q.x / l), R(q.y / l), R(q.z / l)], c: [R(c.x), R(c.y), R(c.z)], lo: [...lo].map(R), hi: [...hi].map(R), type: f.geomType };
}
export const edgeMid = (raw) => { const c = new Edge(downcast(raw)).pointAt(0.5); return [R(c.x), R(c.y), R(c.z)]; };

/**
 * A model: a solid (raw) and one entry per face { id, raw }. `log` collects what the history could not say.
 */
export class Model {
  constructor(shape, entries = [], log = []) { this.shape = shape; this.entries = entries; this.log = log; }
  idOf(raw) { return this.entries.find((e) => same(e.raw, raw))?.id ?? null; }
  rawOf(id) { return this.entries.find((e) => e.id === id)?.raw ?? null; }
  ids() { return this.entries.map((e) => e.id); }
}

/** the edges of the solid with the ids of the two faces beside each: the derived edge index */
export function edgeIndex(model) {
  const out = [];
  for (const ed of edgesOf(model.shape)) {
    const beside = model.entries.filter((e) => edgesOf(e.raw).some((x) => same(x, ed))).map((e) => e.id).sort();
    out.push({ raw: ed, key: beside.join("|"), mid: edgeMid(ed), faces: beside });
  }
  return out;
}

/**
 * Carry ids through an operation. `maker` is the finished OCCT maker (has Modified / IsDeleted / Generated). `inputs` are the entry lists of every
 * shape that went in (body, tool). Faces of the answer that no history reaches get `<step>:gap<k>` and are counted in the log.
 */
export function carry(maker, inputs, newShape, step, extra = []) {
  const faces = facesOf(newShape), claimed = new Map(), log = [];
  const claim = (raw, id, why) => {
    const i = faces.findIndex((f) => same(f, raw));
    if (i < 0) return false;
    if (claimed.has(i)) { claimed.get(i).ids.push(id); return true; }
    claimed.set(i, { ids: [id], why }); return true;
  };
  for (const e of inputs.flat()) {
    const mod = arr(maker.Modified(e.raw));
    if (mod.length) {
      const order = mod.map((m) => facts(m).c);
      const sorted = mod.map((m, k) => ({ m, k, c: facts(m).c })).sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1] || a.c[2] - b.c[2]);
      sorted.forEach((s, rank) => claim(s.m, mod.length === 1 ? e.id : `${e.id}.${rank}`, "modified"));
      if (mod.length > 1) log.push({ split: e.id, parts: mod.length, ociOrder: order });
    } else if (maker.IsDeleted(e.raw)) log.push({ deleted: e.id });
    else if (!claim(e.raw, e.id, "kept")) log.push({ lost: e.id });
  }
  for (const x of extra) claim(x.raw, x.id, "generated");
  const entries = [];
  let gap = 0;
  faces.forEach((f, i) => {
    const c = claimed.get(i);
    if (!c) { entries.push({ id: `${step}:gap${gap++}`, raw: f }); log.push({ gap: facts(f) }); }
    else { c.ids.sort(); entries.push({ id: c.ids[0], raw: f, alias: c.ids.slice(1) }); }
  });
  return new Model(newShape, entries, log);
}

/** a face (from a replicad drawing) pulled along a vector; sides named by `sideId(edgeRaw)` */
export function prism(faceRaw, vec, sideIdOfEdge, step) {
  const mk = new oc.BRepPrimAPI_MakePrism(faceRaw, new oc.gp_Vec(...vec), false, true);
  const shape = mk.Shape();
  const extra = [{ id: `${step}:start`, raw: mk.FirstShape() }, { id: `${step}:end`, raw: mk.LastShape() }];
  for (const ed of edgesOf(faceRaw)) for (const g of arr(mk.Generated(ed))) extra.push({ id: `${step}:side:${sideIdOfEdge(ed)}`, raw: g });
  return { mk, shape, extra };
}

export function boolean(kind, a, b, step) {
  const op = new oc[kind === "cut" ? "BRepAlgoAPI_Cut" : "BRepAlgoAPI_Fuse"](a.shape, b.shape, pr());
  if (!op.IsDone()) throw new Error(`${kind} failed`);
  return carry(op, [a.entries, b.entries], op.Shape(), step);
}

/** area of a face (raw) */
export function area(raw) { const p = new oc.GProp_GProps(); oc.BRepGProp.SurfaceProperties(raw, p, false, false); return p.Mass(); }
/** the area two faces share (exact: a boolean common) */
export function overlap(a, b) {
  const op = new oc.BRepAlgoAPI_Common(a, b, pr());
  if (!op.IsDone()) return 0;
  return facesOf(op.Shape()).reduce((t, f) => t + area(f), 0);
}

/**
 * Unify coplanar faces. OCCT's history of it is not bound in this build, so a face is recovered by containment: the new face that shares nearly all
 * of the old face's area (an exact boolean common, not a box test: a ring face and the island inside it have overlapping boxes).
 */
export function unify(model, step) {
  const u = new oc.ShapeUpgrade_UnifySameDomain(model.shape, true, true, false);
  u.Build();
  const out = u.Shape(), faces = facesOf(out);
  const entries = faces.map((f) => ({ raw: f, ids: [], facts: facts(f) }));
  const lost = [];
  for (const e of model.entries) {
    const a = facts(e.raw), A = area(e.raw);
    const into = entries.filter((x) => x.facts.type === a.type && x.facts.n.every((v, i) => Math.abs(v - a.n[i]) < 1e-3)
      && x.facts.lo.every((v, i) => v <= a.hi[i] + 1e-3) && x.facts.hi.every((v, i) => v >= a.lo[i] - 1e-3)
      && Math.abs(dot(x.facts.n, x.facts.c) - dot(a.n, a.c)) < 1e-2 + 1e-3 * Math.abs(dot(a.n, a.c)))
      .filter((x) => overlap(e.raw, x.raw) > 0.99 * A);
    if (into.length === 1) into[0].ids.push(e.id);
    else lost.push({ id: e.id, candidates: into.length });
  }
  const log = [];
  const res = entries.map((x, i) => {
    x.ids.sort();
    if (x.ids.length > 1) log.push({ merged: x.ids });
    return { id: x.ids[0] ?? `${step}:gap${i}`, raw: x.raw, alias: x.ids.slice(1) };
  });
  for (const l of lost) log.push({ lostInUnify: l });
  return new Model(out, res, log);
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const valid = (shape) => new oc.BRepCheck_Analyzer(shape, true, false).IsValid();
export { pr };
