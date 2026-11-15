// The planes (sheets) of `in_446`: any number cutting at once, four modes on one icon, invisible ones that cannot be pointed at, the arrow along the normal, the move icon.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { add, scale } from "../src/math/vec.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";
import { gizmoOf } from "../src/interaction/control/handles.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { sectionNow, sheetMoveOf } from "../src/interaction/control/section.ts";
import { pickOpts } from "../src/interaction/control/state.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 } as never;
const frame = (st: AppState) => frameOf(st, { w: 800, h: 600 });
const near = (a: number, b: number, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

function box(): AppState {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  return { ...createState(s), cam: homeCamera() };
}
const planes = (st: AppState) => Object.values(scene(st.session).parts).filter((p) => p.kind === "plane" && !!p.section);
const drag = (st: AppState, from: Vec3, to: Vec3, steps = 5): AppState => {
  const pr = projector(st.cam, 800, 600);
  const [x0, y0] = pr.project(from);
  const [x1, y1] = pr.project(to);
  let [lx, ly] = [x0, y0];
  for (let k = 1; k <= steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const y = y0 + ((y1 - y0) * k) / steps;
    st = reduce(st, { type: "orbit", dx: k === 1 ? x - x0 : x - lx, dy: k === 1 ? y - y0 : y - ly, x, y }, env);
    [lx, ly] = [x, y];
  }
  return reduce(st, { type: "dragEnd" }, env);
};

test("the Plane menu row makes a plane that does not cut; the Cross section row one that does; several can cut at once and each is in the picture", () => {
  let st = reduce(box(), { type: "runAction", id: "view:plane" }, env);
  assert.equal(planes(st).length, 1);
  assert.equal(frame(st).sections.length, 0, "a plane does not cut");
  assert.equal(frame(st).sectionPlanes[0]!.mode, 2);
  st = reduce(st, { type: "escape" }, env);
  st = reduce(st, { type: "runAction", id: "view:section" }, env);
  assert.equal(planes(st).length, 2);
  assert.equal(frame(st).sections.length, 1);
  // a third plane, cut by its icon: two cut now
  const first = planes(st).find((p) => p.kind === "plane" && !p.cut)!;
  st = reduce(st, { type: "runAction", id: `sheet:mode:${first.ref}` }, env); // 2 (no cut) -> 3 (invisible)
  st = reduce(st, { type: "runAction", id: `sheet:mode:${first.ref}` }, env); // -> 0 (cuts)
  assert.equal(frame(st).sections.length, 2, "two planes cut together");
  assert.equal(frame(st).sectionPlanes.filter((p) => p.mode === 0).length, 2);
});

test("a sheet that is not invisible is a face to point at; an invisible one cannot be pointed at, and goes back to a face with its icon", () => {
  let st = reduce(box(), { type: "runAction", id: "view:plane" }, env);
  const ref = planes(st)[0]!.ref;
  st = reduce(st, { type: "escape" }, env);
  const sec = planes(st)[0] as unknown as { at: Vec3; u: Vec3; v: Vec3; extent: number };
  const grid: Vec3[] = [];
  for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) grid.push(add(add(sec.at, scale(sec.u, (sec.extent * i) / 10)), scale(sec.v, (sec.extent * j) / 10)) as Vec3); // (points all over the sheet)
  const hits = (s: AppState): number => grid.filter((q) => { const pr = projector(s.cam, 800, 600); const [x, y] = pr.project(q); return candidatesAt(scene(s.session), pr.view(x, y), pickOpts(s)).some((c) => c.ref === ref); }).length;
  assert.ok(hits(st) > 20, `the sheet is a face: it is under the pointer over most of it (${hits(st)} of ${grid.length})`);
  const hidden = reduce(st, { type: "runAction", id: `sheet:mode:${ref}` }, env); // (no cut, then one press: invisible)
  assert.equal(frame(hidden).sectionPlanes[0]!.mode, 3);
  assert.equal(hits(hidden), 0, "the invisible sheet is not under the pointer anywhere");
  const back = reduce(reduce(reduce(hidden, { type: "runAction", id: `sheet:mode:${ref}` }, env), { type: "runAction", id: `sheet:mode:${ref}` }, env), { type: "runAction", id: `sheet:mode:${ref}` }, env); // 3 -> 0 -> 1 -> 2: round to no cut
  assert.ok(hits(back) > 20, "and a face again");
});

test("the arrow along its normal moves the sheet (no step of the body is made), and a number typed for it sets how far along the normal it stands", () => {
  let st = reduce(box(), { type: "runAction", id: "view:plane" }, env);
  const sec = sectionNow(st)!;
  const steps = scene(st.session).steps.length;
  const k = sec.n.findIndex((v) => Math.abs(v) > 0.5);
  const g = gizmoOf(st)!;
  assert.deepEqual(g.handles.map((h) => h.id), ["sheet:n"]);
  const [, tip] = g.handles[0]!.points;
  const dir = [0, 0, 0].map((_, i) => (i === k ? 8 : 0)) as unknown as Vec3;
  const before = sec.centre[k]!;
  const moved = drag(st, tip!, add(tip!, dir), 6);
  assert.ok(Math.abs(sectionNow(moved)!.centre[k]! - before) > 3, `${sectionNow(moved)!.centre[k]} from ${before}`);
  assert.equal(scene(moved.session).steps.length, steps, "nothing was made");
  const typed = reduce({ ...st, handleSel: "sheet:n" }, { type: "entry", field: 6, text: "5" }, env);
  near(Math.abs(sectionNow(typed)!.centre[k]!), 5);
});

test("the move icon goes arrow, free mover, across X, across Y, across Z, then back to the free place it left", () => {
  let st = reduce(box(), { type: "runAction", id: "view:plane" }, env);
  const ref = sectionNow(st)!.ref;
  const first = sectionNow(st)!;
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env); // free
  assert.equal(sheetMoveOf(st, ref), 1);
  // a free place: the plane moved off to x = 17 along its normal
  st = reduce({ ...st, handleSel: "sheet:n" }, { type: "entry", field: 6, text: "17" }, env);
  const free = sectionNow(st)!;
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env); // across X
  assert.equal(sheetMoveOf(st, ref), 2);
  assert.ok(Math.abs(Math.abs(sectionNow(st)!.n[0]!) - 1) < 1e-9, "across X");
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env);
  assert.ok(Math.abs(Math.abs(sectionNow(st)!.n[1]!) - 1) < 1e-9, "across Y");
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env);
  assert.ok(Math.abs(Math.abs(sectionNow(st)!.n[2]!) - 1) < 1e-9, "across Z");
  st = reduce(st, { type: "runAction", id: "sheet:move" }, env); // back
  assert.equal(sheetMoveOf(st, ref), 0);
  near(sectionNow(st)!.centre[0], free.centre[0]);
  near(sectionNow(st)!.centre[1], free.centre[1]);
  near(sectionNow(st)!.centre[2], free.centre[2]);
  near(sectionNow(st)!.n[0], free.n[0]);
  void first;
});

test("a sketch can be started on a sheet like on any face, and a sheet is saved with the part (mode and all)", () => {
  let st = reduce(box(), { type: "runAction", id: "view:plane" }, env);
  const ref = sectionNow(st)!.ref;
  st = reduce(st, { type: "begin", name: "rect" }, env);
  assert.ok(st.tool, "the rectangle tool is on with the sheet selected");
  st = reduce(st, { type: "escape" }, env);
  st = reduce(st, { type: "runAction", id: `sheet:mode:${ref}` }, env); // -> invisible
  const saved = JSON.parse(JSON.stringify(scene(st.session).parts[ref]));
  assert.equal(saved.hidden, true, "the mode is in the part, so in the file");
});
