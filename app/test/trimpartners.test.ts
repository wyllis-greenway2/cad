// A trim that makes a corner where another corner already is joins the two (`in_240`, `dec_hide_structural_constraints`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawCircle, drawChain } from "../src/operation/build.ts";
import { trimAt } from "../src/operation/trim.ts";
import { pointOf } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");

test("two lines crossing, the half of each past the crossing trimmed: the two new ends at the crossing are made coincident", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [20, 0, 0]]); s = run(s, a.command);
  const b = drawChain(scene(s), XY, [[10, -10, 0], [10, 10, 0]]); s = run(s, b.command);
  const first = trimAt(scene(s), a.lines[0]!, [15, 0, 0])!; // the part of the first line past the second
  s = run(s, first.command);
  assert.equal(scene(s).relations.filter((r) => r.kind === "coincident").length, 0, "nothing else was at the crossing yet");
  const rest = Object.values(scene(s).parts).find((p) => p.kind === "line" && p.origin === "drawn" && p.ref !== b.lines[0]! && !p.center)!;
  assert.ok(rest);
  const second = trimAt(scene(s), b.lines[0]!, [10, 5, 0])!; // the upper half of the second, cut where the first now ends
  assert.ok(second, "the end of the first line cuts the second");
  s = run(s, second.command);
  const co = scene(s).relations.filter((r) => r.kind === "coincident");
  assert.equal(co.length, 1, "one coincident for the pair");
  const [p, q] = co[0]!.parts.map((r) => pointOf((x) => scene(s).parts[x], r)!);
  assert.ok(Math.hypot(p![0] - q![0], p![1] - q![1], p![2] - q![2]) < 1e-6, "they are at one spot");
});

test("a circle trimmed where a line already ends on it: the arc's end is made coincident with the line's end", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10); s = run(s, c.command);
  const l = drawChain(scene(s), XY, [[-15, 0, 0], [15, 0, 0]]); s = run(s, l.command);
  const line = () => Object.values(scene(s).parts).find((p) => p.kind === "line" && p.origin === "drawn" && !p.center)!.ref;
  s = run(s, trimAt(scene(s), line(), [-12, 0, 0])!.command); // outside the circle on the left
  s = run(s, trimAt(scene(s), line(), [12, 0, 0])!.command); // and on the right: a chord is left, its ends on the circle
  assert.equal(scene(s).relations.filter((r) => r.kind === "coincident").length, 0, "no corner of the circle was there yet");
  const cut = trimAt(scene(s), c.circle, [0, -10, 0]);
  assert.ok(cut, "the circle is cut by the chord's two ends");
  s = run(s, cut!.command);
  const co = scene(s).relations.filter((r) => r.kind === "coincident");
  assert.equal(co.length, 2, "each end of the arc is joined to the end of the chord that was on the circle there");
  for (const r of co) {
    const [p, q] = r.parts.map((x) => pointOf((y) => scene(s).parts[y], x)!);
    assert.ok(Math.hypot(p![0] - q![0], p![1] - q![1], p![2] - q![2]) < 1e-6);
  }
});
