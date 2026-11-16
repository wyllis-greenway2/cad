// An arc says how far round it goes as well as its radius, and the angle can be set (`in_463`).
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { drawArc } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
import { arcSweepDeg } from "../src/interaction/rows.ts";
import { lookup } from "../src/operation/scene.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;

function arc() {
  let s = createSession(kernel);
  const a = drawArc(scene(s), XY, [10, 0, 0], [10 * Math.SQRT1_2, 10 * Math.SQRT1_2, 0], [0, 10, 0], [0, 0, 1])!; // a quarter round about the origin
  s = run(s, a.command);
  return { s, line: a.line };
}
const sweep = (s: ReturnType<typeof createSession>, line: string): number => arcSweepDeg({ scene: scene(s), get: lookup(scene(s)), parts: [line as never] }, line as never)!;

test("a selected arc shows its radius and its angle, with dashed lines from its centre to its ends and the little arc of the angle between them", () => {
  const { s, line } = arc();
  near(sweep(s, line), 90);
  const notes = annotationsFor(scene(s), [line as never], null);
  const angle = notes.find((a) => a.id === "measure:arcAngle");
  assert.ok(angle, "the angle is among the numbers");
  assert.equal(angle!.unit, "deg");
  near(angle!.value!, 90);
  assert.equal(angle!.dashed!.length, 2, "two dashed lines, from the centre to each end");
  assert.ok(angle!.lines[0]!.length > 8, "and the mark of the angle");
  assert.ok(notes.some((a) => a.kind === "radius"), "the radius is shown as before");
});

test("the angle can be typed: the arc goes round that far, its radius and its centre unchanged", () => {
  const { s, line } = arc();
  let st = { ...createState({ ...s, click: { ...s.click, selection: [line as never] } }), cam: homeCamera() };
  st = reduce(st, { type: "relation", act: "measure", id: "measure:arcAngle", value: 150 }, env);
  assert.equal(st.session.message, null);
  near(sweep(st.session, line), 150);
  const l = scene(st.session).parts[line]! as unknown as { a: string; center: string };
  const [c, a] = [scene(st.session).parts[l.center]! as unknown as { at: number[] }, scene(st.session).parts[l.a]! as unknown as { at: number[] }];
  near(Math.hypot(a.at[0]! - c.at[0]!, a.at[1]! - c.at[1]!), 10, 0.05);
  assert.ok(scene(st.session).relations.some((r) => r.kind === "arcAngle" && r.value === 150), "kept as a constraint");
});

function near(a: number, b: number, tol = 0.01): void { assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`); }
