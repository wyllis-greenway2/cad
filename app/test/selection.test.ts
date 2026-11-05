import test from "node:test";
import assert from "node:assert/strict";
import { ref } from "../src/shared/ref.ts";
import { select, extend, toggle, clear, cycle, click, initialClick, ordered, mover, reference } from "../src/interaction/selection.ts";
import { newHistory, exec } from "../src/operation/history.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { lookup } from "../src/operation/scene.ts";
import { worldRef } from "../src/shared/ref.ts";

const a = ref("d/e_001.p0");
const b = ref("d/e_001.p1");
const c = ref("d/e_001.s0");

test("select, extend, toggle, clear", () => {
  assert.deepEqual(select([a, b], c), [c]);
  assert.deepEqual(extend([a], b), [a, b]);
  assert.deepEqual(extend([a, b], a), [a, b], "adding what is there changes nothing, and the order stays");
  assert.deepEqual(toggle([a, b], a), [b]);
  assert.deepEqual(toggle([a], b), [a, b]);
  assert.deepEqual(clear(), []);
});

test("cycle wraps and starts at the first", () => {
  assert.equal(cycle([a, b, c], undefined), a);
  assert.equal(cycle([a, b, c], a), b);
  assert.equal(cycle([a, b, c], c), a);
  assert.equal(cycle([], a), undefined);
});

test("a click selects the first candidate; the same click again cycles with 'i of n'; one thing does not cycle", () => {
  let st = initialClick();
  let r = click(st, [a, b, c]);
  assert.deepEqual(r.state.selection, [a]);
  assert.equal(r.cycled, undefined);
  r = click(r.state, [a, b, c]);
  assert.deepEqual(r.state.selection, [b]);
  assert.deepEqual(r.cycled, { index: 2, of: 3 });
  r = click(r.state, [a, b, c]);
  r = click(r.state, [a, b, c]);
  assert.deepEqual(r.state.selection, [a], "wraps");
  const one = click(initialClick(), [a]);
  assert.deepEqual(click(one.state, [a]).state.selection, [a]);
  assert.equal(click(one.state, [a]).cycled, undefined);
});

test("a different spot starts over, and a click on nothing lets go of everything", () => {
  let r = click(initialClick(), [a, b]);
  r = click(r.state, [c]);
  assert.deepEqual(r.state.selection, [c]);
  r = click(r.state, [], { shift: true });
  assert.deepEqual(r.state.selection, []);
});

test("Shift adds across kinds in any order, and Shift on a selected part takes it out", () => {
  let r = click(initialClick(), [a]);
  r = click(r.state, [c], { shift: true });
  assert.deepEqual(r.state.selection, [a, c]);
  r = click(r.state, [b], { shift: true });
  assert.deepEqual(r.state.selection, [a, c, b]);
  r = click(r.state, [c], { shift: true });
  assert.deepEqual(r.state.selection, [a, b]);
});

test("the corner selected after another stays selected whichever order (the bug of in_090)", () => {
  let r = click(initialClick(), [b]);
  r = click(r.state, [a], { shift: true });
  assert.deepEqual(r.state.selection, [b, a]);
  r = click(r.state, [], { shift: false });
  assert.deepEqual(r.state.selection, [], "clicking nowhere clears all, nothing is left over");
});

test("Shift on the same spot again swaps the part added last for the next candidate", () => {
  let r = click(initialClick(), [c]);
  r = click(r.state, [a, b], { shift: true });
  assert.deepEqual(r.state.selection, [c, a]);
  r = click(r.state, [a, b], { shift: true });
  assert.deepEqual(r.state.selection, [c, b]);
  assert.deepEqual(r.cycled, { index: 2, of: 2 });
});

test("the first selected is the mover, the second the reference, and a part that cannot move is always the reference", () => {
  const h0 = newHistory();
  const d = drawRectangle(h0.scene, worldRef("XY"), [0, 0, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  const h = exec(h0, d.command);
  assert.ok(h.ok);
  if (!h.ok) return;
  const get = lookup(h.value.scene);
  const world = worldRef("O");
  const [p0, p1] = d.corners as [typeof a, typeof a];
  assert.equal(mover([p0, p1], get), p0);
  assert.equal(reference([p0, p1], get), p1);
  assert.deepEqual(ordered([world, p1], get), [p1, world], "the world origin goes second although selected first");
  assert.equal(mover([world], get), undefined);
});
