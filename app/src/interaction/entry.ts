// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import type { Tool, Preview } from "./tools.ts";
import { FIELDS, previewOf, rectEnd, circleRadius, lineNext, localOf } from "./tools.ts";
import type { Op } from "./operations.ts";
import { OP_FIELD, OP_UNIT, valueOf, turnAngles } from "./operations.ts";

export interface EntryField { label: string; value: string; active: boolean; typed: boolean; /** a short name shown in front of the number when there are several (X Y Z) */ short?: string }
/** `at`: where in the scene the bubble sits (null: no place to attach it to) */
export interface Entry { fields: EntryField[]; unit: string; at?: Vec3 | null; /** the other end of the arrow the bubble is at the tip of: the bubble stands out past the tip, away from it, so it does not cover the arrow */ from?: Vec3 | null }

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** The number chip: for a tool, its fields (what is typed, else the live size); for an operation, its one number. Null when there is nothing to show yet. */
export function entryOf(scene: Scene, tool: Tool | null, op: Op | null): Entry | null {
  if (op && op.kind === "rotate" && op.target === "body") {
    // three angles, how the body is turned about X, Y and Z (what is typed in one of them is how it is to be turned about that axis)
    const now = turnAngles(scene, op);
    return { fields: (["X", "Y", "Z"] as const).map((label, i) => ({ label, short: label, value: op.rot[i] !== "" ? op.rot[i]! : fmt(now[i]!), active: op.axis === i, typed: op.rot[i] !== "" })), unit: "deg" };
  }
  if (op) {
    const v = valueOf(op);
    const axis = op.kind === "move" || op.kind === "rotate" ? ` ${"XYZ"[op.axis]}` : "";
    // an edge is a fillet one way and a chamfer the other
    const label = op.kind === "edge" ? (v !== null && v < 0 ? "Chamfer" : "Fillet") : (op.field ?? OP_FIELD[op.kind]) + axis;
    const shown = op.kind === "edge" && v !== null ? Math.abs(v) : v;
    return { fields: [{ label, value: op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "" : fmt(shown), active: true, typed: op.typed !== "" }], unit: op.unit ?? OP_UNIT[op.kind] };
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

/** The figure being drawn (an extrude and the other operations show their real result instead, see `frame.ts`). */
export function previewFor(scene: Scene, tool: Tool | null): Preview | null {
  return tool ? previewOf(scene, tool) : null;
}
