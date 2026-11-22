// The step kinds of the first slice (E2): a step takes the values of its inputs and returns a body or a sketch. Each is pure: the same step and inputs give the same body and the same ids (E20).
// A step that cannot be made throws; the engine flags it and passes `passthrough` on, a value of the step's own output type (E13).
import * as K from "./kernel.ts";
import { type EdgeRef, type Id, idKey, isPieceOf, mint } from "./id.ts";
import { type Age, Body, type Claim, RefLost, type FaceRec, carry, fromClaims, markImprinted, unifyBody } from "./lineage.ts";

/** a side of a sketch: straight, or an arc through `mid` */
export interface Line { id: Id; a: K.V3; b: K.V3; mid?: K.V3 }
export type PlaneName = "XY" | "XZ" | "YZ";
/** a sketch: lines (a closed polygon, or an open path), or one circle; the plane's normal is the way an extrusion goes unless told otherwise */
/** what a constrained sketch says of itself (E49, E50): data only */
export interface SolveInfo { kind: "solved" | "under" | "redundant"; freedom: number; free: string[]; redundant: string[] }
export interface Sketch { readonly kind: "sketch"; readonly lines: Line[]; readonly face?: Id; readonly normal: V3; readonly open?: boolean; readonly circle?: { id: Id; r: number; c: K.V3; normal: K.V3 }
  /** lines that are not part of the profile: construction lines, and a body's edges held as anchors (E53); read-only for the solver */ readonly reference?: Line[]; readonly solve?: SolveInfo }
/** a step refused, with the constraints that hold it back named, so the screen can show them and offer to delete (E55) */
export class Refusal extends Error { readonly victims: string[]; constructor(message: string, victims: string[]) { super(message); this.victims = victims; } }
/** what a body step passes on when it has no body to pass: nothing, of the type of a body */
export class NoBody { readonly empty = true; fingerprint(): string { return "empty"; } release(): void { /* nothing held */ } }
export type Value = Body | Sketch | NoBody;
export interface Step { readonly id: string; readonly kind: string; readonly params: Readonly<Record<string, any>>; readonly inputs: readonly string[] }
/** `temp` registers a body made on the way (a tool, a body before a merge): the engine releases it when the step is done, so only the result lives on (E17) */
export interface Ctx { age: Age; step: Step; temp: <B extends Body>(b: B) => B }

type V3 = K.V3;
export const unitV = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

export const needBody = (v: Value | undefined, what = "this step"): Body => { if (!(v instanceof Body)) throw new RefLost(`the body ${what} works on`); return v; };
export const needSketch = (v: Value | undefined): Sketch => { if (!v || v instanceof Body || v instanceof NoBody || v.kind !== "sketch") throw new RefLost("the sketch this step works on"); return v; };
export const num = (p: any, name: string): number => { const v = p[name]; if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} is not a number`); return v; };

/** the body a step made, checked (E14): a valid solid with a volume */
export function checked(body: Body, what: string): Body {
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
export function frameOf(face: FaceRec, align: V3 | null) {
  const f = K.facts(face.h), n = f.ne;
  let u: V3 = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]]; if (Math.hypot(...u) < 1e-3) u = [-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]];
  u = unit(u); let v = cross(n, u);
  if (align) { const d = dot(align, n); v = unit([align[0] - n[0] * d, align[1] - n[1] * d, align[2] - n[2] * d]); u = cross(v, n); }
  const O = f.ce; let lo = Infinity, hi = -Infinity;
  for (const e of K.faceEdges(face.h)) for (const p of K.edgeEnds(e)) { const a = dot(sub(p, O), v); lo = Math.min(lo, a); hi = Math.max(hi, a); }
  return { n, u, v, O, lo, hi };
}
export const at = (F: { O: V3; u: V3; v: V3 }, x: number, y: number): V3 => [F.O[0] + F.u[0] * x + F.v[0] * y, F.O[1] + F.u[1] * x + F.v[1] * y, F.O[2] + F.u[2] * x + F.v[2] * y];

function pushed(body: Body, faceId: Id, dist: number, ctx: Ctx): Body {
  const rec = body.one(faceId), f = K.facts(rec.h), step = ctx.step.id;
  const p = K.prism(rec.h, scale(f.ne, dist));
  const claims = [...sidesOf(body, rec, p.report, step), { id: rec.id, face: p.last }]; // the far face carries the pushed face's id on
  const tool = ctx.temp(fromClaims(p.solid, claims, step, false));
  const m = dist >= 0 ? K.fuse(body.solid, tool.solid) : K.cut(body.solid, tool.solid);
  return unifyBody(ctx.temp(carry(m.solid, m.report, [body, tool], [], step, ctx.age)), step, ctx.age);
}

/** where a sketch lies: a named plane, moved along its normal; local (x, y) become world points */
export function planeOf(p: Record<string, any>): { name: PlaneName; offset: number; normal: V3; at(x: number, y: number): V3 } {
  if (p.frame) { // any plane: an origin, the way local x runs, and the normal; local y is the normal across x
    const f = p.frame as { origin: V3; xDir: V3; normal: V3 }, n = unitV(f.normal), x = unitV(f.xDir), y = cross(n, x), o: V3 = f.origin;
    return { name: "XY", offset: 0, normal: n, at: (u, v) => [o[0] + x[0] * u + y[0] * v, o[1] + x[1] * u + y[1] * v, o[2] + x[2] * u + y[2] * v] };
  }
  const name = ((p.plane as PlaneName | undefined) ?? "XY"), offset = typeof p.offset === "number" ? p.offset : 0;
  if (name === "XY") return { name, offset, normal: [0, 0, 1], at: (x, y) => [x, y, offset] };
  if (name === "XZ") return { name, offset, normal: [0, -1, 0], at: (x, y) => [x, offset, y] };
  if (name === "YZ") return { name, offset, normal: [1, 0, 0], at: (x, y) => [offset, x, y] };
  throw new Error(`there is no plane ${String(name)}`);
}
const loopOf = (sk: Sketch): K.Loop => sk.circle ? { kind: "circle", c: sk.circle.c, r: sk.circle.r, normal: sk.circle.normal } : (() => {
  if (sk.open || sk.lines.length < 2 || (sk.lines.length === 2 && !sk.lines.some((l) => l.mid))) throw new Error("a profile needs a closed shape or a circle");
  return { kind: "poly" as const, pts: sk.lines.map((l) => l.a), mids: sk.lines.map((l) => l.mid ?? null) };
})();
/** the face a sketch bounds (a polygon, which may have arcs, or a circle), with the other sketches as holes in it */
export function profileFace(sk: Sketch, holes: readonly Sketch[] = []): K.FaceH { return K.profileFace(loopOf(sk), holes.map(loopOf)); }
/**
 * The sides a profile's edges made, named by the sketch line (or circle) each came from, found by where the edge's ends are; an edge that made more than one face (a sweep round a corner)
 * numbers them along the way (`rank`).
 */
export function sidesFromProfile(sks: readonly Sketch[], face: K.FaceH, report: K.Report, step: string, claims: Claim[], rank?: (f: K.FaceH) => number): void {
  const same = (a: V3, b: V3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-7);
  K.faceEdges(face).map((e) => ({ e, ends: K.edgeEnds(e) })).sort((p, q) => p.ends[0][0] - q.ends[0][0] || p.ends[0][1] - q.ends[0][1] || p.ends[0][2] - q.ends[0][2]).forEach(({ e, ends }, n) => {
    let from: readonly (string | number | Id)[] | null = null;
    for (const sk of sks) {
      if (sk.circle) { if (Math.abs(Math.hypot(...sub(ends[0], sk.circle.c)) - sk.circle.r) < 1e-7) from = [sk.circle.id, n]; }
      else { const l = sk.lines.find((x) => (same(x.a, ends[0]) && same(x.b, ends[1])) || (same(x.a, ends[1]) && same(x.b, ends[0]))); if (l) from = [l.id]; }
      if (from) break;
    }
    if (!from) return;
    const made = report.fromEdge(e), ordered = rank ? [...made].sort((p, q) => rank(p) - rank(q)) : made;
    ordered.forEach((f, k) => claims.push({ id: ordered.length > 1 || rank ? mint(step, "side", ...from!, k) : mint(step, "side", ...from!), face: f }));
  });
}

export interface Kind { outputs: "body" | "sketch"; run(inputs: Value[], ctx: Ctx): Value }
export const kinds: Record<string, Kind> = {
  /** a polygon in a plane (a frame, or XY, XZ, YZ moved `offset` along its normal), its sides straight or arcs through a mid point; every line has an id from this step and its place in it. `open` leaves the last side out: a path */
  sketchPolygon: { outputs: "sketch", run: (_in, { step }) => {
    const pts = step.params.points as [number, number][], mids = (step.params.mids ?? []) as ([number, number] | null)[], pl = planeOf(step.params), open = step.params.open === true;
    if (open && pts.length < 2) throw new Error("a path needs two points at least");
    const lines: Line[] = pts.slice(0, open ? -1 : undefined).map((p, i) => { const q = pts[(i + 1) % pts.length]!, m = mids[i]; return { id: mint(step.id, "line", i), a: pl.at(p[0], p[1]), b: pl.at(q[0], q[1]), ...(m ? { mid: pl.at(m[0], m[1]) } : {}) }; });
    return { kind: "sketch", lines, normal: pl.normal, ...(open ? { open: true } : {}) };
  } },
  /** a circle in a plane, centred at `center` (two numbers in the plane; the origin when not given) */
  sketchCircle: { outputs: "sketch", run: (_in, { step }) => {
    const pl = planeOf(step.params), r = num(step.params, "r"), at = (step.params.center as [number, number] | undefined) ?? [0, 0]; if (!(r > 0)) throw new Error("the radius is not above nothing");
    return { kind: "sketch", lines: [], normal: pl.normal, circle: { id: mint(step.id, "circle"), r, c: pl.at(at[0], at[1]), normal: pl.normal } };
  } },
  /** a sketch pulled along its plane's normal (or `dir`): each side is named by the sketch line it grew from, the caps by their ends */
  extrude: { outputs: "body", run: (inputs, { step }) => {
    const sk = needSketch(inputs[0]), holes = inputs.slice(1).map(needSketch), d = num(step.params, "d"), dir = unitV((step.params.dir as V3 | undefined) ?? sk.normal), face = profileFace(sk, holes), p = K.prism(face, scale(dir, d));
    const claims: Claim[] = [{ id: mint(step.id, "start"), face: p.first }, { id: mint(step.id, "end"), face: p.last }];
    sidesFromProfile([sk, ...holes], face, p.report, step.id, claims);
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
    return { kind: "sketch", lines, face: face.id, normal: unitV(K.facts(face.h).ne) };
  } },
  /** the lines become edges of the body: the faces they cross split (E4); a line that splits nothing is flagged, not ignored */
  imprint: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), sk = needSketch(inputs[1]);
    const m = K.split(body.solid, sk.lines.map((l) => [l.a, l.b] as const));
    if (m.solid.faces().length === body.faces.length) throw new Error("the line does not cross a face: it splits nothing");
    return checked(markImprinted(carry(m.solid, m.report, [body], [], step.id, age), body), "the imprint");
  } },
  /** a face moved out (or in) along its normal, a region made by an imprint included; it keeps its id */
  push: { outputs: "body", run: (inputs, ctx) => checked(pushed(needBody(inputs[0]), ctx.step.params.face as Id, num(ctx.step.params, "dist"), ctx), "the push") },
  /** a driving dimension between two parallel, opposite faces: the second is pushed until the distance is the value; a later dimension wins over earlier numbers (E3) */
  dimension: { outputs: "body", run: (inputs, ctx) => {
    const body = needBody(inputs[0]), a = K.facts(body.one(ctx.step.params.a as Id).h), b = K.facts(body.one(ctx.step.params.b as Id).h);
    if (dot(a.ne, b.ne) > -0.999999) throw new Error("the two faces are not parallel and facing away from each other");
    const delta = num(ctx.step.params, "value") - Math.abs(dot(sub(b.ce, a.ce), b.ne));
    return Math.abs(delta) < 1e-9 ? body : checked(pushed(body, ctx.step.params.b as Id, delta, ctx), "the dimension");
  } },
  /** a round (`fillet`) or a flat cut (`chamfer`) of `size` on every edge between the faces named (`edges`); a face that has split names all its pieces' edges, and the kernel may follow edges that continue them */
  round: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), asked = (step.params.edges as EdgeRef[]).flatMap((r) => body.findEdges(r)), size = num(step.params, "size"), mode = step.params.mode === "chamfer" ? "chamfer" : "fillet";
    const m = K.roundEdges(body.solid, asked.map((e) => e.h), size, mode), claims: Claim[] = [];
    const edges = body.edges().filter((e) => m.rounded.some((x) => K.sameEdge(x, e.h)));
    edges.forEach((e, n) => m.round(e.h).forEach((face, k) => claims.push({ id: e.ref ? mint(step.id, "round", e.ref.a, e.ref.b, k) : mint(step.id, "round", "free", n, k), face })));
    return checked(corners(carry(m.solid, m.report, [body], claims, step.id, age), step.id), `the ${mode}`);
  } },
  /** two bodies made one (`add`), the second taken out of the first (`cut`), or what they share (`intersect`); every face keeps its id, and merged faces answer to both */
  combine: { outputs: "body", run: (inputs, { step, age }, ) => {
    const a = needBody(inputs[0]), b = needBody(inputs[1]), mode = (step.params.mode as string | undefined) ?? "add";
    const m = mode === "cut" ? K.cut(a.solid, b.solid) : mode === "intersect" ? K.common(a.solid, b.solid) : mode === "add" ? K.fuse(a.solid, b.solid) : (() => { throw new Error(`there is no way to combine called ${mode}`); })();
    return checked(unifyBody(carry(m.solid, m.report, [a, b], [], step.id, age, mode === "cut" ? [a] : [a, b]), step.id, age), "the combination");
  } },
  /** the whole body moved by a vector */
  move: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), by = step.params.by as V3; if (!Array.isArray(by) || by.length !== 3) throw new Error("the move needs three numbers");
    const m = K.move(body.solid, by); return checked(carry(m.solid, m.report, [body], [], step.id, age), "the move");
  } },
  /** the whole body turned about an axis (through the origin, or through `pivot`) */
  turn: { outputs: "body", run: (inputs, { step, age }) => {
    const body = needBody(inputs[0]), m = K.turn(body.solid, step.params.axis as V3, num(step.params, "deg"), (step.params.pivot as V3 | undefined) ?? [0, 0, 0]);
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
  return inputs.find((v): v is Sketch => !(v instanceof Body) && !(v instanceof NoBody) && v.kind === "sketch") ?? { kind: "sketch", lines: [], face: mint(step.id, "none"), normal: [0, 0, 1] };
}
