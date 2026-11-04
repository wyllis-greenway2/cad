// Experiment: do OCCT history calls give stable, honest references?
import test from "node:test";
import assert from "node:assert/strict";
import { loadOC } from "../src/oc.mjs";
import { plateWithCornerRefs, cutBox, filletRefs, volumeOf, heightOf } from "../src/history.mjs";

await loadOC();
const W = 50, D = 30, H = 20, R = 3;
const corner = (1 - Math.PI / 4) * R * R; // area removed by one corner fillet
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6 * b, `${a} vs ${b}`);

test("baseline: four corner refs from the profile, filleted by name", () => {
  const { solid, refs } = plateWithCornerRefs(W, D, H);
  for (let i = 0; i < 4; i++) assert.equal(refs.get(`corner_${i}`).length, 1);
  const out = filletRefs(solid, refs, ["corner_0", "corner_1", "corner_2", "corner_3"], R);
  close(volumeOf(out), (W * D - 4 * corner) * H);
});

test("a through-notch destroys one corner: history says so, the other three still fillet correctly", () => {
  const { solid, refs } = plateWithCornerRefs(W, D, H);
  // cut a 10x10 notch centred on the plate's corner, through the whole height
  const cut = cutBox(solid, refs, [20, 10, -1], [30, 20, H + 1], "op_notch");
  const dead = [0, 1, 2, 3].filter((i) => refs.status(`corner_${i}`) === "destroyed");
  console.log(`# destroyed refs: ${dead.map((i) => "corner_" + i).join(", ")} | log: ${refs.log.join("; ")}`);
  assert.equal(dead.length, 1, "exactly one corner reference is reported destroyed");
  const alive = [0, 1, 2, 3].filter((i) => !dead.includes(i)).map((i) => `corner_${i}`);
  const out = filletRefs(cut, refs, alive, R);
  close(volumeOf(out), (W * D - 25 - 3 * corner) * H);
});

test("a partial notch (from z=5 up) modifies the corner edge into a 5 mm stub, not a deletion", () => {
  const { solid, refs } = plateWithCornerRefs(W, D, H);
  cutBox(solid, refs, [20, 10, 5], [30, 20, H + 1], "op_notch");
  const stubs = [0, 1, 2, 3].map((i) => refs.get(`corner_${i}`)).filter((l) => l.length === 1 && Math.abs(heightOf(l[0]) - 5) < 1e-6);
  console.log(`# stub refs: ${stubs.length} | log: ${refs.log.join("; ")}`);
  assert.equal(stubs.length, 1);
});

test("a window cut across a vertical edge splits its ref into two pieces", () => {
  const { solid, refs } = plateWithCornerRefs(W, D, H);
  cutBox(solid, refs, [20, 10, 8], [30, 20, 12], "op_window");
  const split = [0, 1, 2, 3].map((i) => refs.get(`corner_${i}`)).filter((l) => l.length === 2);
  console.log(`# split refs: ${split.length} | log: ${refs.log.join("; ")}`);
  assert.equal(split.length, 1);
  const heights = split[0].map(heightOf).sort((a, b) => a - b);
  assert.deepEqual(heights.map((v) => +v.toFixed(6)), [8, 8], "two 8 mm pieces (z 0-8 and 12-20)");
});
