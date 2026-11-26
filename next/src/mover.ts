// What the mover orb does to the thing it stands for, as pure functions: which arrows are chosen, and what a drag of one does to the thing and to the orb's own place and axes.
// The orb is rigid with its thing (an offset from its origin, three axes) except in orient mode, where only the orb moves.
import { AXES, type Dragged } from "./orb.ts";
import type { Frame } from "./planes.ts";
import { add, rotate, sub, type V3 } from "./vec.ts";

/** Where the orb stands and how it is turned, relative to its thing; `turned` is how far the thing has been turned about each axis (radians). */
export interface Pose {
  offset: V3;
  frame: V3[];
  turned: number[];
}
export const newPose = (): Pose => ({ offset: [0, 0, 0], frame: AXES.map((a) => [...a] as V3), turned: [0, 0, 0] });
export const clonePose = (q: Pose): Pose => ({
  offset: [...q.offset] as V3,
  frame: q.frame.map((a) => [...a] as V3),
  turned: [...q.turned],
});
/** Where the orb stands in the world. */
export const centreOf = (f: Frame, q: Pose): V3 => add(f.origin, q.offset);

/** The axes of the straight arrows that are chosen (`move:X`, ...). */
export const heldAxes = (chosen: string[]): number[] =>
  chosen.filter((id) => id.startsWith("move:")).map((id) => "XYZ".indexOf(id[5]!));
/**
 * A press on an arrow: it is chosen alone; with Shift a straight arrow is added to the straight ones chosen (a curved arrow only replaces them), and a chosen one is taken out;
 * a press on a chosen arrow without Shift keeps all chosen, so they are dragged together. `drag` is false when the press only took one out.
 */
export function choose(chosen: string[], id: string, shift: boolean): { chosen: string[]; drag: boolean } {
  const move = id.startsWith("move:");
  if (shift) {
    if (chosen.includes(id)) return { chosen: chosen.filter((c) => c !== id), drag: false };
    return { chosen: move && chosen.every((c) => c.startsWith("move:")) ? [...chosen, id] : [id], drag: true };
  }
  return { chosen: chosen.includes(id) ? chosen : [id], drag: true };
}

/**
 * What a drag does, from where the thing and the orb were when it began (`base`, `pose0`). Out of orient mode the thing moves (and the orb with it) or turns about the orb's middle (the thing's
 * origin swings round it, the orb's axes turn with it, so the orb keeps its place and its turn relative to the thing). In orient mode the thing stays and the orb moves or its axes turn.
 * `axis` is the index of the arrow's axis (for what has been turned).
 */
export function applyDrag(
  base: Frame,
  pose0: Pose,
  d: Dragged,
  axis: number | null,
  orient: boolean,
): { frame: Frame; pose: Pose } {
  const pose = clonePose(pose0);
  let frame: Frame = { origin: base.origin, normal: base.normal, u: base.u };
  if (orient) {
    if (d.move) pose.offset = add(pose0.offset, d.move);
    if (d.turn) pose.frame = pose0.frame.map((v) => rotate(v, d.turn!.axis, d.turn!.angle));
    return { frame, pose };
  }
  if (d.move) frame = { ...frame, origin: add(base.origin, d.move) };
  if (d.turn) {
    const c0 = add(base.origin, pose0.offset),
      a = d.turn.axis,
      ang = d.turn.angle;
    const origin = add(c0, rotate(sub(base.origin, c0), a, ang));
    frame = { origin, normal: rotate(base.normal, a, ang), u: rotate(base.u, a, ang) };
    pose.offset = sub(c0, origin);
    pose.frame = pose0.frame.map((v) => rotate(v, a, ang));
    if (axis !== null) pose.turned[axis] = pose0.turned[axis]! + ang;
  }
  return { frame, pose };
}
