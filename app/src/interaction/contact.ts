// Contact push (`dec_contact_push`, provisional; `in_904`): while a motion plays, a body that is hard and in the way of a moving body yields along its own joint by the smallest amount that clears it, and a moving body that meets a hard body it cannot push
// stops (a jam, said in words). Built on the mesh test of the hard bodies (`operation/collide.ts`); nothing is written to the model. A pose of the motion is worked out in small steps (a degree, half a millimetre), so a wheel that follows a pin is found
// where it stands at each step, not jumped to. Pure: a scene and a motion in, a motion out.
//   Who takes part: the bodies that move in the motion (the driver, and what its couplings carry), the bodies that can yield (the wheel of a Geneva drive, the first body of a coaxial mate that nothing else moves) and, as walls, every other body; a pair
//   is tested when either is hard (`meets`, `in_490`), and when any body that moves is hard, those that move or yield are all tested against each other (marking one body of a mechanism is enough). A pair a mate joins is never tested (a pin in its
//   hole is in contact by design). Two layers of a mechanism rest face to face; the mesh test counts a face on a face as a hit, so each pair is tested only on the part of each body that overlaps the other in height along the joint's axis.
import type { Ref } from "../shared/ref.ts";
import type { Vec3 } from "../math/vec.ts";
import type { Scene } from "../operation/scene.ts";
import { collidesMoving, buildTree, collides, crossingTris } from "../operation/collide.ts";
import type { Tree } from "../operation/collide.ts";
import { jointOf, compose, inverse, applyPoint } from "../operation/frames.ts";
import type { Rigid } from "../operation/frames.ts";
import { normalize, cross, dot } from "../math/vec.ts";
import { followAmount } from "../operation/gearcouple.ts";
import type { Follower } from "../operation/gearcouple.ts";
import { mateStatus } from "../operation/mates.ts";
import { meshOf, isHard, meets } from "./hard.ts";
import type { CompileOutcome } from "../compiler/compile.ts";
import type { Motion } from "./motion.ts";

/** A body that yields: it turns about the axis through `point` with direction `dir` (or slides along `dir`), and stands at `value` degrees (mm) from where it was drawn. `rest`: where it goes back to when nothing holds it away (a spring, gravity: a follower dropping off a cam), as far as it is clear to. */
export interface Pushable { body: Ref; kind: "turn" | "slide"; /** the mate whose joint it is (for keeping the pose) */ mate?: string; point: Vec3; dir: Vec3; value: number; /** the way it last went, so a tie goes on the same way */ way: 1 | -1; /** how far it was pushed the last time it was: the next push is about the same, so the search begins there */ push?: number; rest?: number; /** a body with no joint (`dec_contact_push`, free push): where it has been pushed to, as a move from where it is drawn; it goes any way in the plane across the turning axis */ free?: [number, number, number]; /** how far it has turned about its own middle (`point`), degrees, as well: a body with no joint has three freedoms in the plane, two of sliding and one of turning */ spin?: number; /** how far its outline reaches from its middle in the plane, mm: a turn of a degree is that much of a slide */ reach?: number; /** the way it was last slid (its place in the list of ways) and the way it was last turned, which the next push of that kind tries first; whether it was turning at the last push, and how many pushes ago it last looked for a slide */ dirSlide?: number; dirTurn?: [number, number]; turning?: boolean; since?: number; /** how many steps it has gone without being pushed */ still?: number; /** what a push could not go on because of: the body this one is against */ blockedBy?: Ref }
export interface Candidate { body: Ref; kind?: "turn" | "slide"; mate?: string; point: Vec3; dir: Vec3; rest?: number; way?: 1 | -1; /** a body with no joint: pushed aside by what it meets */ free?: true; reach?: number }
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
  /** where the bodies of a jam are in each other, in space, to show it: the triangles (nine numbers each) of the two that cross; null when there is no jam */
  clash?: number[] | null;
}
const FREE_STEP = 2.5; // (the most a body with no joint is pushed in one step of the driver, mm)
const SPLITS = 3, SPLIT_PUSH = 0.4; // (a step that moves a body with no joint more than this, mm, is made again in halves, three times at most)
const FREE_MAX = 60;
const FREE_SPIN = 120; // (how far a body with no joint may be turned in one play, degrees) // (how far a body with no joint may be pushed in one play, mm: past it the push stops and says so)
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
  const across = normalize(out.find((q) => q.turns)?.axis ?? [0, 0, 1]); // (the way a body with no joint turns: about the axis of what turns here)
  contact.pushables.forEach((p, i) => out.push({ body: p.body, axis: p.dir, turns: p.kind === "turn" && !p.free, yields: true, pose: p.free ? () => compose(jointOf("turn", p.point, across, p.spin ?? 0), { turn: IDENT.turn, shift: p.free!, k: 1 }) : (_a, vals) => jointOf(p.kind, p.point, p.dir, vals[i]!) }));
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
  const pushables: Pushable[] = candidates.filter((c) => !moving.has(c.body)).slice(0, 16).map((c): Pushable => ({ body: c.body, kind: c.kind ?? "turn", ...(c.mate ? { mate: c.mate } : {}), point: c.point, dir: c.dir, value: 0, way: c.way ?? -1, ...(c.rest !== undefined ? { rest: c.rest } : {}), ...(c.free ? { free: [0, 0, 0] as [number, number, number], spin: 0, reach: c.reach ?? 10 } : {}) }));
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
/** What was worked out at each whole degree of a motion (a place of the grid), for the scene it was worked out in: a change to the scene is a new scene and starts again. */
const placesOf = new WeakMap<object, Map<string, Map<number, { vals: number[]; ways: (1 | -1)[]; pushes: number[]; work: Pushable[] }>>>();
export function solveContact(scene: Scene, m: Motion, outcome?: CompileOutcome, budgetMs = BUDGET_MS): Motion {
  const began = performance.now();
  const c = m.contact;
  if (!c) return m;
  if (Math.abs(m.amount - c.at) < 1e-9 && !c.jam) return m;
  const bodies = [m.body, ...m.follows.map((f) => f.body), ...c.pushables.map((p) => p.body)];
  const work = c.pushables.map((p) => (p.free ? { ...p, free: [...p.free] as [number, number, number] } : p)); // (a body with no joint is moved by writing its place here; the poses read it)
  const movers = moversOf(m, { ...c, pushables: work }), mated = matedPairs(scene), statics = staticBodies(scene, bodies), ignore = new Set(c.ignore);
  const clearance = scene.clearance ?? 0;
  const vals = c.pushables.map((p) => p.value), ways = c.pushables.map((p) => p.way), kinds = c.pushables.map((p) => p.kind), pushes = c.pushables.map((p) => p.push ?? 0);
  const step = m.kind === "turn" ? STEP : STEP / 2;
  const from = c.at, n = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.abs(m.amount - from) / step)));
  let good = from, jam: string | null = null, note: string | null = null, slow = false, clash: number[] | null = null;
  let solid: ReadonlySet<Ref> = new Set();
  const first = 1 + m.follows.length;
  // what a step changes can be put back: the bodies' places, as they stood before it (a step that jams, or that moves a body with no joint further than the driver's own move asks, is made again in halves)
  const snap = () => ({ vals: vals.slice(), ways: ways.slice(), pushes: pushes.slice(), work: work.map((q) => ({ ...q, ...(q.free ? { free: [...q.free] as [number, number, number] } : {}) })) });
  const restore = (s: ReturnType<typeof snap>): void => {
    for (let q = 0; q < vals.length; q++) { vals[q] = s.vals[q]!; ways[q] = s.ways[q]!; pushes[q] = s.pushes[q]!; }
    s.work.forEach((q, ix) => { const w = work[ix]!; Object.assign(w, q); if (q.free) w.free = [...q.free] as [number, number, number]; });
  };
  const pushOf = (s: ReturnType<typeof snap>): number => work.reduce((most, q, ix) => { const b = s.work[ix]!; return q.free && b.free ? Math.max(most, Math.hypot(q.free[0] - b.free[0], q.free[1] - b.free[1], q.free[2] - b.free[2], (((q.spin ?? 0) - (b.spin ?? 0)) * Math.PI * (q.reach ?? 10)) / 180)) : most; }, 0);
  const solveStep = (a: number): void => {
    ({ solid, note } = solidSet(scene, outcome, movers, a, vals)); // (who is solid at this step: hard, or touched by a solid body to the depth)
    // each moving body against the rest, again until nothing is in anything (a body that yields may come to meet another)
    let settled = false;
    const pushedNow = new Set<number>(); // (the bodies with no joint that were pushed in this step: they do not go back while something is pushing them)
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
        const yielded = pi >= 0 && (work[pi]!.free ? yieldFree(scene, outcome, movers, a, vals, work[pi] as Pushable & { free: [number, number, number] }, ways, pushes, pi, aside, movers[w]!.body, mated, ignore, solid, statics, clearance) : yieldBody(scene, outcome, movers, a, vals, ways, kinds, pushes, pi, aside, movers[w]!.body, mated, ignore, solid, statics, clearance));
        // a body with no joint that is against another that yields, and the other cannot get out of its way, goes out of the other's way itself (clear of every body where it stands)
        const retried = !yielded && pi >= 0 && w >= first && w - first !== pi && !!work[w - first]!.free && yieldFree(scene, outcome, movers, a, vals, work[w - first] as Pushable & { free: [number, number, number] }, ways, pushes, w - first, w, movers[w]!.body, mated, ignore, solid, statics, clearance, true);
        if (retried) { pushedNow.add(w - first); next.add(w); continue; }
        if (yielded && pi >= 0) pushedNow.add(pi);
        if (!yielded) {
          const stuck = pi >= 0 ? work[pi]!.blockedBy : undefined; // (a body with no joint that is against another: say which)
          const joint = pi >= 0 && !work[pi]!.free ? ` (${nameOf(scene, work[pi]!.body)} ${work[pi]!.kind === "slide" ? "slides" : "turns"} on its joint but cannot ${work[pi]!.kind === "slide" ? "slide" : "turn"} clear of it)` : "";
          jam = stuck ? `${nameOf(scene, movers[w]!.body)} pushes ${nameOf(scene, work[pi]!.body)} against ${nameOf(scene, stuck)}` : `${nameOf(scene, movers[w]!.body)} against ${nameOf(scene, hit)}${joint}`;
          clash = clashOf(scene, outcome, movers, a, vals, stuck ? aside : w, stuck ?? hit, clearance);
          break;
        }
        next.add(aside); // (it moved: it is tested again)
        if (w >= first) next.add(w); // (a body that yielded itself too)
      }
      if (!next.size) { settled = true; break; }
      dirty = next;
    }
    if (!settled && !jam) { // the passes ran out with bodies still moving: say so, rather than leave bodies in each other without a word
      for (let w = 0; w < movers.length && !jam; w++) { const hit = firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance); if (hit) { jam = `${nameOf(scene, movers[w]!.body)} against ${nameOf(scene, hit)} (the chain is too long to settle)`; clash = clashOf(scene, outcome, movers, a, vals, w, hit, clearance); } }
    }
    // a body with no joint goes back toward where it is drawn as far as it is clear to, a millimetre a step (it was only pushed while something was in its way)
    for (let pi = 0; pi < work.length && !jam; pi++) {
      const f = work[pi]!.free;
      if (!f) continue;
      const reach = work[pi]!.reach ?? 10, here: [number, number, number] = [f[0], f[1], f[2]], spin0 = work[pi]!.spin ?? 0;
      const len = Math.hypot(f[0], f[1], f[2], (spin0 * Math.PI * reach) / 180);
      if (len < 1e-9) continue;
      if (pushedNow.has(pi)) { work[pi]!.still = 0; continue; }
      work[pi]!.still = (work[pi]!.still ?? 0) + 1;
      if (work[pi]!.still! < 3) continue; // (not at once: a body that was just pushed and is touching its pusher does not go back and forth with it)
      const w = first + pi;
      const clearAt = (k: number): boolean => { for (let q = 0; q < 3; q++) f[q] = here[q]! * k; work[pi]!.spin = spin0 * k; return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance) === null; };
      const target = Math.max(0, 1 - 0.6 / len); // (a step of six tenths of a millimetre, or all the way: it drifts back, it does not jump)
      if (clearAt(target)) continue;
      let [lo, hi] = [target, 1]; // (the share of its place that is clear)
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; if (clearAt(mid)) hi = mid; else lo = mid; }
      clearAt(hi);
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
  };
  let cur = from;
  const advance = (a: number, depth: number): void => {
    const before = snap();
    solveStep(a);
    if (jam) { restore(before); return; }
    // a body with no joint moved further than a step of the driver can ask (a body squeezed between two others moves a lot for a little): the step is made again in halves, so it moves as little as the motion needs
    if (depth < SPLITS && pushOf(before) > SPLIT_PUSH) { restore(before); advance((cur + a) / 2, depth + 1); if (!jam) advance(a, depth + 1); return; }
    cur = a; good = a;
  };
  // the steps are the whole degrees (the places of a grid) between where it is and where it goes, then the end: what was worked out at a place of the grid is kept for the scene as it is, so playing again, or scrubbing, goes through
  // places already worked out at once, and the first play is the only one that costs (`in_1080`)
  const sign = m.amount >= from ? 1 : -1;
  const targets: number[] = [];
  for (let g = sign > 0 ? Math.floor(from / step + 1e-9) + 1 : Math.ceil(from / step - 1e-9) - 1; sign > 0 ? g * step < m.amount - 1e-9 : g * step > m.amount + 1e-9; g += sign) targets.push(g * step);
  targets.push(m.amount);
  const cacheKey = `${m.body}|${m.kind}|${m.mate ?? ""}|${m.follows.map((f) => f.body).join(",")}`;
  let places = placesOf.get(scene)?.get(cacheKey);
  if (!places) { places = new Map(); const all = placesOf.get(scene) ?? new Map(); all.set(cacheKey, places); placesOf.set(scene, all); }
  const gridAt = (a: number): number | null => { const g = Math.round(a / step); return Math.abs(g * step - a) < 1e-9 ? g : null; };
  if (targets.length > MAX_STEPS) { targets.length = 0; for (let i = 1; i <= n; i++) targets.push(from + ((m.amount - from) * i) / n); } // (a long scrub in one go: equal steps, nothing kept)
  // the kept places are the path of a play from the start: used going forward from a place on that path (or from the start, with every body where it is drawn); going back, or from a state that is not on the path (a body left where it was
  // pushed by an earlier scrub), the steps are worked out as before
  const same = (x: ReturnType<typeof snap>, y: ReturnType<typeof snap>): boolean => x.vals.every((v, q) => Math.abs(v - y.vals[q]!) < 1e-9) && x.work.every((w, q) => !w.free || (y.work[q]!.free !== undefined && w.free.every((v, k) => Math.abs(v - y.work[q]!.free![k]!) < 1e-9) && Math.abs((w.spin ?? 0) - (y.work[q]!.spin ?? 0)) < 1e-9));
  const here = snap();
  const gFrom = gridAt(from);
  const atRest = here.vals.every((v) => Math.abs(v) < 1e-9) && here.work.every((w) => !w.free || (w.free.every((v) => Math.abs(v) < 1e-9) && Math.abs(w.spin ?? 0) < 1e-9));
  const onPath = sign > 0 && (from === 0 ? atRest : gFrom !== null && !!places.get(gFrom) && same(places.get(gFrom)!, here));
  const keep = onPath && targets.length <= MAX_STEPS && places !== undefined;
  for (let i = 0; i < targets.length && !jam; i++) {
    const a = targets[i]!, g = keep ? gridAt(a) : null;
    const known = g !== null ? places.get(g) : undefined;
    if (known) { restore(known); cur = a; good = a; continue; }
    advance(a, 0);
    if (!jam && g !== null && Math.abs(cur - a) < 1e-9) places.set(g, snap());
    if (!jam && i < targets.length - 1 && performance.now() - began > budgetMs) { slow = true; break; } // (the rest of the steps wait for the next frame)
  }
  if (slow && !note) note = "this push is heavy: it plays slower than real time";
  const pushables = c.pushables.map((p, i) => ({ ...p, value: vals[i]!, way: ways[i]!, push: pushes[i]!, ...(work[i]!.free ? { free: work[i]!.free, spin: work[i]!.spin ?? 0 } : {}), ...(work[i]!.dirSlide !== undefined ? { dirSlide: work[i]!.dirSlide } : {}), ...(work[i]!.dirTurn ? { dirTurn: work[i]!.dirTurn } : {}), turning: !!work[i]!.turning, since: work[i]!.since ?? 0, still: work[i]!.still ?? 0, ...(work[i]!.blockedBy ? { blockedBy: work[i]!.blockedBy } : {}) }));
  const follows = yieldsOf(pushables, movers.find((q) => q.turns)?.axis ?? [0, 0, 1]);
  return { ...m, amount: jam || slow ? good : m.amount, playing: jam ? false : m.playing, from: jam || slow ? good : m.from, startedAt: jam || slow ? null : m.startedAt, contact: { ...c, pushables, at: good, jam, note, clash: jam ? clash : null, target: slow ? m.amount : null }, yields: follows };
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


/**
 * Push a body that has no joint (`dec_contact_push`, free push): it has the three freedoms of a body in a plane, two of sliding and one of turning about its own middle, and moves by the smallest amount that clears what it is in. A turn of a degree is
 * counted as a slide of `reach` times a degree (how far its outline reaches from its middle), so the amounts can be compared. The ways to look are round a sphere of (slide, slide, turn): the way it was last pushed first, and the ones near it, then all of them.
 * No further than `FREE_STEP` in one step, and `FREE_MAX` in all. False when there is no room within that.
 */
function yieldFree(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], p: Pushable & { free: [number, number, number] }, ways: (1 | -1)[], pushes: number[], pi: number, w: number, pusher: Ref, mated: Set<string>, ignore: ReadonlySet<string>, solid: ReadonlySet<Ref>, statics: Ref[], clearance: number, strict = false): boolean {
  const base: [number, number, number] = [p.free[0], p.free[1], p.free[2]], spin0 = p.spin ?? 0, reach = Math.max(2, p.reach ?? 10);
  const axis = normalize(movers.find((q) => q.turns)?.axis ?? [0, 0, 1]);
  const u = normalize(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(axis, u);
  // a way is (a, b, c): a slide along u, a slide along v, a turn (as the slide it is worth), the three of length one
  const clear = (d: Vec3, t: number): boolean => {
    for (let k = 0; k < 3; k++) p.free[k] = base[k]! + (u[k]! * d[0] + v[k]! * d[1]) * t;
    p.spin = spin0 + ((d[2] * t) / reach) * (180 / Math.PI);
    return firstHit(scene, outcome, movers, a, vals, w, mated, ignore, solid, statics, clearance, strict ? undefined : pusher) === null; // (strict: clear of every body, those that yield too, where they stand)
  };
  const distances: number[] = [];
  for (let d = 0.07; d <= 0.56 + 1e-9; d += 0.07) distances.push(d); // (no further in one step than a body is thick: pushed further it would be thrown through what pushes it, and clear of it on the far side)
  for (let d = 0.8; d <= FREE_STEP + 1e-9; d += 0.25) distances.push(d);
  const spent = (d: Vec3, t: number): boolean => Math.hypot(base[0] + (u[0] * d[0] + v[0] * d[1]) * t, base[1] + (u[1] * d[0] + v[1] * d[1]) * t, base[2] + (u[2] * d[0] + v[2] * d[1]) * t) > FREE_MAX || Math.abs(spin0 + ((d[2] * t) / reach) * (180 / Math.PI)) > FREE_SPIN;
  // how far a way is clear: three tests along it (a third of a millimetre, a millimetre, the most a step may be), and the nearest place that clears is found by halving; a way whose clear places are all between the tests is found by the fine look
  // (every 0.07 mm), which is made only when no way was found by the three
  let fine = false;
  const coarse = [0.3, 1, FREE_STEP];
  const nearest = (d: Vec3): number | null => {
    const list = fine ? distances : coarse;
    let before = 0;
    for (const t of list) {
      if (spent(d, t)) return null;
      if (!clear(d, t)) { before = t; continue; }
      let [lo, hi] = [before, t];
      for (let k = 0; k < (fine ? 5 : 6); k++) { const mid = (lo + hi) / 2; if (clear(d, mid)) hi = mid; else lo = mid; }
      return hi;
    }
    return null;
  };
  // the order of freedom (`in_1077`): a body slides if any slide clears it; only when none does, it turns (a turn alone first, then a turn with a slide); when nothing does, it jams. The ways: 64 round the plane (the clear way out of a hole's wall
  // is narrow: a push a few degrees off it runs the body into the next facet of the wall), at five heights toward the turn, and the two ways of the turn alone. The last way it went, and the ones near it, are tried first.
  const PHI = 64, ELS = [0, 1, -1, 2, -2]; // (heights 0, 30, -30, 60, -60 degrees: the index of a height is its place here; 99 is the turn alone)
  const way = (k: number, e: number): Vec3 => {
    if (e === 99) return [0, 0, k === 0 ? 1 : -1];
    const el = (ELS[e]! * Math.PI) / 6, ph = (k * 2 * Math.PI) / PHI;
    return [Math.cos(el) * Math.cos(ph), Math.cos(el) * Math.sin(ph), Math.sin(el)];
  };
  let best: { k: number; e: number; t: number } | null = null;
  const tryWay = (k: number, e: number): void => { const t = nearest(way(k, e)); if (t !== null && (!best || t < best.t - 1e-6)) best = { k, e, t }; };
  const around = (k: number, e: number): [number, number][] => { // the way it last went and the ones near it (round the plane, and a height each side)
    if (e === 99) return [[k, 99], [(k + 1) % 2, 99]];
    const out: [number, number][] = [];
    for (const [dk, de] of [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [4, 0], [-4, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as [number, number][]) { const h = e + de; if (h >= 0 && h < ELS.length && (h === 0) === (e === 0)) out.push([(k + dk + PHI) % PHI, h]); }
    return out;
  };
  const warm = (list: [number, number][]): void => { for (const [k, e] of list) { tryWay(k, e); if (best && (best as { t: number }).t < 1) break; } }; // (a way near the last one that clears is taken as it is)
  const turning = !!p.turning, since = p.since ?? 0;
  // a body that is turning looks for a slide again only every few steps: the search that finds there is none is the costly part
  const slideNow = !turning || since >= 5;
  const rings = (es: number[]): void => { for (const e of es) for (let k = 0; k < PHI; k++) tryWay(k, e); };
  const search = (): void => {
    if (slideNow) {
      if (p.dirSlide !== undefined) warm(around(p.dirSlide, 0));
      if (!best) rings([0]);
    }
    if (!best) {
      if (p.dirTurn) warm(around(p.dirTurn[0], p.dirTurn[1]));
      if (!best) { tryWay(0, 99); tryWay(1, 99); } // (a turn alone)
      if (!best) rings([1, 2, 3, 4]);
    }
    if (!best && !slideNow) rings([0]); // (it had not looked for a slide for a few steps: the last way to look before a jam)
  };
  search();
  if (!best) { fine = true; search(); }
  const found = best as { k: number; e: number; t: number } | null;
  if (!found) {
    for (let k = 0; k < 3; k++) p.free[k] = base[k]!;
    p.spin = spin0;
    // what stops it, to say so: the body it runs into when it is moved a little any way with the pusher left out (a body that cannot be pushed further because it is against another)
    const [x, y] = [`${p.body}|${pusher}`, `${pusher}|${p.body}`];
    const skip = new Set([...ignore, x, y]);
    p.blockedBy = undefined;
    for (let k = 0; k < PHI && !p.blockedBy; k += 2) { const d = way(k, 0); for (let q = 0; q < 3; q++) p.free[q] = base[q]! + (u[q]! * d[0] + v[q]! * d[1]) * 0.3; p.blockedBy = firstHit(scene, outcome, movers, a, vals, w, mated, skip, solid, statics, clearance) ?? undefined; }
    for (let k = 0; k < 3; k++) p.free[k] = base[k]!;
    return false;
  }
  p.blockedBy = undefined;
  clear(way(found.k, found.e), found.t);
  if (found.e === 0) { p.dirSlide = found.k; p.turning = false; p.since = 0; } else { p.dirTurn = [found.k, found.e]; p.turning = true; p.since = slideNow ? 1 : since + 1; }
  pushes[pi] = found.t;
  ways[pi] = 1;
  return true;
}

/** Where two bodies are in each other at a pose, in space (the triangles of each that cross the other), to show a jam in red. */
function clashOf(scene: Scene, outcome: CompileOutcome | undefined, movers: Mover[], a: number, vals: number[], w: number, hit: Ref, clearance: number): number[] {
  const me = movers[w]!;
  const [rMe, rOther] = [me.pose(a, vals), movers.find((q) => q.body === hit)?.pose(a, vals) ?? IDENT];
  const [m1, o1] = [bodyMesh(scene, outcome, me.body), bodyMesh(scene, outcome, hit)];
  if (!m1 || !o1) return [];
  const pose = (tris: ArrayLike<number>, r: Rigid): number[] => { const out: number[] = new Array(tris.length); for (let i = 0; i + 2 < tris.length; i += 3) { const q = applyPoint(r, [tris[i]!, tris[i + 1]!, tris[i + 2]!]); out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; } return out; };
  const toOther = compose(rMe, inverse(rOther)), toMe = compose(rOther, inverse(rMe)); // (each body's triangles in the frame of the other, as the mesh test puts them)
  const mine = crossingTris(pose(m1.tris, toOther), o1.tree, clearance, 150), theirs = crossingTris(pose(o1.tris, toMe), m1.tree, clearance, 150);
  return [...pose(mine, rOther), ...pose(theirs, rMe)];
}

/** The follower of each body that yields: where it stands now, as the drawing of it needs. */
function yieldsOf(pushables: Pushable[], across: Vec3 = [0, 0, 1]): Follower[] {
  return pushables.map((p): Follower => {
    if (p.free) {
      const spin = p.spin ?? 0, len = Math.hypot(...p.free);
      if (Math.abs(spin) < 1e-6) return { gear: "", body: p.body, kind: "slide", point: p.point, dir: len > 1e-9 ? [p.free[0] / len, p.free[1] / len, p.free[2] / len] : [1, 0, 0], k: 0, value: len }; // (a move any way: a slide along the way it went)
      // a slide and a turn about its middle are one turn about another place (the plane's motions are all turns or slides): where that is
      const n = normalize(across), u = normalize(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), v = cross(n, u);
      const r = (spin * Math.PI) / 180, [c, s] = [Math.cos(r), Math.sin(r)];
      const t: [number, number] = [dot(p.free, u), dot(p.free, v)];
      const rhs: [number, number] = [t[0] - 0 + 0, t[1]]; // (the middle's own move: R·0 + t)
      // centre q: q = R q + (c0 - R c0) + t, with c0 the middle taken as the origin of the plane's axes: q = (I - R)^-1 t
      const [a11, a12, a21, a22] = [1 - c, s, -s, 1 - c];
      const det = a11 * a22 - a12 * a21;
      const q: [number, number] = [(a22 * rhs[0] - a12 * rhs[1]) / det, (-a21 * rhs[0] + a11 * rhs[1]) / det];
      const along = dot(p.free, n);
      const centre: Vec3 = [p.point[0] + u[0] * q[0] + v[0] * q[1] + n[0] * along, p.point[1] + u[1] * q[0] + v[1] * q[1] + n[1] * along, p.point[2] + u[2] * q[0] + v[2] * q[1] + n[2] * along];
      return { gear: "", body: p.body, kind: "turn", point: centre, dir: n, k: 0, value: spin };
    }
    return { gear: "", body: p.body, kind: p.kind, point: p.point, dir: p.dir, k: 0, value: p.value, ...(p.mate ? { mate: p.mate } : {}) };
  });
}

/** The motion started again from the beginning (pressing play after a jam): the driver at nothing, every body that yielded back where it is drawn, no jam. */
export function restartContact(c: ContactState, across: Vec3 = [0, 0, 1]): { contact: ContactState; yields: Follower[] } {
  const pushables = c.pushables.map((p): Pushable => { const { push: _p, dirSlide: _s, dirTurn: _t, turning: _u, since: _n, still: _z, blockedBy: _b, ...rest } = p; return { ...rest, value: 0, way: p.way, ...(p.free ? { free: [0, 0, 0] as [number, number, number], spin: 0 } : {}) }; });
  return { contact: { ...c, pushables, at: 0, jam: null, note: null, clash: null, target: null }, yields: yieldsOf(pushables, across) };
}
