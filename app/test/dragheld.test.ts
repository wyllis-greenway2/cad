// A drag that a constraint holds back follows the one rule while it is made and when it is let go (`inv_constraint_uniformity`, `in_1170`).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { actionsFor } from "../src/interaction/actions.ts";
import { homeCamera, projector } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { nextId } from "../src/operation/scene.ts";
import { add, scale } from "../src/math/vec.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);

function lockedBox(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), "w/XY" as never, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  const lines = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn") as unknown as { ref: string; a: string; b: string }[];
  const at = (id: string) => (scene(s).parts[id as never] as unknown as { at: Vec3 }).at;
  const bottom = lines.find((l) => at(l.a)[1] === 0 && at(l.b)[1] === 0)!;
  s = run(s, actionsFor(scene(s), [bottom.ref as never]).find((x) => x.id === "length")!.run(40));
  return { ...createState(s), cam: homeCamera() };
}

test("a side held by a locked length, dragged by its arrow: while it is pulled and when it is let go, the constraint is named, flashes, and offers to be deleted", () => {
  let st = lockedBox();
  const side = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !p.curved && Math.abs(p.at[0] - 40) < 1e-6 && p.u[0] === 0 && p.v[0] === 0)!;
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [side.ref] } } };
  st = reduce(st, { type: "begin", name: "pushpull" }, env);
  const h = gizmoOf(st)!.handles[0]!;
  const from = scale(add(h.points[0]!, h.points.at(-1)!), 0.5);
  const to = add(from, [10, 0, 0]);
  const [x0, y0] = px(st, from);
  const [x1, y1] = px(st, to);
  let mid = st;
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= 4; k++) {
    const x = x0 + ((x1 - x0) * k) / 4, y = y0 + ((y1 - y0) * k) / 4;
    mid = reduce(mid, { type: "orbit", dx: k === 1 ? x - x0 : x - lx, dy: k === 1 ? y - y0 : y - ly, x, y }, env);
    [lx, ly] = [x, y];
  }
  const during = frameOf(mid, env, 0);
  assert.ok(during.flash && during.flash.victims.length > 0, "while it is pulled and held back, the constraints that hold it flash red");
  assert.match(during.message, /the constraints on the sketch would put it back/, "and it is said");
  assert.ok(during.annotations.some((a) => during.flash!.victims.includes(a.id)), "their bubbles are shown, red");
  const done = reduce(mid, { type: "dragEnd" }, env);
  assert.ok(done.session.conflict && done.session.conflict.culprits.length > 0 && done.flash, "let go: refused, and they flash");
  assert.equal(scene(done.session).steps.map((x) => x.type).join(","), "extrude", "nothing was added");
  assert.equal(frameOf(done, env, 0).notices.find((n) => n.kind === "refusal")?.action?.label, "Delete constraints to proceed", "with the button that deletes them");
});
