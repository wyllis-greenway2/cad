// Deleting a part takes the constraints that name it with it, and says nothing in words (`in_1168`): the parts that stayed and leaned on them flash red, and their bubbles pop.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
type L = { ref: string; a: string; b: string };

test("deleting a side that has an equal-length constraint to another: no message, the sides that stayed flash red, the constraint's bubble is shown to pop, and undo clears nothing it should not", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), "w/XY" as never, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const lines = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn") as unknown as L[];
  const at = (id: string) => (scene(s).parts[id as never] as unknown as { at: Vec3 }).at;
  const bottom = lines.find((l) => at(l.a)[1] === 0 && at(l.b)[1] === 0)!;
  const top = lines.find((l) => at(l.a)[1] === 20 && at(l.b)[1] === 20)!;
  const equal = actionsFor(scene(s), [bottom.ref as never, top.ref as never]).find((x) => x.id === "equalLength");
  s = run(s, equal!.run());
  assert.equal(s.message, null);
  const length = scene(s).relations.find((x) => x.kind === "equalLength")!;
  let st = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [bottom.ref as never] } } };
  st = reduce(st, { type: "runAction", id: "delete" }, env);
  assert.ok(!(bottom.ref in scene(st.session).parts), "the side is gone");
  assert.equal(st.session.message, null, "nothing is said in words");
  assert.ok(!scene(st.session).relations.some((x) => x.id === length.id), "its length went with it");
  const f = frameOf(st, env, 0);
  assert.ok(f.flash, "it flashes");
  assert.ok(f.flash!.popped?.includes(length.id), "the constraint's bubble pops");
  assert.ok(f.flash!.parts.some((p) => p === top.ref || p === (bottom.a as never) || p === (top.a as never)), "the parts that stayed are red");
  assert.ok(f.annotations.some((a) => a.id === length.id), "its bubble is drawn once more, as it was, to pop");
  assert.equal(f.refusal, null, "it is not a refusal: no button");
  const later = frameOf(st, env, 100000);
  assert.ok(!later.flash && !later.annotations.some((a) => a.id === length.id), "after the flash it is gone");
});
