// Ctrl+C captures, Ctrl+V pastes (`in_435`): the paste is parts of its own, beside the original or on a surface that is selected.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, selection } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { diskFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { normalOfPlane } from "../src/operation/part.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const circles = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "circle" && p.origin === "drawn");
const act = (st: AppState, id: string) => reduce(st, { type: "runAction", id }, env);
const sel = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

function withCircle(): { st: AppState; disk: string; circle: string } {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [10, 10, 0], 4);
  s = run(s, c.command);
  const disk = diskFaceRef(c.circle);
  return { st: sel({ ...createState(s), cam: homeCamera() }, [disk]), disk, circle: c.circle };
}

test("Ctrl+C on a circle makes nothing; Ctrl+V makes one copy beside it, a circle of its own that is not a repeat", () => {
  const { st, disk } = withCircle();
  const copied = act(st, "clipboard:copy");
  assert.equal(circles(copied.session).length, 1, "nothing is made by copying");
  assert.ok(copied.clipboard?.includes(disk as never));
  const pasted = act(copied, "clipboard:paste");
  assert.equal(pasted.session.message, null);
  assert.equal(circles(pasted.session).length, 2);
  assert.equal(scene(pasted.session).patterns?.length ?? 0, 0, "no repeat ties it to the original");
  const [a, b] = circles(pasted.session) as unknown as { center: string; radius: number }[];
  assert.equal(a!.radius, b!.radius);
  const [ca, cb] = [a!.center, b!.center].map((r) => (scene(pasted.session).parts[r as never] as unknown as { at: number[] }).at);
  assert.ok(Math.hypot(ca![0]! - cb![0]!, ca![1]! - cb![1]!) > 4, "beside it, at the distance a copy begins with");
  const again = act(pasted, "clipboard:paste");
  assert.equal(circles(again.session).length, 3, "pasted again: another");
});

test("the paste can be deleted, and deleting the original leaves it (`in_435`)", () => {
  const { st, disk, circle } = withCircle();
  let t = act(act(st, "clipboard:copy"), "clipboard:paste");
  assert.equal(circles(t.session).length, 2);
  // delete the original
  t = reduce(sel(t, [disk]), { type: "delete" }, env);
  assert.equal(t.session.message, null);
  const left = circles(t.session);
  assert.equal(left.length, 1, "the copy stays");
  assert.notEqual(left[0]!.ref, circle);
  // delete the copy
  const copyDisk = Object.values(scene(t.session).parts).find((p) => p.kind === "face")!.ref;
  t = reduce(sel(t, [copyDisk]), { type: "delete" }, env);
  assert.equal(circles(t.session).length, 0, "the copy can be deleted");
});

test("with a face selected, Ctrl+V pastes the figure onto it: a plane of its own on the face, the circle's middle at the face's middle", () => {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  const c = drawCircle(scene(s), XY, [100, 100, 0], 5);
  s = run(s, c.command);
  const top = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.mesh && normalOfPlane(p)[2] > 0.99 && Math.abs((p.mesh[2] ?? 0) - 20) < 1e-6)!;
  let st = sel({ ...createState(s), cam: homeCamera() }, [diskFaceRef(c.circle)]);
  st = act(st, "clipboard:copy");
  st = act(sel(st, [top.ref]), "clipboard:paste");
  assert.equal(st.session.message, null);
  const made = circles(st.session).filter((p) => p.ref !== c.circle) as unknown as { center: string; radius: number }[];
  assert.equal(made.length, 1);
  const at = (scene(st.session).parts[made[0]!.center as never] as unknown as { at: number[] }).at;
  assert.ok(Math.abs(at[0]! - 20) < 1e-6 && Math.abs(at[1]! - 10) < 1e-6 && Math.abs(at[2]! - 20) < 1e-6, `the middle of the top face: ${at}`);
  assert.equal(made[0]!.radius, 5);
  assert.ok(selection(st.session).length > 0, "the paste is selected");
});

test("nothing copied: Ctrl+V says so; the menu's Paste is off until something is copied", () => {
  const { st } = withCircle();
  const v = act(st, "clipboard:paste");
  assert.ok(/nothing is copied/.test(v.session.message ?? ""));
  assert.equal(circles(v.session).length, 1);
});
