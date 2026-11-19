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
import { jointOf, compose, inverse, applyPoint } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
import { followAmount } from "../operation/gearcouple.ts";
import type { Follower } from "../operation/gearcouple.ts";
import { mateStatus } from "../operation/mates.ts";
import { meshOf, isHard, meets } from "./hard.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { Motion } from "./motion.ts";

/** A body that yields: it turns about the axis through `point` with direction `dir` (or slides along `dir`), and stands at `value` degrees (mm) from where it was drawn. `rest`: where it goes back to when nothing holds it away (a spring, gravity: a follower dropping off a cam), as far as it is clear to. */
export interface Pushable { body: Ref; kind: "turn" | "slide"; /** the mate whose joint it is (for keeping the pose) */ mate?: string; point: Vec3; dir: Vec3; value: number; /** the way it last went, so a tie goes on the same way */ way: 1 | -1; /** how far it was pushed the last time it was: the next push is about the same, so the search begins there */ push?: number; rest?: number }
export interface Candidate { body: Ref; kind?: "turn" | "slide"; mate?: string; point: Vec3; dir: Vec3; rest?: number; way?: 1 | -1 }
export interface ContactState {
  pushables: Pushable[];
  /** the amount of the driver that was last worked out */
  at: number;
  /** why the motion stopped, or null */
  jam: string | null;
  /** the pairs ("a|b") that were already overlapping where the motion began: left out, so a body can be pulled out of another */
  ignore: string[];
  /** the amount asked for when the call ran out of time and stopped short of it: the next frame goes on to it (a scrub does not play, so nothing else would) */
  target?: number | null;
  /** something to say about the mechanism that is not a jam: a chain that goes on past the depth of passed-on hardness */
  note: string | null;
}
const MAX_PUSH = 12.8, STEP = 1, MAX_STEPS = 360, MAX_PASSES = 12;
/** The time a call may take to work out its steps (ms), a part of a frame: past it the steps left are left for the next frame, so a long scrub or a heavy push plays slower, not frozen (`in_1020`, `dec_contact_push`). */
const BUDGET_MS = 20;
const nameOf = (scene: Scene, r: Ref): string => { const p = scene.parts[r]; return p?.kind === "body" && p.id ? p.id : r; };

// ---- the triangles of a body: all of them, from the kernel's mesh (`meshOf`, `hard.ts`) ----
const bodyMesh = (scene: Scene, outcome: CompileOutcome | undefined, ref: Ref): { tris: number[]; tree: Tree } | null => meshOf(scene, ref, outcome);

// ---- the part of two bodies that can meet: their overlap in height along an axis ----
const layerCache = new WeakMap<object, Map<string, { tris: number[]; tree: Tree } | null>>();
function layered(scene: Scene, outcome: CompileOutcome | undefined, body: Ref, other: Ref, axis: Vec3): { tris: number[]; tree: Tree } | null {
  const holder = outcome ?? scene;
  let per = layerCache.get(holder);
  if (!per) { per = new Map(); layerCache.set(holder, per); }
  const key = `${body}|${other}|${axis.map((x) => Math.round(x * 1e4)).join(",")}`;
  if (per.has(key)) return per.get(key)!; // (asked many times a step: the answer, a miss included, is kept)
  const [m, o] = [bodyMesh(scene, outcome, body), bodyMesh(scene, outcome, other)];
  let got: { tris: number[]; tree: Tree } | null = null;
  if (m && o) {
    const l = Math.hypot(...axis) || 1;
    const h = (x: number, y: number, z: number): number => (x * axis[0] + y * axis[1] + z * axis[2]) / l;
    const span = (t: ArrayLike<number>): [number, number] => { let lo = Infinity, hi = -Infinity; for (let i = 0; i + 2 < t.length; i += 3) { const v = h(t[i]!, t[i + 1]!, t[i + 2]!); if (v < lo) lo = v; if (v > hi) hi = v; } return [lo, hi]; };
    const [a, b] = [span(m.tris), span(o.tris)];
    const eps = 0.01;
    const [lo, hi] = [Math.max(a[0], b[0]) + eps, Math.min(a[1], b[1]) - eps];
    if (hi > lo) { // (they share a height; if not they cannot meet)
      const keep: number[] = [];
      for (let i = 0; i + 8 < m.tris.length; i += 9) {
        const hs = [h(m.tris[i]!, m.tris[i + 1]!, m.tris[i + 2]!), h(m.tris[i + 3]!, m.tris[i + 4]!, m.tris[i + 5]!), h(m.tris[i + 6]!, m.tris[i + 7]!, m.tris[i + 8]!)];
        if (Math.max(...hs) > lo && Math.min(...hs) < hi) for (let k = 0; k < 9; k++) keep.push(m.tris[i + k]!);
      }
      if (keep.length) got = { tris: keep, tree: buildTree(keep) };
    }
  }
  per.set(key, got);
  return got;
}

interface Mover { body: Ref; pose: (a: number, vals: number[]) => Rigid; /** the axis it turns about, or the line it slides along */ axis: Vec3; /** whether it turns: the layers of a mechanism are along the axis of a body that turns (a slider moves across them) */ turns: boolean; /** a body that yields */ yields?: true }

/** Who moves, and who yields, for this motion: the driver, what its couplings carry (the formula's followers), and the pushables. */
function moversOf(m: Motion, contact: ContactState): Mover[] {
  const out: Mover[] = [{ body: m.body, pose: (a) => jointOf(m.kind, m.point, m.dir, a), axis: m.dir, turns: m.kind === "turn" }];
  for (const f of m.follows) out.push({ body: f.body, axis: f.dir, turns: f.kind === "turn", pose: (a) => { const first = jointOf(f.kind, f.point, f.dir, followAmount(f, a)); return f.after ? compose(first, jointOf("turn", f.after.point, f.after.dir, f.after.k * a)) : first; } });
  contact.pushables.forEach((p, i) => out.push({ body: p.body, axis: p.dir, turns: p.kind === "turn", yields: true, pose: (_a, vals) => jointOf(p.kind, p.point, p.dir, vals[i]!) }));
  return out;
}
const IDENT: Rigid = { turn: [1, 0, 0, 0, 1, 0, 0, 0, 1], shift: [0, 0, 0], k: 1 };

/** The pairs of bodies a mate joins (never tested). */
function matedPairs(scene: Scene): Set<string> {
  const out = new Set<string>();
  for (const s of mateStatus(scene)) if (s.state === "ok" && s.mover && s.other) { out.add(`${s.mover.body}|${s.other.body}`); out.add(`${s.other.body}|${s.mover.body}`); }
  return out;
}

/** The box of a tree's root (in its own place) taken to where a rigid motion puts it: the box of its eight corners. */
function boxUnder(t: Tree, r: Rigid): [number[], number[]] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = applyPoint(r, [i & 1 ? t.hi[0] : t.lo[0], i & 2 ? t.hi[1] : t.lo[1], i & 4 ? t.hi[2] : t.lo[2]]);
    for (let k = 0; k < 3; k++) { if (p[k]! < lo[k]!) lo[k] = p[k]!; if (p[k]! > hi[k]!) hi[k] = p[k]!; }
  }
  return [lo, hi];
}
/** Do the boxes of two bodies, each where its motion puts it, stay apart by more than the clearance? (a cheap answer for a pair that is far from each other, before walking their trees) */
function apart(a: Tree, ra: Rigid, b: Tree, rb: Rigid, clearance: number): boolean {
  const [x, y] = [boxUnder(a, ra), boxUnder(b, rb)];
  const pad = Math.max(0, clearance) + 1e-3;
  for (let k = 0; k < 3; k++) if (x[1][k]! + pad < y[0][k]! || y[1][k]! + pad < x[0][k]!) return true;
  return false;
}

const DEPTH = 3; // (`dec_contact_push`, `in_1017`: hardness is passed on to three links)
/**
 * Who is solid at a pose of the motion: the bodies that are hard, and the bodies that touch a solid one, to `DEPTH` links from a hard body (touching: their boxes, each where its motion puts it, meet within a few tenths of a millimetre). A pair of the moving and yielding bodies is tested when either of
 * the two is solid, so a push goes on for as many links as there are solid bodies and one more; a body that touches the last solid one is pushed by it and does not push. The note says when a chain goes on past the depth: a body touched by one at the last link that is not solid.
 */
function solidSet(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[]): { solid: Set<Ref>; note: string | null } {
  const level = movers.map((m) => (isHard(scene, m.body) ? 0 : Infinity));
  const boxes = movers.map((m) => { const mesh = bodyMesh(scene, outcome, m.body); return mesh ? boxUnder(mesh.tree, m.pose(a, vals)) : null; });
  const touch = (i: number, j: number): boolean => { const [x, y] = [boxes[i], boxes[j]]; if (!x || !y) return false; for (let k = 0; k < 3; k++) if (x[1][k]! + 0.3 < y[0][k]! || y[1][k]! + 0.3 < x[0][k]!) return false; return true; };
  for (let k = 1; k <= DEPTH; k++) for (let i = 0; i < movers.length; i++) if (level[i] === Infinity) for (let j = 0; j < movers.length; j++) if (level[j] === k - 1 && touch(i, j)) { level[i] = k; break; }
  const solid = new Set<Ref>(movers.filter((_, i) => level[i]! <= DEPTH).map((m) => m.body));
  let note: string | null = null;
  // the chain goes on past the last solid body when the one it pushes touches another that is not solid
  for (let i = 0; i < movers.length && !note; i++) if (level[i] === Infinity && movers.some((_, m) => m !== i && level[m] === Infinity && touch(i, m))) for (let j = 0; j < movers.length; j++) if (level[j] === DEPTH && touch(i, j)) { note = `${nameOf(scene, movers[j]!.body)} touches ${nameOf(scene, movers[i]!.body)}, past the depth of ${DEPTH}, and the chain goes on: mark a body in the middle hard to carry the push on`; break; }
  return { solid, note };
}

/** The first thing a mover at `vals` is in, or null. `skip`: the mover (by index) that is being tried at another place, and the pairs to leave out. */
function firstHit(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], who: number, mated: Set<string>, ignore: ReadonlySet<string>, solid: ReadonlySet<Ref>, statics: Ref[], clearance: number, only?: Ref): Ref | null {
  const me = movers[who]!;
  const rMe = me.pose(a, vals);
  const test = (other: Ref, rOther: Rigid, otherMover: Mover | null): boolean => {
    const axis = me.turns ? me.axis : otherMover?.turns ? otherMover.axis : (movers.find((q) => q.turns) ?? me).axis; // (the height of a layer is along a turning body's axis)
    const key = `${me.body}|${other}`;
    if (mated.has(key) || ignore.has(key)) return false;
    const [m1, o1] = [layered(scene, outcome, me.body, other, axis), layered(scene, outcome, other, me.body, axis)];
    if (!m1 || !o1) return false;
    if (apart(m1.tree, rMe, o1.tree, rOther, clearance)) return false; // (the boxes of the two, each where it stands, do not meet: nothing to walk)
    // either way round: a touch is a hit or not by the direction the test goes, and a body cleared one way would be found in the other (a boundary the search stops at, found again, round and round)
    return collidesMoving(m1.tree, compose(rMe, inverse(rOther)), o1.tree, clearance, false, false, true) || collidesMoving(o1.tree, compose(rOther, inverse(rMe)), m1.tree, clearance, false, false, true);
  };
  for (let j = 0; j < movers.length; j++) {
    if (j === who || movers[j]!.body === me.body) continue;
    if (only !== undefined && movers[j]!.yields && movers[j]!.body !== only) continue; // (a body that yields looks for room away from what does not: another that yields is dealt with when its own turn comes, so a chain is worked out one link at a time)
    if (!solid.has(me.body) && !solid.has(movers[j]!.body)) continue; // (a pair is tested when either is solid: hard, or touched by a solid body to the depth)
    if (test(movers[j]!.body, movers[j]!.pose(a, vals), movers[j]!)) return movers[j]!.body;
  }
  for (const s of statics) if (meets(scene, me.body, s) && test(s, IDENT, null)) return s;
  return null;
}

/** The pushables for a motion: bodies that can yield (given by the caller: the wheel of a Geneva drive, and the first bodies of coaxial mates that nothing else moves) as they stand at rest. */
export function startContact(scene: Scene, m: Motion, candidates: Candidate[], outcome?: CompileOutcome): ContactState | null {
  const moving = new Set<Ref>([m.body, ...m.follows.map((f) => f.body)]);
  const pushables: Pushable[] = candidates.filter((c) => !moving.has(c.body)).slice(0, 16).map((c): Pushable => ({ body: c.body, kind: c.kind ?? "turn", ...(c.mate ? { mate: c.mate } : {}), point: c.point, dir: c.dir, value: 0, way: c.way ?? -1, ...(c.rest !== undefined ? { rest: c.rest } : {}) }));
  const bodies = [...moving, ...pushables.map((p) => p.body)];
  const anyHard = bodies.some((b) => isHard(scene, b));
  const staticsHard = Object.keys(scene.parts).some((r) => { const p = scene.parts[r as Ref]; return p?.kind === "body" && !!p.id && !bodies.includes(r as Ref) && isHard(scene, r as Ref); });
  if (!anyHard && !staticsHard) return null;
  const contact: ContactState = { pushables, at: 0, jam: null, ignore: [], note: null };
  // what overlaps where the motion begins is left alone
  const movers = moversOf(m, contact), mated = matedPairs(scene), statics = staticBodies(scene, bodies);
  const vals: number[] = pushables.map(() => 0), ignore: string[] = [];
  const solid = solidSet(scene, outcome, movers, 0, vals).solid;
  const clearance = scene.clearance ?? 0;
  const eps = m.kind === "turn" ? 0.1 : 0.05; // (a pair that clears when the driver is moved a hair either way is touching, not overlapping: the mesh test counts a touch as a hit)
  const touching: string[] = [];
  for (let i = 0; i < movers.length; i++) {
    for (;;) {
      const skip = new Set([...ignore, ...touching]);
      const hit = firstHit(scene, outcome, movers, 0, vals, i, mated, skip, solid, statics, clearance);
      if (!hit) break;
      const key = [`${movers[i]!.body}|${hit}`, `${hit}|${movers[i]!.body}`];
      const without = new Set([...skip].filter((k) => !key.includes(k)));
      const pi = contact.pushables.findIndex((p) => p.body === hit), qi = contact.pushables.findIndex((p) => p.body === movers[i]!.body);
      const nudge = (target: number): boolean => [1, -1].some((sgn) => { // (the driver, or the body that yields, moved a hair either way)
        const trial = vals.slice();
        const d = target >= 0 ? contact.pushables[target]!.kind === "slide" ? 0.05 : 0.1 : eps;
        if (target >= 0) trial[target] = vals[target]! + sgn * d;
        return firstHit(scene, outcome, movers, target >= 0 ? 0 : sgn * d, trial, i, mated, without, solid, statics, clearance) !== hit;
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
export function solveContact(scene: Scene, m: Motion, outcome?: CompileOutcome, budgetMs = BUDGET_MS): Motion {
  const began = performance.now();
  const c = m.contact;
  if (!c) return m;
  if (Math.abs(m.amount - c.at) < 1e-9 && !c.jam) return m;
  const bodies = [m.body, ...m.follows.map((f) => f.body), ...c.pushables.map((p) => p.body)];
  const movers = moversOf(m, c), mated = matedPairs(scene), statics = staticBodies(scene, bodies), ignore = new Set(c.ignore);
  const clearance = scene.clearance ?? 0;
  const vals = c.pushables.map((p) => p.value), ways = c.pushables.map((p) => p.way), kinds = c.pushables.map((p) => p.kind), pushes = c.pushables.map((p) => p.push ?? 0);
  const step = m.kind === "turn" ? STEP : STEP / 2;
  const from = c.at, n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.abs(m.amount - from) / step)));
  let good = from, jam: string | null = null, note: string | null = null, slow = false;
  let solid: ReadonlySet<Ref> = new Set();
  for (let i = 1; i <= n && !jam; i++) {
    const a = from + ((m.amount - from) * i) / n;
    const was = vals.slice();
    ({ solid, note } = solidSet(scene, outcome, movers, a, vals)); // (who is solid at this step: hard, or touched by a solid body to the depth)
    // each moving body against the rest, again until nothing is in anything (a body that yields may come to meet another)
    const first = 1 + m.follows.length;
    let settled = false;
    // only the bodies that moved since they were last tested are tested again: what did not move meets what did not move as it did before (the driver moved at the start of the step, then each body that yielded, one pass at a time: a chain is a walk along it, not a test of every body again at every link)
    let dirty = new Set<number>(movers.map((_, w) => w).filter((w) => w < first));
    for (let pass = 0; pass < MAX_PASSES && !jam; pass++) {
      const next = new Set<number>();
      for (const w of dirty) {
        if (jam) break;
        const hit = firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance);
        if (!hit) continue;
        const hitIx = c.pushables.findIndex((p) => p.body === hit);
        // who yields: a pushable that meets something that does not yield yields itself; a body that moves by its own rule, or a pushable, that meets a pushable makes that one yield
        const [pi, aside] = w >= first && hitIx < 0 ? [w - first, w] : [hitIx, hitIx >= 0 ? first + hitIx : -1];
        if (pi < 0 || !yieldBody(scene, outcome, movers, a, vals, ways, kinds, pushes, pi, aside, movers[w]!.body, mated, ignore, solid, statics, clearance)) { jam = `${nameOf(scene, movers[w]!.body)} against ${nameOf(scene, hit)}`; break; }
        next.add(aside); // (it moved: it is tested again)
        if (w >= first) next.add(w); // (a body that yielded itself too)
      }
      if (!next.size) { settled = true; break; }
      dirty = next;
    }
    if (!settled && !jam) { // the passes ran out with bodies still moving: say so, rather than leave bodies in each other without a word
      for (let w = 0; w < movers.length && !jam; w++) { const hit = firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance); if (hit) jam = `${nameOf(scene, movers[w]!.body)} against ${nameOf(scene, hit)} (the chain is too long to settle)`; }
    }
    // a body with a rest value goes back toward it as far as it is clear to (found by halving: a follower dropping off a cam, a pawl into the next tooth)
    for (let pi = 0; pi < c.pushables.length && !jam; pi++) {
      const rest = c.pushables[pi]!.rest;
      if (rest === undefined || Math.abs(vals[pi]! - rest) < 1e-9) continue;
      const w = first + pi, here = vals[pi]!;
      const clearAt = (v: number): boolean => { vals[pi] = v; return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance) === null; };
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
    if (i < n && performance.now() - began > budgetMs) { slow = true; break; } // (the rest of the steps wait for the next frame)
  }
  if (slow && !note) note = "this push is heavy: it plays slower than real time";
  const pushables = c.pushables.map((p, i) => ({ ...p, value: vals[i]!, way: ways[i]!, push: pushes[i]! }));
  const follows = pushables.map((p): Follower => ({ gear: "", body: p.body, kind: p.kind, point: p.point, dir: p.dir, k: 0, value: p.value, ...(p.mate ? { mate: p.mate } : {}) }));
  return { ...m, amount: jam || slow ? good : m.amount, playing: jam ? false : m.playing, from: jam || slow ? good : m.from, startedAt: jam || slow ? null : m.startedAt, contact: { ...c, pushables, at: good, jam, note, target: slow ? m.amount : null }, yields: follows };
}

/** Move pushable `pi` (mover `w`) by the smallest amount that leaves it clear of everything, trying the way it last went first: doubling the distance until clear, then halving to the nearest. False when there is none. */
function yieldBody(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], ways: (1 | -1)[], kinds: ("turn" | "slide")[], pushes: number[], pi: number, w: number, pusher: Ref, mated: Set<string>, ignore: ReadonlySet<string>, solid: ReadonlySet<Ref>, statics: Ref[], clearance: number): boolean {
  const base = vals[pi]!;
  const slide = kinds[pi] === "slide";
  const dMax = slide ? MAX_PUSH / 2 : MAX_PUSH;
  const clear = (v: number): boolean => { vals[pi] = v; return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance, pusher) === null; };
  // look outward a little at a time (the room between two teeth is a fraction of a degree wide, so a doubling would step over it), then in bigger steps
  const fine = slide ? 0.07 : 0.15, near = slide ? 2 : 4;
  const distances: number[] = [];
  for (let d = fine; d <= near + 1e-9; d += fine) distances.push(d);
  for (let d = near * 1.5; d <= dMax * 1.0001; d *= 1.5) distances.push(d);
  // where it was pushed to the last time first: the push of one step is near the push of the one before, so a clear place a little short of it is the answer and a few tests find it
  const warm = pushes[pi]!;
  if (warm > 2 * fine) {
    const sgn = ways[pi]!;
    if (clear(base + sgn * warm) && !clear(base + sgn * (warm - 2 * fine))) {
      let [lo, hi] = [warm - 2 * fine, warm];
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (clear(base + sgn * mid)) hi = mid; else lo = mid; }
      vals[pi] = base + sgn * hi; pushes[pi] = hi;
      return true;
    }
  }
  // the way it went last first, all the way out (a tooth pushes on the same side as it did a degree ago), then the other way: a body that turns back (a reversed play) takes one slow step
  for (const sgn of [ways[pi]!, -ways[pi]! as 1 | -1]) {
    for (const d of distances) {
      if (!clear(base + sgn * d)) continue;
      let [lo, hi] = [Math.max(0, d - (d <= near ? fine : d / 3)), d];
      for (let k = 0; k < 5; k++) { const mid = (lo + hi) / 2; if (clear(base + sgn * mid)) hi = mid; else lo = mid; }
      vals[pi] = base + sgn * hi;
      ways[pi] = sgn;
      pushes[pi] = hi;
      return true;
    }
  }
  vals[pi] = base;
  return false;
}

