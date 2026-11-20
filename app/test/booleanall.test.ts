// The booleans take any number of bodies (`in_1334`): Add and Intersect work on every body unless some are selected; Subtract has the bodies to cut and the bodies that cut chosen apart.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, lookStraight, projector } from "../src/interaction/camera.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 900, h: 700, now: 0 };
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
/** two blocks 20 x 20 x 10 apart (x 0-20 and 30-50) and a bar 30 x 10 x 6 across the gap (x 10-40), each a body of its own */
function three(): Session {
  let s = createSession(kernel);
  const add = (id: string, x0: number, x1: number, y0: number, y1: number, depth: number) => {
    const r = drawRectangle(scene(s), XY, [x0, y0, 0], [x1, y1, 0], [1, 0, 0], [0, 1, 0]);
    s = run(s, r.command);
    s = run(s, { type: "addStep", step: { id, type: "extrude", parts: r.lines, params: { depth, mode: "new" } } } as never);
  };
  add("s_100", 0, 20, 0, 20, 10); add("s_101", 30, 50, 0, 20, 10); add("s_102", 10, 40, 5, 15, 6);
  return s;
}
const start = (s: Session): AppState => ({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [25, 10, 0], distance: 140 } });
const click = (st: AppState, p: Vec3) => { const [x, y] = projector(st.cam, env.w, env.h).project(p); return reduce(st, { type: "click", x, y, count: 1, shift: false }, env); };

test("Add with nothing selected adds every body of the model", () => {
  const s = three();
  assert.equal(bodies(s).length, 3);
  const st = reduce(start(s), { type: "runAction", id: "combine:add" }, env);
  assert.equal(st.session.message, null);
  assert.equal(bodies(st.session).length, 1, "one body");
  assert.deepEqual(st.session.outcome.errors, {});
});

test("Subtract asks for the bodies to cut, then the bodies that cut: the bar cuts both blocks at once", () => {
  const s = three();
  let st = reduce(start(s), { type: "runAction", id: "combine:subtract" }, env);
  assert.equal(st.awaiting?.id, "combine:subtract");
  st = click(st, [5, 10, 10]);
  st = click(st, [45, 10, 10]);
  assert.equal(st.session.click.selection.length, 2, "both blocks are chosen, one click each");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.deepEqual(st.awaiting?.targets?.length, 2);
  assert.equal(st.session.click.selection.length, 0);
  st = click(st, [25, 10, 6]);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(st.awaiting, null);
  assert.deepEqual(st.session.outcome.errors, {});
  const bars = 10 * 10 * 6 * 2; // (the bar's part inside each block: 10 x 10 x 6)
  const after = bodies(st.session);
  assert.equal(after.length, 2, "the two blocks, each cut; the bar is used up");
  assert.ok(after.every((b) => Math.abs(b.volume - (4000 - bars / 2)) < 1), `${after.map((b) => b.volume)}`);
});
