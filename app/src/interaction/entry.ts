// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import type { Tool, Preview } from "./tools.ts";
import { FIELDS, previewOf, rectEnd, circleRadius, lineNext, localOf, arcOf } from "./tools.ts";
import type { Op } from "./operations.ts";
import type { Gizmo } from "./gizmo.ts";
import type { Camera } from "./camera.ts";
import { basis } from "./camera.ts";
import { settings } from "../shared/settings.ts";
import { add, scale } from "../math/vec.ts";
import { OP_FIELD, OP_UNIT, valueOf, turnAngles, sizeShown } from "./operations.ts";

export interface EntryField { label: string; value: string; active: boolean; typed: boolean; /** a short name shown in front of the number when there are several (X Y Z) */ short?: string; /** which numbered field of its operation it is, when the operation has several bubbles */ index?: number }
/** `at`: where in the scene the bubble sits (null: no place to attach it to) */
export interface Entry { fields: EntryField[]; unit: string; at?: Vec3 | null; /** the other end of the arrow the bubble is at the tip of: the bubble stands out past the tip, away from it, so it does not cover the arrow */ from?: Vec3 | null }

const fmt = (v: number) => String(Math.round(v * 100) / 100);

/** The number chip: for a tool, its fields (what is typed, else the live size); for an operation, its one number. Null when there is nothing to show yet. */
export function entryOf(scene: Scene, tool: Tool | null, op: Op | null): Entry | null {
  if (op && op.kind === "rotate" && (op.target === "body" || op.target === "plane")) {
    // only the axis that is chosen shows (one is always chosen: Z to begin with; the X Y Z buttons or a ring change it), with how the body is turned about it; what is typed is how it is to be turned about that axis (`in_194`)
    const now = turnAngles(scene, op);
    const i = op.axis;
    return { fields: [{ label: "XYZ"[i]!, short: "XYZ"[i]!, value: op.rot[i] !== "" ? op.rot[i]! : fmt(now[i]!), active: true, typed: op.rot[i] !== "", index: i }], unit: "deg" };
  }
  if (op) {
    const v = valueOf(op);
    const axis = op.kind === "move" || op.kind === "rotate" ? ` ${"XYZ"[op.axis]}` : "";
    // an edge is a fillet one way and a chamfer the other
    const label = op.kind === "edge" ? (v !== null && v < 0 ? "Chamfer" : "Fillet") : op.dim ? (op.curved ? "Diameter" : op.kind === "pushpull" ? "Size" : "Distance") : (op.field ?? OP_FIELD[op.kind]) + axis;
    const size = sizeShown(op); // a push / pull or an extrude shows the size (the thickness, the diameter) you are making, and a typed size is that size
    const shown = size !== null ? size : op.kind === "edge" && v !== null ? Math.abs(v) : v;
    return { fields: [{ label, ...(op.curved ? { short: "Ø" } : {}), value: op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "0" : fmt(shown), active: true, typed: op.typed !== "" }], unit: op.unit ?? OP_UNIT[op.kind] };
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

/**
 * The bubbles of a repeat being set up: a linear one has one on each axis, at the end of that axis's spacing arrow (how many, and how far apart); a circular one has one, to the side
 * of the rings (how many copies, over how many degrees), so it never covers the arcs. `index` is the number's place in the repeat.
 */
export function repeatEntries(op: Op, g: Gizmo | null, cam: Camera): Entry[] {
  const v = op.patStart;
  if (!g || !v) return [];
  const show = (i: number) => (op.pat[i] !== "" ? op.pat[i]! : fmt(v[i]!));
  const typed = (i: number) => op.pat[i] !== "";
  if (op.kind === "circular") {
    const L = cam.distance * settings.gizmo.sizeOfView;
    const right = basis(cam).right;
    return [{
      fields: [
        { label: "Number of copies", short: "n", value: show(0), active: false, typed: typed(0), index: 0 },
        { label: "Degrees to spread them over (360: all the way round)", short: "°", value: show(1), active: false, typed: typed(1), index: 1 },
      ],
      unit: "", at: add(g.centre, scale(right, L * 1.35)),
    }];
  }
  const out: Entry[] = [];
  for (let i = 0; i < 3; i++) {
    const arrow = g.handles.find((h) => h.id === `lin:${"xyz"[i]}`);
    if (!arrow) continue;
    const X = "XYZ"[i]!;
    out.push({
      fields: [
        { label: `Copies along ${X}`, short: `${X}×`, value: show(2 * i), active: false, typed: typed(2 * i), index: 2 * i },
        { label: `Distance between copies along ${X}`, short: "Δ", value: show(2 * i + 1), active: false, typed: typed(2 * i + 1), index: 2 * i + 1 },
      ],
      unit: "", at: arrow.points[1]!, from: g.centre,
    });
  }
  return out;
}

/**
 * The number bubble of the move arrows (`in_215`, changed by `in_230`): only on the arrow of the chosen axis, as the rotator shows one ring's number. It shows where the move has taken the body along
 * that axis since it began (`offset`: 0 to begin with, and on across drags until the move is put away), and a typed number is that position.
 */
export function moveEntries(op: Op, g: Gizmo | null, offset: Vec3): Entry[] {
  if (!g || op.kind !== "move") return [];
  const i = op.axis;
  const arrow = g.handles.find((h) => h.id === `move:${"xyz"[i]}`);
  if (!arrow) return [];
  const typed = op.typed !== "";
  return [{
    fields: [{ label: `Move along ${"XYZ"[i]}`, short: "XYZ"[i]!, value: typed ? op.typed : fmt(offset[i]! + (valueOf(op) ?? 0)), active: true, typed, index: i }],
    unit: "mm", at: arrow.points.at(-1)!, from: g.centre,
  }];
}
