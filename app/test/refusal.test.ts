// A move a constraint stops says so, the same way whatever moved it, and can be pushed through by deleting the constraint (`in_335`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run, previewCommand, previewRefusal, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { Env } from "../src/interaction/control/state.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/circle-held-by-concentric-in_335.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const centre = (s: Session) => (scene(s).parts["d/e_025.c"] as Extract<Part, { kind: "corner" }>).at;
const env = { w: 800, h: 600, now: 1000 } as Env;

for (const [label, sel] of [["the circle line", ["d/e_025.k"]], ["its centre vertex", ["d/e_025.c"]]] as const) {
  test(`${label} moved against the concentric constraint: refused, named, flashed`, () => {
    const s = open();
    const sc = scene(s);
    const st = startOp(sc, [...sel] as never, "move");
    assert.ok(st.ok);
    const cmd = opCommand(sc, { ...st.op, axis: 1, value: 17.5 })!;
    const done = run(s, cmd);
    assert.deepEqual(done.conflict?.victims, ["r_026"]);
    assert.ok(done.conflict?.retry);
    assert.deepEqual(centre(done), centre(s)); // nothing moved
    // the preview shows what is there, with the same reason
    const shown = previewCommand(s, cmd)!;
    assert.ok(previewRefusal(s, cmd, shown)?.includes("r_026"));
  });
}

test("the button deletes the constraint and makes the move as one step, and the flash waits while it is pointed at", () => {
  let state = createState(open());
  const sc = scene(state.session);
  const st = startOp(sc, ["d/e_025.k"] as never, "move");
  assert.ok(st.ok);
  const cmd = opCommand(sc, { ...st.op, axis: 1, value: 17.5 })!;
  state = { ...state, session: run(state.session, cmd) };
  state = { ...state, flash: { ...state.session.conflict!, at: 1000 } };
  assert.ok(frameOf(state, { w: 800, h: 600 }, 1500).refusal?.button.startsWith("Delete constraint"));
  state = reduce(state, { type: "holdFlash" }, { ...env, now: 4000 });
  assert.ok(frameOf(state, { w: 800, h: 600 }, 4001).flash, "still flashing while the pointer is on the button");
  const before = centre(state.session);
  state = reduce(state, { type: "overrideRefusal" }, env);
  assert.equal(state.session.message, null);
  assert.ok(Math.abs(centre(state.session)[1] - before[1] - 17.5) < 1e-6, "moved");
  assert.ok(!scene(state.session).relations.some((r) => r.id === "r_026"), "the constraint is gone");
  const back = undoLast(state.session);
  assert.ok(scene(back).relations.some((r) => r.id === "r_026"), "one undo takes both back");
  assert.deepEqual(centre(back), before);
});
