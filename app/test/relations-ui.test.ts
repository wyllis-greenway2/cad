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
import { badgesFor, focusParts, suggestMeasure, anchorOf } from "../src/interaction/badges.ts";
import { entryOf } from "../src/interaction/entry.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((s, c) => key(s, c), st);
const select = (st: AppState, refs: Ref[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs } } });
const at = (st: AppState, r: Ref): Vec3 => pointOf(lookup(scene(st.session)), r)!;
const near = (a: number, b: number, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

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
  const sug = suggestMeasure(scene(st.session), selection(st.session))!;
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
  assert.equal(suggestMeasure(scene(st.session), selection(st.session)), null, "already locked: no suggestion");
});

test("a dimension cannot start from a selection that has no number", () => {
  const { st: st0, a } = pair();
  let st = select(st0, [a.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  assert.match(st.session.message ?? "", /two parts that can be measured/);
  assert.equal(st.op, null);
});

test("badges: the relations that touch the selection, with their number, lock and the parts they tie", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "12"), "Enter");
  st = select(st, [a.lines[0]!]);
  let badges = badgesFor(scene(st.session), selection(st.session), null);
  assert.equal(badges.length, 1, "a relation on a corner of the line touches the line");
  assert.deepEqual([badges[0]!.kind, badges[0]!.value, badges[0]!.locked, badges[0]!.unit, badges[0]!.broken], ["distance", 12, true, "mm", false]);
  assert.deepEqual(badges[0]!.others, [b.corners[0]], "what it ties the selection to");
  assert.equal(badgesFor(scene(st.session), [b.lines[0]!], null).length, 1, "and it shows on the other part too");
  badges = badgesFor(scene(st.session), selection(st.session), badges[0]!.id);
  assert.equal(badges[0]!.focused, true);
  const [p, q] = [at(st, a.corners[0]!), at(st, a.corners[1]!)];
  const m = anchorOf(scene(st.session), [a.lines[0]!])!;
  near(m[0], (p[0] + q[0]) / 2);
  near(m[1], (p[1] + q[1]) / 2);
});

test("focus a badge: the other parts it ties are the amber ones; Esc and a click elsewhere close it", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "12"), "Enter");
  const id = scene(st.session).relations[0]!.id;
  st = select(st, [a.corners[0]!]);
  st = reduce(st, { type: "relation", act: "focus", id }, env);
  assert.equal(st.focus, id);
  assert.deepEqual(focusParts(scene(st.session), selection(st.session), st.focus), [b.corners[0]]);
  st = reduce(st, { type: "relation", act: "focus", id }, env);
  assert.equal(st.focus, null, "focusing it again closes it");
  st = reduce(st, { type: "relation", act: "focus", id }, env);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.focus, null);
  assert.equal(selection(st.session).length, 1, "the first Esc closes the badge, not the selection");
  st = reduce(st, { type: "relation", act: "focus", id }, env);
  st = reduce(st, { type: "click", x: 5, y: 5, count: 1, shift: false }, env);
  assert.equal(st.focus, null);
});

test("edit a number: the new value is solved; delete the badge: the relation goes and undo brings it back", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "12"), "Enter");
  const id = scene(st.session).relations[0]!.id;
  st = reduce(st, { type: "relation", act: "edit", id }, env);
  assert.equal(st.op!.kind, "edit");
  assert.equal(entryOf(scene(st.session), null, st.op)!.fields[0]!.value, "12");
  st = typeText(st, "20");
  st = key(st, "Enter");
  near(dist(at(st, a.corners[0]!), at(st, b.corners[0]!)), 20);
  assert.equal(scene(st.session).relations[0]!.value, 20);
  st = reduce(st, { type: "relation", act: "remove", id }, env);
  assert.equal(scene(st.session).relations.length, 0);
  assert.equal(st.focus, null);
  st = { ...st, session: undoLast(st.session) };
  assert.equal(scene(st.session).relations.length, 1);
});

test("unlock leaves the number as a measurement only (the solver lets the part move); lock takes the value it measures now", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.corners[0]!, b.corners[0]!]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "12"), "Enter");
  const id = scene(st.session).relations[0]!.id;
  st = reduce(st, { type: "relation", act: "lock", id }, env);
  assert.equal(scene(st.session).relations[0]!.locked, false);
  st = { ...st, session: run(st.session, { type: "movePart", ref: a.corners[0]!, to: [0, 0, 0] }) };
  near(dist(at(st, a.corners[0]!), at(st, b.corners[0]!)), 5, 1e-4);
  const b1 = badgesFor(scene(st.session), [a.corners[0]!], null)[0]!;
  assert.deepEqual([b1.locked, b1.value], [false, 12]);
  near(b1.measured!, 5, 1e-4);
  st = reduce(st, { type: "relation", act: "lock", id }, env);
  assert.equal(scene(st.session).relations[0]!.locked, true);
  near(scene(st.session).relations[0]!.value!, 5, 1e-4);
});

test("a relation whose part was deleted is a broken badge", () => {
  const { st: st0, a, b } = pair();
  let st = select(st0, [a.lines[0]!, b.lines[0]!]);
  st = reduce(st, { type: "runAction", id: "parallel" }, env);
  assert.equal(scene(st.session).relations.length, 1);
  const rel = scene(st.session).relations[0]!;
  // a relation naming a part that is gone (as after an old file): added directly
  const broken = { ...scene(st.session), relations: [...scene(st.session).relations, { id: "r_999", kind: "horizontal", parts: ["d/e_099.s0" as Ref] }] };
  assert.equal(badgesFor(broken, [a.lines[0]!], null).length, 1);
  assert.equal(badgesFor({ ...broken, relations: broken.relations.map((r) => (r.id === rel.id ? { ...r, parts: [...r.parts, "d/e_098.p0" as Ref] } : r)) }, [a.lines[0]!], null)[0]!.broken, true);
});

test("a single line has a length you can set; a circle has a diameter; a selected closed figure shows the badges of its lines", () => {
  const { st: st0, a } = pair();
  let st = select(st0, [a.lines[0]!]);
  const sug = suggestMeasure(scene(st.session), selection(st.session))!;
  assert.deepEqual([sug.label, sug.value, sug.unit], ["Length", 10, "mm"]);
  st = reduce(st, { type: "begin", name: "dimension" }, env);
  st = key(typeText(st, "25"), "Enter");
  near(dist(at(st, a.corners[0]!), at(st, a.corners[1]!)), 25);
  assert.equal(badgesFor(scene(st.session), [a.lines[0]!], null)[0]!.label, "Length");
  // diameter
  let c = createState(createSession(kernel));
  const circ = drawCircle(scene(c.session), XY, [0, 0, 0], 4);
  c = { ...c, session: run(c.session, circ.command) };
  c = select(c, [circ.circle]);
  c = reduce(c, { type: "begin", name: "dimension" }, env);
  assert.equal(entryOf(scene(c.session), null, c.op)!.fields[0]!.value, "8");
  c = key(typeText(c, "30"), "Enter");
  near((scene(c.session).parts[circ.circle] as { radius: number }).radius, 15);
  // a drawn rectangle selected as a figure shows its sides' relations
  let r = createState(createSession(kernel));
  const sq = drawSquaredRectangle(scene(r.session), XY, [0, 0, 0], [10, 6, 0], [1, 0, 0], [0, 1, 0]);
  r = { ...r, session: run(r.session, sq.command) };
  const face = Object.values(scene(r.session).parts).find((p) => p.kind === "face")!.ref;
  assert.equal(badgesFor(scene(r.session), [face], null).length, 4, "horizontal, vertical, horizontal, vertical");
});
