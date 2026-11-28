// The operations the screen knows (`in_1576`): each is a function from what was picked to an `Operation` description (`operation.ts`). The steps they make are `interaction/extrude.ts`'s; the numbers and kinds are the engine's (`pullModes`, E32).
import type { EdgeRef, Id } from "../engine/id.ts";
import type { SketchParams } from "../engine/sketch.ts";
import type { Step } from "../engine/steps.ts";
import { vOf, type Frame } from "../planes.ts";
import { to3 } from "../sketch.ts";
import type { V3 } from "../vec.ts";
import { extrudeSteps, pushSteps, roundSteps, type Region } from "./extrude.ts";
import type { OpOption, Operation } from "./operation.ts";

/** what a sketch that lies on a face of a body is made from: the face and the step that made the body */
export interface Source {
  face: Id;
  body: string;
}
/** the ways to pull a face (E32): `edit` the step that made it (Move), `push` a prism of its outline (Extrude), `move` it with its neighbours carried on (Extend), `offset` a round wall */
export type PullKind = "edit" | "push" | "move" | "offset";
export interface PullInfo {
  mode: PullKind;
  ok: boolean;
  why: string;
  suggested: boolean;
}
const KIND_LABEL: Record<PullKind, string> = { edit: "Move", push: "Extrude", move: "Extend", offset: "Offset" };

/** a closed part of a drawing, pulled along its plane's normal: out adds a body (or joins), in cuts */
export function extrudeOp(
  a: { key: string; frame: Frame; def: SketchParams; region: Region; source: Source | null; snap?: Operation["snap"] },
  d = 0,
): Operation {
  const base = to3(a.frame, a.region.centre),
    pts = a.region.loops[0]!,
    xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]),
    f = a.frame;
  const op = (value: number): Operation => ({
    kind: "extrude",
    title: "Extrude",
    options: [],
    value,
    valueTitle: "Distance (type a number)",
    at: base,
    arrow: { base, normal: f.normal },
    ...(a.snap ? { snap: a.snap } : {}),
    ghost: {
      frame: { origin: f.origin, u: f.u, v: vOf(f), n: f.normal },
      loops: a.region.loops as [number, number][][],
      d: value,
      adds: value > 0 || !a.source, // (pulled out, or from a drawing with no body: a body is made; pushed into a body: a cut)
    },
    tilt: {
      frame: f,
      centre: base,
      size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    },
    pulled: value,
    withPull: (d) => op(d),
    withValue: (v) => op(v),
    withOption: () => op(value),
    plan: (recipe) =>
      Math.abs(value) < 1e-6
        ? { kind: "nothing" }
        : {
            kind: "steps",
            steps: [...recipe, ...extrudeSteps(recipe, a.def, a.frame, a.region.pick, value, a.source ?? undefined)],
          },
    debug: { key: a.key, pick: a.region.pick, loops: a.region.loops.length },
  });
  return op(d);
}

/** the triangles of faces, each moved `d` along its own normal */
function movedFaces(faces: { normal: V3; positions: Float32Array }[], d: number): Float32Array {
  const out = new Float32Array(faces.reduce((n, f) => n + f.positions.length, 0));
  let o = 0;
  for (const f of faces) for (let i = 0; i < f.positions.length; i++) out[o++] = f.positions[i]! + f.normal[i % 3]! * d;
  return out;
}
/** a face of a body, pulled: the kinds the engine says it has, as chips; the first that applies is chosen (Move when a step made the face) */
export function pushOp(
  a: {
    ref: Id;
    body: string;
    at: V3;
    normal: V3;
    /** the face's triangles (x y z each), to show it moved */ positions: Float32Array;
    kinds: readonly PullInfo[];
    snap?: Operation["snap"];
    /** more faces picked with it: all are pushed or pulled by the same distance, each along its own normal (only the plain push) */
    more?: { ref: Id; normal: V3; positions: Float32Array }[];
  },
  kind?: PullKind,
  d = 0,
): Operation {
  const several = !!a.more?.length;
  const chosen: PullKind = several
    ? "push"
    : (kind ?? (a.kinds.find((k) => k.suggested) ?? { mode: "push" as PullKind }).mode);
  const options: OpOption[] = (several ? [] : a.kinds)
    .filter((k) => k.mode !== "offset" || k.ok)
    .map((k) => ({
      id: k.mode,
      label: KIND_LABEL[k.mode],
      on: k.mode === chosen,
      enabled: k.ok,
      ...(k.ok ? {} : { why: k.why }),
    }));
  const op = (value: number): Operation => ({
    kind: "push",
    title: "Push / pull",
    options,
    value,
    valueTitle: "Distance (type a number)",
    at: a.at,
    arrow: { base: a.at, normal: a.normal },
    ...(a.snap ? { snap: a.snap } : {}),
    // (several faces: each moved by its own normal, so the positions are moved here and the ghost itself stays put)
    ghost: several
      ? { faceMove: { positions: movedFaces([a, ...a.more!], value), n: [0, 0, 0], d: value } }
      : { faceMove: { positions: a.positions, n: a.normal, d: value } },
    tilt: null,
    pulled: value,
    withPull: (d) => op(d),
    withValue: (v) => op(v),
    withOption: (id) => pushOp(a, id as PullKind, value),
    plan: (recipe) => {
      if (Math.abs(value) < 1e-6) return { kind: "nothing" };
      if (chosen === "edit") {
        // Move: the step that made the face takes the new number: the worker says which and what
        return {
          kind: "ask",
          ask: { what: "originalEdit", step: a.body, face: a.ref, dist: value },
          then: (data) => {
            const r = data as { step?: string; params?: Record<string, unknown>; why?: string };
            return r.step && r.params
              ? { steps: recipe.map((s) => (s.id === r.step ? ({ ...s, params: r.params } as Step) : s)) }
              : { why: r.why ?? "that cannot be moved" };
          },
        };
      }
      return {
        kind: "steps",
        steps: [
          ...recipe,
          ...(several ? [{ ref: a.ref }, ...a.more!] : [{ ref: a.ref }]).reduce<Step[]>(
            (made, f) => [
              ...made,
              ...pushSteps(
                [...recipe, ...made],
                f.ref,
                made.length ? made[made.length - 1]!.id : a.body, // (each pushes the body the one before made)
                value,
                chosen === "push" ? "push" : chosen === "move" ? "moveFace" : "offsetFace",
              ),
            ],
            [],
          ),
        ],
      };
    },
    debug: { face: a.ref.role, kind: chosen },
  });
  return op(d);
}

/** edges of a body rounded or chamfered: one number, the size, and the arrow out of the edge (`dec_task_handles`): pulled out the edge is rounded, pushed in it is chamfered; the kinds are also chips. `normal`: out of the body between the two faces (null: no arrow, the size is typed). */
export function roundOp(
  a: { body: string; edges: EdgeRef[]; kind: "fillet" | "chamfer"; at: V3; normal: V3 | null },
  size: number,
): Operation {
  const label = (k: "fillet" | "chamfer") => (k === "chamfer" ? "Chamfer" : "Round");
  const options: OpOption[] = (["fillet", "chamfer"] as const).map((k) => ({
    id: k,
    label: label(k),
    on: k === a.kind,
    enabled: true,
  }));
  const op = (value: number): Operation => ({
    kind: "round",
    title: label(a.kind),
    options,
    value,
    valueTitle: "Size (type a number)",
    at: a.at,
    arrow: a.normal ? { base: a.at, normal: a.normal } : null,
    ghost: null,
    tilt: null,
    pulled: a.kind === "chamfer" ? -value : value,
    withPull: (d) => {
      const v = Math.round(Math.abs(d) * 100) / 100;
      return v > 0 ? roundOp({ ...a, kind: d < 0 ? "chamfer" : "fillet" }, v) : null;
    },
    withValue: (v) => (v > 0 ? op(v) : null),
    withOption: (id) => roundOp({ ...a, kind: id as "fillet" | "chamfer" }, value),
    plan: (recipe) =>
      value > 0
        ? { kind: "steps", steps: [...recipe, ...roundSteps(recipe, a.edges, a.body, value, a.kind)] }
        : { kind: "nothing" },
    debug: { edges: a.edges.length, kind: a.kind },
  });
  return op(size);
}
