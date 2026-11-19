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
import type { MateState } from "../operation/mates.ts";
import { featureOf, mateRelation, mateStatus, isFlatMode, turnOnly, angleOfMode, canonBody, bodyPart } from "../operation/mates.ts";
import { shapeOf, tangentMotion, whyNotTangent } from "../operation/tangent.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { carrySketches } from "./operations.ts";
import type { SolveMate, SolveBody, Pose } from "../operation/matesolve.ts";
import { solvePoses, solveDriven, poseOfRigid, rigidOfPose, poseForBody } from "../operation/matesolve.ts";
import type { Rigid } from "../operation/frames.ts";
import { laterMotion } from "../operation/frames.ts";
import { hardCollision, hardNames } from "./hard.ts";
import { freePart } from "../operation/collide.ts";
import type { Step } from "../operation/scene.ts";

export type { MateMode };
type Mat = [Vec3, Vec3, Vec3]; // rows

/** Why these two faces cannot be mated this way, or null. */
export function whyNotMate(scene: Scene, mode: MateMode, mover: Ref, other: Ref): string | null {
  const [a, b] = [featureOf(scene, mover, mode), featureOf(scene, other, mode)];
  if (!a || !b) return mode === "tangent" ? "a round face (a cylinder, a ball or a cone) and a flat or round face of two bodies" : mode === "axisToFace" ? "a flat face and a round face of two bodies" : isFlatMode(mode) ? "two flat faces of two bodies" : "two round faces of two bodies";
  if (mode === "axisToFace" && (a.radius > 0) === (b.radius > 0)) return "a flat face and a round face (one of each)";
  if (mode === "tangent") { const w = whyNotTangent(shapeOf(a), shapeOf(b)); if (w) return w; }
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
const rotate = (m: Mat, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
/** The turn that brings the angle between two directions (as lines) to `degrees`, by the smaller turn: about the line across both, toward the other when the angle is to be less, away when it is to be more. */
function turnToAngle(a: Vec3, b: Vec3, degrees: number): Mat {
  const b2: Vec3 = degrees > 90 || dot(a, b) >= 0 ? b : [-b[0], -b[1], -b[2]]; // (to 90 the angle is between lines: the nearer way round; past 90 it is between the directions themselves, `in_326`)
  const phi = Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b2)))));
  const psi = phi - (degrees * Math.PI) / 180;
  if (Math.abs(psi) < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const across = cross(a, b2);
  const axis = length(across) > 1e-9 ? across : Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]); // (parallel already: any line across them)
  return turnAbout(axis, psi);
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
export function mateCommand(scene: Scene, mode: MateMode, mover: Ref, other: Ref, gap = 0, again?: string, counts = true, standing = false): { command: Command } | { why: string } {
  const why = whyNotMate(scene, mode, mover, other);
  if (why) return { why };
  const [a, b] = [featureOf(scene, mover, mode)!, featureOf(scene, other, mode)!];
  // the turn: a flat face to face the other (its normal opposite), a round face's axis parallel to the other's (the nearer of the two ways)
  const want: Vec3 = mode === "flush" ? [-b.dir[0], -b.dir[1], -b.dir[2]] : dot(a.dir, b.dir) >= 0 ? b.dir : [-b.dir[0], -b.dir[1], -b.dir[2]]; // (a flush face faces the other; for the rest the nearer way is taken)
  const tmo = mode === "tangent" ? tangentMotion(a, b) : null; // (a tangent mate: the turn and the move that bring the faces to touch, `in_976`, `in_977`)
  const R = tmo ? (tmo.turnTo ? turnBetween(a.dir, tmo.turnTo) : turnBetween(a.dir, a.dir)) : turnOnly(mode) ? turnToAngle(a.dir, b.dir, angleOfMode(mode, gap)) : turnBetween(a.dir, want);
  const pivot = a.point; // (a point on the face or on the axis stays where it is under the turn)
  // the move: a flat face onto the other's plane (plus the gap, along the other's normal); an axis onto the other's axis, keeping its place along it
  let move: Vec3;
  let moverWhenTrue: Vec3; // (a point of the mover's face or axis when the mate is true)
  let tangentSide = 1;
  if (tmo) {
    tangentSide = tmo.side;
    move = tmo.move(rotate(R, a.dir));
    moverWhenTrue = [a.point[0] + move[0], a.point[1] + move[1], a.point[2] + move[2]];
  } else if (mode === "flush") {
    const s = dot(sub(a.point, b.point), b.dir);
    move = [b.dir[0] * (gap - s), b.dir[1] * (gap - s), b.dir[2] * (gap - s)];
    moverWhenTrue = [b.point[0] + b.dir[0] * gap, b.point[1] + b.dir[1] * gap, b.point[2] + b.dir[2] * gap];
  } else if (mode === "coaxial") { // the axes parallel and `gap` apart (0: one axis), keeping its place along the axis; the way it stands off is the way it does now (any way, from one axis)
    const w = sub(a.point, b.point);
    const along = dot(w, b.dir);
    const perp: Vec3 = [w[0] - b.dir[0] * along, w[1] - b.dir[1] * along, w[2] - b.dir[2] * along];
    const pl = length(perp);
    const way: Vec3 = pl > 1e-9 ? [perp[0] / pl, perp[1] / pl, perp[2] / pl] : normalize(Math.abs(b.dir[0]) < 0.9 ? cross(b.dir, [1, 0, 0]) : cross(b.dir, [0, 1, 0]));
    const to: Vec3 = [way[0] * gap, way[1] * gap, way[2] * gap];
    move = [to[0] - perp[0], to[1] - perp[1], to[2] - perp[2]];
    moverWhenTrue = [b.point[0] + b.dir[0] * along + to[0], b.point[1] + b.dir[1] * along + to[1], b.point[2] + b.dir[2] * along + to[2]];
  } else if (mode === "parallel" && counts) { // the planes `gap` apart, on the side it is on now (the turn leaves the point of the face where it is)
    const s = dot(sub(a.point, b.point), b.dir);
    const target = (s >= 0 ? 1 : -1) * gap;
    move = [b.dir[0] * (target - s), b.dir[1] * (target - s), b.dir[2] * (target - s)];
    moverWhenTrue = [b.point[0] + b.dir[0] * target, b.point[1] + b.dir[1] * target, b.point[2] + b.dir[2] * target];
  } else { // only turned: where it is stays (a point of the face or the axis does not move under the turn)
    move = [0, 0, 0];
    moverWhenTrue = a.point;
  }
  const r6 = (v: Vec3): Vec3 => v.map((x) => Math.round(x * 1e6) / 1e6) as unknown as Vec3;
  const turns = eulerXYZ(R);
  const translate = r6(move);
  const own = turns.length + (length(translate) > 1e-9 ? 1 : 0); // (the steps the mate makes before it is recorded: it is true after them)
  // a mate that would put a hard body into another (or, with a clearance, closer to it than that) is not made (`in_477`)
  if (scene.hard?.length && (turns.length || length(translate) > 1e-9)) {
    const R9 = [R[0][0], R[0][1], R[0][2], R[1][0], R[1][1], R[1][2], R[2][0], R[2][1], R[2][2]] as unknown as Rigid["turn"];
    const rp: Vec3 = [R9[0] * pivot[0] + R9[1] * pivot[1] + R9[2] * pivot[2], R9[3] * pivot[0] + R9[4] * pivot[1] + R9[5] * pivot[2], R9[6] * pivot[0] + R9[7] * pivot[1] + R9[8] * pivot[2]];
    const rigid: Rigid = { turn: R9, shift: [pivot[0] - rp[0] + translate[0], pivot[1] - rp[1] + translate[1], pivot[2] - rp[2] + translate[2]], k: 1 };
    const into = hardCollision(scene, [a.body], () => rigid);
    if (into.length) return { why: `the mate would put this body into ${hardNames(scene, into)}: hard bodies do not go into each other${(scene.clearance ?? 0) > 0 ? ` (or nearer than the clearance, ${scene.clearance} mm: give the mate a gap of at least that)` : ""}` };
  }
  const made = mateRelation(again ?? nextId(scene, "r"), mode, mode === "tangent" ? tangentSide : gap, a, b, { mover: { point: moverWhenTrue, dir: turnOnly(mode) || mode === "tangent" ? rotate(R, a.dir) : want }, other: { point: b.point, dir: b.dir } }, counts, standing, scene.steps.length + own);
  const kept = again ? scene.relations.find((r) => r.id === again)?.params : undefined; // (the drive values and limits of a joint stay when the mate is put back)
  if (kept) for (const k of JOINT_KEYS) if (k in kept) made.params![k] = kept[k]!;
  const record: Command = { type: "addRelation", relation: made };
  const forget: Command[] = again ? [{ type: "removeRelation", id: again }] : [];
  if (!turns.length && length(translate) < 1e-9) return { command: { type: "batch", commands: [...forget, record] } }; // (they meet already: only the mate is recorded)
  let id = nextId(scene, "s");
  while (scene.steps.some((st) => st.id.startsWith(id))) id = `${id}_`; // (the steps of an earlier mate are named from its id: s_028m, s_028x0, so the id alone does not show that it is taken)
  const steps: Command[] = turns.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: [a.body], params: { axis: t.axis, value: t.angle, px: pivot[0], py: pivot[1], pz: pivot[2], follow: 1, body: a.bodyId } } }));
  if (length(translate) > 1e-9) steps.push({ type: "addStep", step: { id: `${id}m`, type: "move", parts: [a.body], params: { axis: 0, value: 0, vx: translate[0], vy: translate[1], vz: translate[2], follow: 1, body: a.bodyId } } });
  const carry = carrySketches(scene, turns, translate, pivot, 1, a.bodyId);
  return { command: { type: "batch", commands: [...forget, ...steps, ...carry, record] } };
}

/** The mates that are no longer true (or just `only` this one), and the command that puts the first of them back (the one after it is looked at again once this one is made, for it may have moved what it rests on); null when all are true. */
export function putMatesBack(scene: Scene, only?: string, standingOnly = false): { command: Command; id: string } | null {
  for (const m of mateStatus(scene)) {
    if (m.state !== "off" || !m.mover || !m.other || (only && m.id !== only) || (standingOnly && !m.standing)) continue;
    const r = mateCommand(scene, m.mode, m.mover.ref, m.other.ref, m.gap, m.id, m.counts !== false, !!m.standing);
    if ("command" in r) return { command: r.command, id: m.id };
  }
  return null;
}

/** The numbers a joint keeps on its mate: where it stands now (turn in degrees, slide in mm) and the limits (absent: none). */
const JOINT_KEYS = ["turn", "slide", "turnMin", "turnMax", "slideMin", "slideMax", "turnRest", "slideRest"] as const;
export type JointKey = (typeof JOINT_KEYS)[number];

const withParams = (scene: Scene, mateId: string, set: Partial<Record<JointKey, number | null>>): Command[] => {
  const rel = scene.relations.find((r) => r.id === mateId);
  if (!rel?.params) return [];
  const params = { ...rel.params };
  for (const [k, v] of Object.entries(set)) { if (v === null || v === undefined) delete params[k]; else params[k] = v; }
  return [{ type: "removeRelation", id: mateId }, { type: "addRelation", relation: { ...rel, params } }];
};
/** The limits of a joint as numbers (or none) and where it stands. */
export function jointOf(scene: Scene, mateId: string): Record<"turn" | "slide", { now: number; min?: number; max?: number; /** where it goes back to when nothing holds it away, `in_1020` */ rest?: number }> | null {
  const p = scene.relations.find((r) => r.id === mateId)?.params;
  if (!p) return null;
  const of = (k: "turn" | "slide") => ({ now: p[k] ?? 0, ...(p[`${k}Min`] !== undefined ? { min: p[`${k}Min`]! } : {}), ...(p[`${k}Max`] !== undefined ? { max: p[`${k}Max`]! } : {}), ...(p[`${k}Rest`] !== undefined ? { rest: p[`${k}Rest`]! } : {}) });
  return { turn: of("turn"), slide: of("slide") };
}
/** The command that sets one limit of a joint (or takes it away with null); refused when the limits would cross. */
export function limitCommand(scene: Scene, mateId: string, kind: "turn" | "slide", side: "Min" | "Max", value: number | null): Command | null {
  const j = jointOf(scene, mateId)?.[kind];
  if (!j || (value !== null && !Number.isFinite(value))) return null;
  if (value !== null && (side === "Min" ? value > (j.max ?? Infinity) : value < (j.min ?? -Infinity))) return null;
  return { type: "batch", commands: withParams(scene, mateId, { [`${kind}${side}`]: value }) };
}

/** The command that sets where a joint goes back to when nothing holds it away (degrees or mm, as the joint counts them; null takes it away): a spring, a pawl dropping into the next tooth (`dec_contact_push`, `in_1020`). */
export function restCommand(scene: Scene, mateId: string, kind: "turn" | "slide", rest: number | null): Command | null {
  if (!jointOf(scene, mateId) || (rest !== null && !Number.isFinite(rest))) return null;
  return { type: "batch", commands: withParams(scene, mateId, { [`${kind}Rest`]: rest }) };
}
/** The command that takes both stops of a joint away. */
export function unlimitCommand(scene: Scene, mateId: string, kind: "turn" | "slide"): Command | null {
  return jointOf(scene, mateId) ? { type: "batch", commands: withParams(scene, mateId, { [`${kind}Min`]: null, [`${kind}Max`]: null }) } : null;
}

/**
 * A joint driven (`in_321`): a coaxial mate leaves the first body free to turn about the shared axis (a pivot) and to slide along it (a slider); this is that turn (degrees) or slide (mm) as ordinary steps, with the
 * body's sketches carried. The mate stays true, since the axis is what is kept. The amount is added to where the joint stands, and stops at a limit (`in_322`): asked for more, it goes as far as the limit.
 * Null when the mate is not a true coaxial mate, or the joint cannot go that way.
 */
export function driveCommand(scene: Scene, mateId: string, kind: "turn" | "slide", amount: number): Command | null {
  const m = mateStatus(scene).find((x) => x.id === mateId);
  const j = jointOf(scene, mateId)?.[kind];
  if (!m || !j || m.state !== "ok" || !m.mover || (m.mode !== "coaxial" && m.mode !== "parallelAxes") || !Number.isFinite(amount) || amount === 0) return null;
  const target = Math.min(j.max ?? Infinity, Math.max(j.min ?? -Infinity, j.now + amount));
  const delta = target - j.now;
  if (Math.abs(delta) < 1e-9) return null;
  const a = m.mover;
  let id = nextId(scene, "s");
  while (scene.steps.some((st) => st.id.startsWith(id))) id = `${id}_`;
  const body = a.bodyId;
  const record = withParams(scene, mateId, { [kind]: Math.round(target * 1e6) / 1e6 });
  if (kind === "slide") {
    const d = normalize(a.dir);
    const t: Vec3 = [d[0] * delta, d[1] * delta, d[2] * delta];
    return { type: "batch", commands: [{ type: "addStep", step: { id: `${id}m`, type: "move", parts: [a.body], params: { axis: 0, value: 0, vx: t[0], vy: t[1], vz: t[2], follow: 1, body } } }, ...carrySketches(scene, [], t, a.point, 1, body), ...record] };
  }
  const turns = eulerXYZ(turnAbout(a.dir, (delta * Math.PI) / 180));
  const steps = turns.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: [a.body], params: { axis: t.axis, value: t.angle, px: a.point[0], py: a.point[1], pz: a.point[2], follow: 1, body } } }));
  return { type: "batch", commands: [...steps, ...carrySketches(scene, turns, [0, 0, 0], a.point, 1, body), ...record] };
}

/**
 * A body that was made to turn (`pivot.ts`, `in_912`) turned by `degrees` about its axis, as ordinary steps (the same turns and carried sketches as a joint driven), for keeping the pose of a motion. Null when the body is not there or the turn is nothing.
 */
export function pivotTurnCommand(scene: Scene, body: Ref, point: Vec3, dir: Vec3, degrees: number): Command | null {
  const p = scene.parts[body];
  if (p?.kind !== "body" || !p.id || !Number.isFinite(degrees) || Math.abs(degrees) < 1e-9) return null;
  let id = nextId(scene, "s");
  while (scene.steps.some((st) => st.id.startsWith(id))) id = `${id}_`;
  const turns = eulerXYZ(turnAbout(normalize(dir), (degrees * Math.PI) / 180));
  const steps = turns.map((t, k): Command => ({ type: "addStep", step: { id: `${id}${"xyz"[t.axis]}${k}`, type: "rotate", parts: [body], params: { axis: t.axis, value: t.angle, px: point[0], py: point[1], pz: point[2], follow: 1, body: p.id as string } } }));
  return { type: "batch", commands: [...steps, ...carrySketches(scene, turns, [0, 0, 0], point, 1, p.id as string)] };
}

/**
 * How far driving a joint by `amount` may go before its body meets a hard body (`in_480`): the amount it can make, and the hard bodies it is against at the next step beyond (all of it, and none, when nothing is in the way).
 * Tested along the way, so a thin wall is not stepped over; a pair already overlapping is left out, so a body can be driven out of another.
 */
export function hardDrive(scene: Scene, mateId: string, kind: "turn" | "slide", amount: number): { amount: number; hit: Ref[] } {
  const body = mateStatus(scene).find((x) => x.id === mateId)?.mover?.body;
  if (!body || !scene.hard?.length || !amount) return { amount, hit: [] };
  const into = (a: number): Ref[] => hardCollision(scene, [body], () => jointRigid(scene, mateId, kind, a));
  const t = freePart((u) => into(amount * u).length > 0);
  return t >= 1 ? { amount, hit: [] } : { amount: amount * t, hit: into(amount * Math.min(1, t + 5e-3)) };
}

/** The joint of a body (`in_323`): the mate that leaves it free to turn and slide (it is the first body of a true coaxial mate), where its axis stands and which way it points; or null. */
export function jointOfBody(scene: Scene, body: Ref): { mate: string; point: Vec3; dir: Vec3 } | null {
  const m = mateStatus(scene).find((x) => x.state === "ok" && x.mode === "coaxial" && x.mover?.body === body);
  return m?.mover ? { mate: m.id, point: m.mover.point, dir: normalize(m.mover.dir) } : null;
}
/** What driving a joint by `amount` does to its body, for the picture while a handle is dragged (what is made when it is let go is `driveCommand`). */
export function jointRigid(scene: Scene, mateId: string, kind: "turn" | "slide", amount: number): Rigid | null {
  const c = driveCommand(scene, mateId, kind, amount);
  const steps = (c?.type === "batch" ? c.commands : []).flatMap((x) => (x.type === "addStep" ? [x.step] : [])) as Step[];
  return steps.length ? laterMotion(steps, -1, () => true) : null;
}
/** How far a joint may still go, each way, from where it stands (the stops; infinite when there is none). */
export function jointRoom(scene: Scene, mateId: string, kind: "turn" | "slide"): { down: number; up: number } {
  const j = jointOf(scene, mateId)?.[kind];
  return j ? { down: j.min !== undefined ? j.min - j.now : -Infinity, up: j.max !== undefined ? j.max - j.now : Infinity } : { down: 0, up: 0 };
}

/**
 * The standing mates solved together (`in_329`): when some are not true, the poses of the bodies that make them all true at once (`operation/matesolve.ts`), as turns and moves with the sketches carried, in one batch.
 * `atOdds`: the mates that cannot all hold (nothing is changed then). Empty commands and no mates at odds: nothing is off.
 */
/** The standing mates in `states` as a problem for the solver: the mates, and the bodies they join with their middles. */
function problemOf(scene: Scene, states: readonly MateState[]): { mates: SolveMate[]; bodies: SolveBody[] } {
  const mates: SolveMate[] = states.map((m) => ({ id: m.id, mode: m.mode, gap: m.gap, counts: m.counts !== false, mover: m.mover!.body, other: m.other!.body, a: { point: m.mover!.point, dir: m.mover!.dir, radius: m.mover!.radius, ...(m.mover!.shape ? { shape: m.mover!.shape } : {}), ...(m.mover!.semi !== undefined ? { semi: m.mover!.semi } : {}) }, b: { point: m.other!.point, dir: m.other!.dir, radius: m.other!.radius, ...(m.other!.shape ? { shape: m.other!.shape } : {}), ...(m.other!.semi !== undefined ? { semi: m.other!.semi } : {}) } }));
  const bodies: SolveBody[] = [];
  for (const ref of new Set(mates.flatMap((m) => [m.mover, m.other]))) {
    const w = scene.parts[ref];
    if (w?.kind === "plane" && w.origin === "world") { bodies.push({ id: ref, pivot: w.at, order: -1 }); continue; } // (the world: it stands still, and the first of the set that only moves each other, `in_976`)
    const b = bodyPart(scene, ref as Ref);
    if (!b?.bbox) continue;
    bodies.push({ id: ref, pivot: [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2], order: Number(String(b.id ?? "").replace(/\D/g, "")) || 0 });
  }
  return { mates, bodies };
}

/** The steps that put a body at a pose (turns about its pivot, then a move), with its sketches carried; none when the pose is no change. `k` tells the bodies of one batch apart in the step ids. */
function poseCommands(scene: Scene, ref: Ref, pivot: Vec3, pose: Pose, k: number): Command[] {
  const part = bodyPart(scene, ref);
  if (!part?.id) return [];
  let id = nextId(scene, "s");
  while (scene.steps.some((st) => st.id.startsWith(id))) id = `${id}_`;
  const angle = length(pose.turn);
  const shift = pose.shift.map((v) => Math.round(v * 1e6) / 1e6) as unknown as Vec3;
  const turns = angle > 5e-5 ? eulerXYZ(turnAbout(pose.turn, angle)) : []; // (less than fifty millionths of a radian (three thousandths of a degree), or ten nanometres, is no change: the solver's own rounding)
  if (!turns.length && length(shift) < 1e-5) return [];
  const tag = `${id}b${k}`;
  return [
    ...turns.map((t, j): Command => ({ type: "addStep", step: { id: `${tag}${"xyz"[t.axis]}${j}`, type: "rotate", parts: [ref], params: { axis: t.axis, value: t.angle, px: pivot[0], py: pivot[1], pz: pivot[2], follow: 1, body: part.id! } } })),
    ...(length(shift) >= 1e-5 ? [{ type: "addStep", step: { id: `${tag}m`, type: "move", parts: [ref], params: { axis: 0, value: 0, vx: shift[0], vy: shift[1], vz: shift[2], follow: 1, body: part.id! } } } as Command] : []),
    ...carrySketches(scene, turns, shift, pivot, 1, part.id),
  ];
}

/**
 * What releasing a drag of bodies makes when their standing mates hold them back (`in_340`, `in_345`): only the pose the mates leave, as the turns and move of each body, not the move asked for and then a correction. Null when no mate holds
 * them back (the move asked for is made as it is); an empty batch when the mates leave them nowhere to go that way.
 */
export function heldCommand(scene: Scene, group: readonly Ref[], asked: Rigid, grab?: Vec3): Command | null {
  const held = constrainedMotion(scene, group, asked, grab);
  if (!held) return null;
  const commands: Command[] = [];
  let sc = scene;
  let any = false;
  held.rigids.forEach(({ body, rigid }, k) => {
    const b = bodyPart(sc, body);
    if (!b?.bbox) return;
    const pivot: Vec3 = [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2];
    const pose = poseOfRigid(rigid, pivot);
    if (Math.hypot(...pose.shift) < 1e-2 && Math.hypot(...pose.turn) < 1e-4) return; // (a hundredth of a millimetre: the mates leave it nowhere to go, and the solver's leftovers are not a move)
    const made = poseCommands(sc, body, pivot, pose, k);
    any = any || made.length > 0;
    commands.push(...made);
    const next = apply(sc, { type: "batch", commands: made });
    if (next.ok) sc = next.value;
  });
  return { type: "batch", commands: any ? commands : [] };
}

/**
 * Bodies being dragged (`in_338`, `in_345`): the motion the mates allow that is nearest to the one asked for, and the mates that held it back (they flash). The bodies dragged (the ones selected) move as one; every other body stays where it
 * is, even one that is mated to them. Null when no standing mate holds it back.
 */
let lastGrab: { key: string; pose: Pose } | null = null;
export function constrainedMotion(scene: Scene, group0: readonly Ref[], asked: Rigid, grab?: Vec3): { rigids: { body: Ref; rigid: Rigid }[]; blocked: string[] } | null {
  const group = group0.map((g) => canonBody(scene, g)); // (a body is called one thing here, whether the scene has one body or several, `in_976`)
  const states = mateStatus(scene).filter((m) => m.standing && m.state === "ok" && m.mover && m.other && (group.includes(m.mover.body) !== group.includes(m.other.body)));
  if (!states.length) return null;
  const problem = problemOf(scene, states);
  const mates = problem.mates;
  // (every body dragged, also one that no mate joins to a body that stays: it moves with the others)
  const middle = (b: Scene["parts"][string] | undefined): Vec3 | null => (b?.kind === "body" && b.bbox ? [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2] : null);
  const extra: SolveBody[] = group.flatMap((g) => { const c = middle(bodyPart(scene, g)); return c && !problem.bodies.some((q) => q.id === g) ? [{ id: g, pivot: c, order: 0 }] : []; });
  const bodies = [...problem.bodies, ...extra];
  const members = group.flatMap((g) => { const b = bodies.find((q) => q.id === g); return b ? [b] : []; });
  if (!members.length) return null;
  const at: Vec3 = [members.reduce((t, b) => t + b.pivot[0], 0) / members.length, members.reduce((t, b) => t + b.pivot[1], 0) / members.length, members.reduce((t, b) => t + b.pivot[2], 0) / members.length];
  // (the last pose found is where the next one is looked for from, so a drag goes on from where it was and does not jump between two ways of getting there)
  const key = `${group.join(",")}|${scene.steps.length}`;
  const solved = solveDriven(mates, bodies, group, poseOfRigid(asked, at), grab, lastGrab?.key === key ? lastGrab.pose : undefined);
  if (!solved.blockedBy.length) { lastGrab = null; return null; }
  if (grab) lastGrab = { key, pose: solved.pose };
  return { rigids: members.map((b) => ({ body: b.id as Ref, rigid: rigidOfPose(poseForBody(solved.pose, solved.at, b.pivot), b.pivot) })), blocked: solved.reached ? [] : solved.blockedBy };
}

export function solveStanding(scene: Scene): { commands: Command[]; atOdds: string[]; /** the hard bodies the bodies would be in where the mates leave them (`in_480`) */ hard?: string } {
  const states = mateStatus(scene).filter((m) => m.standing && m.state !== "lost" && m.mover && m.other);
  if (!states.some((m) => m.state === "off")) return { commands: [], atOdds: [] };
  const { mates, bodies } = problemOf(scene, states);
  const solved = solvePoses(mates, bodies);
  if (!solved.ok) return { commands: [], atOdds: solved.atOdds };
  // a chain of mates settled together may leave one of its bodies in a hard body: then none of it is made, and the mates stay off, with the reason (`in_480`)
  if (scene.hard?.length) {
    const rigid = (b: Ref): Rigid | null => { const pose = solved.poses.get(b); const body = bodies.find((q) => q.id === b); return pose && body ? rigidOfPose(pose, body.pivot) : null; };
    const into = hardCollision(scene, [...solved.poses.keys()] as Ref[], rigid);
    if (into.length) return { commands: [], atOdds: states.filter((m) => m.state === "off").map((m) => m.id), hard: hardNames(scene, into) };
  }
  const commands = [...solved.poses].flatMap(([ref, pose], k) => { const body = bodies.find((b) => b.id === ref); return body ? poseCommands(scene, ref as Ref, body.pivot, pose, k) : []; });
  return { commands, atOdds: [] };
}

/** A mate made again at another number (its gap, offset, distance or angle), typed over on its bubble (`in_338`); null when its faces are not found or the number is not one it can take. */
export function setMateValue(scene: Scene, id: string, value: number): Command | null {
  const m = mateStatus(scene).find((x) => x.id === id);
  if (!m || !m.mover || !m.other || !Number.isFinite(value)) return null;
  const angle = m.mode === "angle" || m.mode === "angleAxes";
  const v = angle ? Math.min(180, Math.max(0, value)) : Math.max(0, value);
  const r = mateCommand(scene, m.mode, m.mover.ref, m.other.ref, v, id, m.counts !== false, !!m.standing);
  return "command" in r ? r.command : null;
}

/**
 * A command that moves or turns a whole body is solved against the body's standing mates before it is made (`in_343`), so the state never leaves the mates: what is made is the pose the mates leave it at, the steps of the move that was
 * asked for are not made. Returns the command to make; null when the mates leave the body nowhere to go that way (nothing is made); the command itself when it moves no body, or no mate holds the move back.
 */
/** The standing mates that hold the bodies a move or turn command moves (each between one of them and a body that stays): the ones to offer to delete when the move is refused (`in_436`). */
export function mateHolders(scene: Scene, c: Command): string[] {
  const flat = (x: Command): Command[] => (x.type === "batch" ? x.commands.flatMap(flat) : [x]);
  const bodies = new Set(flat(c).flatMap((x) => (x.type === "addStep" && (x.step.type === "move" || x.step.type === "rotate") && x.step.params.body ? [canonBody(scene, x.step.parts[0]!)] : [])));
  return mateStatus(scene).filter((m) => m.standing && m.state === "ok" && m.mover && m.other && bodies.has(m.mover.body) !== bodies.has(m.other.body)).map((m) => m.id);
}
export function projectOnMates(scene: Scene, c: Command): Command | null {
  const flat = (x: Command): Command[] => (x.type === "batch" ? x.commands.flatMap(flat) : [x]);
  const list = flat(c);
  if (list.some((x) => x.type === "addRelation" || x.type === "removeRelation")) return c; // (a mate being made or taken away is not a move)
  const motion = list.flatMap((x) => (x.type === "addStep" && (x.step.type === "move" || x.step.type === "rotate") && Number(x.step.params.follow) === 1 && x.step.params.body ? [x.step] : []));
  if (!motion.length) return c;
  // (the rest of the command is only what carries the sketches of the bodies along with them)
  if (list.some((x) => x.type !== "addStep" && x.type !== "transformFigure")) return c;
  const bodies = [...new Set(motion.map((st) => st.parts[0]!))];
  if (bodies.some((b) => scene.parts[b]?.kind !== "body")) return c;
  // each body's motion; bodies that are moved together are moved by the same (a drag of the selected bodies)
  const rigids = bodies.map((b) => laterMotion(motion.filter((st) => st.parts[0] === b), -1, () => true));
  const same = rigids.every((r) => r.turn.every((v, i) => Math.abs(v - rigids[0]!.turn[i]!) < 1e-9) && r.shift.every((v, i) => Math.abs(v - rigids[0]!.shift[i]!) < 1e-9));
  if (!same) return c;
  const held = heldCommand(scene, bodies, rigids[0]!);
  if (!held) return c;
  return held.type === "batch" && !held.commands.length ? null : held;
}
