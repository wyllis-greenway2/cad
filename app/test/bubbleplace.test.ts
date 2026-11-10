// Where the bubbles stand (`in_259`): a bubble keeps its place while that place is clear, gives way to what comes first, and does not jump about as the camera turns.
import test from "node:test";
import assert from "node:assert/strict";
import { placeBubbles } from "../src/interaction/bubbleplace.ts";
import type { Obstacles, Memory } from "../src/interaction/bubbleplace.ts";

const none: Obstacles = { lines: [], dots: [] };
const one = (x: number, y: number, obs: Obstacles, memory: Memory, w = 60) => placeBubbles([{ id: "a", x, y, w }], obs, memory)[0]!;
const offsetOf = (x: number, y: number, p: { left: number; top: number }, w = 60) => [Math.round(p.left - (x - w / 2)), Math.round(p.top + 13 - y)];

test("a bubble stands up and to the right of its spot when nothing is in the way", () => {
  const p = one(100, 100, none, new Map());
  assert.deepEqual(offsetOf(100, 100, p), [Math.round(Math.cos(Math.PI / 4) * 28), -Math.round(Math.sin(Math.PI / 4) * 28)]);
});

test("it keeps the place it has while that is clear, even if a better one is free, and moves only when something comes to be in the way", () => {
  const memory: Memory = new Map();
  const first = one(100, 100, none, memory);
  // a line through the usual place (up and right) that the place it has does not meet: nothing changes if it was elsewhere
  memory.set("a", [-28, 0]); // it was left of its spot
  const kept = one(100, 100, { lines: [[[100, 60], [160, 60]]], dots: [] }, memory);
  assert.deepEqual(offsetOf(100, 100, kept), [-28, 0], "the place it had");
  // now a line right through that place: it goes to a clear one
  const moved = one(100, 100, { lines: [[[40, 80], [40, 120]], [[30, 100], [75, 100]]], dots: [] }, memory);
  assert.notDeepEqual(offsetOf(100, 100, moved), [-28, 0]);
  void first;
});

test("a bubble gives way to what comes first (the ring, the number being typed) and goes back to a clear place", () => {
  const memory: Memory = new Map();
  const at = one(100, 100, none, memory);
  const rect: [number, number, number, number] = [at.left - 5, at.top - 5, at.left + 70, at.top + 31];
  const away = one(100, 100, { ...none, rects: [rect] }, memory);
  assert.ok(away.left + 60 <= rect[0] + 3 || away.left >= rect[2] - 3 || away.top + 26 <= rect[1] + 3 || away.top >= rect[3] - 3, "it does not stand on the box");
});

test("turning the view past a corner does not make a bubble jump about: far fewer changes of place than starting the search again every frame", () => {
  // a ring of radial lines like a gear's, turned a degree at a time, with a bubble on the rim
  const spokes = 24;
  const run = (keep: boolean): number => {
    const memory: Memory = new Map();
    let changes = 0;
    let last: number[] | null = null;
    for (let deg = 0; deg < 360; deg += 1) {
      const lines: Obstacles["lines"] = [];
      for (let k = 0; k < spokes; k++) { const a = ((k * 360) / spokes + deg) * Math.PI / 180; lines.push([[300 + 40 * Math.cos(a), 300 + 40 * Math.sin(a)], [300 + 120 * Math.cos(a), 300 + 120 * Math.sin(a)]]); }
      const a = (30 + deg) * Math.PI / 180;
      const [x, y] = [300 + 100 * Math.cos(a), 300 + 100 * Math.sin(a)];
      const p = one(x, y, { lines, dots: [] }, keep ? memory : new Map(), 50);
      const off = offsetOf(x, y, p, 50);
      if (last && (off[0] !== last[0] || off[1] !== last[1])) changes++;
      last = off;
    }
    return changes;
  };
  const fresh = run(false);
  const kept = run(true);
  console.log(`bubble changed place ${kept} times in a full turn with memory, ${fresh} times without`);
  assert.ok(kept < fresh * 0.6, `${kept} changes with memory, ${fresh} without`);
});

test("bubbles on one spot are laid side by side, and each remembers the same place", () => {
  const memory: Memory = new Map();
  const put = placeBubbles([{ id: "a", x: 100, y: 100, w: 40 }, { id: "b", x: 104, y: 102, w: 40 }], none, memory);
  assert.ok(put[1]!.left - put[0]!.left >= 40, "side by side");
  assert.deepEqual(memory.get("a"), memory.get("b"));
  placeBubbles([{ id: "a", x: 100, y: 100, w: 40 }], none, memory);
  assert.equal(memory.has("b"), false, "a bubble that is gone forgets");
});

test("with no clear place within reach under what comes first, a bubble is faded; with room it moves and is not (`in_260`)", () => {
  const big: [number, number, number, number] = [-1000, -1000, 1000, 1000];
  assert.equal(one(100, 100, { ...none, rects: [big] }, new Map()).faded, true, "covered everywhere: faded");
  const ring: [number, number, number, number] = [60, 40, 160, 110];
  const moved = one(100, 100, { ...none, rects: [ring] }, new Map());
  assert.equal(moved.faded, false, "it found room beside the box");
});
