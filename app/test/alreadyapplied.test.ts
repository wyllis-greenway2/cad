// A constraint that already holds is not made again: it is said, and it flashes green (`inv_constraint_uniformity`, `in_1102`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";
import { nextId, lookup } from "../src/operation/scene.ts";
import { roundOf } from "../src/operation/part.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;

function twoCircles() {
  let s = createSession(kernel);
  const a = drawCircle(scene(s), XY, [0, 0, 0], 8); s = run(s, a.command);
  const b = drawCircle(scene(s), XY, [20, 0, 0], 3); s = run(s, b.command);
  return { s, a: a.circle, b: b.circle };
}
const concentric = (s: Session, a: Ref, b: Ref) => actionsFor(scene(s), [b, a]).find((x) => x.id === "concentric")!;

test("a sketch constraint asked for again is not added a second time: it says it is applied and names the one that is there", () => {
  const { s, a, b } = twoCircles();
  const once = run(s, concentric(s, a, b).run());
  assert.equal(once.message, null);
  assert.equal(scene(once).relations.length, 1);
  const twice = run(once, concentric(once, a, b).run());
  assert.match(twice.message ?? "", /already applied: the Concentric constraint \(it flashes green\)/);
  assert.deepEqual(twice.already, [scene(once).relations[0]!.id]);
  assert.equal(scene(twice).relations.length, 1, "no duplicate");
  assert.equal(twice.history, once.history, "nothing was made: nothing to undo");
  assert.equal(twice.conflict, null, "it is not a refusal");
});

test("a different number is not 'already': a diameter asked for again with the same value is, with another value it is a change", () => {
  const { s, a } = twoCircles();
  const diameter = (q: Session) => actionsFor(scene(q), [a]).find((x) => x.id === "diameter")!;
  const once = run(s, diameter(s).run(16));
  assert.ok(!once.message, once.message ?? "");
  assert.equal(scene(once).relations.length, 1);
  const same = run(once, diameter(once).run(16));
  assert.ok(same.already?.length, "the same diameter again: already applied");
  assert.equal(scene(same).relations.length, 1);
  const other = run(once, diameter(once).run(18));
  assert.ok(!other.already, "another diameter is a change, not 'already'");
});

test("the app: the constraint's bubble and its parts flash green (the frame says which), and no refusal button is offered", () => {
  const { s, a, b } = twoCircles();
  const once = run(s, concentric(s, a, b).run());
  let st = reduce({ ...createState({ ...once, click: { ...once.click, selection: [b, a] as never } }), cam: homeCamera() }, { type: "runAction", id: "concentric" }, env);
  assert.ok(st.session.already?.length, "said");
  assert.ok(st.flash?.green?.length, "the flash is green");
  assert.deepEqual(st.flash?.victims, []);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.deepEqual(f.flash?.green, st.flash!.green);
  assert.ok((f.flash?.greenParts ?? []).length > 0, "the parts it ties flash");
  assert.ok(f.annotations.some((x) => x.id === st.flash!.green![0]), "its bubble is shown, so it can flash");
  assert.ok(!f.notices.some((n) => n.kind === "refusal"), "nothing was refused");
  st = reduce(st, { type: "runAction", id: "concentric" } as never, env);
  assert.equal(scene(st.session).relations.length, 1);
});
