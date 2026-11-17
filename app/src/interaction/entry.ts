// What the view shows while a tool or an operation is running: the figure or prism being made and the number chip. Derived from the state; nothing here changes it.
import { normalAngle } from "./control/section.ts";
import { localOf } from "../operation/part.ts";
import { roundedText } from "../shared/numbers.ts";
import { lengthText, unitName, units } from "../shared/units.ts";
import { GEAR_HINTS, gearTitle } from "./gearhelp.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import type { Plane } from "../operation/part.ts";
import type { Tool, Preview } from "./tools.ts";
import { FIELDS, previewOf, rectEnd, circleRadius, lineNext, arcOf, gearFields, gearLive } from "./tools.ts";
import type { Op } from "./operations.ts";
import type { Gizmo } from "./gizmo.ts";
import type { Camera } from "./camera.ts";
import { basis } from "./camera.ts";
import { settings } from "../shared/settings.ts";
import { add, sub, scale, dot } from "../math/vec.ts";
import { anglesOf, fromAngles } from "../math/rotation.ts";
import { OP_FIELD, OP_UNIT, valueOf, turnAngles, sizeShown } from "./operations.ts";
import { advanceOf } from "./revolve.ts";
import { loftNumbers, loftGapNumbers } from "./loft.ts";

export interface EntryField { /** a line that says what the number is (the gear box, `in_685`) */ hint?: string; label: string; value: string; active: boolean; typed: boolean; /** a short name shown in front of the number when there are several (X Y Z) */ short?: string; /** which numbered field of its operation it is, when the operation has several bubbles */ index?: number; /** the unit of this field when it is not the entry's (a position and a rotation in one bubble) */ unit?: string }
/** `at`: where in the scene the bubble sits (null: no place to attach it to) */
export interface Entry { /** shown as a labelled panel that stands still, not a bubble that follows the pointer: a box of many numbers to click into (the gear tool, `in_685`) */ panel?: string; fields: EntryField[]; unit: string; /** how plainly it shows: less than 1 while it fades out (`in_439`) */ opacity?: number; /** the number typed is also a constraint (a size of a figure): a lock shows by it, closed once typed (`in_384`) */ constraint?: boolean; at?: Vec3 | null; /** the other end of the arrow the bubble is at the tip of: the bubble stands out past the tip, away from it, so it does not cover the arrow */ from?: Vec3 | null }


/** The number chip: for a tool, its fields (what is typed, else the live size); for an operation, its one number. Null when there is nothing to show yet. */
export function entryOf(scene: Scene, tool: Tool | null, op: Op | null): Entry | null {
  if (op && op.kind === "mirror") return null; // (its numbers are on its arrows, `in_437`)
  if (op && op.kind === "rotate" && op.frame && (op.target === "body" || op.target === "plane")) {
    // the mover has been turned: a single angle about the axis of the chosen ring (`in_417`)
    const live = valueOf(op);
    return { fields: [{ label: `About the mover's ${"XYZ"[op.axis]}`, short: "XYZ"[op.axis]!, value: op.typed !== "" ? op.typed : live !== null ? roundedText(live) : "0", active: true, typed: op.typed !== "", index: op.axis }], unit: "deg" };
  }
  if (op && op.kind === "rotate" && (op.target === "body" || op.target === "plane")) {
    // only the axis that is chosen shows (one is always chosen: Z to begin with; the X Y Z buttons or a ring change it), with how the body is turned about it; what is typed is how it is to be turned about that axis (`in_194`)
    const now = turnAngles(scene, op);
    const i = op.axis;
    return { fields: [{ label: "XYZ"[i]!, short: "XYZ"[i]!, value: op.rot[i] !== "" ? op.rot[i]! : roundedText(now[i]!), active: true, typed: op.rot[i] !== "", index: i }], unit: "deg" };
  }
  if (op && op.kind === "revolve") {
    // the angle (any size: past 360 it goes on round) and the advance along the axis (a spiral if it is not nothing), Tab goes between them (`dec_spiral_extrude`)
    const angle = valueOf(op);
    const on = op.revField ?? 0;
    return { fields: [
      { label: "Angle", short: "°", value: op.typed !== "" ? op.typed : roundedText(angle ?? 0), active: on === 0, typed: op.typed !== "", index: 0, unit: "°" },
      { label: "Advance", short: "↔", value: (op.advTyped ?? "") !== "" ? op.advTyped! : roundedText(advanceOf(op)), active: on === 1, typed: (op.advTyped ?? "") !== "", index: 1, unit: "mm" },
    ], unit: "mm" };
  }
  if (op) {
    const v = valueOf(op);
    const axis = op.kind === "move" || op.kind === "rotate" ? ` ${"XYZ"[op.axis]}` : "";
    // an edge is a fillet one way and a chamfer the other
    const label = op.kind === "edge" ? (op.twoDist || (v !== null && v < 0) ? "Chamfer" : "Fillet") : op.dim ? (op.curved ? "Diameter" : op.kind === "pushpull" ? "Size" : op.kind === "hollow" ? "Wall" : "Distance") : (op.field ?? OP_FIELD[op.kind]) + axis;
    const size = sizeShown(op); // a push / pull or an extrude shows the size (the thickness, the diameter) you are making, and a typed size is that size
    const shown = size !== null ? size : op.kind === "edge" && v !== null ? Math.abs(v) : v;
    if (op.kind === "edge" && op.twoDist && op.vary) {
      // a chamfer with a distance along each face: the one along the face that is lit, and the one along the other (`dec_chamfer_two_distances`)
      const first = op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "0" : roundedText(shown);
      const second = (op.endTyped ?? "") !== "" ? op.endTyped! : first;
      const on = op.varField ?? 0;
      return { fields: [{ label: "Along the lit face", short: "1", value: first, active: on === 0, typed: op.typed !== "", index: 0 }, { label: "Along the other face", short: "2", value: second, active: on === 1, typed: (op.endTyped ?? "") !== "", index: 1 }], unit: op.unit ?? OP_UNIT[op.kind] };
    }
    if (op.kind === "edge" && op.variable && op.vary) {
      // a fillet or chamfer whose size changes along the edge: the size at its start and at its end (`in_406`)
      const first = op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "0" : roundedText(shown);
      const second = (op.endTyped ?? "") !== "" ? op.endTyped! : first;
      const dash = (s: string | undefined) => (s ?? "") !== "" ? s! : "-";
      const on = op.varField ?? 0;
      const f = (label: string, short: string, value: string, i: number, typed: boolean) => ({ label, short, value, active: on === i, typed, index: i });
      const all = [f("Start", "A", first, 0, op.typed !== ""), f("End", "B", second, 1, (op.endTyped ?? "") !== ""), f("Middle", "M", dash(op.midTyped), 2, (op.midTyped ?? "") !== ""), f("1/4", "Q", dash(op.q1Typed), 3, (op.q1Typed ?? "") !== ""), f("3/4", "R", dash(op.q3Typed), 4, (op.q3Typed ?? "") !== "")];
      return { fields: op.rimVary ? all.filter((x) => x.index !== 1) : all, unit: op.unit ?? OP_UNIT[op.kind] }; // (round a rim there is no end: the size comes back to the start)
    }
    return { fields: [{ label, ...(op.curved ? { short: "Ø" } : {}), value: op.typed !== "" ? op.typed.replace(/^-/, "") : shown === null ? "0" : roundedText(shown), active: true, typed: op.typed !== "" }], unit: op.unit ?? OP_UNIT[op.kind] };
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
  else if (tool.kind === "gear") {
    const g = tool.gear ?? { internal: false, typed: [] as string[], field: 0 };
    const shown = gearLive(scene, tool);
    return { panel: gearTitle(g), fields: gearFields(g).map((f, i) => ({ hint: GEAR_HINTS[f.key], label: f.label, value: (g.typed[i] ?? "") !== "" ? g.typed[i]! : shown ? roundedText(shown[i]!) : "", active: g.field === i, typed: (g.typed[i] ?? "") !== "", ...(f.key === "pressure" || f.key === "angle" ? { unit: "°" } : {}) })), unit: "mm" };
  }
  else if (tool.kind === "arc") {
    if (tool.points.length < 2) return null; // nothing to size until the arc has its two ends
    const arc = arcOf(pl, tool);
    if (arc) live.push(Math.abs(arc.bulge) * Math.hypot(arc.b[0] - arc.a[0], arc.b[1] - arc.a[1], arc.b[2] - arc.a[2]));
  } else {
    const n = lineNext(tool);
    const a = tool.points[tool.points.length - 1]!;
    if (n) live.push(Math.hypot(n[0] - a[0], n[1] - a[1], n[2] - a[2]));
  }
  return { fields: labels.map((label, i) => ({ label, value: tool.typed[i as 0 | 1] !== "" ? tool.typed[i as 0 | 1] : live[i] != null ? roundedText(live[i]!) : "", active: tool.field === i, typed: tool.typed[i as 0 | 1] !== "" })), unit: "mm", constraint: true }; // (a size typed for a figure is kept as a constraint on it, `in_384`)
}

/** The figure being drawn (an extrude and the other operations show their real result instead, see `frame.ts`). */
export function previewFor(scene: Scene, tool: Tool | null): Preview | null {
  return tool ? previewOf(scene, tool) : null;
}

/**
 * The bubbles of a repeat being set up: a linear one has one on each axis, at the end of that axis's spacing arrow (how many, and how far apart); a circular one has one, to the side
 * of the rings (how many copies, over how many degrees), so it never covers the arcs. `index` is the number's place in the repeat.
 */
export function repeatEntries(op: Op, g: Gizmo | null, cam: Camera, chosen: string | null = null): Entry[] {
  const v = op.patStart;
  if (!g || !v) return [];
  const show = (i: number) => (op.pat[i] !== "" ? op.pat[i]! : roundedText(v[i]!));
  const typed = (i: number) => op.pat[i] !== "";
  if (op.kind === "circular") {
    const L = cam.distance * settings.gizmo.sizeOfView;
    const right = basis(cam).right;
    const piv = chosen?.startsWith("piv:") ? g.handles.find((h) => h.id === chosen) : undefined; // (the pivot's arrow that was taken: its coordinate, to type, `in_384`)
    const k = piv ? "xyz".indexOf(chosen![4]!) : -1;
    return [{
      fields: [
        { label: "Number of copies", short: "n", value: show(0), active: false, typed: typed(0), index: 0 },
        { label: "Degrees to spread them over (360: all the way round)", short: "°", value: show(1), active: false, typed: typed(1), index: 1, unit: "°" },
      ],
      unit: "", at: add(g.centre, scale(right, L * 1.35)),
    }, ...(piv && k >= 0 ? [{ fields: [{ label: `The pivot point along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(v[3 + k]!), active: false, typed: false, index: 3 + k }], unit: "mm", at: piv.points.at(-1)!, from: g.centre }] : [])];
  }
  // only the arrow that was taken last shows its number, as only the chosen ring of a turn does (`in_236`): the stub past the last copy its count, the other arrow the distance between copies
  if (!chosen) return [];
  const i = "xyz".indexOf(chosen.slice(4, 5));
  const arrow = g.handles.find((h) => h.id === chosen);
  if (i < 0 || !arrow) return [];
  const X = "XYZ"[i]!;
  // the count arrow and the distance arrow of an axis are active together (`in_386`): both numbers show, each at the tip of its arrow
  const countArrow = g.handles.find((h) => h.id === `cnt:${chosen.slice(4, 5)}`);
  const distArrow = g.handles.find((h) => h.id === `lin:${chosen.slice(4, 5)}`);
  return [
    ...(countArrow ? [{ fields: [{ label: `Copies along ${X}`, short: `${X}×`, value: show(2 * i), active: false, typed: typed(2 * i), index: 2 * i }], unit: "", at: countArrow.points.at(-1)!, from: g.centre }] : []),
    ...(distArrow ? [{ fields: [{ label: `Distance between copies along ${X}`, short: "Δ", value: show(2 * i + 1), active: false, typed: typed(2 * i + 1), index: 2 * i + 1 }], unit: "mm", at: distArrow.points.at(-1)!, from: g.centre }] : []),
  ];
}

/**
 * The number bubble of the move arrows (`in_215`, changed by `in_230`): only on the arrow of the chosen axis, as the rotator shows one ring's number. It shows where the move has taken the body along
 * that axis since it began (`offset`: 0 to begin with, and on across drags until the move is put away), and a typed number is that position.
 */
/** The numbers of the cross section plane (`in_395`): while its arrows move it, where it is along each axis, a bubble at each arrow; while its rings turn it, the angle its normal makes about each axis, a bubble at each ring. */
/** The mirror plane's number: the chosen arrow's, where its plane stands along the axis (type it to place the plane exactly, `in_437`). */
export function mirrorEntries(op: Op, g: Gizmo | null): Entry[] {
  if (!g || op.kind !== "mirror" || !op.mirrorAt) return [];
  const k = op.mirrorAxis ?? 0;
  const arrow = g.handles.find((h) => h.id === `mir:${"xyz"[k]}`);
  return arrow ? [{ fields: [{ label: `Mirror plane along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(op.mirrorAt[k]!), active: true, typed: false, index: k, unit: "mm" }], unit: "mm", at: arrow.points.at(-1)!, from: g.centre }] : [];
}
export function sectionEntries(sec: { at: Vec3; n: Vec3 }, g: Gizmo | null, chosen: string | null): Entry[] {
  if (!g || !chosen) return []; // (as for a body: the number of the arrow or ring that is taken, not of all of them, `in_419`)
  if (chosen === "sheet:n") { // the sheet's own arrow: how far along its normal the plane stands from the origin, `in_459`
    const h = g.handles.find((x) => x.id === chosen);
    return h ? [{ fields: [{ label: "Where the plane is along its normal", short: "n", value: roundedText(dot(sec.at, sec.n)), active: false, typed: false, index: 6 }], unit: "mm", at: h.points.at(-1)!, from: g.centre }] : [];
  }
  return ([0, 1, 2] as const).flatMap((k) => {
    const moving = chosen === `move:${"xyz"[k]}`;
    if (!moving && chosen !== `rot:${"xyz"[k]}`) return [];
    const h = g.handles.find((x) => x.id === chosen);
    if (!h) return [];
    const head = h.points[Math.floor(h.points.length / 8)]!;
    const at = moving ? h.points.at(-1)! : add(g.centre, scale(sub(head, g.centre), 1.25)); // (the number of a ring stands a little further out than its arrowhead, `in_436`)
    return [{ fields: [{ label: moving ? `Where the plane is along ${"XYZ"[k]}` : `The angle of the plane about ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(moving ? sec.at[k]! : normalAngle(sec.n, k)), active: false, typed: false, index: moving ? k : 3 + k }], unit: moving ? "mm" : "°", at, ...(moving ? { from: g.centre } : {}) }];
  });
}
/**
 * The number bubble of a revolve's arrow that is taken (`in_531`): at the tip of a position arrow (`piv:`) the orb's place along that axis (its distance from the origin along that arrow's axis, which is the world coordinate when the orb is not turned; typed to put it: field 10 + the axis), at the tip of a
 * spiral arrow (`rev:adv:`) the advance (field 1, the same number as the chip's). Nothing for an arrow not taken.
 */
export function revolveEntries(op: Op, g: Gizmo | null, chosen: string | null): Entry[] {
  if (!g || op.kind !== "revolve" || !chosen) return [];
  const h = g.handles.find((x) => x.id === chosen);
  if (!h) return [];
  if (/^piv:[xyz]$/.test(chosen)) {
    const k = "xyz".indexOf(chosen[4]!);
    const along = dot(g.centre, (op.frame ?? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const)[k]!); // (measured along the arrow as it stands: the orb's own axis when it is turned, `in_532`)
    return [{ fields: [{ label: `The orb's place along its ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(along), active: false, typed: false, index: 10 + k, unit: "mm" }], unit: "mm", at: h.points.at(-1)!, from: g.centre }];
  }
  if (/^rev:adv:[xyz]$/.test(chosen)) {
    const typed = (op.advTyped ?? "") !== "";
    return [{ fields: [{ label: `The spiral advance along ${"XYZ"["xyz".indexOf(chosen[8]!)]}`, short: "↔", value: typed ? op.advTyped! : roundedText(advanceOf(op)), active: false, typed, index: 1, unit: "mm" }], unit: "mm", at: h.points.at(-1)!, from: h.points[0]! }];
  }
  return [];
}
/** A loft's start numbers: a bubble at each sketch's start dot with the number of the corner it starts at (`in_533`). */
export function loftEntries(scene: Scene, op: Op): Entry[] {
  if (op.kind !== "loft") return [];
  const starts = loftNumbers(scene, op).map((x): Entry => ({ fields: [{ label: `Where sketch ${x.sketch} starts (corner 1 to ${x.sides})`, short: `${x.sketch}`, value: String(x.value), active: false, typed: false, index: x.index }], unit: "", at: x.at }));
  // and the distance from each sketch to the next, to type (`in_535`)
  const gaps = loftGapNumbers(scene, op).map((x): Entry => { const typed = (op.loftGaps?.[x.sketch - 1] ?? "") !== ""; return { fields: [{ label: `Distance from sketch ${x.sketch} to sketch ${x.sketch + 1}, ${op.loftStraight ? "along the straight line between their middles" : "along the normal of the first one's plane"}`, short: "↔", value: typed ? op.loftGaps![x.sketch - 1]! : roundedText(x.distance), active: false, typed, index: x.index, unit: "mm" }], unit: "mm", at: x.at }; });
  return [...starts, ...gaps];
}
/** The numbers of a scale along axes (`in_390`): one bubble at the tip of each axis arrow with the factor along it, to type. */
export function scaleEntries(op: Op, g: Gizmo | null): Entry[] {
  if (!g || op.kind !== "scale" || !op.axes) return [];
  return ([0, 1, 2] as const).flatMap((k) => {
    const arrow = g.handles.find((h) => h.id === `scale:${"xyz"[k]}`);
    return arrow ? [{ fields: [{ label: `Scale along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(op.axes![k]), active: false, typed: false, index: k }], unit: "×", at: arrow.points.at(-1)!, from: g.centre }] : [];
  });
}
/** The mover's own place as three numbers (world x, y, z), one on each of the sphere's arrows, while the sphere is selected (`in_418`). */
export function moverPlaceEntries(g: Gizmo | null, frame: readonly [Vec3, Vec3, Vec3] | undefined, show: { all: false; handle: string | null } | { all: true; opacity: number }): Entry[] {
  if (!g) return [];
  const turned = frameAngles(frame);
  // the whole orb being moved: all three positions and turns, which fade out; else only the value of the arrow or ring that was clicked (`in_439`)
  if (!show.all) {
    const h = show.handle;
    const k = h && /^(piv|rot):[xyz]$/.test(h) ? "xyz".indexOf(h[4]!) : -1;
    if (k < 0) return [];
    const handle = g.handles.find((x) => x.id === h);
    if (!handle) return [];
    if (h!.startsWith("piv:")) return [{ fields: [{ label: `Mover's position along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(g.centre[k]!), active: false, typed: false, index: k, unit: "mm" }], unit: "mm", at: handle.points.at(-1)!, from: g.centre }];
    const head = handle.points[Math.floor(handle.points.length / 8)]!;
    return [{ fields: [{ label: `Mover's turn about ${"XYZ"[k]}`, short: "↻", value: roundedText(turned[k]!), active: false, typed: false, index: 3 + k, unit: "°" }], unit: "°", at: add(g.centre, scale(sub(head, g.centre), 1.25)), from: g.centre }];
  }
  // each of the three bubbles has the mover's position along its axis and, beside it, the turn of its axes about that axis (`in_434`)
  return ([0, 1, 2] as const).flatMap((k) => {
    const arrow = g.handles.find((h) => h.id === `piv:${"xyz"[k]}`);
    return arrow ? [{ opacity: show.opacity, fields: [
      { label: `Mover's position along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(g.centre[k]!), active: false, typed: false, index: k, unit: "mm" },
      { label: `Mover's turn about ${"XYZ"[k]}`, short: "↻", value: roundedText(turned[k]!), active: false, typed: false, index: 3 + k, unit: "°" },
    ], unit: "mm", at: arrow.points.at(-1)!, from: g.centre }] : [];
  });
}
/** The turn of the mover's axes as three angles, about X, then Y, then Z (zeros for the world's own axes). */
export function frameAngles(frame?: readonly [Vec3, Vec3, Vec3]): [number, number, number] {
  if (!frame) return [0, 0, 0];
  const [a, b, c] = frame;
  return anglesOf([a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]]);
}
/** The mover's axes after a turn of these three angles (the inverse of `frameAngles`). */
export function frameOfAngles(angles: [number, number, number]): [Vec3, Vec3, Vec3] {
  const r = fromAngles(angles);
  return [[r[0], r[3], r[6]], [r[1], r[4], r[7]], [r[2], r[5], r[8]]];
}
export function moveEntries(op: Op, g: Gizmo | null, offset: Vec3): Entry[] {
  if (!g || op.kind !== "move") return [];
  // a body dragged free: all three numbers, one on each arrow, as it goes (`in_293`)
  if (op.free) {
    return ([0, 1, 2] as const).flatMap((k) => {
      const arrow = g.handles.find((h) => h.id === `move:${"xyz"[k]}`);
      return arrow ? [{ fields: [{ label: `Move along ${"XYZ"[k]}`, short: "XYZ"[k]!, value: roundedText(offset[k]!), active: false, typed: false, index: k }], unit: "mm", at: arrow.points.at(-1)!, from: g.centre }] : [];
    });
  }
  const i = op.axis;
  const arrow = g.handles.find((h) => h.id === `move:${"xyz"[i]}`);
  if (!arrow) return [];
  const typed = op.typed !== "";
  return [{
    fields: [{ label: `Move along ${"XYZ"[i]}`, short: "XYZ"[i]!, value: typed ? op.typed : roundedText(offset[i]! + (valueOf(op) ?? 0)), active: true, typed, index: i }],
    unit: "mm", at: arrow.points.at(-1)!, from: g.centre,
  }];
}

/** An entry as the person reads it in the number system in use (`in_661`): a length that is the live value of the model (not what was typed: that is in the system already) is shown in inches, and the unit's name follows. Everything the model keeps is millimetres. */
export function inUnits<T extends Entry | null>(e: T): T {
  if (!e || units.system === "mm" || e.panel) return e; // (a gear box keeps its own numbers, millimetres and modules: they follow the standards, `q_gear_units`)
  const fields = e.fields.map((f) => {
    const u = f.unit ?? e.unit;
    if (u !== "mm") return f;
    const n = Number(f.value);
    return { ...f, ...(f.typed || f.value === "" || !Number.isFinite(n) ? {} : { value: lengthText(n) }), unit: unitName(u) };
  });
  return { ...e, fields, unit: unitName(e.unit) } as T;
}
