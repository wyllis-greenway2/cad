// A body with a hole, moved: it stays, and the hole goes with it (`in_317`). The sketch of a body made from tangent circles is named by pieces of circles ("d/arc@e_001.k@..."), and those circles were left behind by the carry, so the step that made the body broke and the body was gone; the hole's plane, drawn while there was one body, had no owner and the hole was moved twice.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
type Body = Extract<Part, { kind: "body" }>;
const body = (s: Session, id: string) => Object.values(scene(s).parts).find((p): p is Body => p.kind === "body" && p.id === id)!;
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/hole-body-move-in_317.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;

for (const [axis, value] of [[1, -6.5], [1, -20], [0, -10], [2, 5]] as const) {
  test(`the body with the hole moved ${value} along axis ${axis} stays, with its hole`, () => {
    const s = open();
    const before = body(s, "x_s_028");
    const sc = scene(s);
    const st = startOp(sc, [before.ref], "move");
    assert.ok(st.ok);
    const moved = run(s, opCommand(sc, { ...st.op, axis, value })!);
    assert.deepEqual(moved.outcome.errors, {});
    const after = body(moved, "x_s_028");
    assert.ok(after, "the body is still there");
    assert.ok(Math.abs(after.bbox!.min[axis] - (before.bbox!.min[axis] + value)) < 1e-3, "it moved by the distance");
    assert.ok(Math.abs(after.volume! - before.volume!) < 0.01, "same solid: the hole went with it and was not cut twice");
    assert.equal(Object.values(scene(moved).parts).filter((p) => p.origin === "body" && p.of === after.ref && "curved" in p && p.curved).length, 1, "the hole is there");
  });
}
