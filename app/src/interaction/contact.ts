// Contact push (`dec_contact_push`, provisional; `in_904`): while a motion plays, a body that is hard and in the way of a moving body yields along its own joint by the smallest amount that clears it, and a moving body that meets a hard body it cannot push
// stops (a jam, said in words). Built on the mesh test of the hard bodies (`operation/collide.ts`); nothing is written to the model. A pose of the motion is worked out in small steps (a degree, half a millimetre), so a wheel that follows a pin is found
// where it stands at each step, not jumped to. Pure: a scene and a motion in, a motion out.
//   Who takes part: the bodies that move in the motion (the driver, and what its couplings carry), the bodies that can yield (the wheel of a Geneva drive, the first body of a coaxial mate that nothing else moves) and, as walls, every other body; a pair
//   is tested when either is hard (`meets`, `in_490`), and when any body that moves is hard, those that move or yield are all tested against each other (marking one body of a mechanism is enough). A pair a mate joins is never tested (a pin in its
//   hole is in contact by design). Two layers of a mechanism rest face to face; the mesh test counts a face on a face as a hit, so each pair is tested only on the part of each body that overlaps the other in height along the joint's axis.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { collidesMoving, buildTree, collides } from "../operation/collide.ts";
import type { Tree } from "../operation/collide.ts";
import { jointOf, compose, inverse } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
import { followAmount } from "../operation/gearcouple.ts";
import type { Follower } from "../operation/gearcouple.ts";
import { mateStatus } from "../operation/mates.ts";
import { meshOf, isHard, meets } from "./hard.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { Motion } from "./motion.ts";

/** A body that yields: it turns about the axis through `point` with direction `dir` (or slides along `dir`), and stands at `value` degrees (mm) from where it was drawn. `rest`: where it goes back to when nothing holds it away (a spring, gravity: a follower dropping off a cam), as far as it is clear to. */
export interface Pushable { body: Ref; kind: "turn" | "slide"; point: Vec3; dir: Vec3; value: number; /** the way it last went, so a tie goes on the same way */ way: 1 | -1; rest?: number }
export interface Candidate { body: Ref; kind?: "turn" | "slide"; point: Vec3; dir: Vec3; rest?: number; way?: 1 | -1 }
export interface ContactState {
  pushables: Pushable[];
  /** the amount of the driver that was last worked out */
  at: number;
  /** why the motion stopped, or null */
  jam: string | null;
  /** the pairs ("a|b") that were already overlapping where the motion began: left out, so a body can be pulled out of another */
  ignore: string[];
}
const MAX_PUSH = 12.8, STEP = 1, MAX_STEPS = 360;
const nameOf = (scene: Scene, r: Ref): string => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; };

// ---- the triangles of a body: all of them, from the kernel's mesh ----
/** The face planes of a body (`meshOf`) leave out the walls of a gear's teeth (a spline's walls are not parts of the scene), so a pair of gears never met. The kernel's own mesh has every face of the body; this reads it by the faces' ranges (the index list, three entries a triangle). */
const kernelMeshes = new WeakMap<object, Map<Ref, { tris: number[]; tree: Tree } | null>>();
function bodyMesh(scene: Scene, outcome: CompileOutcome | undefined, ref: Ref): { tris: number[]; tree: Tree } | null {
  const k = outcome?.kernel;
  const b = scene.parts[ref];
  if (!outcome || !k?.mesh || !k.faces || b?.kind !== "body" || !b.id) return meshOf(scene, ref);
  let per = kernelMeshes.get(outcome);
  if (!per) { per = new Map(); kernelMeshes.set(outcome, per); }
  const had = per.get(ref);
  if (had !== undefined) return had;
  const index = k.bodies ? k.bodies.findIndex((x) => x.id === b.id) : 0;
  const several = (k.bodies?.length ?? 1) > 1;
  let out: { tris: number[]; tree: Tree } | null = null;
  if (index >= 0) {
    const { vertices: v, triangles: t } = k.mesh;
    const tris: number[] = [];
    for (const f of k.faces) {
      if (several && f.body !== index) continue;
      const ranges = (f.ranges as { start: number; count: number }[] | undefined) ?? [{ start: f.start, count: f.count }];
      for (const r of ranges) for (let i = r.start; i + 2 < r.start + r.count; i += 3) for (let c = 0; c < 3; c++) { const vi = t[i + c]! * 3; tris.push(v[vi]!, v[vi + 1]!, v[vi + 2]!); }
    }
    if (tris.length) out = { tris, tree: buildTree(tris) };
  }
  per.set(ref, out ?? meshOf(scene, ref));
  return per.get(ref)!;
}

// ---- the part of two bodies that can meet: their overlap in height along an axis ----
const layerCache = new WeakMap<object, Map<string, { tris: number[]; tree: Tree }>>();
function layered(scene: Scene, outcome: CompileOutcome | undefined, body: Ref, other: Ref, axis: Vec3): { tris: number[]; tree: Tree } | null {
  const [m, o] = [bodyMesh(scene, outcome, body), bodyMesh(scene, outcome, other)];
  if (!m || !o) return null;
  const l = Math.hypot(...axis) || 1;
  const h = (x: number, y: number, z: number): number => (x * axis[0] + y * axis[1] + z * axis[2]) / l;
  const span = (t: ArrayLike<number>): [number, number] => { let lo = Infinity, hi = -Infinity; for (let i = 0; i + 2 < t.length; i += 3) { const v = h(t[i]!, t[i + 1]!, t[i + 2]!); if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
  const [a, b] = [span(m.tris), span(o.tris)];
  const eps = 0.01;
  const [lo, hi] = [Math.max(a[0], b[0]) + eps, Math.min(a[1], b[1]) - eps];
  if (!(hi > lo)) return null; // (they do not share a height: they cannot meet)
  const key = `${body}|${other}|${axis.map((x) => Math.round(x * 1e4)).join(",")}`;
  const holder = outcome ?? scene;
  let per = layerCache.get(holder);
  if (!per) { per = new Map(); layerCache.set(holder, per); }
  let got = per.get(key);
  if (!got) {
    const keep: number[] = [];
    for (let i = 0; i + 8 < m.tris.length; i += 9) {
      const hs = [h(m.tris[i]!, m.tris[i + 1]!, m.tris[i + 2]!), h(m.tris[i + 3]!, m.tris[i + 4]!, m.tris[i + 5]!), h(m.tris[i + 6]!, m.tris[i + 7]!, m.tris[i + 8]!)];
      if (Math.max(...hs) > lo && Math.min(...hs) < hi) for (let k = 0; k < 9; k++) keep.push(m.tris[i + k]!);
    }
    got = { tris: keep, tree: buildTree(keep) };
    per.set(key, got);
  }
  return got.tris.length ? got : null;
}

interface Mover { body: Ref; pose: (a: number, vals: number[]) => Rigid; /** the axis it turns about, or the line it slides along */ axis: Vec3; /** whether it turns: the layers of a mechanism are along the axis of a body that turns (a slider moves across them) */ turns: boolean }

/** Who moves, and who yields, for this motion: the driver, what its couplings carry (the formula's followers), and the pushables. */
function moversOf(m: Motion, contact: ContactState): Mover[] {
  const out: Mover[] = [{ body: m.body, pose: (a) => jointOf(m.kind, m.point, m.dir, a), axis: m.dir, turns: m.kind === "turn" }];
  for (const f of m.follows) out.push({ body: f.body, axis: f.dir, turns: f.kind === "turn", pose: (a) => { const first = jointOf(f.kind, f.point, f.dir, followAmount(f, a)); return f.after ? compose(first, jointOf("turn", f.after.point, f.after.dir, f.after.k * a)) : first; } });
  contact.pushables.forEach((p, i) => out.push({ body: p.body, axis: p.dir, turns: p.kind === "turn", pose: (_a, vals) => jointOf(p.kind, p.point, p.dir, vals[i]!) }));
  return out;
}
const IDENT: Rigid = { turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [0, 0, 0], k: 1 };

/** The pairs of bodies a mate joins (never tested). */
function matedPairs(scene: Scene): Set<string> {
  const out = new Set<string>();
  for (const s of mateStatus(scene)) if (s.state === "ok" && s.mover && s.other) { out.add(`${s.mover.body}|${s.other.body}`); out.add(`${s.other.body}|${s.mover.body}`); }
  return out;
}

/** The first thing a mover at `vals` is in, or null. `skip`: the mover (by index) that is being tried at another place, and the pairs to leave out. */
function firstHit(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], who: number, mated: Set<string>, ignore: ReadonlySet<string>, anyHard: boolean, statics: Ref[], clearance: number): Ref | null {
  const me = movers[who]!;
  const rMe = me.pose(a, vals);
  const test = (other: Ref, rOther: Rigid, otherMover: Mover | null): boolean => {
    const axis = me.turns ? me.axis : otherMover?.turns ? otherMover.axis : (movers.find((q) => q.turns) ?? me).axis; // (the height of a layer is along a turning body's axis)
    const key = `${me.body}|${other}`;
    if (mated.has(key) || ignore.has(key)) return false;
    const [m1, o1] = [layered(scene, outcome, me.body, other, axis), layered(scene, outcome, other, me.body, axis)];
    if (!m1 || !o1) return false;
    return collidesMoving(m1.tree, compose(rMe, inverse(rOther)), o1.tree, clearance);
  };
  for (let j = 0; j < movers.length; j++) {
    if (j === who || movers[j]!.body === me.body) continue;
    if (!anyHard && !meets(scene, me.body, movers[j]!.body)) continue;
    if (test(movers[j]!.body, movers[j]!.pose(a, vals), movers[j]!)) return movers[j]!.body;
  }
  for (const s of statics) if (meets(scene, me.body, s) && test(s, IDENT, null)) return s;
  return null;
}

/** The pushables for a motion: bodies that can yield (given by the caller: the wheel of a Geneva drive, and the first bodies of coaxial mates that nothing else moves) as they stand at rest. */
export function startContact(scene: Scene, m: Motion, candidates: Candidate[], outcome?: CompileOutcome): ContactState | null {
  const moving = new Set<Ref>([m.body, ...m.follows.map((f) => f.body)]);
  const pushables: Pushable[] = candidates.filter((c) => !moving.has(c.body)).slice(0, 16).map((c): Pushable => ({ body: c.body, kind: c.kind ?? "turn", point: c.point, dir: c.dir, value: 0, way: c.way ?? -1, ...(c.rest !== undefined ? { rest: c.rest } : {}) }));
  const bodies = [...moving, ...pushables.map((p) => p.body)];
  const anyHard = bodies.some((b) => isHard(scene, b));
  const staticsHard = Object.keys(scene.parts).some((r) => { const p = scene.parts[r as Ref]; return p?.kind === "body" && !!p.id && !bodies.includes(r as Ref) && isHard(scene, r as Ref); });
  if (!anyHard && !staticsHard) return null;
  const contact: ContactState = { pushables, at: 0, jam: null, ignore: [] };
  // what overlaps where the motion begins is left alone
  const movers = moversOf(m, contact), mated = matedPairs(scene), statics = staticBodies(scene, bodies);
  const vals: number[] = pushables.map(() => 0), ignore: string[] = [];
  const clearance = scene.clearance ?? 0;
  const eps = m.kind === "turn" ? 0.1 : 0.05; // (a pair that clears when the driver is moved a hair either way is touching, not overlapping: the mesh test counts a touch as a hit)
  const touching: string[] = [];
  for (let i = 0; i < movers.length; i++) {
    for (;;) {
      const skip = new Set([...ignore, ...touching]);
      const hit = firstHit(scene, outcome, movers, 0, vals, i, mated, skip, anyHard, statics, clearance);
      if (!hit) break;
      const key = [`${movers[i]!.body}|${hit}`, `${hit}|${movers[i]!.body}`];
      const without = new Set([...skip].filter((k) => !key.includes(k)));
      const pi = contact.pushables.findIndex((p) => p.body === hit), qi = contact.pushables.findIndex((p) => p.body === movers[i]!.body);
      const nudge = (target: number): boolean => [1, -1].some((sgn) => { // (the driver, or the body that yields, moved a hair either way)
        const trial = vals.slice();
        const d = target >= 0 ? contact.pushables[target]!.kind === "slide" ? 0.05 : 0.1 : eps;
        if (target >= 0) trial[target] = vals[target]! + sgn * d;
        return firstHit(scene, outcome, movers, target >= 0 ? 0 : sgn * d, trial, i, mated, without, anyHard, statics, clearance) !== hit;
      });
      const apart = nudge(-1) || (pi >= 0 && nudge(pi)) || (qi >= 0 && nudge(qi));
      (apart ? touching : ignore).push(...key);
    }
  }
  contact.ignore = ignore;
  return contact;
}
const staticBodies = (scene: Scene, bodies: readonly Ref[]): Ref[] => Object.keys(scene.parts).filter((r) => { const p = scene.parts[r as Ref]; return p?.kind === "body" && !!p.id && !bodies.includes(r as Ref); }) as Ref[];

/**
 * The motion worked out for the driver's amount, in steps from where it was last worked out: at each step the driver and what it carries are put where they go, and each body that yields is moved by the smallest amount that clears it. When one
 * cannot be cleared (it has nowhere to go) or a moving body meets a wall, the motion goes back to the last amount that was clear and stops, saying what it was against.
 */
export function solveContact(scene: Scene, m: Motion, outcome?: CompileOutcome): Motion {
  const c = m.contact;
  if (!c) return m;
  if (Math.abs(m.amount - c.at) < 1e-9 && !c.jam) return m;
  const bodies = [m.body, ...m.follows.map((f) => f.body), ...c.pushables.map((p) => p.body)];
  const anyHard = bodies.some((b) => isHard(scene, b));
  const movers = moversOf(m, c), mated = matedPairs(scene), statics = staticBodies(scene, bodies), ignore = new Set(c.ignore);
  const clearance = scene.clearance ?? 0;
  const vals = c.pushables.map((p) => p.value), ways = c.pushables.map((p) => p.way), kinds = c.pushables.map((p) => p.kind);
  const step = m.kind === "turn" ? STEP : STEP / 2;
  const from = c.at, n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.abs(m.amount - from) / step)));
  let good = from, jam: string | null = null;
  for (let i = 1; i <= n && !jam; i++) {
    const a = from + ((m.amount - from) * i) / n;
    const was = vals.slice();
    // each moving body against the rest, again until nothing is in anything (a body that yields may come to meet another)
    const first = 1 + m.follows.length;
    for (let pass = 0; pass < 4 && !jam; pass++) {
      let moved = false;
      for (let w = 0; w < movers.length && !jam; w++) {
        const hit = firstHit(scene, outcome, movers, a, vals, w, mated, ignore, anyHard, statics, clearance);
        if (!hit) continue;
        const hitIx = c.pushables.findIndex((p) => p.body === hit);
        const [pi, aside] = w >= first ? [w - first, w] : [hitIx, hitIx >= 0 ? first + hitIx : -1]; // (a pushable yields itself; the driver or what it carries makes the one it meets yield)
        if (pi < 0 || !yieldBody(scene, outcome, movers, a, vals, ways, kinds, pi, aside, mated, ignore, anyHard, statics, clearance)) { jam = `${nameOf(scene, movers[w]!.body)} against ${nameOf(scene, hit)}`; break; }
        moved = true;
      }
      if (!moved) break;
    }
    // a body with a rest value goes back toward it as far as it is clear to (found by halving: a follower dropping off a cam, a pawl into the next tooth)
    for (let pi = 0; pi < c.pushables.length && !jam; pi++) {
      const rest = c.pushables[pi]!.rest;
      if (rest === undefined || Math.abs(vals[pi]! - rest) < 1e-9) continue;
      const w = first + pi, here = vals[pi]!;
      const clearAt = (v: number): boolean => { vals[pi] = v; return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, anyHard, statics, clearance) === null; };
      // a step toward the rest, no more than a body is thick (1 mm, or 4 degrees): so it cannot jump through anything on the way
      const limit = c.pushables[pi]!.kind === "slide" ? 1 : 4;
      const target = here + Math.max(-limit, Math.min(limit, rest - here));
      if (clearAt(target)) continue;
      let [lo, hi] = [0, 1]; // (a share of that step that is clear)
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (clearAt(here + (target - here) * mid)) lo = mid; else hi = mid; }
      vals[pi] = here + (target - here) * lo;
    }
    if (jam) { for (let k = 0; k < vals.length; k++) vals[k] = was[k]!; break; }
    good = a;
  }
  const pushables = c.pushables.map((p, i) => ({ ...p, value: vals[i]!, way: ways[i]! }));
  const follows = pushables.map((p): Follower => ({ gear: "", body: p.body, kind: p.kind, point: p.point, dir: p.dir, k: 0, value: p.value }));
  return { ...m, amount: jam ? good : m.amount, playing: jam ? false : m.playing, from: jam ? good : m.from, startedAt: jam ? null : m.startedAt, contact: { ...c, pushables, at: good, jam }, yields: follows };
}

/** Move pushable `pi` (mover `w`) by the smallest amount that leaves it clear of everything, trying the way it last went first: doubling the distance until clear, then halving to the nearest. False when there is none. */
function yieldBody(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], ways: (1 | -1)[], kinds: ("turn" | "slide")[], pi: number, w: number, mated: Set<string>, ignore: ReadonlySet<string>, anyHard: boolean, statics: Ref[], clearance: number): boolean {
  const base = vals[pi]!;
  const slide = kinds[pi] === "slide";
  const [d0, dMax] = slide ? [0.05, MAX_PUSH / 2] : [0.1, MAX_PUSH];
  const clear = (v: number): boolean => { vals[pi] = v; return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, anyHard, statics, clearance) === null; };
  for (let d = d0; d <= dMax; d *= 2) {
    for (const sgn of [ways[pi]!, -ways[pi]! as 1 | -1]) {
      if (!clear(base + sgn * d)) continue;
      let [lo, hi] = [0, d];
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (clear(base + sgn * mid)) hi = mid; else lo = mid; }
      vals[pi] = base + sgn * hi;
      ways[pi] = sgn;
      return true;
    }
  }
  vals[pi] = base;
  return false;
}

