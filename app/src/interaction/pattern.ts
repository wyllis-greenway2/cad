// Linear and circular repeat (`in_137`, `in_139`): the body or a drawn figure, repeated along X, Y and Z (a line, a grid, a block) or turned about a point (copies round it).
// The numbers: linear is [nX, dX, nY, dY, nZ, dZ] (how many along each axis and how far apart), circular is [count, degrees, axis (0 X, 1 Y, 2 Z), x, y, z of the point].
// A body is repeated by a step of the kernel (the copies are joined to it); a figure is repeated by new parts, copies of its corners, lines and circle with the relations among them.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import { placements } from "../operation/repeat.ts";
import type { Op } from "./operations.ts";

const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const num = (s: string): number | null => {
  const v = Number(s);
  return s !== "" && s !== "-" && s !== "." && Number.isFinite(v) ? v : null;
};
const middle = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** The numbers a repeat starts with, and the middle of what is repeated: a first try that shows the idea (three along a line, four round a point). Null if there is nothing to repeat. */
export function patternStart(scene: Scene, kind: "linear" | "circular", figure: readonly Ref[] | null, view: { normal: 0 | 1 | 2; right: 0 | 1 | 2 } | null = null, body: Ref | null = null): { parts: Ref[]; start: number[]; target: "body" | "plane"; /** the direction the helper bubbles stand on: the first one the thing has any size in */ along: 0 | 1 | 2 } | null {
  let pts: Vec3[];
  let parts: Ref[];
  let radius = 0;
  let normalAxis = 2;
  if (figure) {
    parts = [...figure];
    pts = figure.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at);
    const circle = figure.map((r) => scene.parts[r]).find((p) => p?.kind === "circle") as Extract<Part, { kind: "circle" }> | undefined;
    radius = circle?.radius ?? 0;
    const pl = pts.length && scene.parts[(scene.parts[figure.find((r) => scene.parts[r]?.kind === "corner")!] as Part).plane ?? ""];
    if (pl && pl.kind === "plane") { const n = normalOfPlane(pl); normalAxis = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]!) > Math.abs(n[m]!) ? i : m), 0); }
  } else {
    const one = body ? scene.parts[body] : undefined; // (one body of several: its own box)
    parts = [one?.kind === "body" ? body! : BODY_OBJECT];
    pts = one?.kind === "body" && one.bbox ? [one.bbox.min, one.bbox.max] : Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at);
  }
  if (!pts.length) return null;
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((c) => c[i]!)) - radius);
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((c) => c[i]!)) + radius);
  const ext = hi.map((h, i) => r3(h - lo[i]!));
  const mid = hi.map((h, i) => (h + lo[i]!) / 2);
  const biggest = Math.max(...ext, 1);
  if (kind === "linear") {
    // one to begin with (no copy yet: the arrow past it is pulled to make one, `in_236`), spaced one and a half sizes
    // (a body is repeated across the screen when the view is straight on to a plane, not towards the eye, `in_244`)
    const along = (figure ? Math.max(0, ext.findIndex((e, i) => e > 1e-6 && i !== normalAxis)) : view?.right ?? 0) as 0 | 1 | 2;
    const start = [1, 0, 1, 0, 1, 0].map((v, k) => (k % 2 === 0 ? 1 : r3((ext[k >> 1]! > 1e-6 ? ext[k >> 1]! : biggest) * 1.5)));
    return { parts, start, target: figure ? "plane" : "body", along };
  }
  const axis = figure ? normalAxis : view?.normal ?? 2; // (like a clock face seen from where you look, `in_244`)
  const c = [r3(mid[0]! + ext[0]! * 1.5), r3(mid[1]!), r3(mid[2]!)];
  return { parts, start: [4, 360, axis, c[0]!, c[1]!, c[2]!], target: figure ? "plane" : "body", along: 0 };
}

/** The numbers of a repeat: each field as typed, else as it started. */
export const patternValues = (op: Op): number[] => (op.patStart ?? []).map((v, i) => num(op.pat[i] ?? "") ?? v);

/** The middle of what is repeated (where the arrows of a linear repeat start). */
export function patternCentre(scene: Scene, op: Op): Vec3 {
  const pts = op.target === "plane"
    ? op.parts.map((r) => scene.parts[r]).filter((p): p is Extract<Part, { kind: "corner" }> => p?.kind === "corner").map((p) => p.at)
    : Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at);
  if (!pts.length) return [0, 0, 0];
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((c) => c[i]!)));
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((c) => c[i]!)));
  return op.target === "plane" ? middle(pts) : [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
}

/** The command that makes the repeat (null while it would make no copy, or too many). */
export function patternCommand(scene: Scene, op: Op): Command | null {
  const kind = op.kind === "circular" ? "circular" : "linear";
  const v = patternValues(op);
  if (!placements(kind, v).length) return null;
  const params = kind === "linear"
    ? [Math.max(1, Math.round(v[0]!)), v[1]!, Math.max(1, Math.round(v[2]!)), v[3]!, Math.max(1, Math.round(v[4]!)), v[5]!]
    : [Math.max(1, Math.round(v[0]!)), v[1]!, Math.min(2, Math.max(0, Math.round(v[2]!))), v[3]!, v[4]!, v[5]!];
  if (op.target !== "plane") {
    // the body: a step of the history with the numbers (reopened from its row in the History list, `in_257`: the same numbers are set again)
    const names = kind === "linear" ? ["nx", "dx", "ny", "dy", "nz", "dz"] : ["count", "angle", "axis", "px", "py", "pz"];
    const numbers = Object.fromEntries(names.map((n, i) => [n, params[i]!]));
    if (op.editStep) return { type: "setStepParams", id: op.editStep, params: numbers };
    const mine = scene.parts[op.parts[0]!];
    const body: Record<string, string> = mine?.kind === "body" && mine.ref !== BODY_OBJECT && mine.id ? { body: mine.id } : {};
    return { type: "addStep", step: { id: nextId(scene, "s"), type: "pattern", parts: op.parts, params: { mode: kind, ...numbers, ...body } } };
  }
  // a drawn figure: a repeat that keeps its numbers, its copies made from it (`in_257`): changing the numbers later changes the copies, and the copies keep their names
  if (op.editPattern) return { type: "setPattern", id: op.editPattern, params };
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const plane = first?.plane ? scene.parts[first.plane] : undefined;
  if (!plane || plane.kind !== "plane") return null;
  return { type: "pattern", id: nextId(scene, "q"), kind, parts: op.parts, plane: plane.ref, params };
}

const fmtN = (v: number) => String(Math.round(v * 1e3) / 1e3);

/** The number a drag of this handle starts from (the spacing, the count or the angle it will add to). */
export function patternBase(op: Op, id: string): number {
  const v = patternValues(op);
  const i = "xyz".indexOf(id.slice(4, 5));
  if (id.startsWith("lin:")) return v[2 * i + 1] ?? 0;
  if (id.startsWith("cnt:")) return v[2 * i] ?? 1;
  if (id.startsWith("rot:")) return v[1] ?? 360;
  return 0;
}

/** What a drag of a handle makes of the numbers: an arrow sets how far apart the copies are, the stub past the last copy how many there are, a ring which axis they turn about and over how many degrees, the ball the point. */
export function dragPattern(op: Op, id: string, r: { value: number } | { pivot: Vec3 }, base: number): Op {
  const pat = [...op.pat];
  const v = patternValues(op);
  const i = "xyz".indexOf(id.slice(4, 5));
  if ("pivot" in r) { pat[3] = fmtN(r.pivot[0]); pat[4] = fmtN(r.pivot[1]); pat[5] = fmtN(r.pivot[2]); return { ...op, pat }; }
  if (id.startsWith("lin:") && i >= 0) {
    const sgn = base < 0 ? -1 : 1;
    pat[2 * i + 1] = fmtN(sgn * Math.max(0.001, Math.abs(base) + r.value));
  } else if (id.startsWith("cnt:") && i >= 0) {
    const sp = Math.abs(v[2 * i + 1] ?? 0);
    if (sp < 1e-6) return op;
    pat[2 * i] = String(Math.max(1, Math.min(200, Math.round(base + r.value / sp))));
  } else if (id.startsWith("rot:") && i >= 0) {
    pat[2] = String(i);
    const a = Math.round((base + r.value) * 2) / 2;
    pat[1] = fmtN(Math.abs(a) < 1 ? 1 : Math.max(-720, Math.min(720, a)));
  }
  return { ...op, pat, axis: (i >= 0 ? i : op.axis) as 0 | 1 | 2 };
}

// ---- the repeat edit mode (`in_141`) ----
/** The parts a circular repeat is built around: a point at the middle of what is repeated, the pivot point it turns about, and the line between them. They are ordinary drawn parts, so the pivot can be moved with Move, given a length, constrained like any vertex. */
export interface PivotParts { centre: Ref; point: Ref; line: Ref }
/** A repeat that is being set up: its numbers, and for a circular one the pivot parts. It goes on until Apply or Cancel (you can work in the world meanwhile). */
export interface Repeat {
  op: Op;
  pivot: PivotParts | null;
  /** the arrow that was taken last (dragged, or its number typed): only that arrow shows its number, as only the chosen ring of a turn does (`in_236`) */
  chosen?: string | null;
  /** the helper bubbles of a linear repeat, once in each use of the tool: "pull to copy" on the arrow past the last copy until a copy exists, then "pull to separate" on the other arrow until the copies have been moved apart a little */
  help?: { phase: "copy" | "separate" | "done"; sep0: number } | null;
}

/** Where the helper bubbles are in their one use of the tool: they only go forward (`in_236`). */
export function advanceHelp(r: Repeat): Repeat {
  const h = r.help;
  if (!h || h.phase === "done") return r;
  const v = patternValues(r.op);
  const a = r.op.along ?? 0;
  const [count, spacing] = [Math.round(v[2 * a] ?? 1), v[2 * a + 1] ?? 0];
  if (h.phase === "copy" && count >= 2) return { ...r, help: { phase: "separate", sep0: spacing } };
  if (h.phase === "separate" && Math.abs(spacing - h.sep0) > Math.max(0.5, 0.1 * Math.abs(h.sep0))) return { ...r, help: { ...h, phase: "done" } };
  return r;
}

/** The helper bubble to show now, and the handle it stands on, if any. */
export function helperOf(r: Repeat): { text: string; handle: string } | null {
  const h = r.help;
  if (!h || r.op.kind === "circular") return null;
  const a = "xyz"[r.op.along ?? 0]!;
  if (h.phase === "copy") return { text: "pull to copy", handle: `cnt:${a}` };
  if (h.phase === "separate") return { text: "pull to separate", handle: `lin:${a}` };
  return null;
}

/** The commands that make the pivot parts of a circular repeat at the point its numbers start with. */
export function pivotCommands(scene: Scene, op: Op): { command: Command; parts: PivotParts } {
  const v = patternValues(op);
  const centreAt = patternCentre(scene, op);
  const pivotAt: Vec3 = [v[3]!, v[4]!, v[5]!];
  const e = nextId(scene, "e");
  const parts: PivotParts = { centre: drawnRef(`${e}.rc`), point: drawnRef(`${e}.rp`), line: drawnRef(`${e}.rl`) };
  const commands: Command[] = [];
  let plane = op.plane;
  if (!plane) {
    // the body: the point needs a plane to be a vertex on; one through it, parallel to the ground
    plane = drawnRef(nextId(scene, "p"));
    commands.push({ type: "addPart", part: { ref: plane, kind: "plane", origin: "drawn", plane: null, movable: false, at: [0, 0, pivotAt[2]], u: [1, 0, 0], v: [0, 1, 0] } });
  }
  const base = { origin: "drawn" as const, plane, movable: true };
  commands.push({ type: "addPart", part: { ...base, ref: parts.centre, kind: "corner", at: centreAt } });
  commands.push({ type: "addPart", part: { ...base, ref: parts.point, kind: "corner", at: pivotAt } });
  commands.push({ type: "addPart", part: { ...base, ref: parts.line, kind: "line", a: parts.centre, b: parts.point } });
  commands.push({ type: "addRelation", relation: { id: nextId(scene, "r"), kind: "fixed", parts: [parts.centre] } });
  return { command: { type: "batch", commands }, parts };
}

/** The repeat with its pivot read from where the pivot point is now (it can have been moved, sized or constrained since). */
export function liveRepeat(scene: Scene, r: Repeat): Op {
  const p = r.pivot ? scene.parts[r.pivot.point] : undefined;
  if (!p || p.kind !== "corner" || !r.op.patStart) return r.op;
  const start = [...r.op.patStart];
  start[3] = Math.round(p.at[0] * 1e3) / 1e3; start[4] = Math.round(p.at[1] * 1e3) / 1e3; start[5] = Math.round(p.at[2] * 1e3) / 1e3;
  const pat = [...r.op.pat];
  pat[3] = ""; pat[4] = ""; pat[5] = "";
  return { ...r.op, patStart: start, pat };
}

const dropPivot = (r: Repeat, scene: Scene): Command[] => (r.pivot ? [{ type: "deleteParts", refs: [r.pivot.centre, r.pivot.point, r.pivot.line].filter((x) => x in scene.parts) }] : []);
/** The command that applies a repeat (the pivot parts go, the copies come), or null while it would make nothing. */
export function repeatApply(scene: Scene, r: Repeat): Command | null {
  const main = patternCommand(scene, liveRepeat(scene, r));
  return main ? { type: "batch", commands: [...dropPivot(r, scene), main] } : null;
}
/** The command that gives a repeat up (the pivot parts go), or null if there is nothing to take away. */
export function repeatCancel(scene: Scene, r: Repeat): Command | null {
  const drop = dropPivot(r, scene);
  return drop.length && (drop[0] as { refs: Ref[] }).refs.length ? drop[0]! : null;
}
