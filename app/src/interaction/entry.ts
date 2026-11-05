// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import type { Vec3 } from "../math/vec.ts";
import { add, scale } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { lookup } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import { pointOf, circleOf } from "../operation/part.ts";
import type { Tool, Preview } from "./tools.ts";
import { FIELDS, previewOf, rectEnd, circleRadius, lineNext, localOf } from "./tools.ts";
import type { Op } from "./operations.ts";
import { OP_FIELD, OP_UNIT, valueOf } from "./operations.ts";
import { loopOf } from "../operation/loops.ts";

export interface EntryField { label: string; value: string; active: boolean; typed: boolean }
export interface Entry { fields: EntryField[]; unit: string }

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** The number chip: for a tool, its fields (what is typed, else the live size); for an operation, its one number. Null when there is nothing to show yet. */
export function entryOf(scene: Scene, tool: Tool | null, op: Op | null): Entry | null {
  if (op) {
    const v = valueOf(op);
    const axis = op.kind === "move" || op.kind === "rotate" ? ` ${"XYZ"[op.axis]}` : "";
    return { fields: [{ label: (op.field ?? OP_FIELD[op.kind]) + axis, value: op.typed !== "" ? op.typed : v === null ? "" : fmt(v), active: true, typed: op.typed !== "" }], unit: op.unit ?? OP_UNIT[op.kind] };
  }
  if (!tool || !tool.plane || !tool.points.length) return null;
  const pl = scene.parts[tool.plane] as Plane | undefined;
  if (!pl || pl.kind !== "plane") return null;
  const labels = FIELDS[tool.kind];
  const live: (number | null)[] = [];
  if (tool.kind === "rect") {
    const e = rectEnd(pl, tool);
    if (e) {
      const [ax, ay] = localOf(pl, tool.points[0]!);
      const [ex, ey] = localOf(pl, e);
      live.push(Math.abs(ex - ax), Math.abs(ey - ay));
    }
  } else if (tool.kind === "circle") live.push(circleRadius(pl, tool) * 2);
  else {
    const n = lineNext(tool);
    const a = tool.points[tool.points.length - 1]!;
    if (n) live.push(Math.hypot(n[0] - a[0], n[1] - a[1], n[2] - a[2]));
  }
  return { fields: labels.map((label, i) => ({ label, value: tool.typed[i as 0 | 1] !== "" ? tool.typed[i as 0 | 1] : live[i] != null ? fmt(live[i]!) : "", active: tool.field === i, typed: tool.typed[i as 0 | 1] !== "" })), unit: "mm" };
}

/** The figure being drawn, or for an extrude the prism it would make (drawn as lines). */
export function previewFor(scene: Scene, tool: Tool | null, op: Op | null): Preview | null {
  if (op && op.kind === "extrude" && op.normal) {
    const v = valueOf(op);
    if (v === null || v === 0) return null;
    const get = lookup(scene);
    const off = scale(op.normal, v);
    const first = get(op.parts[0]!);
    if (first?.kind === "circle") {
      const c = circleOf(get, first.ref);
      return c ? { segments: [], circle: { center: add(c.center, off), radius: c.radius, normal: op.normal } } : null;
    }
    const loop = loopOf(get, op.parts);
    if (!loop.ok) return null;
    const pts = loop.corners.map((r) => pointOf(get, r)).filter((p): p is Vec3 => !!p);
    const top = pts.map((p) => add(p, off));
    return { segments: [...top.map((p, i): [Vec3, Vec3] => [p, top[(i + 1) % top.length]!]), ...pts.map((p, i): [Vec3, Vec3] => [p, top[i]!])], circle: null };
  }
  return tool ? previewOf(scene, tool) : null;
}
