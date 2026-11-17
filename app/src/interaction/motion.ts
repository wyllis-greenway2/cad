// A joint played and scrubbed (`dec_mechanism_motion`, stage 1; `in_803`): the body of a pivot or a slider is drawn turned or slid by an amount that changes with time (play) or is set (the scrubber). The amount is counted from where the
// joint stands in the history (its rest), and nothing is written: the picture is moved by a matrix on the graphics card (the way a joint's handle is dragged, `in_323`); stopping puts it back; keeping the pose writes the ordinary drive
// step (`mate.ts` `driveCommand`). Pure: a scene and a time in; a matrix out. The axis of the joint is worked out once, when the motion starts, not for every frame.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import { normalize } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { mateStatus } from "../operation/mates.ts";
import { jointRoom } from "./mate.ts";

export type JointKind = "turn" | "slide";
export interface Motion {
  mate: string;
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
}
/** The span a joint with no stops is scrubbed and swung over: a turn goes right round either way, a slide as far as the body is wide again. */
const FREE_TURN = 180, FREE_SLIDE = 30;

/** The motion of the joint that the body is the first of (a true coaxial mate), or the reason there is none. */
export function startMotion(scene: Scene, body: Ref, kind: JointKind = "turn"): { ok: true; motion: Motion } | { ok: false; why: string } {
  const m = mateStatus(scene).find((x) => x.state === "ok" && x.mode === "coaxial" && x.mover?.body === body);
  if (!m?.mover) return { ok: false, why: "select a body that turns on a pin or slides on a rod (the first body of a coaxial mate)" };
  const room = jointRoom(scene, m.id, kind);
  const free = !Number.isFinite(room.down) || !Number.isFinite(room.up);
  const [lo, hi] = free ? (kind === "turn" ? [-FREE_TURN, FREE_TURN] : [-FREE_SLIDE, FREE_SLIDE]) : [room.down, room.up];
  if (hi - lo < 1e-9) return { ok: false, why: "the joint's stops leave it no room to move" };
  return { ok: true, motion: { mate: m.id, kind, body, point: m.mover.point, dir: normalize(m.mover.dir), amount: 0, lo, hi, free, playing: false, from: 0, startedAt: null, speed: kind === "turn" ? 60 : 10 } };
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
/** Playing stops where it is (and a stopped one starts from where it stands). */
export function setPlaying(m: Motion, on: boolean): Motion {
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
