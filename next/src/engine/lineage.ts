// A body is an exact solid and, for each of its faces, an id (E6, E7); a step's result carries the ids of the input's faces through the operation by the kernel's own report,
// completed by exact rules where the report is silent. A reference to a face that split resolves to its pieces (E8); to a face that merged, through its other ids (E9);
// a reference that finds nothing is lost (E10) and never attaches to anything else.
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, baseKey, edgeKey, edgeRef, idKey, isPieceOf, mint, piece, show } from "./id.ts";

export interface FaceRec { id: Id; alias: Id[]; h: K.FaceH; /** the engine could not name this face from the step's history or rules (E7): a defect, reported */ defect: boolean }
export interface Note { kind: "split" | "tie" | "defect" | "merged" | "dropped"; text: string }
export interface EdgeRec { h: K.EdgeH; faces: FaceRec[]; /** two faces beside it: the edge's name */ ref: EdgeRef | null }

/** a reference that finds nothing: the step it belongs to is orphaned (E10) */
export class RefLost extends Error { readonly what: string; constructor(what: string) { super(`${what} is no longer there`); this.what = what; } }
/** the age of a step in the recipe: older ids lead when faces merge */
export type Age = (step: string) => number;

export class Body {
  private es: EdgeRec[] | null = null;
  readonly solid: K.Solid; readonly faces: FaceRec[]; readonly notes: Note[];
  constructor(solid: K.Solid, faces: FaceRec[], notes: Note[] = []) { this.solid = solid; this.faces = faces; this.notes = notes; }
  release(): void { this.solid.release(); this.es = null; }

  /** the faces a reference means: the face, or the pieces it split into, found through any of its ids (E8, E9) */
  find(id: Id): FaceRec[] { return this.faces.filter((f) => isPieceOf(f.id, id) || f.alias.some((a) => isPieceOf(a, id))); }
  /** the one face a reference means, or lost; more than one is a split the step must say how to take (E8) */
  one(id: Id): FaceRec {
    const s = this.find(id);
    if (!s.length) throw new RefLost(show(id));
    if (s.length > 1) throw new Error(`${show(id)} has split into ${s.length} faces: say which`);
    return s[0]!;
  }
  all(id: Id): FaceRec[] { const s = this.find(id); if (!s.length) throw new RefLost(show(id)); return s; }

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
  /** the edges a reference means: every edge between the faces (or their pieces) it names (E8) */
  findEdges(ref: EdgeRef): EdgeRec[] {
    const hit = (f: FaceRec, id: Id) => isPieceOf(f.id, id) || f.alias.some((a) => isPieceOf(a, id));
    const out = this.edges().filter((e) => e.faces.length === 2 && ((hit(e.faces[0]!, ref.a) && hit(e.faces[1]!, ref.b)) || (hit(e.faces[0]!, ref.b) && hit(e.faces[1]!, ref.a))));
    if (!out.length) throw new RefLost(`the edge between ${show(ref.a)} and ${show(ref.b)}`);
    return out;
  }
  /** what a step's answer is known by, for the engine to tell whether it changed (a whole-body fingerprint: volume and every id) */
  fingerprint(): string {
    // the geometry as well as the ids: an edit that only moves a face must show (else the engine stops there and the steps after it do not run)
    const g = (f: FaceRec) => { const q = K.facts(f.h); return `${idKey(f.id)}~${q.type}~${q.area.toFixed(9)}~${q.ce.map((v) => v.toFixed(9)).join(",")}`; };
    return K.scoped(() => `${K.volume(this.solid).toFixed(9)}|${this.faces.map(g).sort().join(";")}`);
  }
}

export interface Claim { id: Id; face: K.FaceH }
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const older = (age: Age) => (a: Id, b: Id) => age(a.step) - age(b.step) || (idKey(a) < idKey(b) ? -1 : 1);

/**
 * Carry the ids of the input bodies' faces through an operation (E7). `claims` name faces the step itself made (a cap, a side from a sketch line, a round).
 * A face of the answer that nothing names is a defect: it gets an id marked so and a note (never a silent name).
 */
export function carry(solid: K.Solid, report: K.Report, inputs: readonly Body[], claims: readonly Claim[], step: string, age: Age): Body {
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
  const lead = older(age);
  let n = 0;
  const recs: FaceRec[] = newFaces.map((h, i) => {
    const ids = got[i]!.filter((x, k, all) => all.findIndex((y) => idKey(y) === idKey(x)) === k).sort(lead);
    if (!ids.length) { notes.push({ kind: "defect", text: `a face of ${step} has no id` }); return { id: mint(step, "unnamed", n++), alias: [], h, defect: true }; }
    if (ids.length > 1) notes.push({ kind: "merged", text: `${ids.map(show).join(" + ")}` });
    return { id: ids[0]!, alias: ids.slice(1), h, defect: false };
  });
  return new Body(solid, recs, notes);
}

/** join faces in one surface, and recover which new face each old face went into by the area they share (E7, E9) */
export function unifyBody(body: Body, step: string, age: Age): Body {
  // the seams between the pieces of a face that split (an imprint's lines) stay: they are the person's lines, not leftovers (E4)
  const seams = body.edges().filter((e) => e.faces.length === 2 && baseKey(e.faces[0]!.id) === baseKey(e.faces[1]!.id) && idKey(e.faces[0]!.id) !== idKey(e.faces[1]!.id)).map((e) => e.h);
  const solid = K.unify(body.solid, seams), faces = solid.faces();
  const targets = faces.map((h) => ({ h, f: K.facts(h), ids: [] as Id[] })), notes: Note[] = [...body.notes];
  for (const rec of body.faces) {
    const a = K.facts(rec.h);
    const into = targets.filter((t) => t.f.type === a.type && t.f.ne.every((v, i) => Math.abs(v - a.ne[i]!) < 1e-6)
      && t.f.lo.every((v, i) => v <= a.hi[i]! + 1e-6) && t.f.hi.every((v, i) => v >= a.lo[i]! - 1e-6) && K.overlap(rec.h, t.h) > 0.99 * a.area);
    if (into.length === 1) into[0]!.ids.push(rec.id, ...rec.alias);
    else notes.push({ kind: "dropped", text: `${show(rec.id)} could not be placed after the merge (${into.length} candidates)` });
  }
  const lead = older(age); let n = 0;
  const recs: FaceRec[] = targets.map((t) => {
    const ids = t.ids.filter((x, k, all) => all.findIndex((y) => idKey(y) === idKey(x)) === k).sort(lead);
    if (!ids.length) { notes.push({ kind: "defect", text: `a face after the merge in ${step} has no id` }); return { id: mint(step, "unnamed", n++), alias: [], h: t.h, defect: true }; }
    if (ids.length > 1) notes.push({ kind: "merged", text: ids.map(show).join(" + ") });
    return { id: ids[0]!, alias: ids.slice(1), h: t.h, defect: false };
  });
  return new Body(solid, recs, notes);
}

/** a body made by a step from nothing: every face named by the step, from a list of claims */
export function fromClaims(solid: K.Solid, claims: readonly Claim[], step: string): Body {
  const faces = solid.faces(), notes: Note[] = []; let n = 0;
  const recs: FaceRec[] = faces.map((h) => {
    const c = claims.find((x) => K.sameFace(x.face, h));
    if (c) return { id: c.id, alias: [], h, defect: false };
    notes.push({ kind: "defect", text: `a face of ${step} has no id` }); return { id: mint(step, "unnamed", n++), alias: [], h, defect: true };
  });
  return new Body(solid, recs, notes);
}
export { edgeKey };
