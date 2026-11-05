import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { dist } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, selection, run, undoLast } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawChain, drawCircle, drawSquaredRectangle } from "../src/operation/build.ts";
import { lookup } from "../src/operation/scene.ts";
import { pointOf } from "../src/operation/part.ts";
import { annotationsFor, focusParts } from "../src/interaction/annotations.ts";
import { entryOf } from "../src/interaction/entry.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((s, c) => key(s, c), st);
const select = (st: AppState, refs: Ref[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs } } });
const at = (st: AppState, r: Ref): Vec3 => pointOf(lookup(scene(st.session)), r)!;
const near = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const nearV = (a: readonly number[], b: readonly number[], tol = 1e-4) => a.forEach((x, i) => near(x, b[i]!, tol));

/** Two corners 5 apart and two parallel lines. */
function pair() {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]]);
  s = run(s, a.command);
  const b = drawChain(scene(s), XY, [[3, 4, 0], [13, 4, 0]]);
  s = run(s, b.command);
  return { st: createState(s), a, b };
}

test("measure, then lock: the pair's number is suggested; D shows it in a chip; typing a number and Enter locks it and moves the first part", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  const sug = annotationsFor(scene(st.session), selection(st.session), null).find((x) => x.id === "measure")!;
  assert.deepEqual([sug.label, sug.value, sug.unit], ["Distance", 5, "mm"]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  assert.equal(st.op!.kind, "dimension");
  const e = entryOf(scene(st.session), null, st.op)!;
  assert.deepEqual([e.fields[0]!.label, e.fields[0]!.value, e.unit], ["Distance", "5", "mm"]);
  st = typeText(st, "12");
  st = key(st, "Enter");
  assert.equal(st.op, null);
  const rel = scene(st.session).relations[0]!;
  assert.deepEqual([rel.kind, rel.value, rel.locked], ["distance", 12, true]);
  near(dist(at(st, a.corners[0]!), at(st, b.corners[0]!)), 12);
  assert.deepEqual(at(st, b.corners[0]!), [3, 4, 0], "the second part is the reference and stayed");
  assert.equal(annotationsFor(scene(st.session), selection(st.session), null).some((x) => x.id === "measure"), false, "already locked: no suggestion");
});

test("a dimension cannot start from a selection that has no number", () => {
  const { st: st0, a } = pair();
  let st = select(st0, [a.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  assert.match(st.session.message ?? "", /two parts that can be measured/);
  assert.equal(st.op, null);
});

test("constraints belong to the thing they constrain: a line shows its own, a vertex its own, a face or plane none", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  let st = createState(s);
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "face")!.ref;
  const kinds = (refs: Ref[]) => annotationsFor(scene(st.session), refs, null).filter((a) => a.id !== "measure").map((a) => a.kind);
  assert.deepEqual(kinds([face]), [], "a face is only what its lines fill in: no constraints of its own");
  assert.deepEqual(kinds([XY]), [], "nor a plane");
  assert.deepEqual(kinds([r.lines[0]!]), ["horizontal"], "a line shows its line constraints");
  assert.deepEqual(kinds([r.lines[1]!]), ["vertical"]);
  assert.deepEqual(kinds([r.corners[0]!]), [], "a vertex shows only vertex constraints: the rectangle has none");
  st = select(st, [r.corners[0]!, r.corners[1]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "30"), "Enter");
  assert.deepEqual(kinds([r.corners[0]!]), ["distance"]);
  assert.deepEqual(kinds([r.corners[2]!]), [], "an unrelated vertex shows nothing");
});

test("each constraint is shown where it means something: on the line, between parallel lines, at the angle, where perpendicular lines meet if extended", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0]]); // a corner at (10,0)
  s = run(s, a.command);
  const b = drawChain(scene(s), XY, [[0, 20, 0], [10, 20, 0]]);
  s = run(s, b.command);
  let st = createState(s);
  const at = (refs: Ref[], id: string) => annotationsFor(scene(st.session), refs, null).find((x) => x.kind === id)!;
  // a length sits on its line
  st = select(st, [a.lines[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "12"), "Enter");
  near(at([a.lines[0]!], "length").at[1], 0, 1e-6);
  // an angle between two lines that meet: an arc drawn between them, the bubble beside it
  st = select(st, [a.lines[0]!, a.lines[1]!]);
  st = reduce(st, { type: "runAction", id: "angle" }, env);
  const ang = at([a.lines[0]!, a.lines[1]!], "angle");
  assert.equal(ang.lines.length, 1);
  assert.ok(ang.lines[0]!.length >= 8, "an arc");
  const corner = at2(st, a.corners[1]!);
  assert.ok(ang.lines[0]!.every((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 6), "the arc is round the shared corner");
  // parallel: in the space between the two lines
  st = select(st, [a.lines[0]!, b.lines[0]!]);
  st = reduce(st, { type: "runAction", id: "parallel" }, env);
  const par = at([a.lines[0]!, b.lines[0]!], "parallel");
  const [la, lb] = [mid2(st, a.lines[0]!), mid2(st, b.lines[0]!)];
  nearV(par.at, [(la[0] + lb[0]) / 2, (la[1] + lb[1]) / 2, 0], 1e-6);
  assert.ok(par.at[1] > la[1] && par.at[1] < lb[1], "between them");
  // an annotation is shown for either selected part, once
  assert.equal(annotationsFor(scene(st.session), [a.lines[0]!, b.lines[0]!], null).filter((x) => x.kind === "parallel").length, 1);
});

function at2(st: AppState, r: Ref): Vec3 { return at(st, r); }
function mid2(st: AppState, line: Ref): Vec3 {
  const l = scene(st.session).parts[line] as unknown as { a: Ref; b: Ref };
  const [p, q] = [at(st, l.a), at(st, l.b)];
  return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
}

test("perpendicular shows at the point the two lines would meet if extended", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]]);
  s = run(s, a.command);
  const b = drawChain(scene(s), XY, [[30, 5, 0], [30, 15, 0]]); // a vertical line far to the right: it meets the first one's extension at (30, 0)
  s = run(s, b.command);
  let st = select(createState(s), [a.lines[0]!, b.lines[0]!]);
  st = reduce(st, { type: "runAction", id: "perpendicular" }, env);
  const p = annotationsFor(scene(st.session), [a.lines[0]!], null).find((x) => x.kind === "perpendicular")!;
  near(p.at[0], 30, 1e-3);
  near(p.at[1], 0, 1e-3);
});

test("a bubble opens and closes: focusing twice closes it; the number can be typed over, locked, unlocked and deleted; a free pair's measure is locked by a number", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  st = reduce(st, { type: "relation", act: "measure", id: null, value: 12 }, env);
  const rel = scene(st.session).relations[0]!;
  assert.deepEqual([rel.kind, rel.value, rel.locked], ["distance", 12, true]);
  near(dist(at(st, a.corners[0]!), at(st, b.corners[0]!)), 12);
  st = reduce(st, { type: "relation", act: "focus", id: rel.id }, env);
  assert.equal(annotationsFor(scene(st.session), selection(st.session), st.focus).find((x) => x.id === rel.id)!.open, true);
  assert.deepEqual(focusParts(scene(st.session), selection(st.session), st.focus), []);
  st = reduce(st, { type: "relation", act: "focus", id: rel.id }, env);
  assert.equal(st.focus, null, "the second click closes it");
  st = reduce(st, { type: "relation", act: "set", id: rel.id, value: 20 }, env);
  near(dist(at(st, a.corners[0]!), at(st, b.corners[0]!)), 20);
  st = reduce(st, { type: "relation", act: "lock", id: rel.id }, env);
  assert.equal(scene(st.session).relations[0]!.locked, false);
  st = reduce(st, { type: "relation", act: "lock", id: rel.id }, env);
  assert.equal(scene(st.session).relations[0]!.locked, true);
  st = reduce(st, { type: "relation", act: "set", id: rel.id, value: -3 }, env);
  near(scene(st.session).relations[0]!.value!, 20, 1e-6); // a number that is not positive is ignored
  st = reduce(st, { type: "relation", act: "remove", id: rel.id }, env);
  assert.equal(scene(st.session).relations.length, 0);
  st = { ...st, session: undoLast(st.session) };
  assert.equal(scene(st.session).relations.length, 1);
});

test("several selected parts each show their own: one line shows its constraints, another its, both shows both", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [30, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const st = createState(s);
  const one = annotationsFor(scene(st.session), [r.lines[0]!], null).filter((x) => x.id !== "measure");
  const two = annotationsFor(scene(st.session), [r.lines[1]!], null).filter((x) => x.id !== "measure");
  const both = annotationsFor(scene(st.session), [r.lines[0]!, r.lines[1]!], null).filter((x) => x.id !== "measure");
  assert.equal(one.length, 1);
  assert.equal(two.length, 1);
  assert.equal(both.length, 2);
  assert.notDeepEqual(one[0]!.at, two[0]!.at, "each is on its own line");
});
