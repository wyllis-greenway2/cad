// A body is an exact solid and, for each of its faces, an id (E6, E7); a step's result carries the ids of the input's faces through the operation by the kernel's own report,
// completed by exact rules where the report is silent. A reference to a face that split resolves to its pieces (E8); to a face that merged, through its other ids (E9);
// a reference that finds nothing is lost (E10) and never attaches to anything else.
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, type VertexRef, baseKey, edgeKey, edgeRef, idKey, isPieceOf, mint, piece, show, vertexRef } from "./id.ts";

export interface FaceRec { id: Id; alias: Id[]; h: K.FaceH; /** the engine could not name this face from the step's history or rules (E7): a defect, reported */ defect: boolean }
/** a body: a solid the model remembers by a name (E38). `faces` are the faces in it; `alias` the other names it answers to after bodies were joined (E39) */
/** a face or a body answers to a reference when the reference names it, one of the names it answers to (after joins, E8, E39), or a piece of either: the one rule every lookup by id uses */
export const answers = (r: { id: Id; alias: readonly Id[] }, ref: Id): boolean => isPieceOf(r.id, ref) || r.alias.some((a) => isPieceOf(a, ref));
export interface BodyRec { id: Id; alias: Id[]; faces: FaceRec[] }
export interface Note { kind: "split" | "tie" | "defect" | "merged" | "dropped" | "unjoined" | "sliver" | "free" | "sequence"; text: string }
export interface VertexRec { p: K.V3; faces: FaceRec[]; /** the faces that meet there, if three or more: the vertex's name (E6) */ ref: VertexRef | null }
export interface EdgeRec { h: K.EdgeH; faces: FaceRec[]; /** two faces beside it: the edge's name */ ref: EdgeRef | null }

/** a reference that finds nothing: the step it belongs to is orphaned (E10) */
export class RefLost extends Error { readonly what: string; /** the faces whose names were looked for (so a step working on one body of a scene can tell a face that is gone from one that is on another body) */ readonly faces: Id[]; constructor(what: string, faces: Id[] = []) { super(`${what} is no longer there`); this.what = what; this.faces = faces; } }
/** the age of a step in the recipe: older ids lead when faces merge */
export type Age = (step: string) => number;

export class Body {
  private es: EdgeRec[] | null = null;
  private vs: VertexRec[] | null = null;
  readonly solid: K.Solid; readonly faces: FaceRec[]; readonly notes: Note[];
  /** the base keys of faces an imprint split: the person's own lines. Only the seams between pieces of these are kept when faces merge (E4); a piece made by a boolean is not a line the person drew */
  readonly kept: ReadonlySet<string>;
  /** the bodies of the shape (a scene of one or more), each with its name: set by `labelBodies` when a step has made the body */
  bodies: BodyRec[];
  constructor(solid: K.Solid, faces: FaceRec[], notes: Note[] = [], kept: ReadonlySet<string> = new Set(), bodies: BodyRec[] = []) { this.solid = solid; this.faces = faces; this.notes = notes; this.kept = kept; this.bodies = bodies; }
  release(): void { this.solid.release(); this.es = null; this.vs = null; }

  /** the faces a reference means: the face, or the pieces it split into, found through any of its ids (E8, E9) */
  find(id: Id): FaceRec[] { return this.faces.filter((f) => answers(f, id)); }
  /** the one face a reference means, or lost; more than one is a split the step must say how to take (E8) */
  one(id: Id): FaceRec {
    const s = this.find(id);
    if (!s.length) throw new RefLost(show(id), [id]);
    if (s.length > 1) throw new Error(`${show(id)} has split into ${s.length} faces: say which`);
    return s[0]!;
  }
  all(id: Id): FaceRec[] { const s = this.find(id); if (!s.length) throw new RefLost(show(id), [id]); return s; }

  /** the derived list of edges, each with the faces beside it (the edge index, E5) */
  edges(): EdgeRec[] {
    if (this.es) return this.es;
    this.es = K.scoped(() => {
      const byFace = this.faces.map((f) => ({ f, edges: K.faceEdges(f.h) }));
      return this.solid.edges().map((h) => {
        const beside = byFace.filter((x) => x.edges.some((e) => K.sameEdge(e, h))).map((x) => x.f);
        return { h, faces: beside, ref: beside.length === 2 ? edgeRef(beside[0]!.id, beside[1]!.id) : null };
      });
    });
    return this.es;
  }
  /** the derived list of vertices, each with the faces that meet there (E6) */
  vertices(): VertexRec[] {
    if (this.vs) return this.vs;
    this.vs = K.scoped(() => {
      const per = this.faces.map((f) => ({ f, pts: K.faceVertexPoints(f.h) })), same = (a: K.V3, b: K.V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-7;
      return K.vertexPoints(this.solid).map((p) => { const beside = per.filter((x) => x.pts.some((q) => same(p, q))).map((x) => x.f); return { p, faces: beside, ref: beside.length >= 3 ? vertexRef(beside.map((f) => f.id)) : null }; });
    });
    return this.vs;
  }
  /** the vertices a reference means: the ones where exactly the faces it names (or their pieces) meet */
  findVertices(ref: VertexRef): VertexRec[] {
    const out = this.vertices().filter((v) => v.faces.length === ref.faces.length && ref.faces.every((id) => v.faces.some((f) => answers(f, id))));
    if (!out.length) throw new RefLost(`the vertex where ${ref.faces.map(show).join(", ")} meet`, [...ref.faces]);
    return out;
  }
  /** the edges a reference means: every edge between the faces (or their pieces) it names (E8) */
  findEdges(ref: EdgeRef): EdgeRec[] {
    const out = this.edges().filter((e) => e.faces.length === 2 && ((answers(e.faces[0]!, ref.a) && answers(e.faces[1]!, ref.b)) || (answers(e.faces[0]!, ref.b) && answers(e.faces[1]!, ref.a))));
    if (!out.length) throw new RefLost(`the edge between ${show(ref.a)} and ${show(ref.b)}`, [ref.a, ref.b]);
    return out;
  }
  /** what a step's answer is known by, for the engine to tell whether it changed (a whole-body fingerprint: volume and every id) */
  fingerprint(): string {
    // kept fine on purpose: the kernel's own sums differ in the 8th digit with the way a shape was built, which only makes a step run again that need not have (a rounder fingerprint could hide a real, small edit); a check that compares two builds compares the numbers with a tolerance (`same` in dev/lib.ts)
    // the geometry as well as the ids: an edit that only moves a face must show (else the engine stops there and the steps after it do not run)
    const g = (f: FaceRec) => { const q = K.facts(f.h); return `${idKey(f.id)}~${q.type}~${q.area.toFixed(9)}~${q.ce.map((v) => v.toFixed(9)).join(",")}`; };
    return K.scoped(() => `${K.volume(this.solid).toFixed(9)}|${this.faces.map(g).sort().join(";")}|${this.bodies.map((b) => [b.id, ...b.alias].map(idKey).join("=") + ":" + b.faces.length).sort().join(";")}`);
  }
}

export interface Claim { id: Id; face: K.FaceH }
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const older = (age: Age) => (a: Id, b: Id) => age(a.step) - age(b.step) || (idKey(a) < idKey(b) ? -1 : 1);

/**
 * Carry the ids of the input bodies' faces through an operation (E7). `claims` name faces the step itself made (a cap, a side from a sketch line, a round).
 * A face of the answer that nothing names is a defect: it gets an id marked so and a note (never a silent name).
 */
/** the order faces with no name are numbered in: by what they are and where, not by the order the kernel happened to list them (that order depends on the memory the shapes were made in, so a live engine and a fresh build disagreed on `unnamed(1)` and `unnamed(2)`) */
function unnamedRank(hs: readonly K.FaceH[]): Map<K.FaceH, number> {
  const q = (v: number) => Math.round(v * 1e6) / 1e6;
  const key = (h: K.FaceH) => { const f = K.facts(h); return [f.type, q(f.ce[0]), q(f.ce[1]), q(f.ce[2]), q(f.area)] as const; };
  const order = hs.map((h) => ({ h, k: key(h) })).sort((a, b) => (a.k[0] < b.k[0] ? -1 : a.k[0] > b.k[0] ? 1 : 0) || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.k[3] - b.k[3] || a.k[4] - b.k[4]);
  return new Map(order.map((o, i) => [o.h, i]));
}
export function carry(solid: K.Solid, report: K.Report, inputs: readonly Body[], claims: readonly Claim[], step: string, age: Age, nameFrom: readonly Body[] = inputs): Body {
  const newFaces = solid.faces(), notes: Note[] = [], got: Id[][] = newFaces.map(() => []);
  const where = (h: K.FaceH) => newFaces.findIndex((f) => K.sameFace(f, h));
  for (const body of inputs) for (const rec of body.faces) {
    const mods = report.modified(rec.h), ids = [rec.id, ...rec.alias];
    if (mods.length > 1) {
      // a face that split: its pieces, bigger first, then by centre; two equal pieces are a tie, reported and not broken by chance (E8)
      const ordered = mods.map((h) => ({ h, f: K.facts(h) })).sort((p, q) => q.f.area - p.f.area || p.f.ce[0] - q.f.ce[0] || p.f.ce[1] - q.f.ce[1] || p.f.ce[2] - q.f.ce[2]);
      ordered.forEach((o, k) => { const i = where(o.h); if (i >= 0) got[i]!.push(...ids.map((x) => piece(x, k))); });
      for (let k = 1; k < ordered.length; k++) { const p = ordered[k - 1]!.f, q = ordered[k]!.f; if (near(p.area, q.area) && near(p.ce[0], q.ce[0]) && near(p.ce[1], q.ce[1]) && near(p.ce[2], q.ce[2])) notes.push({ kind: "tie", text: `two equal pieces of ${show(rec.id)}: their order is arbitrary` }); }
      notes.push({ kind: "split", text: `${show(rec.id)} split into ${mods.length}` });
    } else if (mods.length === 1) { const i = where(mods[0]!); if (i >= 0) got[i]!.push(...ids); }
    else if (report.deleted(rec.h)) notes.push({ kind: "dropped", text: `${show(rec.id)} is gone` });
    else { const i = where(rec.h); if (i >= 0) got[i]!.push(...ids); else notes.push({ kind: "dropped", text: `${show(rec.id)} was not carried` }); }
  }
  for (const c of claims) { const i = where(c.face); if (i >= 0) got[i]!.push(c.id); }
  const lead = older(age), rank = unnamedRank(newFaces.filter((_h, i) => !got[i]!.length));
  const recs: FaceRec[] = newFaces.map((h, i) => {
    const ids = got[i]!.filter((x, k, all) => all.findIndex((y) => idKey(y) === idKey(x)) === k).sort(lead);
    if (!ids.length) { notes.push({ kind: "defect", text: `a face of ${step} has no id` }); return { id: mint(step, "unnamed", rank.get(h)!), alias: [], h, defect: true }; }
    if (ids.length > 1) notes.push({ kind: "merged", text: `${ids.map(show).join(" + ")}` });
    return { id: ids[0]!, alias: ids.slice(1), h, defect: ids[0]!.role === "unnamed" };
  });
  return labelBodies(new Body(solid, recs, notes, new Set(inputs.flatMap((b) => [...b.kept]))), nameFrom, step, age); // `nameFrom`: the bodies whose names the result may take (a tool that is cut away lends its faces' names but not its body's)
}

/** join faces in one surface, and recover which new face each old face went into by the area they share (E7, E9) */
/**
 * The faces that are one face to the person: faces of a body that lie on one surface and share an edge, except the pieces an imprint made on purpose (E4). The kernel's join (`unify`) does this
 * as geometry, but it leaves them apart where it cannot (a wall with openings across a seam: `dev/pull-equivalence-check.ts`) or where joining would make an invalid solid.
 */
export function wholes(body: Body): FaceRec[][] {
  const parent = new Map<FaceRec, FaceRec>(); const find = (f: FaceRec): FaceRec => { let r = f; while (parent.get(r)! !== r) r = parent.get(r)!; return r; };
  const fx = new Map<FaceRec, K.Facts>(); const fact = (f: FaceRec) => fx.get(f) ?? (fx.set(f, K.facts(f.h)), fx.get(f)!);
  for (const f of body.faces) parent.set(f, f);
  for (const e of body.edges()) {
    if (e.faces.length !== 2) continue; const [a, b] = e.faces as [FaceRec, FaceRec];
    if (baseKey(a.id) === baseKey(b.id) && body.kept.has(baseKey(a.id))) continue; // the person's own line
    if (["PLANE", "CYLINDRE", "CONE", "SPHERE", "TORUS"].includes(fact(a).type) && K.sameSurface(a.h, b.h, fact(a), fact(b))) parent.set(find(a), find(b));
  }
  const groups = new Map<FaceRec, FaceRec[]>(); for (const f of body.faces) { const r = find(f); groups.set(r, [...(groups.get(r) ?? []), f]); }
  return [...groups.values()];
}
/**
 * Faces that are one face but are two to the kernel answer to one id: the earliest id of the group leads (E9), the others are its pieces (E8), so a reference to the lead finds them all and no two faces share an id.
 * A group that holds two pieces an imprint made on purpose (E4) is left alone: the person's line runs through it.
 */
function joinFamilies(body: Body, step: string, age: Age): Body {
  const lead = older(age);
  for (const group of wholes(body)) {
    if (group.length < 2) continue;
    const keys = group.map((f) => baseKey(f.id)).filter((k) => body.kept.has(k));
    if (new Set(group.flatMap((f) => keys.includes(baseKey(f.id)) ? [idKey(f.id)] : [])).size > 1) continue; // two pieces of an imprint in one group
    const all = group.flatMap((f) => [f.id, ...f.alias]).sort(lead), head: Id = { ...all[0]!, pieces: [] }, taken = new Set(all.map(idKey));
    const loose = group.filter((f) => !answers(f, head)).sort((p, q) => { const a = K.facts(p.h), b = K.facts(q.h); return b.area - a.area || a.ce[0] - b.ce[0] || a.ce[1] - b.ce[1] || a.ce[2] - b.ce[2]; });
    let n = 0;
    for (const f of loose) { let id = piece(head, n++); while (taken.has(idKey(id))) id = piece(head, n++); taken.add(idKey(id)); f.alias.push(id); }
    if (loose.length) body.notes.push({ kind: "unjoined", text: `${group.length} faces on one surface answer to ${show(head)} (the kernel keeps them apart; ${step})` });
  }
  return body;
}
export function unifyBody(body: Body, step: string, age: Age): Body {
  // the seams between the pieces of a face that split (an imprint's lines) stay: they are the person's lines, not leftovers (E4)
  const seams = body.edges().filter((e) => e.faces.length === 2 && baseKey(e.faces[0]!.id) === baseKey(e.faces[1]!.id) && idKey(e.faces[0]!.id) !== idKey(e.faces[1]!.id) && body.kept.has(baseKey(e.faces[0]!.id))).map((e) => e.h);
  const u = K.unify(body.solid, seams);
  if (!u.joined) { body.notes.push({ kind: "unjoined", text: `the faces of ${step} were not joined: joining them would have made an invalid solid` }); return joinFamilies(body, step, age); } // the body as it is is right, with more faces than it needs
  const solid = u.solid, faces = solid.faces();
  const targets = faces.map((h) => ({ h, f: K.facts(h), ids: [] as Id[] })), notes: Note[] = [...body.notes];
  for (const rec of body.faces) {
    const a = K.facts(rec.h);
    const into = targets.filter((t) => t.f.type === a.type && (a.type !== "PLANE" || t.f.ne.every((v, i) => Math.abs(v - a.ne[i]!) < 1e-6)) // a curved face's normal is read at its centre, which moves when it merges: planes only are told apart by it
      && t.f.lo.every((v, i) => v <= a.hi[i]! + 1e-6) && t.f.hi.every((v, i) => v >= a.lo[i]! - 1e-6) && K.overlap(rec.h, t.h) > 0.99 * a.area);
    if (into.length === 1) into[0]!.ids.push(rec.id, ...rec.alias);
    else notes.push({ kind: "dropped", text: `${show(rec.id)} could not be placed after the merge (${into.length} candidates)` });
  }
  const lead = older(age), rank = unnamedRank(targets.filter((x) => !x.ids.length).map((x) => x.h));
  const recs: FaceRec[] = targets.map((t) => {
    const ids = t.ids.filter((x, k, all) => all.findIndex((y) => idKey(y) === idKey(x)) === k).sort(lead);
    if (!ids.length) { notes.push({ kind: "defect", text: `a face after the merge in ${step} has no id` }); return { id: mint(step, "unnamed", rank.get(t.h)!), alias: [], h: t.h, defect: true }; }
    if (ids.length > 1) notes.push({ kind: "merged", text: ids.map(show).join(" + ") });
    return { id: ids[0]!, alias: ids.slice(1), h: t.h, defect: ids[0]!.role === "unnamed" };
  });
  return joinFamilies(labelBodies(new Body(solid, recs, notes, body.kept), [body], step, age), step, age);
}

/** a body made by a step from nothing: every face named by the step, from a list of claims */
export function fromClaims(solid: K.Solid, claims: readonly Claim[], step: string, label = true): Body {
  const faces = solid.faces(), notes: Note[] = [], rank = unnamedRank(faces.filter((h) => !claims.some((x) => K.sameFace(x.face, h))));
  const recs: FaceRec[] = faces.map((h) => {
    const c = claims.find((x) => K.sameFace(x.face, h));
    if (c) return { id: c.id, alias: [], h, defect: false };
    notes.push({ kind: "defect", text: `a face of ${step} has no id` }); return { id: mint(step, "unnamed", rank.get(h)!), alias: [], h, defect: true };
  });
  const body = new Body(solid, recs, notes);
  return label ? labelBodies(body, [], step, null) : body; // a tool (`label` false) is not a body of the model: it only lends its faces' names
}
export { edgeKey };

/** the faces an imprint split are the person's lines: remember them, so the seams between their pieces stay when faces merge later (E4) */
export function markImprinted(body: Body, before: Body): Body {
  const kept = new Set(body.kept), had = new Set(before.faces.filter((g) => g.id.pieces.length).map((g) => baseKey(g.id)));
  for (const f of body.faces) if (f.id.pieces.length && !had.has(baseKey(f.id))) kept.add(baseKey(f.id)); // newly split by this imprint, not split before by a boolean
  return new Body(body.solid, body.faces, body.notes, kept, body.bodies);
}

/**
 * Name the bodies of a shape (E38, E39; `dec_independent_bodies`: a body is known by a name, not by its shape). A body keeps the name of the input body its faces came from; bodies that were joined answer to the
 * older name and to the others; a body that was split into pieces: the largest piece keeps the name and the others are its pieces (E8); a body no input body is in is new, named by this step.
 */
export function labelBodies(body: Body, inputs: readonly Body[], step: string, age: Age | null): Body {
  const index = K.solidIndexOfFaces(body.solid), groups = new Map<number, FaceRec[]>();
  body.faces.forEach((f, i) => { const g = index[i]!; if (g >= 0) groups.set(g, [...(groups.get(g) ?? []), f]); });
  const made = [...groups.values()].map((faces) => { const solidFacts = faces.map((f) => K.facts(f.h)); return { faces, area: solidFacts.reduce((a, q) => a + q.area, 0), ce: [0, 1, 2].map((i) => solidFacts.reduce((a, q) => a + q.ce[i]! * q.area, 0)) }; })
    .sort((p, q) => q.area - p.area || p.ce[0]! - q.ce[0]! || p.ce[1]! - q.ce[1]! || p.ce[2]! - q.ce[2]!);
  const known = inputs.flatMap((b) => b.bodies.map((r) => ({ r, keys: new Set(r.faces.flatMap((f) => [f.id, ...f.alias].map(idKey))) })));
  // which input body each made body holds faces of (by the ids its faces carry)
  const from = made.map((m) => known.filter((k) => m.faces.some((f) => [f.id, ...f.alias].some((x) => k.keys.has(idKey(x))))));
  const lead = age ? older(age) : (a: Id, b: Id) => (idKey(a) < idKey(b) ? -1 : 1), used = new Map<string, number>(), taken = new Set<string>(), recs: BodyRec[] = []; let fresh = 0;
  made.forEach((m, i) => {
    const names: Id[] = [];
    for (const k of from[i]!) { const key = idKey(k.r.id), n = used.get(key) ?? 0; used.set(key, n + 1); names.push(n === 0 ? k.r.id : piece(k.r.id, n)); for (const a of k.r.alias) names.push(a); } // the largest piece (made first) keeps the name; the next are its pieces
    const ids = names.filter((x, j, all) => all.findIndex((y) => idKey(y) === idKey(x)) === j).sort(lead);
    let id = ids.length ? ids[0]! : mint(step, "body", fresh++), alias = ids.slice(1);
    while (taken.has(idKey(id))) id = piece(id, 1 + (used.get(idKey(id)) ?? 0));
    taken.add(idKey(id)); recs.push({ id, alias, faces: m.faces });
  });
  body.bodies = recs; return body;
}
/** the body a reference means (a body's name, or the name of a face in it); lost when there is none (E10) */
export function bodyOf(scene: Body, ref: Id): BodyRec {
  const hit = scene.bodies.filter((b) => answers(b, ref) || b.faces.some((f) => answers(f, ref)));
  if (!hit.length) throw new RefLost(show(ref));
  if (hit.length > 1) throw new Error(`${show(ref)} is in ${hit.length} bodies: say which`);
  return hit[0]!;
}
