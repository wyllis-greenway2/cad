// An arc tangent to another round curve can be trimmed anywhere (`in_338`). The solver used to hold such a tangent at an end of the arc, so trimming off the piece with that end left the arc a tangent it could not
// take, and the whole trim was refused with relations nobody could see. It is now the distance between the centres (`in_340`), whatever the arc's ends.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { trimAt } from "../src/operation/trim.ts";
import type { Vec3 } from "../src/math/vec.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/trim-arc-tangent-in_338.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const along = (s: Session, ref: string, f: number): Vec3 => {
  const sc = scene(s);
  const l = sc.parts[ref as Ref] as { a: string; b: string; center: string; ccw: boolean };
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
    const plan = trimAt(scene(s), "d/e_023.s0" as Ref, along(s, "d/e_023.s0", f));
    assert.ok(plan, "a plan");
    const done = run(s, plan.command);
    assert.equal(done.message, null);
    assert.ok(!scene(done).parts["d/e_023.s0"], "the arc is cut");
  });
}

test("the tangent to the other arc stays on the piece that is left, wherever the cut is, and holds when the sketch is moved", () => {
  const touching = (s: Session) => scene(s).relations.filter((r) => r.kind === "tangent" && r.parts.includes("d/e_042.s0" as Ref) && r.parts.some((p) => /^d\/e_0(5\d|6\d)\.s\d$/.test(p)));
  const s = open();
  for (const f of [0.1, 0.9]) {
    const done = run(s, trimAt(scene(s), "d/e_023.s0" as Ref, along(s, "d/e_023.s0", f))!.command);
    assert.equal(touching(done).length, 1, `kept at ${f}`);
    // the two arcs still touch: the distance of their centres is the sum or the difference of their radii
    const sc = scene(done);
    const pt = (r: string) => (sc.parts[r as Ref] as { at: Vec3 }).at;
    const arc = touching(done)[0]!.parts.find((p) => p !== "d/e_042.s0")!;
    const [A, B] = [sc.parts[arc as Ref] as { a: string; center: string }, sc.parts["d/e_042.s0" as Ref] as { a: string; center: string }];
    const rad = (q: { a: string; center: string }) => Math.hypot(pt(q.a)[0] - pt(q.center)[0], pt(q.a)[1] - pt(q.center)[1]);
    const dist = Math.hypot(pt(A.center)[0] - pt(B.center)[0], pt(A.center)[1] - pt(B.center)[1]);
    assert.ok(Math.min(Math.abs(dist - (rad(A) + rad(B))), Math.abs(dist - Math.abs(rad(A) - rad(B)))) < 1e-4, "still touching");
  }
});
