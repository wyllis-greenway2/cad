// A hand-made link between two joints (`dec_mechanism_motion`, choice 5; `in_833`): when the first joint moves by an amount, the second moves by that amount times a ratio. Each end is the coaxial mate of a pin or a rod (the joint of its first body), and
// turns (degrees) or slides (mm); a turn that moves a slide has a ratio in mm for a degree, and the other way round. The scene keeps the links (`Scene.couplings`); the pose is not kept. Pure: scenes in, scenes and followers out.
import type { Result } from "../shared/result.ts";
import { ok, err } from "../shared/result.ts";
import type { Scene } from "./scene.ts";
import { mateStatus } from "./mates.ts";
import { normalize } from "../math/vec.ts";
import type { Follower } from "./gearcouple.ts";

export type JointKind = "turn" | "slide";
/** `a` and `b` are mate ids (coaxial mates); the amount of `b` is `ratio` times the amount of `a`. */
export interface Coupling { id: string; a: string; b: string; ka: JointKind; kb: JointKind; ratio: number }
const couplingsOf = (s: Scene): readonly Coupling[] => s.couplings ?? [];

const joint = (s: Scene, mate: string) => mateStatus(s).find((m) => m.id === mate && m.state === "ok" && m.mode === "coaxial" && m.mover);
const nextId = (s: Scene): string => { let n = couplingsOf(s).length + 1; while (couplingsOf(s).some((c) => c.id === `l_${String(n).padStart(3, "0")}`)) n++; return `l_${String(n).padStart(3, "0")}`; };

/** A link made: the two joints have to be true coaxial mates, different, and the ratio a number other than nothing. */
export function addCoupling(s: Scene, c: Omit<Coupling, "id"> & { id?: string }): Result<Scene> {
  if (c.a === c.b) return err("a joint cannot be linked to itself");
  if (!joint(s, c.a) || !joint(s, c.b)) return err("both ends of a link must be a pin or a rod (a true coaxial mate)");
  if (!Number.isFinite(c.ratio) || c.ratio === 0) return err("the ratio has to be a number other than nothing");
  const id = c.id ?? nextId(s);
  if (couplingsOf(s).some((q) => q.id === id)) return err(`link ${id} already exists`);
  if (couplingsOf(s).some((q) => (q.a === c.a && q.b === c.b) || (q.a === c.b && q.b === c.a))) return err("these two joints are linked already: change that link's ratio");
  return ok({ ...s, couplings: [...couplingsOf(s), { id, a: c.a, b: c.b, ka: c.ka, kb: c.kb, ratio: c.ratio }] });
}
/** New numbers for a link (its ratio, and what each end does). */
export function setCoupling(s: Scene, id: string, patch: Partial<Pick<Coupling, "ratio" | "ka" | "kb">>): Result<Scene> {
  const q = couplingsOf(s).find((x) => x.id === id);
  if (!q) return err(`link ${id} does not exist`);
  const next = { ...q, ...patch };
  if (!Number.isFinite(next.ratio) || next.ratio === 0) return err("the ratio has to be a number other than nothing");
  return ok({ ...s, couplings: couplingsOf(s).map((x) => (x === q ? next : x)) });
}
export function deleteCoupling(s: Scene, id: string): Result<Scene> {
  if (!couplingsOf(s).some((x) => x.id === id)) return err(`link ${id} does not exist`);
  const left = couplingsOf(s).filter((x) => x.id !== id);
  const { couplings: _c, ...rest } = s;
  return ok(left.length ? { ...rest, couplings: left } : rest);
}

/** The links that touch a joint, as seen from it: the other joint, what that one does, and its amount for each of this one's. */
export function linksOf(s: Scene, mate: string, kind: JointKind): { id: string; other: string; kind: JointKind; k: number }[] {
  const out: { id: string; other: string; kind: JointKind; k: number }[] = [];
  for (const c of couplingsOf(s)) {
    if (c.a === mate && c.ka === kind) out.push({ id: c.id, other: c.b, kind: c.kb, k: c.ratio });
    else if (c.b === mate && c.kb === kind) out.push({ id: c.id, other: c.a, kind: c.ka, k: 1 / c.ratio });
  }
  return out;
}
/** Everything the joint moves through links, link by link (the ratios multiplied along a chain), each as a follower with its own axis and body. */
export function linkFollowers(s: Scene, mate: string, kind: JointKind): Follower[] {
  const seen = new Map<string, number>([[mate, 1]]);
  const out: Follower[] = [];
  const queue: { mate: string; kind: JointKind }[] = [{ mate, kind }];
  const status = mateStatus(s);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const l of linksOf(s, cur.mate, cur.kind)) {
      if (seen.has(l.other)) continue;
      const k = seen.get(cur.mate)! * l.k;
      seen.set(l.other, k);
      queue.push({ mate: l.other, kind: l.kind });
      const m = status.find((x) => x.id === l.other && x.state === "ok" && x.mode === "coaxial" && x.mover);
      if (m?.mover) out.push({ gear: "", body: m.mover.body, kind: l.kind, point: m.mover.point, dir: normalize(m.mover.dir), k, mate: l.other });
    }
  }
  return out;
}
