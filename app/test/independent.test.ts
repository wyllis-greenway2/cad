// Independent bodies in the app (`dec_independent_bodies`, `in_270`): separated pieces are separate body parts, each selected, moved and combined on its own.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { objectOf } from "../src/interaction/objects.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };

function box(s: Session, x: number, y: number, w = 10, h = 10): Session {
  const r = drawSquaredRectangle(scene(s), XY, [x, y, 0], [x + w, y + w, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "body" }> => p.kind === "body");
const pick = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("two pieces that stand apart are two bodies in the Bodies list, and a face knows which one it is in", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  assert.equal(bodies(s).length, 2);
  assert.equal(scene(s).steps.length, 2);
  const faces = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body" && p.of);
  assert.ok(faces.length >= 10);
  const [a, b] = bodies(s);
  assert.ok(a!.bbox!.max[0] <= 10.01 && b!.bbox!.min[0] >= 39.99);
  const faceOfB = faces.find((f) => f.kind === "plane" && f.of === b!.ref)!;
  assert.equal(objectOf(scene(s), faceOfB.ref), b!.ref, "the third click on it takes b");
  const st = reduce(pick({ ...createState(s), cam: homeCamera() }, []), { type: "panel", name: "bodies" }, env);
  assert.deepEqual(frameOf(st, env).panel?.rows.map((r) => r.label), ["Body 1", "Body 2"]);
  // a single body keeps the one name it always had
  const one = box(createSession(kernel), 0, 0);
  assert.equal(bodies(one).length, 1);
  assert.equal(bodies(one)[0]!.ref, "b/body/o");
});

test("Move takes the selected body only; the other stays where it is", () => {
  const s = box(box(createSession(kernel), 0, 0), 40, 0);
  const [a, b] = bodies(s);
  const st = startOp(scene(s), [b!.ref], "move");
  assert.ok(st.ok);
  if (!st.ok) return;
  assert.deepEqual(st.op.parts, [b!.ref]);
  const moved = run(s, opCommand(scene(s), { ...st.op, axis: 1, value: 25 })!);
  assert.equal(moved.message, null);
  const after = bodies(moved);
  assert.equal(after.length, 2);
  const A = after.find((x) => x.id === a!.id)!, B = after.find((x) => x.id === b!.id)!;
  assert.ok(Math.abs(A.bbox!.min[1]) < 1e-6, "a stays");
  assert.ok(Math.abs(B.bbox!.min[1] - 25) < 1e-6, "b moved");
});

test("Add joins overlapping bodies into the first; Subtract takes the second out of the first; neither works with one body selected", () => {
  let s = box(box(createSession(kernel), 0, 0), 40, 0);
  const b = bodies(s)[1]!;
  const mv = startOp(scene(s), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  s = run(s, opCommand(scene(s), { ...mv.op, axis: 0, value: -35 })!); // b now overlaps a
  const [a2, b2] = bodies(s);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  const menu = (x: AppState) => reduce(x, { type: "menu", x: 5, y: 5, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]);
  assert.equal(menu(pick(st, [a2!.ref])).find((i) => i.id === "combine:add")!.enabled, false);
  assert.equal(menu(pick(st, [a2!.ref, b2!.ref])).find((i) => i.id === "combine:add")!.enabled, true);
  const sub = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:subtract" }, env);
  assert.equal(sub.session.message, "bodies subtracted");
  assert.equal(bodies(sub.session).length, 1);
  assert.ok(sub.session.outcome.kernel!.volume! < 2000 - 1, "b was taken out of a");
  st = reduce(pick(st, [a2!.ref, b2!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.equal(st.session.message, "bodies added together");
  assert.equal(bodies(st.session).length, 1);
  assert.ok(st.session.outcome.kernel!.volume! < 2000 && st.session.outcome.kernel!.volume! > 1000);
  // two that do not touch cannot be added: refused with the reason, nothing changes
  const apart = box(box(createSession(kernel), 0, 0), 40, 0);
  const [p, q] = bodies(apart);
  const no = reduce(pick({ ...createState(apart), cam: homeCamera() }, [p!.ref, q!.ref]), { type: "runAction", id: "combine:add" }, env);
  assert.match(no.session.message ?? "", /do not touch or overlap/);
  assert.equal(scene(no.session).steps.length, 2);
});
