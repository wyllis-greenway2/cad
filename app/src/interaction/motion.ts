// A joint played and scrubbed (`dec_mechanism_motion`, stage 1; `in_824`): the body of a pivot or a slider is drawn turned or slid by an amount that changes with time (play) or is set (the scrubber). The amount is counted from where the
// joint stands in the history (its rest), and nothing is written: the picture is moved by a matrix on the graphics card (the way a joint's handle is dragged, `in_323`); stopping puts it back; keeping the pose writes the ordinary drive
// step (`mate.ts` `driveCommand`). Pure: a scene and a time in; a matrix out. The axis of the joint is worked out once, when the motion starts, not for every frame.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { mateStatus } from "../operation/mates.ts";
import { jointRoom, driveCommand, pivotTurnCommand, jointOf as mateJoint } from "./mate.ts";
import type { Command } from "../operation/commands.ts";
import { apply } from "../operation/commands.ts";
import { followersOf, gearAxis, gearOfBody, genevaPlay, carrierPlay, modelPlay } from "../operation/gearcouple.ts";
import type { Follower } from "../operation/gearcouple.ts";
import type { ContactState } from "./contact.ts";
import { startContact } from "./contact.ts";
import { pivotOfBody, pivotsOf } from "../operation/pivot.ts";
import { isHard, isFixed } from "./hard.ts";
import type { Candidate } from "./contact.ts";
import { restartContact } from "./contact.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import { followAmount } from "../operation/gearcouple.ts";
import type { FixPlan } from "./fixmotion.ts";
import { linkFollowers } from "../operation/coupling.ts";

export type JointKind = "turn" | "slide";
export interface Motion {
  /** the joint's mate, or "" when it is a gear that is played (`gear`) */
  mate: string;
  /** a gear played: the gears it turns (or racks it slides) each by its own matrix, from the meshes it was made with (`gearcouple.ts`, stage 2) */
  gear?: string;
  follows: Follower[];
  kind: JointKind;
  /** the body that moves (the first of the coaxial mate) */
  body: Ref;
  /** a point on the joint's axis, and its direction */
  point: Vec3;
  dir: Vec3;
  /** where it is now, from the rest: degrees for a turn, mm for a slide */
  amount: number;
  /** the range the scrubber and the swing cover: the stops, or a span when there are none */
  lo: number;
  hi: number;
  /** whether the stops are real (a joint with none, turning, goes round and round) */
  free: boolean;
  playing: boolean;
  /** play: where it started (the amount, and the time in ms the clock gave); null until the first frame sets it */
  from: number;
  startedAt: number | null;
  /** degrees a second for a turn, mm a second for a slide */
  speed: number;
  /** when the pose cannot be kept: why (a Geneva drive stays one drawing) */
  noKeep?: string;
  /** a gear meshed with this one that is not turned along, and why (a pair of a kind that is not worked out): said when the motion starts, so a partner that stands still is not a mystery (`in_1117`) */
  note?: string;
  /** contact push (`contact.ts`): the bodies that yield and where the motion stands; the followers they make this frame */
  contact?: ContactState;
  yields?: Follower[];
  /** the walk through the joints that would take the place of the push (`fixmotion.ts`): the offers, the one shown, and what has been made so far */
  fix?: { plan: FixPlan; i: number; made: string[] } | null;
}
/** The span a joint with no stops is scrubbed and swung over: a turn goes right round either way, a slide as far as the body is wide again. */
const FREE_TURN = 180, FREE_SLIDE = 30;

/** The motion of the joint that the body is the first of (a true coaxial mate), or the reason there is none. */
export function startPlain(scene: Scene, body: Ref, kind: JointKind = "turn"): { ok: true; motion: Motion } | { ok: false; why: string } {
  const m = mateStatus(scene).find((x) => x.state === "ok" && x.mode === "coaxial" && x.mover?.body === body);
  const mp = m?.mover ? null : modelPlay(scene, body);
  if (mp) return { ok: true, motion: { mate: "", gear: "", follows: mp.followers, kind: "turn", body: mp.driver.body, point: mp.driver.point, dir: mp.driver.dir, amount: 0, lo: -FREE_TURN, hi: FREE_TURN, free: true, playing: false, from: 0, startedAt: null, speed: 30, noKeep: "a model is played as one picture: its pose is not kept", note: mp.note } }; // (a gear assembly model, `dec_gear_models`)
  const cp = m?.mover ? null : carrierPlay(scene, body);
  if (cp) return { ok: true, motion: { mate: "", gear: "", follows: cp.followers, kind: "turn", body, point: cp.driver.point, dir: cp.driver.dir, amount: 0, lo: -FREE_TURN, hi: FREE_TURN, free: true, playing: false, from: 0, startedAt: null, speed: 30, noKeep: "a turning carrier is a pose of the whole set: turn the set with Edit (its Turn field) instead" } };
  if (!m?.mover) { // not a pin or a rod: a gear that was made with its body, which turns (or a rack, which slides) and takes the gears meshed with it along
    const g = gearOfBody(scene, body);
    const ax = g ? gearAxis(scene, g) : null;
    const gp = g ? genevaPlay(scene, g, body) : null;
    if (gp) return "why" in gp ? { ok: false, why: gp.why } : { ok: true, motion: { mate: "", gear: g!.id, follows: gp.followers, kind: "turn", body, point: gp.driver.point, dir: gp.driver.dir, amount: 0, lo: -FREE_TURN, hi: FREE_TURN, free: true, playing: false, from: 0, startedAt: null, speed: 60, noKeep: "a Geneva drive is one drawing: turn it with Edit cam instead" } };
    if (!g || !ax) {
      const pv = pivotOfBody(scene, body); // (a body made to turn: about an axis of its own, with no partner)
      if (pv) return { ok: true, motion: { mate: "", gear: "", follows: [], kind: "turn", body, point: pv.point, dir: pv.dir, amount: 0, lo: -FREE_TURN, hi: FREE_TURN, free: true, playing: false, from: 0, startedAt: null, speed: 45 } };
      return { ok: false, why: "select a body that turns on a pin or slides on a rod (the first body of a coaxial mate), a gear with its body, or any body after Pivot" };
    }
    const { followers, why } = followersOf(scene, g);
    const [lo, hi] = ax.kind === "turn" ? [-FREE_TURN, FREE_TURN] : [-FREE_SLIDE, FREE_SLIDE];
    const hasWorm = [g.id, ...followers.map((f) => f.gear)].some((id) => scene.gears?.find((q) => q.id === id)?.spec.worm); // (a worm's record has no turn about its own length: the pose of the thread cannot be written, `in_1117`)
    return { ok: true, motion: { mate: "", gear: g.id, follows: followers, kind: ax.kind, body, point: ax.point, dir: ax.dir, amount: 0, lo, hi, free: true, playing: false, from: 0, startedAt: null, speed: ax.kind === "turn" ? 45 : 8, ...(why ? { note: `something meshed with this stays where it is: ${why}` } : {}), ...(hasWorm ? { noKeep: "a worm's pose is the phase of its thread, which is not kept: the worm and its wheel stay as they were drawn" } : {}) } };
  }
  const room = jointRoom(scene, m.id, kind);
  const free = !Number.isFinite(room.down) || !Number.isFinite(room.up);
  const [lo, hi] = free ? (kind === "turn" ? [-FREE_TURN, FREE_TURN] : [-FREE_SLIDE, FREE_SLIDE]) : [room.down, room.up];
  if (hi - lo < 1e-9) return { ok: false, why: "the joint's stops leave it no room to move" };
  return { ok: true, motion: { mate: m.id, follows: linkFollowers(scene, m.id, kind), kind, body, point: m.mover.point, dir: normalize(m.mover.dir), amount: 0, lo, hi, free, playing: false, from: 0, startedAt: null, speed: kind === "turn" ? 60 : 10 } };
}

/** The motion of the body that is played or the joint it is the first of (`startPlain`), and, when a hard body is in the mechanism, with contact push on (`contact.ts`, `dec_contact_push`): the bodies that can yield are the wheel of a Geneva drive (which then yields instead of following its formula) and the first body of each coaxial mate that nothing else here moves. */
export function startMotion(scene: Scene, body: Ref, kind: JointKind = "turn", outcome?: CompileOutcome): { ok: true; motion: Motion } | { ok: false; why: string } {
  const r = startPlain(scene, body, kind);
  if (!r.ok || !scene.hard?.length) return r;
  const m = r.motion;
  const wheel = m.follows.find((f) => f.geneva);
  const camRod = m.follows.find((f) => f.table); // (a cam's follower: with a hard body here it rides the cam by contact, going back to where it began when the cam lets it)
  const candidates: Candidate[] = wheel ? [{ body: wheel.body, point: wheel.point, dir: wheel.dir }] : [];
  if (camRod) { const way: 1 | -1 = camRod.table!.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0) < 0 ? -1 : 1; candidates.push({ body: camRod.body, kind: "slide", ...(camRod.mate ? { mate: camRod.mate } : {}), point: camRod.point, dir: camRod.dir, rest: -way * 50, way }); } // (the way the cam pushes it, and the rest: toward the cam, as far as it is clear to)
  for (const pv of pivotsOf(scene)) { const b = Object.values(scene.parts).find((p) => p.kind === "body" && p.id === pv.body); if (b && b.ref !== m.body && !candidates.some((c) => c.body === b.ref)) candidates.push({ body: b.ref, point: pv.point, dir: pv.dir, ...(pv.rest !== undefined ? { rest: pv.rest } : {}) }); } // (a body made to turn can yield)
  for (const j of mateStatus(scene)) if (j.state === "ok" && j.mode === "coaxial" && j.mover && j.mover.body !== m.body && !candidates.some((c) => c.body === j.mover!.body)) { const jr = mateJoint(scene, j.id)?.turn; candidates.push({ body: j.mover.body, mate: j.id, point: j.mover.point, dir: normalize(j.mover.dir), ...(jr?.rest !== undefined ? { rest: jr.rest - jr.now } : {}) }); } // (a joint's rest, where the joint counts from: the body is drawn where it stands now)
  // a hard body with no joint, no mate and no mark of being fixed is pushed aside by what it meets (`dec_contact_push`, free push); a fixed one, or one with a mate, stays a wall
  const mated = new Set<Ref>(); for (const j of mateStatus(scene)) { if (j.mover) mated.add(j.mover.body); if (j.other) mated.add(j.other.body); }
  const jointed = new Set<Ref>([m.body, ...m.follows.map((f) => f.body), ...candidates.map((c) => c.body)]);
  for (const b of Object.values(scene.parts)) {
    if (b.kind !== "body" || !b.id || !isHard(scene, b.ref) || isFixed(scene, b.ref) || jointed.has(b.ref) || mated.has(b.ref) || pivotOfBody(scene, b.ref) || !b.bbox) continue;
    candidates.push({ body: b.ref, point: [(b.bbox.min[0] + b.bbox.max[0]) / 2, (b.bbox.min[1] + b.bbox.max[1]) / 2, (b.bbox.min[2] + b.bbox.max[2]) / 2], dir: [0, 0, 1], free: true, reach: Math.hypot(b.bbox.max[0] - b.bbox.min[0], b.bbox.max[1] - b.bbox.min[1], b.bbox.max[2] - b.bbox.min[2]) / 2 }); // (how far its outline reaches from its middle: half the diagonal of its box)
  }
  const stripped: Motion = wheel || camRod ? { ...m, follows: m.follows.filter((f) => f !== wheel && f !== camRod) } : m;
  const contact = startContact(scene, stripped, candidates, outcome);
  const keepable = !!contact && contact.pushables.every((p) => !!p.mate || !!pivotOfBody(scene, p.body)); // (a pose by contact is kept for yielders that are joints: a mate's or a pivot's; not the wheel of a Geneva drive, which is one drawing)
  return { ok: true, motion: contact ? { ...stripped, contact, ...(m.noKeep ? { noKeep: m.noKeep } : keepable ? {} : { noKeep: "a pose found by contact is kept only when every body that yields turns on a pin or a pivot or slides on a rod" }),  yields: contact.pushables.map((p): Follower => ({ gear: "", body: p.body, kind: p.kind, point: p.point, dir: p.dir, k: 0, value: 0, ...(camRod && p.body === camRod.body && camRod.mate ? { mate: camRod.mate } : {}) })) } : m };
}

/** The amount at a time (ms): a joint with no stops that turns goes on turning; any other swings from stop to stop and back. */
export function amountAt(m: Motion, now: number): number {
  if (!m.playing || m.startedAt === null) return m.amount;
  const s = (m.speed * (now - m.startedAt)) / 1000;
  if (m.free && m.kind === "turn") return m.from + s;
  const span = m.hi - m.lo;
  const w = (((m.from - m.lo + s) % (2 * span)) + 2 * span) % (2 * span);
  return m.lo + (w <= span ? w : 2 * span - w);
}
/** One frame later: the clock is read, the start is set on the first frame, and the amount moves on. */
export function tickMotion(m: Motion, now: number): Motion {
  if (!m.playing) return m;
  const started = m.startedAt === null ? { ...m, startedAt: now, from: m.amount } : m;
  return { ...started, amount: amountAt(started, now) };
}
const mul4 = (a: number[], b: number[]): number[] => Array.from({ length: 16 }, (_, i) => { const [c, r] = [Math.floor(i / 4), i % 4]; return a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!; });
/** The matrix of a follower when the driver is at `a`: its own turn or slide (`followAmount`), and for a planet on a turning carrier the orbit after it. */
export function followMatrix(f: Follower, a: number): number[] {
  const first = jointMatrix(f, followAmount(f, a));
  return f.after ? mul4(jointMatrix({ kind: "turn", point: f.after.point, dir: f.after.dir }, f.after.k * a), first) : first;
}
/** The other way round: the speed changes sign, and a motion that is playing goes on from where it stands. */
export function reverseMotion(m: Motion): Motion {
  const r = { ...m, speed: -m.speed };
  return m.playing ? { ...r, from: m.amount, startedAt: null } : r;
}
/** Playing stops where it is (and a stopped one starts from where it stands). */
export function setPlaying(m: Motion, on: boolean): Motion {
  // play pressed after a jam: the motion begins again from the start (the same jam would come at once from where it stopped)
  if (on && m.contact?.jam) { const r = restartContact(m.contact, m.kind === "turn" ? m.dir : undefined); return { ...m, amount: 0, from: 0, playing: true, startedAt: null, contact: r.contact, yields: r.yields }; }
  return on ? { ...m, playing: true, startedAt: null, from: m.amount } : { ...m, playing: false, startedAt: null };
}

/** The matrix (a 4 x 4, column by column, as a graphics card takes it) that moves the body by this amount about the joint's axis: a turn about the axis through the point (the right hand rule, as `driveCommand` turns it), or a slide along it. */
export function jointMatrix(m: Pick<Motion, "kind" | "point" | "dir">, amount: number): number[] {
  const d = normalize(m.dir);
  if (m.kind === "slide") return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d[0] * amount, d[1] * amount, d[2] * amount, 1];
  const a = (amount * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const [x, y, z] = d;
  const t = 1 - c;
  const r = [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; // (row by row)
  const p = m.point;
  const shift: Vec3 = [p[0] - (r[0]! * p[0] + r[1]! * p[1] + r[2]! * p[2]), p[1] - (r[3]! * p[0] + r[4]! * p[1] + r[5]! * p[2]), p[2] - (r[6]! * p[0] + r[7]! * p[1] + r[8]! * p[2])];
  return [r[0]!, r[3]!, r[6]!, 0, r[1]!, r[4]!, r[7]!, 0, r[2]!, r[5]!, r[8]!, 0, shift[0], shift[1], shift[2], 1];
}

/** The command that keeps the pose: a joint's drive step; or, for a gear played, each gear (and the racks) set to where it stands, as `setGear` does (the record's turn or its centre), in one batch so one undo. Null when there is nothing to keep. */
export function keepCommand(scene: Scene, m: Motion): Command | null {
  const yielded = (m.yields ?? []).some((f) => Math.abs(f.value ?? 0) > 1e-9);
  if ((Math.abs(m.amount) < 1e-9 && !yielded) || m.noKeep) return null;
  const drives = (from: Scene): Drive[] => [
    ...(m.mate ? [{ mate: m.mate, kind: m.kind, by: m.amount }] : !m.gear && pivotOfBody(from, m.body) ? [{ pivot: m.body, kind: "turn" as const, by: m.amount }] : []), // (a joint, or a body made to turn)
    ...m.follows.flatMap((f) => (f.mate ? [{ mate: f.mate, kind: f.kind, by: followAmount(f, m.amount) }] : [])), // (the joints linked to it, by their ratios; a cam's follower)
    ...(m.yields ?? []).flatMap((f): Drive[] => (f.mate ? [{ mate: f.mate, kind: f.kind, by: f.value ?? 0 }] : pivotOfBody(from, f.body) ? [{ pivot: f.body, kind: "turn", by: f.value ?? 0 }] : [])), // (the bodies that yielded by contact, where they stand)
  ];
  if (!m.gear) return batchOf(keepJoints(scene, drives(scene)));
  const moves: { gear: string; kind: "turn" | "slide"; dir: Vec3; k: number }[] = [{ gear: m.gear, kind: m.kind, dir: m.dir, k: 1 }, ...m.follows.filter((f) => !f.mate).map((f) => ({ gear: f.gear, kind: f.kind, dir: f.dir, k: f.k }))];
  const commands: Command[] = [];
  for (const mv of moves) {
    const rec = scene.gears?.find((g) => g.id === mv.gear);
    if (!rec) continue;
    const by = mv.k * m.amount;
    if (mv.kind === "turn") commands.push({ type: "setGear", id: rec.id, spec: rec.spec, turn: (rec.turn ?? 0) + (by * Math.PI) / 180 });
    else commands.push({ type: "setGear", id: rec.id, spec: rec.spec, at: [rec.at[0] + mv.dir[0] * by, rec.at[1] + mv.dir[1] * by, rec.at[2] + mv.dir[2] * by] });
  }
  let cur = scene;
  for (const c of commands) { const next = apply(cur, c); if (next.ok) cur = next.value; }
  const rest = drives(cur).filter((d) => !(d.mate === m.mate && m.mate)); // (a gear's joints: a cam's follower rod, what yielded)
  return batchOf([...commands, ...keepJoints(cur, rest)]);
}
interface Drive { mate?: string; pivot?: Ref; kind: JointKind; by: number }
const batchOf = (commands: Command[]): Command | null => (commands.length > 1 ? { type: "batch", commands } : commands[0] ?? null);
/** The steps that drive each joint (a mate's, or a pivot's body) by its amount, one after the other, each worked out on the scene the one before leaves (so the steps have their own names and a body that carries another goes with it). */
function keepJoints(scene: Scene, drives: Drive[]): Command[] {
  const commands: Command[] = [];
  let cur = scene;
  for (const d of drives) {
    let c: Command | null = null;
    if (d.mate) c = driveCommand(cur, d.mate, d.kind, d.by);
    else if (d.pivot) { const pv = pivotOfBody(cur, d.pivot); c = pv ? pivotTurnCommand(cur, d.pivot, pv.point, pv.dir, d.by) : null; }
    if (!c) continue;
    commands.push(c);
    const next = apply(cur, c);
    if (next.ok) cur = next.value;
  }
  return commands;
}
