// The cross section's orb works as every orb does (`in_1127`, `dec_unified_orb`): Shift on its arrows holds a drag to axes, the blue orb moves the plane (held, sticking to places) instead of turning the view, and a click on it lets a corner, an edge or a face put the plane there.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { sectionNow } from "../src/interaction/control/section.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const box = (): AppState => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
};
const free = (): AppState => reduce(reduce(box(), { type: "runAction", id: "view:section" }, env), { type: "runAction", id: "sheet:move" }, env); // the plane with the mover
const px = (st: AppState, p: Vec3) => projector(st.cam, 800, 600).project(p);
const click = (st: AppState, p: Vec3, shift = false): AppState => { const [x, y] = px(st, p); return reduce(st, { type: "click", x, y, count: 1, shift }, env); };
const drag = (st: AppState, from: Vec3, to: Vec3, steps = 6): AppState => {
  const [x0, y0] = px(st, from); const [x1, y1] = px(st, to);
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps, y = y0 + ((y1 - y0) * k) / steps;
    st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env);
    [lx, ly] = [x, y];
  }
  return reduce(st, { type: "dragEnd" }, env);
};
const orbAt = (st: AppState): Vec3 => gizmoOf(st)!.handles.find((h) => h.id === "pivot")!.points[0]!;
const tip = (st: AppState, id: string): Vec3 => gizmoOf(st)!.handles.find((h) => h.id === id)!.points[1]!;

test("Shift on the plane's arrows holds its drag to those axes, in the words every orb uses", () => {
  let st = free();
  st = click(st, tip(st, "move:x"), true);
  assert.deepEqual(st.lockAxes, [0]);
  assert.match(st.session.message ?? "", /the plane moves along X only/);
  st = click(st, tip(st, "move:y"), true);
  assert.deepEqual(st.lockAxes, [0, 1]);
  assert.match(st.session.message ?? "", /the plane moves in the XY plane only/);
  st = click(st, tip(st, "move:y"), true);
  assert.deepEqual(st.lockAxes, [0]);
});

test("the blue orb moves the plane (the view stays), and held to the XY plane it keeps its height", () => {
  const st0 = free();
  const before = sectionNow(st0)!.centre;
  const camBefore = JSON.stringify(st0.cam);
  const o = orbAt(st0);
  const loose = drag(st0, o, add(o, [6, 4, 3]));
  assert.equal(JSON.stringify(loose.cam), camBefore, "the view did not turn");
  const moved = sectionNow(loose)!.centre;
  assert.ok(Math.hypot(moved[0] - before[0], moved[1] - before[1], moved[2] - before[2]) > 1, `moved ${moved} from ${before}`);
  let held = click(st0, tip(st0, "move:x"), true);
  held = click(held, tip(held, "move:y"), true);
  assert.deepEqual(held.lockAxes, [0, 1]);
  const after = sectionNow(drag(held, orbAt(held), add(orbAt(held), [6, 4, 3])))!.centre;
  assert.ok(Math.abs(after[2] - before[2]) < 1e-6, `held to XY: z stays (${after[2]} from ${before[2]})`);
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > 1, "and it moved in the plane");
});

test("a click on the blue orb selects it; then a corner clicked puts the plane there, and the orb is let go", () => {
  let st = free();
  st = click(st, orbAt(st));
  assert.equal(st.moverSphere, true);
  assert.match(st.session.message ?? "", /click a corner, an edge, a face or a body/);
  const corner: Vec3 = [0, 0, 20]; // (a corner on the half that is drawn: the half nearer the eye is not, and cannot be pointed at)
  st = click(st, corner);
  assert.equal(st.moverSphere, false);
  const c = sectionNow(st)!.centre;
  assert.ok(Math.hypot(c[0] - corner[0], c[1] - corner[1], c[2] - corner[2]) < 1e-3, `at the corner: ${c}`);
  const again = click(click(free(), orbAt(free())), orbAt(click(free(), orbAt(free()))));
  assert.equal(again.moverSphere, false, "a second click lets it go");
});
