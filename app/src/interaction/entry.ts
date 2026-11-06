// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import type { Tool, Preview } from "./tools.ts";
import { FIELDS, previewOf, rectEnd, circleRadius, lineNext, localOf, arcOf } from "./tools.ts";
import type { Op } from "./operations.ts";
import { OP_FIELD, OP_UNIT, valueOf, turnAngles, sizeShown } from "./operations.ts";

export interface EntryField { label: string; value: string; active: boolean; typed: boolean; /** a short name shown in front of the number when there are several (X Y Z) */ short?: string }
/** `at`: where in the scene the bubble sits (null: no place to attach it to) */
export interface Entry { fields: EntryField[]; unit: string; at?: Vec3 | null; /** the other end of the arrow the bubble is at the tip of: the bubble stands out past the tip, away from it, so it does not cover the arrow */ from?: Vec3 | null }

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** The number chip: for a tool, its fields (what is typed, else the live size); for an operation, its one number. Null when there is nothing to show yet. */
export function entryOf(scene: Scene, tool: Tool | null, op: Op | null): Entry | null {
  if (op && (op.kind === "linear" || op.kind === "circular") && op.patStart) {
    // a repeat has all its numbers in the bubble at once: how many and how far apart along each axis, or how many, over how many degrees, about which axis and which point
    const names = op.kind === "linear"
      ? [["nX", "Copies along X"], ["dX", "Distance between along X"], ["nY", "Copies along Y"], ["dY", "Distance between along Y"], ["nZ", "Copies along Z"], ["dZ", "Distance between along Z"]]
      : [["n", "Number of copies"], ["°", "Degrees to spread them over (360: all the way round)"], ["axis", "Turn about: 0 X, 1 Y, 2 Z"], ["x", "The point they turn about: X"], ["y", "The point they turn about: Y"], ["z", "The point they turn about: Z"]];
    return { fields: names.map(([short, label], i) => ({ label: label!, short: short!, value: op.pat[i] !== "" ? op.pat[i]! : fmt(op.patStart![i]!), active: op.axis === i, typed: op.pat[i] !== "" })), unit: "" };
  }
  if (op && op.kind === "rotate" && (op.target === "body" || op.target === "plane")) {
    // three angles, how the body is turned about X, Y and Z (what is typed in one of them is how it is to be turned about that axis)
    const now = turnAngles(scene, op);
    return { fields: (["X", "Y", "Z"] as const).map((label, i) => ({ label, short: label, value: op.rot[i] !== "" ? op.rot[i]! : fmt(now[i]!), active: op.axis === i, typed: op.rot[i] !== "" })), unit: "deg" };
  }
  if (op) {
    const v = valueOf(op);
    const axis = op.kind === "move" || op.kind === "rotate" ? ` ${"XYZ"[op.axis]}` : "";
    // an edge is a fillet one way and a chamfer the other
    const label = op.kind === "edge" ? (v !== null && v < 0 ? "Chamfer" : "Fillet") : op.dim ? (op.curved ? "Diameter" : op.kind === "pushpull" ? "Size" : "Distance") : (op.field ?? OP_FIELD[op.kind]) + axis;
    const size = sizeShown(op); // a push / pull or an extrude shows the size (the thickness, the diameter) you are making, and a typed size is that size
    const shown = size !== null ? size : op.kind === "edge" && v !== null ? Math.abs(v) : v;
    return { fields: [{ label, value: op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "0" : fmt(shown), active: true, typed: op.typed !== "" }], unit: op.unit ?? OP_UNIT[op.kind] };
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
  else if (tool.kind === "arc") {
    if (tool.points.length < 2) return null; // nothing to size until the arc has its two ends
    const arc = arcOf(pl, tool);
    if (arc) live.push(Math.abs(arc.bulge) * Math.hypot(arc.b[0] - arc.a[0], arc.b[1] - arc.a[1], arc.b[2] - arc.a[2]));
  } else {
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
