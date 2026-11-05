// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import type { Vec3 } from "../math/vec.ts";
import { add, scale, sub, dot, cross, normalize } from "../math/vec.ts";
import { triangulate } from "./surfaces.ts";
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

/** The sides and both caps of the prism a figure makes when pulled `off` along its normal, as triangles (flat xyz). The caps are cut into triangles in the plane of the figure. */
export function prismTriangles(base: Vec3[], off: Vec3, normal: Vec3): number[] {
  const n = base.length;
  if (n < 3) return [];
  const top = base.map((p) => add(p, off));
  const out: number[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => out.push(...a, ...b, ...c);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(base[i]!, base[j]!, top[j]!);
    tri(base[i]!, top[j]!, top[i]!);
  }
  // the caps: a flat polygon cut in 2D (any two axes across the normal will do)
  const helper: Vec3 = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(helper, normal));
  const v = cross(normal, u);
  const flat = base.map((p): [number, number] => [dot(sub(p, base[0]!), u), dot(sub(p, base[0]!), v)]);
  const cut = triangulate(flat);
  for (let k = 0; k + 2 < cut.length; k += 3) {
    const [a, b, c] = [cut[k]!, cut[k + 1]!, cut[k + 2]!];
    tri(base[a]!, base[b]!, base[c]!);
    tri(top[a]!, top[b]!, top[c]!);
  }
  return out;
}

/** The figure being drawn, or for an extrude the prism it would make (a translucent solid with its outline). */
export function previewFor(scene: Scene, tool: Tool | null, op: Op | null): Preview | null {
  if (op && op.kind === "extrude" && op.normal) {
    const v = valueOf(op);
    if (v === null || v === 0) return null;
    const get = lookup(scene);
    const off = scale(op.normal, v);
    const first = get(op.parts[0]!);
    let base: Vec3[];
    if (first?.kind === "circle") {
      const c = circleOf(get, first.ref);
      const pl = first.plane ? get(first.plane) : undefined;
      if (!c || !pl || pl.kind !== "plane") return null;
      base = Array.from({ length: 64 }, (_, i) => add(c.center, add(scale(pl.u, Math.cos((i / 64) * Math.PI * 2) * c.radius), scale(pl.v, Math.sin((i / 64) * Math.PI * 2) * c.radius))));
    } else {
      const loop = loopOf(get, op.parts);
      if (!loop.ok) return null;
      base = loop.corners.map((r) => pointOf(get, r)).filter((p): p is Vec3 => !!p);
    }
    const top = base.map((p) => add(p, off));
    const segments: [Vec3, Vec3][] = first?.kind === "circle" ? [] : [...top.map((p, i): [Vec3, Vec3] => [p, top[(i + 1) % top.length]!]), ...base.map((p, i): [Vec3, Vec3] => [p, top[i]!])];
    return { segments, circle: first?.kind === "circle" ? { center: add(circleOf(get, first.ref)!.center, off), radius: circleOf(get, first.ref)!.radius, normal: op.normal } : null, solid: prismTriangles(base, off, op.normal), cursor: null };
  }
  return tool ? previewOf(scene, tool) : null;
}
