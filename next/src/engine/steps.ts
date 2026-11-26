// The step kinds of the first slice (E2): a step takes the values of its inputs and returns a body or a sketch. Each is pure: the same step and inputs give the same body and the same ids (E20).
// A step that cannot be made throws; the engine flags it and passes `passthrough` on, a value of the step's own output type (E13).
import { type EdgeRef, type Id, idKey, mint, show } from "./id.ts";
import * as K from "./kernel.ts";
import {
  type Age,
  Body,
  type Claim,
  type EdgeRec,
  type FaceRec,
  RefLost,
  carry,
  fromClaims,
  markImprinted,
  unifyBody,
} from "./lineage.ts";
import { pointedLimit, rimOf } from "./rounds.ts";
import { cross, dot, faceAxes, scale, sub, unit } from "./vec.ts";

/** a side of a sketch: straight, or an arc through `mid` */
export interface Line {
  id: Id;
  a: K.V3;
  b: K.V3;
  mid?: K.V3;
}
export type PlaneName = "XY" | "XZ" | "YZ";
/** a sketch: lines (a closed polygon, or an open path), or one circle; the plane's normal is the way an extrusion goes unless told otherwise */
/** what a constrained sketch says of itself (E49, E50): data only */
export interface SolveInfo {
  kind: "solved" | "under" | "redundant";
  freedom: number;
  free: string[];
  redundant: string[];
  /** only for a drag (E58): where every point and circle ended up, what was not reached and what was held */ solution?: {
    points: Record<string, [number, number]>;
    circles: Record<string, number>;
  };
  unreached?: Record<string, number>;
  holds?: string[];
}
export interface Sketch {
  readonly kind: "sketch";
  readonly lines: Line[];
  readonly face?: Id;
  readonly normal: V3;
  readonly open?: boolean;
  /** the holes of the profile (E63, E64): closed loops inside it, each a sketch of its own (lines, or one circle) */ readonly inner?: readonly Sketch[];
  /** every region the drawing makes, as a point inside it (the world), its area, and whether the profile fills it (E63) */ readonly regions?: readonly {
    at: V3;
    area: number;
    filled: boolean;
  }[];
  readonly circle?: { id: Id; r: number; c: K.V3; normal: K.V3 };
  /** lines that are not part of the profile: construction lines, and a body's edges held as anchors (E53); read-only for the solver */ readonly reference?: Line[];
  readonly solve?: SolveInfo;
  /** how a constrained sketch was made (its entities and constraints, as data), so a copy of it can carry them (E59); constraints a copy could not keep, and what each became */ readonly definition?: unknown;
  readonly carried?: {
    dropped: { id: string; kind: string; why: string }[];
    changed: { id: string; from: string; to: string }[];
  };
}
/** a step refused, with the constraints that hold it back named, so the screen can show them and offer to delete (E55) */
import { Refusal } from "./refusal.ts";
export { Refusal };
/** what a body step passes on when it has no body to pass: nothing, of the type of a body */
export class NoBody {
  readonly empty = true;
  fingerprint(): string {
    return "empty";
  }
  release(): void {
    /* nothing held */
  }
}
export type Value = Body | Sketch | NoBody;
export interface Step {
  readonly id: string;
  readonly kind: string;
  readonly params: Readonly<Record<string, any>>;
  readonly inputs: readonly string[];
}
/** `temp` registers a body made on the way (a tool, a body before a merge): the engine releases it when the step is done, so only the result lives on (E17) */
export interface Ctx {
  age: Age;
  step: Step;
  temp: <B extends Body>(b: B) => B;
}

type V3 = K.V3;

export const needBody = (v: Value | undefined, what = "this step"): Body => {
  if (!(v instanceof Body)) throw new RefLost(`the body ${what} works on`);
  return v;
};
export const needSketch = (v: Value | undefined): Sketch => {
  if (!v || v instanceof Body || v instanceof NoBody || v.kind !== "sketch")
    throw new RefLost("the sketch this step works on");
  return v;
};
export const num = (p: any, name: string): number => {
  const v = p[name];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${name} is not a number`);
  return v;
};

/** the body a step made, checked (E14): a valid solid with a volume */
export function checked(body: Body, what: string): Body {
  if (!K.valid(body.solid)) throw new Error(`${what} gave an invalid solid`);
  if (!(K.volume(body.solid) > 0)) throw new Error(`${what} left nothing`);
  if (K.absurd(body.solid))
    throw new Error(`${what} gave a solid that cannot be right (a face or the volume is beyond any part)`);
  return body;
}

/** the id of the side a prism made on each edge of a face: named by the two faces beside that edge (so it is the same on every replay) */
function sidesOf(body: Body, face: FaceRec, report: K.Report, step: string): Claim[] {
  const out: Claim[] = [],
    edges = body.edges();
  K.faceEdges(face.h).forEach((e, n) => {
    const rec = edges.find((x) => K.sameEdge(x.h, e)),
      ref: EdgeRef | null = rec?.ref ?? null;
    for (const f of report.fromEdge(e))
      out.push({ id: ref ? mint(step, "side", ref.a, ref.b) : mint(step, "side", "free", n), face: f });
  });
  return out;
}

/** the frame of a face for placing lines: u across, v along; v follows `align` (an edge's direction) when given, so a line placed from an edge is parallel to it (E12) */
export function frameOf(face: FaceRec, align: V3 | null) {
  const f = K.facts(face.h),
    n = f.ne;
  let { u, v } = faceAxes(n);
  if (align) {
    const d = dot(align, n);
    v = unit([align[0] - n[0] * d, align[1] - n[1] * d, align[2] - n[2] * d]);
    u = cross(v, n);
  }
  const O = f.ce;
  let lo = Infinity,
    hi = -Infinity;
  for (const e of K.faceEdges(face.h))
    for (const p of K.edgeEnds(e)) {
      const a = dot(sub(p, O), v);
      lo = Math.min(lo, a);
      hi = Math.max(hi, a);
    }
  return { n, u, v, O, lo, hi };
}
export const at = (F: { O: V3; u: V3; v: V3 }, x: number, y: number): V3 => [
  F.O[0] + F.u[0] * x + F.v[0] * y,
  F.O[1] + F.u[1] * x + F.v[1] * y,
  F.O[2] + F.u[2] * x + F.v[2] * y,
];

/**
 * Put a tool body into a body: added (`add`), taken out (`cut`) or kept where they overlap (`intersect`); every face keeps its id, the faces the kernel says nothing of are recovered by the engine (E7), and faces
 * that lie on one surface are joined. The one place this sequence is written (a push, a hole, a pull, a combine all end here). `nameFrom`: the bodies whose names the result may take (a cut takes the target's).
 */
export function joinTool(
  a: Body,
  tool: Body,
  mode: "add" | "cut" | "intersect",
  ctx: Ctx,
  nameFrom?: readonly Body[],
): Body {
  const m =
    mode === "cut"
      ? K.cut(a.solid, tool.solid)
      : mode === "intersect"
        ? K.common(a.solid, tool.solid)
        : K.fuse(a.solid, tool.solid);
  return unifyBody(
    ctx.temp(carry(m.solid, m.report, [a, tool], [], ctx.step.id, ctx.age, nameFrom)),
    ctx.step.id,
    ctx.age,
  );
}
function pushed(body: Body, faceId: Id, dist: number, ctx: Ctx): Body {
  const rec = body.one(faceId),
    f = K.facts(rec.h),
    step = ctx.step.id;
  const p = K.prism(rec.h, scale(f.ne, dist));
  const claims = [...sidesOf(body, rec, p.report, step), { id: rec.id, face: p.last }]; // the far face carries the pushed face's id on
  const tool = ctx.temp(fromClaims(p.solid, claims, step, false));
  return joinTool(body, tool, dist >= 0 ? "add" : "cut", ctx);
}

/** where a sketch lies: a named plane, moved along its normal; local (x, y) become world points */
export function planeOf(p: Record<string, any>): {
  name: PlaneName;
  offset: number;
  normal: V3;
  at(x: number, y: number): V3;
} {
  if (p.frame) {
    // any plane: an origin, the way local x runs, and the normal; local y is the normal across x
    const f = p.frame as { origin: V3; xDir: V3; normal: V3 },
      n = unit(f.normal),
      x = unit(f.xDir),
      y = cross(n, x),
      o: V3 = f.origin;
    return {
      name: "XY",
      offset: 0,
      normal: n,
      at: (u, v) => [o[0] + x[0] * u + y[0] * v, o[1] + x[1] * u + y[1] * v, o[2] + x[2] * u + y[2] * v],
    };
  }
  const name = (p.plane as PlaneName | undefined) ?? "XY",
    offset = typeof p.offset === "number" ? p.offset : 0;
  if (name === "XY") return { name, offset, normal: [0, 0, 1], at: (x, y) => [x, y, offset] };
  if (name === "XZ") return { name, offset, normal: [0, -1, 0], at: (x, y) => [x, offset, y] };
  if (name === "YZ") return { name, offset, normal: [1, 0, 0], at: (x, y) => [offset, x, y] };
  throw new Error(`there is no plane ${String(name)}`);
}
const loopOf = (sk: Sketch): K.Loop =>
  sk.circle
    ? { kind: "circle", c: sk.circle.c, r: sk.circle.r, normal: sk.circle.normal }
    : (() => {
        if (sk.open || sk.lines.length < 2 || (sk.lines.length === 2 && !sk.lines.some((l) => l.mid)))
          throw new Error("a profile needs a closed shape or a circle");
        return { kind: "poly" as const, pts: sk.lines.map((l) => l.a), mids: sk.lines.map((l) => l.mid ?? null) };
      })();
/** the face a sketch bounds (a polygon, which may have arcs, or a circle), with the other sketches as holes in it */
export function profileFace(sk: Sketch, holes: readonly Sketch[] = []): K.FaceH {
  return K.profileFace(loopOf(sk), [...holes, ...(sk.inner ?? [])].map(loopOf));
}
/**
 * The sides a profile's edges made, named by the sketch line (or circle) each came from, found by where the edge's ends are; an edge that made more than one face (a sweep round a corner)
 * numbers them along the way (`rank`).
 */
export function sidesFromProfile(
  sks: readonly Sketch[],
  face: K.FaceH,
  report: K.Report,
  step: string,
  claims: Claim[],
  rank?: (f: K.FaceH) => number,
): void {
  const same = (a: V3, b: V3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-7);
  K.faceEdges(face)
    .map((e) => ({ e, ends: K.edgeEnds(e) }))
    .sort((p, q) => p.ends[0][0] - q.ends[0][0] || p.ends[0][1] - q.ends[0][1] || p.ends[0][2] - q.ends[0][2])
    .forEach(({ e, ends }, n) => {
      let from: readonly (string | number | Id)[] | null = null;
      for (const sk of sks.flatMap((q) => [q, ...(q.inner ?? [])])) {
        if (sk.circle) {
          if (Math.abs(Math.hypot(...sub(ends[0], sk.circle.c)) - sk.circle.r) < 1e-7) from = [sk.circle.id, n];
        } else {
          const em = K.edgeMid(e),
            l = sk.lines.find(
              (x) =>
                ((same(x.a, ends[0]) && same(x.b, ends[1])) || (same(x.a, ends[1]) && same(x.b, ends[0]))) &&
                same(x.mid ?? [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2, (x.a[2] + x.b[2]) / 2], em),
            );
          if (l) from = [l.id];
        } // the middle tells a line from an arc with the same ends (a D)
        if (from) break;
      }
      if (!from) return;
      const made = report.fromEdge(e),
        ordered = rank ? [...made].sort((p, q) => rank(p) - rank(q)) : made;
      ordered.forEach((f, k) =>
        claims.push({
          id: ordered.length > 1 || rank ? mint(step, "side", ...from!, k) : mint(step, "side", ...from!),
          face: f,
        }),
      );
    });
}

export interface Kind {
  outputs: "body" | "sketch";
  run(inputs: Value[], ctx: Ctx): Value;
  /** what is known of the kind besides how it runs, written once with the kind (`meta`): */
  /** the number the step is mostly about (the one a failed step offers a range for, E35) */ main?: string;
  /** the step must change the body it is given: when the result is that body again it is flagged (E27) */ changes?: boolean;
  /** which face, edge or body the step names, to find the body it works on when there are several (E40); with `bodyRequired`, a step that names none is refused */ scope?: (
    params: Record<string, any>,
    inputs: Value[],
  ) => Id | null;
  bodyRequired?: boolean;
}
type KindMeta = Pick<Kind, "main" | "changes" | "scope" | "bodyRequired">;
/** say what a kind is about, next to where the kind is defined: its main number, whether it must change something, what it names (replaces three tables in three files) */
export function meta(name: string, m: KindMeta): void {
  const k = kinds[name];
  if (!k) throw new Error(`there is no step kind ${name} to say anything about`);
  Object.assign(k, m);
}
export const kinds: Record<string, Kind> = {
  /** a polygon in a plane (a frame, or XY, XZ, YZ moved `offset` along its normal), its sides straight or arcs through a mid point; every line has an id from this step and its place in it. `open` leaves the last side out: a path */
  sketchPolygon: {
    outputs: "sketch",
    run: (_in, { step }) => {
      const pts = step.params.points as [number, number][],
        mids = (step.params.mids ?? []) as ([number, number] | null)[],
        pl = planeOf(step.params),
        open = step.params.open === true;
      if (open && pts.length < 2) throw new Error("a path needs two points at least");
      const lines: Line[] = pts.slice(0, open ? -1 : undefined).map((p, i) => {
        const q = pts[(i + 1) % pts.length]!,
          m = mids[i];
        return {
          id: mint(step.id, "line", i),
          a: pl.at(p[0], p[1]),
          b: pl.at(q[0], q[1]),
          ...(m ? { mid: pl.at(m[0], m[1]) } : {}),
        };
      });
      return { kind: "sketch", lines, normal: pl.normal, ...(open ? { open: true } : {}) };
    },
  },
  /** a circle in a plane, centred at `center` (two numbers in the plane; the origin when not given) */
  sketchCircle: {
    outputs: "sketch",
    run: (_in, { step }) => {
      const pl = planeOf(step.params),
        r = num(step.params, "r"),
        at = (step.params.center as [number, number] | undefined) ?? [0, 0];
      if (!(r > 0)) throw new Error("the radius is not above nothing");
      return {
        kind: "sketch",
        lines: [],
        normal: pl.normal,
        circle: { id: mint(step.id, "circle"), r, c: pl.at(at[0], at[1]), normal: pl.normal },
      };
    },
  },
  /** a sketch pulled along its plane's normal (or `dir`): each side is named by the sketch line it grew from, the caps by their ends */
  extrude: {
    outputs: "body",
    run: (inputs, { step }) => {
      const sk = needSketch(inputs[0]),
        holes = inputs.slice(1).map(needSketch),
        d = num(step.params, "d");
      if (!(Math.abs(d) > 1e-9)) throw new Error("the distance is nothing: an extrusion needs a length");
      const dir = unit((step.params.dir as V3 | undefined) ?? sk.normal),
        face = profileFace(sk, holes),
        p = K.prism(face, scale(dir, d));
      const claims: Claim[] = [
        { id: mint(step.id, "start"), face: p.first },
        { id: mint(step.id, "end"), face: p.last },
      ];
      sidesFromProfile([sk, ...holes], face, p.report, step.id, claims);
      return checked(fromClaims(p.solid, claims, step.id), "the extrusion");
    },
  },
  /** lines drawn on a face; a line may be placed by its distance from an edge named by the two faces beside it (E5, E12) */
  sketchOnFace: {
    outputs: "sketch",
    run: (inputs, { step }) => {
      const body = needBody(inputs[0]),
        face = body.one(step.params.face as Id),
        lines: Line[] = [];
      (step.params.lines as { x?: number; from?: { edge: EdgeRef; dist: number } }[]).forEach((ln, i) => {
        let F = frameOf(face, null),
          x = ln.x ?? 0;
        if (ln.from) {
          const e = body.findEdges(ln.from.edge)[0]!,
            [p, q] = K.edgeEnds(e.h);
          F = frameOf(face, sub(q, p));
          const along = dot(sub(K.edgeMid(e.h), F.O), F.u);
          x = along + (Math.sign(-along) || 1) * ln.from.dist; // measured from the edge towards the middle of the face
        }
        lines.push({ id: mint(step.id, "line", i), a: at(F, x, F.lo), b: at(F, x, F.hi) });
      });
      return { kind: "sketch", lines, face: face.id, normal: unit(K.facts(face.h).ne) };
    },
  },
  /** the lines become edges of the body: the faces they cross split (E4); a line that splits nothing is flagged, not ignored */
  imprint: {
    outputs: "body",
    run: (inputs, { step, age }) => {
      const body = needBody(inputs[0]),
        sk = needSketch(inputs[1]);
      const m = K.split(
        body.solid,
        sk.lines.map((l) => [l.a, l.b] as const),
      );
      if (m.solid.faces().length === body.faces.length)
        throw new Error("the line does not cross a face: it splits nothing");
      return checked(markImprinted(carry(m.solid, m.report, [body], [], step.id, age), body), "the imprint");
    },
  },
  /** a face moved out (or in) along its normal, a region made by an imprint included; it keeps its id */
  push: {
    outputs: "body",
    run: (inputs, ctx) =>
      checked(pushed(needBody(inputs[0]), ctx.step.params.face as Id, num(ctx.step.params, "dist"), ctx), "the push"),
  },
  /** a driving dimension between two parallel, opposite faces: the second is pushed until the distance is the value; a later dimension wins over earlier numbers (E3) */
  dimension: {
    outputs: "body",
    run: (inputs, ctx) => {
      const body = needBody(inputs[0]),
        a = K.facts(body.one(ctx.step.params.a as Id).h),
        b = K.facts(body.one(ctx.step.params.b as Id).h);
      if (dot(a.ne, b.ne) > -0.999999)
        throw new Error("the two faces are not parallel and facing away from each other");
      const delta = num(ctx.step.params, "value") - Math.abs(dot(sub(b.ce, a.ce), b.ne));
      return Math.abs(delta) < 1e-9
        ? body
        : checked(pushed(body, ctx.step.params.b as Id, delta, ctx), "the dimension");
    },
  },
  /** a round (`fillet`) or a flat cut (`chamfer`) of `size` on every edge between the faces named (`edges`); a face that has split names all its pieces' edges, and the kernel may follow edges that continue them */
  round: {
    outputs: "body",
    run: (inputs, { step, age }) => {
      const body = needBody(inputs[0]),
        asked = (step.params.edges as EdgeRef[]).flatMap((r) => body.findEdges(r)),
        mode = step.params.mode === "chamfer" ? "chamfer" : "fillet";
      for (const e of asked)
        if (e.faces.length === 2 && K.edgeTurn(e.h, e.faces[0]!.h, e.faces[1]!.h) < 0.5)
          throw new Error(
            `the edge between ${show(e.faces[0]!.id)} and ${show(e.faces[1]!.id)} is smooth (the faces meet without a corner): there is nothing to ${mode === "chamfer" ? "chamfer" : "round"}`,
          ); // the seam of a fillet, a tangent join: the kernel fails on these at any size
      const law = step.params.sizes as K.SizeLaw | undefined;
      if (
        law !== undefined &&
        (!Array.isArray(law) ||
          law.length < 2 ||
          law.some((q) => !Array.isArray(q) || q.length !== 2 || !(q[1] > 0) || !(q[0] >= 0 && q[0] <= 1)) ||
          law.some((q, i) => i > 0 && !(q[0] > law[i - 1]![0])))
      )
        throw new Error(
          "a varying size is a list of (place along the edge from 0 to 1, size above nothing) in order, two at least",
        );
      const size = law ? Math.max(...law.map((q) => q[1])) : num(step.params, "size");
      if (step.params.past === true && !law && mode === "fillet") {
        const out = pointed(body, asked, size, step, age);
        if (out) return out;
      } // the person chose to continue past the kernel's limit (E35)
      // the law's first place is the edge's own start, which end that is nobody can tell from outside: `near` (a point) says which end the first size belongs to
      const near = step.params.near as V3 | undefined,
        lawFor =
          law && near
            ? (e: K.EdgeH): K.SizeLaw => {
                const [a, b] = K.edgeEnds(e),
                  da = Math.hypot(a[0] - near[0], a[1] - near[1], a[2] - near[2]),
                  db = Math.hypot(b[0] - near[0], b[1] - near[1], b[2] - near[2]);
                return da <= db ? law : [...law].reverse().map(([u, z]) => [1 - u, z] as const);
              }
            : null;
      const once = (from: Body, edgesOf: EdgeRec[]): Body => {
        const m = K.roundEdges(
            from.solid,
            edgesOf.map((e) => e.h),
            lawFor ?? law ?? size,
            mode,
          ),
          claims: Claim[] = [];
        const edges = from.edges().filter((e) => m.rounded.some((x) => K.sameEdge(x, e.h)));
        edges.forEach((e, n) =>
          m.round(e.h).forEach((face, k) =>
            claims.push({
              id: e.ref ? mint(step.id, "round", e.ref.a, e.ref.b, k) : mint(step.id, "round", "free", n, k),
              face,
            }),
          ),
        );
        return checked(corners(carry(m.solid, m.report, [from], claims, step.id, age), step.id), `the ${mode}`);
      };
      const refs = step.params.edges as EdgeRef[];
      try {
        return once(body, asked);
      } catch (first) {
        // the kernel often fails on several edges at once where each edge alone, one after the other, is fine (found by the stress run: two walls of a boss running out over a cylinder's rim). The edges are then done in turn: the same faces are named, and a note says so; where the edges meet, the corners are the kernel's for each in turn
        if (refs.length < 2) throw first;
        let cur = body;
        try {
          for (const r of refs) {
            const next = once(cur, cur.findEdges(r));
            if (cur !== body) cur.release();
            cur = next;
          }
        } catch (later) {
          if (cur !== body) cur.release();
          throw first instanceof Error && later instanceof Error
            ? new Error(`${first.message}; one edge at a time it stopped too: ${later.message}`)
            : first;
        }
        cur.notes.push({
          kind: "sequence",
          text: `the ${mode} could not be made on all ${refs.length} edges at once, so each edge was done after the other`,
        });
        return cur;
      }
    },
  },
  /** two bodies made one (`add`), the second taken out of the first (`cut`), or what they share (`intersect`); every face keeps its id, and merged faces answer to both */
  combine: {
    outputs: "body",
    run: (inputs, { step, age }) => {
      const a = needBody(inputs[0]),
        b = needBody(inputs[1]),
        mode = (step.params.mode as string | undefined) ?? "add";
      if (mode !== "cut" && mode !== "intersect" && mode !== "add")
        throw new Error(`there is no way to combine called ${mode}`);
      return checked(
        joinTool(a, b, mode, { step, age, temp: (x) => x }, mode === "cut" ? [a] : [a, b]),
        "the combination",
      );
    },
  },
  /** the whole body moved by a vector */
  move: {
    outputs: "body",
    run: (inputs, { step, age }) => {
      const body = needBody(inputs[0]),
        by = step.params.by as V3;
      if (!Array.isArray(by) || by.length !== 3) throw new Error("the move needs three numbers");
      const m = K.move(body.solid, by);
      return checked(carry(m.solid, m.report, [body], [], step.id, age), "the move");
    },
  },
  /** the whole body turned about an axis (through the origin, or through `pivot`) */
  turn: {
    outputs: "body",
    run: (inputs, { step, age }) => {
      const body = needBody(inputs[0]),
        m = K.turn(
          body.solid,
          step.params.axis as V3,
          num(step.params, "deg"),
          (step.params.pivot as V3 | undefined) ?? [0, 0, 0],
        );
      return checked(carry(m.solid, m.report, [body], [], step.id, age), "the turn");
    },
  },
};
meta("extrude", { main: "d" });
meta("push", { main: "dist", changes: true, scope: (p) => p.face ?? null });
meta("round", { main: "size", changes: true, scope: (p) => (p.edges as { a: Id }[] | undefined)?.[0]?.a ?? null });
meta("dimension", { main: "value", scope: (p) => p.b ?? null });
meta("combine", { changes: true });
meta("turn", { main: "deg", scope: (p) => (p.body && p.body !== "all" ? p.body : null), bodyRequired: true });
meta("move", { scope: (p) => (p.body && p.body !== "all" ? p.body : null), bodyRequired: true });
meta("imprint", { scope: (_p, inputs) => (inputs[1] as { face?: Id } | undefined)?.face ?? null });

/** the pointed end (E34, tier 2): for the rim of a rod's end and a size above the radius; null when the size is not above the radius (the kernel's round is the same shape then) */
function pointed(body: Body, asked: EdgeRec[], s: number, step: { id: string }, age: Age): Body | null {
  if (asked.length !== 1) throw new Error("a pointed end is made on one edge, the rim of a rod's end");
  const rim = rimOf(body, asked[0]!);
  if (!rim)
    throw new Error(
      "a pointed end is defined only for the rim of a rod's flat end (a disc with nothing else on it, a wall round the same axis)",
    );
  if (s <= rim.r) return null;
  const limit = pointedLimit(rim.r, rim.height);
  if (s > limit)
    throw new Error(`the pointed end would pass the other end of the wall: the largest size is ${limit.toFixed(3)}`);
  const m = K.pointedEnd(body.solid, rim.c, rim.outward, rim.r, s),
    out = carry(m.solid, m.report, [body], [], step.id, age),
    ref = asked[0]!.ref,
    fresh = out.faces.filter((f) => f.defect);
  if (fresh.length === 1 && ref) {
    fresh[0]!.id = mint(step.id, "round", ref.a, ref.b, 0);
    fresh[0]!.defect = false;
  } // the arc's surface takes the name a kernel round would have given
  return checked(out, "the pointed end");
}

/**
 * Where two rounds made by one step meet at a vertex the kernel makes a corner face it does not report. The step's own claims name it: a face with no id that touches two or more of
 * this step's rounds is the corner between them, named by their ids (an exact rule from the step's own inputs, E7; a face that fits no rule stays a defect).
 */
function corners(body: Body, step: string): Body {
  const edges = body.edges();
  for (const f of body.faces) {
    if (!f.defect) continue;
    const around = new Map<string, Id>();
    for (const e of edges)
      if (e.faces.includes(f))
        for (const g of e.faces)
          if (g !== f && g.id.step === step && g.id.role === "round") around.set(idKey(g.id), g.id);
    if (around.size >= 2) {
      f.id = mint(step, "corner", ...[...around.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, id]) => id));
      f.defect = false;
    }
  }
  return body;
}

/** what a failed step hands on, of its own output type (E13) */
export function passthrough(kind: Kind, inputs: Value[], step: Step): Value {
  if (kind.outputs === "body") return inputs.find((v) => v instanceof Body) ?? new NoBody();
  return (
    inputs.find((v): v is Sketch => !(v instanceof Body) && !(v instanceof NoBody) && v.kind === "sketch") ?? {
      kind: "sketch",
      lines: [],
      face: mint(step.id, "none"),
      normal: [0, 0, 1],
    }
  );
}
