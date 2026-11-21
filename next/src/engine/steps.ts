// The step kinds of the first slice (E2): a step takes the values of its inputs and returns a body or a sketch. Each is pure: the same step and inputs give the same body and the same ids (E20).
// A step that cannot be made throws; the engine flags it and passes `passthrough` on, a value of the step's own output type (E13).
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, idKey, isPieceOf, mint } from "./id.ts";
import { type Age, Body, type Claim, RefLost, type FaceRec, carry, fromClaims, unifyBody } from "./lineage.ts";

export interface Line { id: Id; a: K.V3; b: K.V3 }
export interface Sketch { readonly kind: "sketch"; readonly lines: Line[]; readonly face?: Id }
/** what a body step passes on when it has no body to pass: nothing, of the type of a body */
export class NoBody { readonly empty = true; fingerprint(): string { return "empty"; } release(): void { /* nothing held */ } }
export type Value = Body | Sketch | NoBody;
export interface Step { readonly id: string; readonly kind: string; readonly params: Readonly<Record<string, any>>; readonly inputs: readonly string[] }
/** `temp` registers a body made on the way (a tool, a body before a merge): the engine releases it when the step is done, so only the result lives on (E17) */
export interface Ctx { age: Age; step: Step; temp: <B extends Body>(b: B) => B }

type V3 = K.V3;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

const needBody = (v: Value | undefined, what = "this step"): Body => { if (!(v instanceof Body)) throw new RefLost(`the body ${what} works on`); return v; };
const needSketch = (v: Value | undefined): Sketch => { if (!v || v instanceof Body || v instanceof NoBody || v.kind !== "sketch") throw new RefLost("the sketch this step works on"); return v; };
const num = (p: any, name: string): number => { const v = p[name]; if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} is not a number`); return v; };

/** the body a step made, checked (E14): a valid solid with a volume */
function checked(body: Body, what: string): Body {
  if (!K.valid(body.solid)) throw new Error(`${what} gave an invalid solid`);
  if (!(K.volume(body.solid) > 0)) throw new Error(`${what} left nothing`);
  return body;
}

/** the id of the side a prism made on each edge of a face: named by the two faces beside that edge (so it is the same on every replay) */
function sidesOf(body: Body, face: FaceRec, report: K.Report, step: string): Claim[] {
  const out: Claim[] = [], edges = body.edges();
  K.faceEdges(face.h).forEach((e, n) => {
    const rec = edges.find((x) => K.sameEdge(x.h, e)), ref: EdgeRef | null = rec?.ref ?? null;
    for (const f of report.fromEdge(e)) out.push({ id: ref ? mint(step, "side", ref.a, ref.b) : mint(step, "side", "free", n), face: f });
  });
  return out;
}

/** the frame of a face for placing lines: u across, v along; v follows `align` (an edge's direction) when given, so a line placed from an edge is parallel to it (E12) */
function frameOf(face: FaceRec, align: V3 | null) {
  const f = K.facts(face.h), n = f.ne;
  let u: V3 = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]; if (Math.hypot(...u) < 1e-3) u = [-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]];
  u = unit(u); let v = cross(n, u);
  if (align) { const d = dot(align, n); v = unit([align[0] - n[0] * d, align[1] - n[1] * d, align[2] - n[2] * d]); u = cross(v, n); }
  const O = f.ce; let lo = Infinity, hi = -Infinity;
  for (const e of K.faceEdges(face.h)) for (const p of K.edgeEnds(e)) { const a = dot(sub(p, O), v); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  return { n, u, v, O, lo, hi };
}
const at = (F: { O: V3; u: V3; v: V3 }, x: number, y: number): V3 => [F.O[0] + F.u[0] * x + F.v[0] * y, F.O[1] + F.u[1] * x + F.v[1] * y, F.O[2] + F.u[2] * x + F.v[2] * y];

function pushed(body: Body, faceId: Id, dist: number, ctx: Ctx): Body {
  const rec = body.one(faceId), f = K.facts(rec.h), step = ctx.step.id;
  const p = K.prism(rec.h, scale(f.ne, dist));
  const claims = [...sidesOf(body, rec, p.report, step), { id: rec.id, face: p.last }]; // the far face carries the pushed face's id on
  const tool = ctx.temp(fromClaims(p.solid, claims, step));
  const m = dist >= 0 ? K.fuse(body.solid, tool.solid) : K.cut(body.solid, tool.solid);
  return unifyBody(ctx.temp(carry(m.solid, m.report, [body, tool], [], step, ctx.age)), step, ctx.age);
}

export interface Kind { outputs: "body" | "sketch"; run(inputs: Value[], ctx: Ctx): Value }
export const kinds: Record<string, Kind> = {
  /** a closed polygon in the XY plane; every line has an id from this step and its place in the polygon */
  sketchPolygon: { outputs: "sketch", run: (_in, { step }) => {
    const pts = step.params.points as [number, number][], lines: Line[] = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]!; return { id: mint(step.id, "line", i), a: [p[0], p[1], 0], b: [q[0], q[1], 0] }; });
    return { kind: "sketch", lines };
  } },
  /** a sketch pulled up: each side is named by the sketch line it grew from, the caps by their ends */
  extrude: { outputs: "body", run: (inputs, { step }) => {
    const sk = needSketch(inputs[0]), d = num(step.params, "d");
    const face = K.polygonFace(sk.lines.map((l) => [l.a[0], l.a[1]] as [number, number])), p = K.prism(face, [0, 0, d]);
    const claims: Claim[] = [{ id: mint(step.id, "start"), face: p.first }, { id: mint(step.id, "end"), face: p.last }];
    for (const e of K.faceEdges(face)) { const m = K.edgeMid(e), line = sk.lines.find((l) => Math.abs((l.a[0] + l.b[0]) / 2 - m[0]) < 1e-9 && Math.abs((l.a[1] + l.b[1]) / 2 - m[1]) < 1e-9); if (line) for (const f of p.report.fromEdge(e)) claims.push({ id: mint(step.id, "side", line.id), face: f }); }
    return checked(fromClaims(p.solid, claims, step.id), "the extrusion");
  } },
  /** lines drawn on a face; a line may be placed by its distance from an edge named by the two faces beside it (E5, E12) */
  sketchOnFace: { outputs: "sketch", run: (inputs, { step }) => {
    const body = needBody(inputs[0]), face = body.one(step.params.face as Id), lines: Line[] = [];
    (step.params.lines as { x?: number; from?: { edge: EdgeRef; dist: number } }[]).forEach((ln, i) => {
      let F = frameOf(face, null), x = ln.x ?? 0;
      if (ln.from) {
        const e = body.findEdges(ln.from.edge)[0]!, [p, q] = K.edgeEnds(e.h); F = frameOf(face, sub(q, p));
        const along = dot(sub(K.edgeMid(e.h), F.O), F.u); x = along + (Math.sign(-along) || 1) * ln.from.dist; // measured from the edge towards the middle of the face
      }
      lines.push({ id: mint(step.id, "line", i), a: at(F, x, F.lo), b: at(F, x, F.hi) });
    });
    return { kind: "sketch", lines, face: face.id };
  } },
  /** the lines become edges of the body: the faces they cross split (E4); a line that splits nothing is flagged, not ignored */
  imprint: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), sk = needSketch(inputs[1]);
    const m = K.split(body.solid, sk.lines.map((l) => [l.a, l.b] as const));
    if (m.solid.faces().length === body.faces.length) throw new Error("the line does not cross a face: it splits nothing");
    return checked(carry(m.solid, m.report, [body], [], step.id, age), "the imprint");
  } },
  /** one face (a region made by an imprint, say) pulled out and joined to the body */
  extrudeRegion: { outputs: "body", run: (inputs, ctx) => {
    const body = needBody(inputs[0]), rec = body.one(ctx.step.params.region as Id), f = K.facts(rec.h), step = ctx.step.id;
    const p = K.prism(rec.h, scale(f.ne, num(ctx.step.params, "t")));
    const tool = ctx.temp(fromClaims(p.solid, [...sidesOf(body, rec, p.report, step), { id: mint(step, "end"), face: p.last }], step));
    const m = K.fuse(body.solid, tool.solid);
    return checked(unifyBody(ctx.temp(carry(m.solid, m.report, [body, tool], [], step, ctx.age)), step, ctx.age), "the extrusion");
  } },
  /** a face moved out (or in) along its normal; it keeps its id */
  push: { outputs: "body", run: (inputs, ctx) => checked(pushed(needBody(inputs[0]), ctx.step.params.face as Id, num(ctx.step.params, "dist"), ctx), "the push") },
  /** a driving dimension between two parallel, opposite faces: the second is pushed until the distance is the value; a later dimension wins over earlier numbers (E3) */
  dimension: { outputs: "body", run: (inputs, ctx) => {
    const body = needBody(inputs[0]), a = K.facts(body.one(ctx.step.params.a as Id).h), b = K.facts(body.one(ctx.step.params.b as Id).h);
    if (dot(a.ne, b.ne) > -0.999999) throw new Error("the two faces are not parallel and facing away from each other");
    const delta = num(ctx.step.params, "value") - Math.abs(dot(sub(b.ce, a.ce), b.ne));
    return Math.abs(delta) < 1e-9 ? body : checked(pushed(body, ctx.step.params.b as Id, delta, ctx), "the dimension");
  } },
  /** a round on every edge between the faces named (a face that has split names all its pieces' edges, E8) */
  fillet: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), asked = body.findEdges(step.params.edge as EdgeRef), r = num(step.params, "r");
    const m = K.fillet(body.solid, asked.map((e) => e.h), r), claims: Claim[] = [];
    // the kernel rounds along edges that continue the ones asked for (an imprint splits one straight edge in two): every edge it rounded gets a round, named by its two faces
    const edges = body.edges().filter((e) => m.rounded.some((x) => K.sameEdge(x, e.h)));
    edges.forEach((e, n) => m.round(e.h).forEach((face, k) => claims.push({ id: e.ref ? mint(step.id, "round", e.ref.a, e.ref.b, k) : mint(step.id, "round", "free", n, k), face })));
    return checked(corners(carry(m.solid, m.report, [body], claims, step.id, age), step.id), "the fillet");
  } },
  /** the whole body turned about an axis through the origin */
  turn: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), m = K.turn(body.solid, step.params.axis as V3, num(step.params, "deg"));
    return checked(carry(m.solid, m.report, [body], [], step.id, age), "the turn");
  } },
};

/**
 * Where two rounds made by one step meet at a vertex the kernel makes a corner face it does not report. The step's own claims name it: a face with no id that touches two or more of
 * this step's rounds is the corner between them, named by their ids (an exact rule from the step's own inputs, E7; a face that fits no rule stays a defect).
 */
function corners(body: Body, step: string): Body {
  const edges = body.edges();
  for (const f of body.faces) {
    if (!f.defect) continue;
    const around = new Map<string, Id>();
    for (const e of edges) if (e.faces.includes(f)) for (const g of e.faces) if (g !== f && g.id.step === step && g.id.role === "round") around.set(idKey(g.id), g.id);
    if (around.size >= 2) { f.id = mint(step, "corner", ...[...around.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, id]) => id)); f.defect = false; }
  }
  return body;
}

/** what a failed step hands on, of its own output type (E13) */
export function passthrough(kind: Kind, inputs: Value[], step: Step): Value {
  if (kind.outputs === "body") return inputs.find((v) => v instanceof Body) ?? new NoBody();
  return inputs.find((v): v is Sketch => !(v instanceof Body) && !(v instanceof NoBody) && v.kind === "sketch") ?? { kind: "sketch", lines: [], face: mint(step.id, "none") };
}
