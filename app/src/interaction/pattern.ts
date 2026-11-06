// Linear and circular repeat (`in_137`, `in_139`): the body or a drawn figure, repeated along X, Y and Z (a line, a grid, a block) or turned about a point (copies round it).
// The numbers: linear is [nX, dX, nY, dY, nZ, dZ] (how many along each axis and how far apart), circular is [count, degrees, axis (0 X, 1 Y, 2 Z), x, y, z of the point].
// A body is repeated by a step of the kernel (the copies are joined to it); a figure is repeated by new parts, copies of its corners, lines and circle with the relations among them.
import type { Ref } from "../shared/ref.ts";
import { drawnRef } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot } from "../math/vec.ts";
import { about } from "../math/rotation.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { Command } from "../operation/commands.ts";
import type { Part } from "../operation/part.ts";
import { normalOfPlane } from "../operation/part.ts";
import { BODY_OBJECT } from "../compiler/body.ts";
import type { Op } from "./operations.ts";

const r3 = (v: number) => Math.round(v * 1e3) / 1e3;
const num = (s: string): number | null => {
  const v = Number(s);
  return s !== "" && s !== "-" && s !== "." && Number.isFinite(v) ? v : null;
};
const middle = (pts: Vec3[]): Vec3 => scale(pts.reduce((a, p) => add(a, p), [0, 0, 0] as Vec3), 1 / Math.max(1, pts.length));

/** The numbers a repeat starts with, and the middle of what is repeated: a first try that shows the idea (three along a line, four round a point). Null if there is nothing to repeat. */
export function patternStart(scene: Scene, kind: "linear" | "circular", figure: readonly Ref[] | null): { parts: Ref[]; start: number[]; target: "body" | "plane" } | null {
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
    parts = [BODY_OBJECT];
    pts = Object.values(scene.parts).filter((p) => p.kind === "corner" && p.origin === "body").map((p) => (p as { at: Vec3 }).at);
  }
  if (!pts.length) return null;
  const lo = [0, 1, 2].map((i) => Math.min(...pts.map((c) => c[i]!)) - radius);
  const hi = [0, 1, 2].map((i) => Math.max(...pts.map((c) => c[i]!)) + radius);
  const ext = hi.map((h, i) => r3(h - lo[i]!));
  const mid = hi.map((h, i) => (h + lo[i]!) / 2);
  const biggest = Math.max(...ext, 1);
  if (kind === "linear") {
    // three along the first direction the thing has any size in, spaced one and a half sizes; one along the others
    const along = figure ? ext.findIndex((e, i) => e > 1e-6 && i !== normalAxis) : 0;
    const start = [1, 0, 1, 0, 1, 0].map((v, k) => (k % 2 === 0 ? (k / 2 === along ? 3 : 1) : r3((ext[k >> 1]! > 1e-6 ? ext[k >> 1]! : biggest) * 1.5)));
    return { parts, start, target: figure ? "plane" : "body" };
  }
  const axis = figure ? normalAxis : 2;
  const c = [r3(mid[0]! + ext[0]! * 1.5), r3(mid[1]!), r3(mid[2]!)];
  return { parts, start: [4, 360, axis, c[0]!, c[1]!, c[2]!], target: figure ? "plane" : "body" };
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

/** The copies of a repeat as the places they go to: how far each is moved, or turned about the axis through the point (the original, the first, is not in the list). */
function placements(op: Op): { move: Vec3; turn: { axis: 0 | 1 | 2; angle: number; pivot: Vec3 } | null }[] {
  const v = patternValues(op);
  if (v.length < 6) return [];
  const out: { move: Vec3; turn: { axis: 0 | 1 | 2; angle: number; pivot: Vec3 } | null }[] = [];
  if (op.kind === "linear") {
    const [nx, ny, nz] = [Math.max(1, Math.round(v[0]!)), Math.max(1, Math.round(v[2]!)), Math.max(1, Math.round(v[4]!))];
    if (nx * ny * nz > 200) return [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) if (i || j || k) out.push({ move: [i * v[1]!, j * v[3]!, k * v[5]!], turn: null });
    return out;
  }
  const count = Math.max(1, Math.round(v[0]!));
  if (count > 200) return [];
  const angle = v[1]!;
  const step = Math.abs(angle) >= 360 ? angle / count : count > 1 ? angle / (count - 1) : 0;
  const axis = Math.min(2, Math.max(0, Math.round(v[2]!))) as 0 | 1 | 2;
  for (let i = 1; i < count; i++) out.push({ move: [0, 0, 0], turn: { axis, angle: step * i, pivot: [v[3]!, v[4]!, v[5]!] } });
  return out;
}

const turnVec = (v: Vec3, axis: 0 | 1 | 2, angle: number): Vec3 => { const m = about(axis, angle); return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; };

/** The command that makes the repeat (null while it would make no copy, or too many). */
export function patternCommand(scene: Scene, op: Op): Command | null {
  const copies = placements(op);
  if (!copies.length) return null;
  const v = patternValues(op);
  if (op.target !== "plane") {
    const id = nextId(scene, "s");
    const params: Record<string, number | string> = op.kind === "linear"
      ? { mode: "linear", nx: Math.max(1, Math.round(v[0]!)), dx: v[1]!, ny: Math.max(1, Math.round(v[2]!)), dy: v[3]!, nz: Math.max(1, Math.round(v[4]!)), dz: v[5]! }
      : { mode: "circular", count: Math.max(1, Math.round(v[0]!)), angle: v[1]!, axis: Math.min(2, Math.max(0, Math.round(v[2]!))), px: v[3]!, py: v[4]!, pz: v[5]! };
    return { type: "addStep", step: { id, type: "pattern", parts: op.parts, params } };
  }
  // a drawn figure: new corners, lines and circles, with the relations among them (so a copied rectangle stays a rectangle), on the same plane or on a plane of the copy's own
  const figure = new Set(op.parts);
  const first = op.parts.map((r) => scene.parts[r]).find((p) => p?.kind === "corner");
  const plane = first?.plane ? scene.parts[first.plane] : undefined;
  if (!plane || plane.kind !== "plane") return null;
  const eBase = nextId(scene, "e");
  const pBase = nextId(scene, "p");
  const rBase = nextId(scene, "r");
  const n0 = normalOfPlane(plane);
  const commands: Command[] = [];
  copies.forEach((c, k) => {
    const place = (p: Vec3): Vec3 => (c.turn ? add(c.turn.pivot, turnVec(sub(p, c.turn.pivot), c.turn.axis, c.turn.angle)) : add(p, c.move));
    const at2 = place(plane.at);
    const u2 = c.turn ? turnVec(plane.u, c.turn.axis, c.turn.angle) : plane.u;
    const v2 = c.turn ? turnVec(plane.v, c.turn.axis, c.turn.angle) : plane.v;
    const n2 = c.turn ? turnVec(n0, c.turn.axis, c.turn.angle) : n0;
    const same = Math.abs(dot(n2, n0) - 1) < 1e-9 && Math.abs(dot(sub(at2, plane.at), n0)) < 1e-9;
    let target: Ref = plane.ref;
    if (!same) {
      target = drawnRef(`${pBase}.c${k}`);
      commands.push({ type: "addPart", part: { ref: target, kind: "plane", origin: "drawn", plane: null, movable: false, at: at2, u: u2, v: v2 } });
    }
    const name = (r: Ref): Ref => drawnRef(`${eBase}.c${k}_${r.slice(2).replace(/[./]/g, "_")}`);
    const base = { origin: "drawn" as const, plane: target, movable: true };
    for (const r of op.parts) {
      const p = scene.parts[r];
      if (p?.kind === "corner") commands.push({ type: "addPart", part: { ...base, ref: name(r), kind: "corner", at: place(p.at) } });
    }
    for (const r of op.parts) {
      const p = scene.parts[r];
      if (p?.kind === "line") commands.push({ type: "addPart", part: { ...base, ref: name(r), kind: "line", a: name(p.a), b: name(p.b), ...(p.bulge ? { bulge: p.bulge } : {}) } });
      else if (p?.kind === "circle") commands.push({ type: "addPart", part: { ...base, ref: name(r), kind: "circle", center: name(p.center), radius: p.radius } });
    }
    scene.relations.filter((rel) => rel.parts.every((q) => figure.has(q))).forEach((rel, j) => {
      commands.push({ type: "addRelation", relation: { ...rel, id: `${rBase}.c${k}_${j}`, parts: rel.parts.map(name) } });
    });
  });
  return { type: "batch", commands };
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
