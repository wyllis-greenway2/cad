// A drawn corner nothing is drawn on goes with the parts that stood on it, in one place, the command layer (`in_332`, `in_334`): whatever takes lines or circles away (a delete, a trim, a deleted surface) leaves no corner behind
// to be snapped to; a corner a step names stays; and a history made before the rule, which deletes such corners by name afterwards, still replays.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { createSession, run, scene, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawChain, drawCircle, drawArc } from "../src/operation/build.ts";
import type { Command } from "../src/operation/commands.ts";
import { apply } from "../src/operation/commands.ts";

await kernel.init();
const XY = worldRef("XY");
const cornersOf = (s: Session): string[] => Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => p.ref).sort();
const linesOf = (s: Session): string[] => Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.derived).map((p) => p.ref).sort();
const make = (c: Command) => (s: Session) => run(s, c);

test("a line taken away takes its two ends; one shared with another line stays", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]], false);
  s = make(a.command)(s);
  assert.equal(cornersOf(s).length, 2);
  const lone = run(s, { type: "deleteParts", refs: a.lines });
  assert.deepEqual(cornersOf(lone), [], "both ends went");
  // two lines in a row: the corner between them stays when one goes, its free end goes
  let t = createSession(kernel);
  const c = drawChain(scene(t), XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0]], false);
  t = make(c.command)(t);
  assert.equal(cornersOf(t).length, 3);
  const [first] = c.lines;
  const rest = run(t, { type: "deleteParts", refs: [first!] });
  assert.equal(cornersOf(rest).length, 2, "the free end went, the shared corner stayed with the other line");
  assert.equal(linesOf(rest).length, 1);
});

test("a corner of a square taken away takes its two lines and leaves no stray", () => {
  let s = createSession(kernel);
  const sq = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]], true);
  s = make(sq.command)(s);
  assert.equal(cornersOf(s).length, 4);
  const after = run(s, { type: "deletePart", ref: sq.corners[0]! });
  assert.equal(linesOf(after).length, 2, "the two lines on it went");
  assert.equal(cornersOf(after).length, 3, "the three corners still on a line stay");
  const every = new Set<string>();
  for (const p of Object.values(scene(after).parts)) if (p.kind === "line" && !p.derived) { every.add(p.a); every.add(p.b); }
  for (const c of cornersOf(after)) assert.ok(every.has(c), `${c} has a line on it`);
});

test("a circle takes its middle; an arc takes its middle unless another curve is about it", () => {
  let s = createSession(kernel);
  const circ = drawCircle(scene(s), XY, [0, 0, 0], 5);
  s = make(circ.command)(s);
  const gone = run(s, { type: "deleteParts", refs: [circ.circle] });
  assert.deepEqual(cornersOf(gone), [], "the circle's middle went");
  // an arc and a circle about the same middle (a hand-made scene: the circle is drawn on the arc's middle corner)
  let t = createSession(kernel);
  const arc = drawArc(scene(t), XY, [5, 0, 0], [0, 5, 0], [-5, 0, 0], [0, 0, 1]);
  assert.ok(arc);
  t = make(arc!.command)(t);
  const before = cornersOf(t);
  assert.ok(before.includes(arc!.centre), "the arc has a middle corner");
  const noArc = run(t, { type: "deleteParts", refs: [arc!.line] });
  assert.deepEqual(cornersOf(noArc), [], "all three corners went with the arc");
  const circle = { type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_900.k", kind: "circle", center: arc!.centre, radius: 5 } } as unknown as Command;
  const both = run(t, circle);
  const arcOnly = run(both, { type: "deleteParts", refs: [arc!.line] });
  assert.ok(cornersOf(arcOnly).includes(arc!.centre), "the middle stays: the circle is about it");
});

test("a corner a step names stays", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]], false);
  s = make(a.command)(s);
  const named = a.corners[0]!;
  // (on the scene itself: the session would refuse a move step with no body to move)
  const withStep = apply(scene(s), { type: "addStep", step: { id: "s_900", type: "move", parts: [named], params: { axis: 0, value: 1 } } });
  assert.ok(withStep.ok);
  if (!withStep.ok) return;
  const after = apply(withStep.value, { type: "deleteParts", refs: a.lines });
  assert.ok(after.ok);
  if (!after.ok) return;
  const left = Object.values(after.value.parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => p.ref);
  assert.deepEqual(left, [named], "the one the step names is kept, the other went");
});

test("parts that are gone already are not an error: a history made before the rule still replays", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]], false);
  s = make(a.command)(s);
  const once = run(s, { type: "deleteParts", refs: a.lines });
  // the old history then deleted the ends by name
  const again = run(once, { type: "deleteParts", refs: a.corners });
  assert.equal(again.message, null);
  assert.deepEqual(cornersOf(again), []);
  const twice = run(again, { type: "deleteParts", refs: a.lines });
  assert.equal(twice.message, null, "a line that is not there is not an error either");
});

test("a corner made in the same batch, before anything stands on it, is not taken", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0]], false);
  s = make(a.command)(s);
  const lonely = { type: "addPart", part: { origin: "drawn", plane: XY, movable: true, ref: "d/e_901.p0" as Ref, kind: "corner", at: [50, 50, 0] } } as unknown as Command;
  const after = run(s, { type: "batch", commands: [lonely, { type: "deleteParts", refs: a.lines }] });
  assert.deepEqual(cornersOf(after), ["d/e_901.p0"], "only the corners that stood under what went are taken");
});

test("undo brings the line and its ends back", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [10, 0, 0], [10, 10, 0]], false);
  s = make(a.command)(s);
  const [before, beforeLines] = [cornersOf(s), linesOf(s)];
  const gone = run(s, { type: "deleteParts", refs: a.lines });
  assert.notDeepEqual(cornersOf(gone), before);
  const back = undoLast(gone);
  assert.deepEqual(cornersOf(back), before);
  assert.deepEqual(linesOf(back), beforeLines);
});
