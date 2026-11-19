// The cross section plane's mover (`in_1129`): three panes beside its junction (a click on one lays the plane across that axis), the arrows that move it and the rings that turn it (one icon goes between them), and the sphere, which with a click puts the plane where a corner, an edge or a face is.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { sectionNow, sheetMoveOf, activePane } from "../src/interaction/control/section.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
function box(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
}
const ids = (st: AppState) => gizmoOf(st)!.handles.map((h) => h.id);
const middle = (st: AppState, id: string): [number, number] => {
  const h = gizmoOf(st)!.handles.find((q) => q.id === id)!;
  const pr = projector(st.cam, 800, 600);
  const pts = h.points.map(pr.project);
  return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length];
};
const click = (st: AppState, [x, y]: [number, number]) => reduce(st, { type: "click", x, y, count: 1, shift: false }, env);

test("a selected plane has the mover's arrows, its sphere and three panes; the move icon goes to the rings and back", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const ref = sectionNow(st)!.ref;
  assert.deepEqual(ids(st).sort(), ["move:x", "move:y", "move:z", "pane:x", "pane:y", "pane:z", "pivot"]);
  assert.equal(sheetMoveOf(st, ref), 0);
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env);
  assert.equal(sheetMoveOf(st, ref), 1);
  assert.deepEqual(ids(st).sort(), ["pane:x", "pane:y", "pane:z", "pivot", "rot:x", "rot:y", "rot:z"]);
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env);
  assert.equal(sheetMoveOf(st, ref), 0, "and back to the arrows");
});

test("a click on a pane lays the plane across that axis, where its middle is, and lights the pane", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  const centre = sectionNow(st)!.centre;
  for (const k of [1, 2, 0] as const) {
    st = click(st, middle(st, `pane:${"xyz"[k]}`));
    const sec = sectionNow(st);
    assert.ok(sec, "the plane is still selected");
    assert.ok(Math.abs(Math.abs(sec!.n[k]!) - 1) < 1e-9, `across ${"xyz"[k]}: ${sec!.n}`);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(sec!.centre[i]! - centre[i]!) < 1e-6, "its middle stays");
    assert.equal(activePane(st), `pane:${"xyz"[k]}`);
  }
});

test("the sphere selected, a click on a face of the body lays the plane on it, a click on an edge puts the middle at the edge's middle with the plane across it", () => {
  let st = reduce(box(), { type: "runAction", id: "view:section" }, env);
  st = click(st, middle(st, "pivot"));
  assert.equal(st.moverSphere, true, "the sphere is selected");
  const faces = Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && p.origin === "body" && !p.section && p.mesh && p.mesh.length >= 9);
  const top = faces.find((p) => p.kind === "plane" && Math.abs(p.at[2] - 20) < 1e-6 && Math.abs(Math.abs(p.u[2]) + Math.abs(p.v[2])) < 1e-6) ?? faces[0]!;
  assert.ok(top);
  const pr = projector(st.cam, 800, 600);
  const m = (top as unknown as { mesh: number[] }).mesh;
  const c: Vec3 = [m[0]! / 3 + m[3]! / 3 + m[6]! / 3, m[1]! / 3 + m[4]! / 3 + m[7]! / 3, m[2]! / 3 + m[5]! / 3 + m[8]! / 3];
  st = click(st, pr.project(c));
  const sec = sectionNow(st)!;
  assert.ok(sec, "still selected");
  assert.equal(st.moverSphere, true, "and the sphere stays selected, to put it somewhere else");
  assert.ok(Math.abs(Math.abs(sec.n[0]!) + Math.abs(sec.n[1]!) + Math.abs(sec.n[2]!) - 1) < 1e-6, "lying on a flat face: its normal is an axis");
});
