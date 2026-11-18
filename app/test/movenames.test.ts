// A body moved among others keeps the names of all its faces and the others keep theirs (`in_912`): the names were left where they were whenever one body of several was moved, so the faces that stand across the motion lost theirs.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { worldRef } from "../src/shared/ref.ts";

await kernel.init();
const box = (s: Session, x: number): Session => {
  const r = drawRectangle(scene(s), worldRef("XY"), [x, 0, 0], [x + 8, 8, 0], [1, 0, 0], [0, 1, 0]);
  const s2 = run(s, r.command);
  return runOp(s2, { ...(startOp(scene(s2), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: 5 })!.session;
};
const names = (s: Session): string[] => ((s.outcome as unknown as { kernel: { faceNames: { name: string }[] } }).kernel.faceNames ?? []).map((f) => f.name).sort();

test("moving the middle one of three bodies along the row keeps the names of its six faces, and the names of the others", () => {
  let s = createSession(kernel);
  for (const x of [0, 20, 40]) s = box(s, x);
  const before = names(s);
  assert.equal(before.length, 18);
  const middle = scene(s).steps.filter((st) => st.type === "extrude")[1]!.id;
  const ref = Object.values(scene(s).parts).find((p) => p.kind === "body" && (p as { id?: string }).id === `x_${middle}`)!.ref;
  const st = startOp(scene(s), [ref] as never, "move");
  assert.ok(st.ok);
  const moved = run(s, opCommand(scene(s), { ...(st as { op: Op }).op, value: 5 })!);
  assert.deepEqual(moved.outcome.errors, {});
  assert.deepEqual(names(moved).filter((n) => !/^x_s_0(07|08):/.test(n)), before, "every name there was is still there (the move's own fresh names are not counted)");
  assert.equal(names(moved).filter((n) => /^x_s_0(07|08):/.test(n)).length, 0, "and no face was given a new name");
});
