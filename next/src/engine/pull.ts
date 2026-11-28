// Pulling a face (E26, E32, "Face pull modes"). The modes the person can pick, each one recipe change:
//   1 Change the original (`originalEdit`: a number of the step that made the face; not a step kind)   2 Push (`push` in steps.ts)   3 Move with neighbours (`moveFace`)   4 Offset (`offsetFace`)
// Modes 3 and 4 are regions (spike 8, `prototypes/face-modes`): the slab or ring between the old and the new surface, kept on the side of each neighbour's plane where the face lies, added or taken.
// The neighbours keep their ids, the moved face keeps its own, a face that collapses is gone (E10); a move past the limit is refused with the distance where it stops (E26).
import type { Engine } from "./engine.ts";
import { type Id } from "./id.ts";
import * as K from "./kernel.ts";
import { type Body, type Claim, type FaceRec, fromClaims } from "./lineage.ts";
import { type Ctx, type Sketch, checked, joinTool, kinds, meta, needBody, num } from "./steps.ts";
import { dot, sub, unit } from "./vec.ts";

type V3 = K.V3;

/** the faces that share an edge with `rec` */
function neighbours(body: Body, rec: FaceRec): FaceRec[] {
  const out: FaceRec[] = [];
  for (const e of body.edges())
    if (e.faces.includes(rec)) for (const f of e.faces) if (f !== rec && !out.includes(f)) out.push(f);
  return out;
}
/** a tool face lies in the plane of a neighbour (and so joins it when the faces are merged) */
const coplanar = (a: K.Facts, b: K.Facts) =>
  a.type === "PLANE" &&
  b.type === "PLANE" &&
  Math.abs(dot(a.ne, b.ne)) > 0.999 &&
  Math.abs(dot(sub(a.ce, b.ce), b.ne)) < 1e-6;

/** put the tool in the body: the face at the new place carries the moved face's id, every other face of the tool lies in a neighbour's plane and carries that neighbour's id */
function applyTool(
  body: Body,
  tool: K.Solid,
  isCap: (q: K.Facts) => boolean,
  moved: FaceRec,
  around: FaceRec[],
  add: boolean,
  ctx: Ctx,
): Body {
  const claims: Claim[] = [];
  for (const h of tool.faces()) {
    const q = K.facts(h);
    if (isCap(q)) {
      claims.push({ id: moved.id, face: h });
      continue;
    }
    const n = around.find((g) => coplanar(q, K.facts(g.h)) || (q.type === "CYLINDRE" && K.sameSurface(h, g.h, q)));
    if (n) claims.push({ id: n.id, face: h });
  }
  const toolBody = ctx.temp(fromClaims(tool, claims, ctx.step.id, false));
  return joinTool(body, toolBody, add ? "add" : "cut", ctx);
}

/** the distance, up to `d`, at which the face has collapsed (the neighbours meet), by halving */
function limitOf(body: Body, rec: FaceRec, around: FaceRec[], d: number): number {
  let lo = 0,
    hi = Math.abs(d);
  const s = Math.sign(d);
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2,
      r = K.moveRegion(
        body.solid,
        rec.h,
        around.map((g) => g.h),
        s * mid,
      );
    r.tool.release();
    if (r.collapsed) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** mode 3: the face moves by `dist` along its outward normal; the faces beside it (flat, or the wall of a hole or boss along the move) are carried on */
kinds["moveFace"] = {
  outputs: "body",
  run: (inputs, ctx) => {
    const body = needBody(inputs[0]),
      d = num(ctx.step.params, "dist"),
      rec = body.one(ctx.step.params.face as Id),
      around = neighbours(body, rec);
    if (Math.abs(d) < 1e-12) return body;
    const f = K.facts(rec.h),
      reg = K.moveRegion(
        body.solid,
        rec.h,
        around.map((g) => g.h),
        d,
      );
    if (reg.collapsed) {
      reg.tool.release();
      const at = limitOf(body, rec, around, d);
      throw new Error(`the face has collapsed: the faces beside it meet at ${at.toFixed(3)} (the move is ${d})`);
    }
    const target: V3 = [f.ce[0] + f.ne[0] * d, f.ce[1] + f.ne[1] * d, f.ce[2] + f.ne[2] * d];
    const isCap = (q: K.Facts) =>
      q.type === "PLANE" && Math.abs(dot(q.ne, f.ne)) > 0.999 && Math.abs(dot(sub(q.ce, target), f.ne)) < 1e-6;
    return checked(applyTool(body, reg.tool, isCap, rec, around, d > 0, ctx), "the move");
  },
};

/** mode 4: a cylinder's wall moves by `dist` along its outward normal (its radius changes); the faces beside it (all flat) are carried on. A wall the kernel split at its seam is moved as one wall */
kinds["offsetFace"] = {
  outputs: "body",
  run: (inputs, ctx) => {
    const body = needBody(inputs[0]),
      d = num(ctx.step.params, "dist"),
      id = ctx.step.params.face as Id,
      pieces = body.find(id);
    if (!pieces.length) body.one(id); // lost: says so
    if (pieces.some((p) => K.facts(p.h).type !== "CYLINDRE"))
      throw new Error("offset moves a round wall: this face is not one");
    if (Math.abs(d) < 1e-12) return body;
    const around = [...new Set(pieces.flatMap((p) => neighbours(body, p)))].filter((g) => !pieces.includes(g));
    const reg = K.ringRegion(
        body.solid,
        pieces[0]!.h,
        around.map((g) => g.h),
        d,
      ),
      axis = K.cylinderOf(pieces[0]!.h);
    const newWall = (h: K.FaceH) => {
      const q = K.facts(h);
      if (q.type !== "CYLINDRE") return false;
      const c = K.cylinderOf(h);
      return Math.abs(c.r - reg.r2) < 1e-6 && Math.abs(Math.abs(dot(c.dir, axis.dir)) - 1) < 1e-9;
    };
    const claims: Claim[] = [];
    for (const h of reg.tool.faces()) {
      if (newWall(h)) {
        claims.push({ id: pieces[0]!.id, face: h });
        continue;
      }
      const q = K.facts(h),
        n = around.find((g) => coplanar(q, K.facts(g.h)));
      if (n) claims.push({ id: n.id, face: h });
    }
    const toolBody = ctx.temp(fromClaims(reg.tool, claims, ctx.step.id, false));
    return checked(joinTool(body, toolBody, d > 0 ? "add" : "cut", ctx), "the offset");
  },
};

// ---------------------------------------------------------------- the modes offered for a face (E32)
export type Mode = "edit" | "push" | "move" | "offset";
export interface ModeInfo {
  mode: Mode;
  ok: boolean;
  /** when not: why, in a sentence */ why: string;
  /** the first that applies, in the order edit, push, move, offset: highlighted, never applied unchosen */ suggested: boolean;
  /** offset of a round wall: the cylinder it lies on (its radius, a point on its axis and the axis's direction), to say what a pull makes of its diameter */
  cylinder?: { r: number; point: readonly [number, number, number]; dir: readonly [number, number, number] };
}

/** mode 1: the step that made the face has a number that moves it. Only the end of an extrusion for now (its depth); the answer is the step's new numbers, to be set with `Engine.edit` */
export function originalEdit(
  engine: Engine,
  bodyStep: string,
  face: Id,
  dist: number,
): { step: string; params: Record<string, any> } | { why: string } {
  const st = engine.ids().includes(face.step) ? engine.step(face.step) : null;
  if (!st) return { why: "no step made this face" };
  if (st.kind === "hole" && (face.role === "hole" || face.role === "cb") && typeof face.of[0] === "string") {
    // a hole's own faces: the bottom is its depth, a wall its diameter, a counterbore's floor and wall the same (E76)
    const part = face.of[0] as string,
      cb = st.params.counterbore as { diameter: number; depth: number } | undefined;
    if (face.role === "cb" && !cb) return { why: "this hole has no counterbore" };
    if (part === "bottom") {
      if (face.role === "cb") {
        const h = cb!.depth - dist;
        return h > 0
          ? { step: st.id, params: { ...st.params, counterbore: { ...cb, depth: h } } }
          : { why: `the counterbore would be ${h.toFixed(3)} deep, not above nothing` };
      }
      const h = st.params.depth as number | "through";
      if (h === "through") return { why: "a hole that goes through has no bottom to move" };
      const d = h - dist;
      return d > 0
        ? { step: st.id, params: { ...st.params, depth: d } }
        : { why: `the depth would be ${d.toFixed(3)}, not above nothing` };
    }
    if (part === "wall") {
      const wd = (face.role === "cb" ? cb!.diameter : (st.params.diameter as number)) - 2 * dist;
      if (!(wd > 0)) return { why: `the diameter would be ${wd.toFixed(3)}, not above nothing` };
      return face.role === "cb"
        ? { step: st.id, params: { ...st.params, counterbore: { ...cb, diameter: wd } } }
        : { step: st.id, params: { ...st.params, diameter: wd } };
    }
  }
  if (st.kind !== "extrude" || face.role !== "end")
    return { why: `the ${st.kind} step that made this face has no number that moves it` };
  const body = engine.result(bodyStep).value as Body;
  let rec: FaceRec;
  try {
    rec = body.one(face);
  } catch (e) {
    return { why: e instanceof Error ? e.message : String(e) };
  }
  const sk = engine.result(st.inputs[0]!).value as Sketch,
    dir = unit((st.params.dir as V3 | undefined) ?? sk.normal),
    n = K.facts(rec.h).ne,
    d = (st.params.d as number) + (dot(n, dir) > 0 ? dist : -dist);
  if (!(d > 0)) return { why: `the depth would be ${d.toFixed(3)}, not above nothing` };
  return { step: st.id, params: { ...st.params, d } };
}
/** the four modes for a face of the body made by `bodyStep`, each with whether it applies and why not */
export function pullModes(engine: Engine, bodyStep: string, face: Id): ModeInfo[] {
  const body = engine.result(bodyStep).value as Body,
    pieces = body.find(face),
    out: Omit<ModeInfo, "suggested">[] = [];
  if (!pieces.length)
    return (["edit", "push", "move", "offset"] as Mode[]).map((mode) => ({
      mode,
      ok: false,
      why: "the face is no longer there",
      suggested: false,
    }));
  const types = new Set(pieces.map((p) => K.facts(p.h).type)),
    around = pieces.flatMap((p) => neighbours(body, p)).filter((g) => !pieces.includes(g)),
    allFlat = around.every((g) => K.facts(g.h).type === "PLANE");
  // a flat face can also be moved beside a round wall that runs along the move (the wall of a hole or a boss)
  const flatN = types.size === 1 && types.has("PLANE") && pieces.length ? K.facts(pieces[0]!.h).ne : null,
    canMove =
      flatN !== null &&
      around.every((g) => {
        const q = K.facts(g.h);
        return q.type === "PLANE" || (q.type === "CYLINDRE" && Math.abs(dot(K.cylinderOf(g.h).dir, flatN)) > 0.999);
      });
  const e = originalEdit(engine, bodyStep, face, 0);
  out.push({ mode: "edit", ok: !("why" in e), why: "why" in e ? e.why : "" });
  out.push({
    mode: "push",
    ok: types.size === 1 && types.has("PLANE") && pieces.length === 1,
    why:
      pieces.length > 1
        ? "the face has split: say which piece"
        : types.has("PLANE")
          ? ""
          : "push extrudes a flat face's outline; this face is round",
  });
  out.push({
    mode: "move",
    ok: types.size === 1 && types.has("PLANE") && pieces.length === 1 && canMove,
    why: !types.has("PLANE")
      ? "move carries a flat face; this face is round"
      : pieces.length > 1
        ? "the face has split: say which piece"
        : canMove
          ? ""
          : "a face beside it is round, across the move",
  });
  out.push({
    mode: "offset",
    ok: types.size === 1 && types.has("CYLINDRE") && allFlat,
    why: !types.has("CYLINDRE")
      ? "offset moves a round wall; this face is not one"
      : allFlat
        ? ""
        : "a face beside the wall is round",
    ...(types.size === 1 && types.has("CYLINDRE") && pieces.length === 1
      ? (() => {
          const cy = K.cylinderOf(pieces[0]!.h);
          return { cylinder: { r: cy.r, point: cy.point, dir: cy.dir } };
        })()
      : {}),
  });
  const first = out.findIndex((m) => m.ok);
  return out.map((m, i) => ({ ...m, suggested: i === first }));
}

meta("moveFace", { main: "dist", changes: true, scope: (p) => p.face ?? null });
meta("offsetFace", { main: "dist", changes: true, scope: (p) => p.face ?? null });
