// Mates between bodies (`in_314`, `dec_body_mates`): two faces of two bodies are brought together by moving and turning the first body, as steps (the sketches of the body go with it).
//   flush:   a flat face of the mover is laid on a flat face of the other, facing it, with a gap (0: touching)
//   coaxial: the axis of a round face (a post, a hole) of the mover is put on the axis of a round face of the other
// The motion is worked out from where the faces are now and made as ordinary turns about X, Y and Z and a move, so it replays, undoes and carries sketches as any other move does. It is placed once: later changes to either body
// do not move it again (`q_mate_persistence`).
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { sub, dot, cross, normalize, length } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { nextId } from "../operation/scene.ts";
import type { MateMode } from "../operation/mates.ts";
import { featureOf, mateRelation, mateStatus, isFlatMode } from "../operation/mates.ts";
import type { Command } from "../operation/commands.ts";
import { carrySketches } from "./operations.ts";

export type { MateMode };
type Mat = [Vec3, Vec3, Vec3]; // rows

/** Why these two faces cannot be mated this way, or null. */
export function whyNotMate(scene: Scene, mode: MateMode, mover: Ref, other: Ref): string | null {
  const [a, b] = [featureOf(scene, mover, mode), featureOf(scene, other, mode)];
  if (!a || !b) return isFlatMode(mode) ? "two flat faces of two bodies" : "two round faces of two bodies";
  if (a.body === b.body) return "the faces are of one body: choose a face of each of two bodies";
  return null;
}

const turnAbout = (axis: Vec3, rad: number): Mat => {
  const [x, y, z] = normalize(axis);
  const [c, s, t] = [Math.cos(rad), Math.sin(rad), 1 - Math.cos(rad)];
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
};
/** The turn that takes direction `from` onto direction `to` by the shortest way. */
function turnBetween(from: Vec3, to: Vec3): Mat {
  const [f, t] = [normalize(from), normalize(to)];
  const c = dot(f, t);
  if (c > 1 - 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (c < -1 + 1e-12) { const across = Math.abs(f[0]) < 0.9 ? cross(f, [1, 0, 0]) : cross(f, [0, 1, 0]); return turnAbout(across, Math.PI); }
  return turnAbout(cross(f, t), Math.acos(Math.max(-1, Math.min(1, c))));
}
/** The turns about X, then Y, then Z (degrees) that make this turn: R = Rz Ry Rx. */
function eulerXYZ(m: Mat): { axis: 0 | 1 | 2; angle: number }[] {
  const b = -Math.asin(Math.max(-1, Math.min(1, m[2][0])));
  const [a, c] = Math.abs(Math.cos(b)) > 1e-9 ? [Math.atan2(m[2][1], m[2][2]), Math.atan2(m[1][0], m[0][0])] : [Math.atan2(-m[1][2], m[1][1]), 0];
  const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 1e6) / 1e6;
  return ([[0, deg(a)], [1, deg(b)], [2, deg(c)]] as [0 | 1 | 2, number][]).filter(([, angle]) => Math.abs(angle) > 1e-9).map(([axis, angle]) => ({ axis, angle }));
}

/**
 * The command that puts the first face's body against the second's: turns and a move, with the body's sketches carried, and the mate recorded as a relation (`in_315`); or why not. `gap`: how far apart the flat faces are left (mm).
 * `again`: the id of a mate that is made again after a change: the old record goes and the new one takes its id.
 */
export function mateCommand(scene: Scene, mode: MateMode, mover: Ref, other: Ref, gap = 0, again?: string): { command: Command } | { why: string } {
  const why = whyNotMate(scene, mode, mover, other);
  if (why) return { why };
  const [a, b] = [featureOf(scene, mover, mode)!, featureOf(scene, other, mode)!];
  // the turn: a flat face to face the other (its normal opposite), a round face's axis parallel to the other's (the nearer of the two ways)
  const want: Vec3 = mode === "flush" ? [-b.dir[0], -b.dir[1], -b.dir[2]] : dot(a.dir, b.dir) >= 0 ? b.dir : [-b.dir[0], -b.dir[1], -b.dir[2]]; // (a flush face faces the other; for the rest the nearer way is taken)
  const R = turnBetween(a.dir, want);
  const pivot = a.point; // (a point on the face or on the axis stays where it is under the turn)
  // the move: a flat face onto the other's plane (plus the gap, along the other's normal); an axis onto the other's axis, keeping its place along it
  let move: Vec3;
  let moverWhenTrue: Vec3; // (a point of the mover's face or axis when the mate is true)
  if (mode === "flush") {
    const s = dot(sub(a.point, b.point), b.dir);
    move = [b.dir[0] * (gap - s), b.dir[1] * (gap - s), b.dir[2] * (gap - s)];
    moverWhenTrue = [b.point[0] + b.dir[0] * gap, b.point[1] + b.dir[1] * gap, b.point[2] + b.dir[2] * gap];
  } else if (mode === "coaxial") {
    const w = sub(a.point, b.point);
    const along = dot(w, b.dir);
    move = [-(w[0] - b.dir[0] * along), -(w[1] - b.dir[1] * along), -(w[2] - b.dir[2] * along)];
    moverWhenTrue = [b.point[0] + b.dir[0] * along, b.point[1] + b.dir[1] * along, b.point[2] + b.dir[2] * along];
  } else { // only turned until parallel: where it is stays (a point of the face or the axis does not move under the turn)
    move = [0, 0, 0];
    moverWhenTrue = a.point;
  }
  const r6 = (v: Vec3): Vec3 => v.map((x) => Math.round(x * 1e6) / 1e6) as unknown as Vec3;
  const turns = eulerXYZ(R);
  const translate = r6(move);
  const record: Command = { type: "addRelation", relation: mateRelation(again ?? nextId(scene, "r"), mode, gap, a, b, { mover: { point: moverWhenTrue, dir: want }, other: { point: b.point, dir: b.dir } }) };
  const forget: Command[] = again ? [{ type: "removeRelation", id: again }] : [];
  if (!turns.length && length(translate) < 1e-9) return { command: { type: "batch", commands: [...forget, record] } }; // (they meet already: only the mate is recorded)
  const id = nextId(scene, "s");
  const steps: Command[] = turns.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: [a.body], params: { axis: t.axis, value: t.angle, px: pivot[0], py: pivot[1], pz: pivot[2], follow: 1, body: a.bodyId } } }));
  if (length(translate) > 1e-9) steps.push({ type: "addStep", step: { id: `${id}m`, type: "move", parts: [a.body], params: { axis: 0, value: 0, vx: translate[0], vy: translate[1], vz: translate[2], follow: 1, body: a.bodyId } } });
  const carry = carrySketches(scene, turns, translate, pivot, 1, a.bodyId);
  return { command: { type: "batch", commands: [...forget, ...steps, ...carry, record] } };
}

/** The mates that are no longer true (or just `only` this one), and the command that puts the first of them back (the one after it is looked at again once this one is made, for it may have moved what it rests on); null when all are true. */
export function putMatesBack(scene: Scene, only?: string): { command: Command; id: string } | null {
  for (const m of mateStatus(scene)) {
    if (m.state !== "off" || !m.mover || !m.other || (only && m.id !== only)) continue;
    const r = mateCommand(scene, m.mode, m.mover.ref, m.other.ref, m.gap, m.id);
    if ("command" in r) return { command: r.command, id: m.id };
  }
  return null;
}
