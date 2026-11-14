// An arc tangent to another round curve can be trimmed anywhere (`in_338`). The solver holds such a tangent at an end of the arc; trimming off the piece with that end left the arc a tangent it could not
// take, and the whole trim was refused with relations nobody could see. Now the tangent is kept only when the piece that is left still ends where they touch.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { trimAt } from "../src/operation/trim.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/trim-arc-tangent-in_338.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const along = (s: Session, ref: string, f: number): Vec3 => {
  const sc = scene(s);
  const l = sc.parts[ref as never] as { a: string; b: string; center: string; ccw: boolean };
  const [a, b, c] = [l.a, l.b, l.center].map((r) => (sc.parts[r as never] as { at: Vec3 }).at);
  const r = Math.hypot(a![0] - c![0], a![1] - c![1]);
  const a0 = Math.atan2(a![1] - c![1], a![0] - c![0]);
  let a1 = Math.atan2(b![1] - c![1], b![0] - c![0]);
  if (l.ccw) while (a1 < a0) a1 += 2 * Math.PI; else while (a1 > a0) a1 -= 2 * Math.PI;
  const t = a0 + (a1 - a0) * f;
  return [c![0] + r * Math.cos(t), c![1] + r * Math.sin(t), 0];
};

for (const f of [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]) {
  test(`the arc tangent to the other arc is trimmed at ${f} of its length`, () => {
    const s = open();
    const plan = trimAt(scene(s), "d/e_023.s0", along(s, "d/e_023.s0", f));
    assert.ok(plan, "a plan");
    const done = run(s, plan.command);
    assert.equal(done.message, null);
    assert.ok(!scene(done).parts["d/e_023.s0"], "the arc is cut");
  });
}

test("the tangent to the other arc stays on the piece that still ends where they touch, and goes with the piece that does not", () => {
  const touching = (s: Session) => scene(s).relations.filter((r) => r.kind === "tangent" && r.parts.includes("d/e_042.s0") && r.parts.some((p) => /^d\/e_0(5\d|6\d)\.s\d$/.test(p)));
  const s = open();
  // the end of the arc that touches the other arc is its start: cutting the far end keeps it
  const far = run(s, trimAt(scene(s), "d/e_023.s0", along(s, "d/e_023.s0", 0.9))!.command);
  assert.equal(touching(far).length, 1, "kept");
  const near = run(s, trimAt(scene(s), "d/e_023.s0", along(s, "d/e_023.s0", 0.1))!.command);
  assert.equal(touching(near).length, 0, "dropped with the touching end");
});
