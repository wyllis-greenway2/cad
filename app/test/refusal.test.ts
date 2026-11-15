// A change a standing mate refuses (`in_436`): it flashes the two faces the mate is between (not every surface), the move goes back to where it was, and a button offers to delete the mate and make the change.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const mated = () => (openSession(kernel, readFileSync(new URL("./fixtures/mated-in_436.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value; // (a standing flush mate between two blocks)

for (const kind of ["move", "rotate"] as const) {
  test(`a ${kind} the standing mate refuses flashes the mate's two faces, says why, and offers to delete the mate and make it (the button)`, () => {
    const s = mated();
    let st = { ...createState({ ...s, click: { ...s.click, selection: ["b/x_s_026/o"] as never } }), cam: homeCamera() };
    st = reduce(st, { type: "begin", name: kind }, env);
    for (const k of kind === "move" ? "-5" : "30") st = reduce(st, { type: "typed", key: k, shift: false }, env);
    st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
    assert.ok(/mates of this body/.test(st.session.message ?? ""), st.session.message ?? "");
    assert.ok(st.flash?.retry, "there is a way through");
    assert.deepEqual(st.flash!.victims, ["r_027"]);
    const f = frameOf(st, { w: 800, h: 600 }, st.flash!.at + 10);
    assert.ok(f.flash && f.flash.parts.length === 2, `the two faces, not the bodies: ${JSON.stringify(f.flash?.parts)}`);
    assert.ok(f.flash!.parts.every((p) => scene(st.session).parts[p as never]?.kind === "plane"), "faces");
    assert.ok(f.refusal && /Delete constraint/.test(f.refusal.button), "the button is offered");
    const before = scene(st.session).relations.length;
    st = reduce(st, { type: "overrideRefusal" }, env);
    assert.equal(st.session.message, null);
    assert.equal(scene(st.session).relations.length, before - 1, "the mate is gone");
    assert.equal(scene(st.session).steps.at(-1)!.type, kind, "and the change is made");
  });
}

import { gizmoOf } from "../src/interaction/control/handles.ts";
import { projector } from "../src/interaction/camera.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { lookStraight } from "../src/interaction/camera.ts";
import { paneAt } from "../src/interaction/panes.ts";

test("a ring dragged against a standing mate bounces back as an arrow does: nothing is made, the degrees do not stay (`in_436`)", () => {
  const s = mated();
  const base = { ...createState({ ...s, click: { ...s.click, selection: ["b/x_s_026/o"] as never } }), cam: homeCamera() };
  const begun = reduce(base, { type: "begin", name: "rotate" }, env);
  const g = gizmoOf(begun)!;
  const pr = projector(begun.cam, 800, 600);
  const steps0 = scene(begun.session).steps.length;
  let tried = 0;
  for (const id of ["rot:z", "rot:x", "rot:y"]) {
    const ring = g.handles.find((h) => h.id === id)!;
    for (const q of [2, 3, 5, 6, 10, 14, 20]) {
      let st = begun;
      const p0 = ring.points[Math.floor((ring.points.length * q) / 24)]!;
      const w: Vec3 = [p0[0] - g.centre[0], p0[1] - g.centre[1], p0[2] - g.centre[2]];
      const k = "xyz".indexOf(id[4]!);
      const rot = (v: Vec3): Vec3 => (k === 2 ? [-v[1], v[0], v[2]] : k === 0 ? [v[0], -v[2], v[1]] : [v[2], v[1], -v[0]]);
      const q1 = rot(w);
      const p1: Vec3 = [g.centre[0] + q1[0], g.centre[1] + q1[1], g.centre[2] + q1[2]];
      const [x0, y0] = pr.project(p0);
      const [x1, y1] = pr.project(p1);
      let [lx, ly] = [x0, y0];
      for (let n = 1; n <= 6; n++) { const [x, y] = [x0 + ((x1 - x0) * n) / 6, y0 + ((y1 - y0) * n) / 6]; st = reduce(st, { type: "orbit", dx: x - lx, dy: y - ly, x, y }, env); [lx, ly] = [x, y]; }
      if (!(st.drag && "handle" in st.drag)) continue;
      tried++;
      st = reduce(st, { type: "dragEnd" }, env);
      assert.equal(scene(st.session).steps.length, steps0, "nothing was made");
      assert.ok(/mates of this body/.test(st.session.message ?? ""), st.session.message ?? "");
      assert.equal(st.op?.value ?? null, null, "the degrees are not kept");
      assert.ok(st.flash?.retry, "the way through is offered");
      return;
    }
  }
  assert.fail(`no ring could be taken (${tried})`);
});

test("the world panes are not there in an orthographic (straight) view: they are not drawn and take no pick (`in_436`)", () => {
  const st = createState(mated());
  assert.equal(frameOf(st, { w: 800, h: 600 }).panes.length, 3);
  const straight = { ...st, cam: lookStraight(st.cam, [0, 0, 1], [1, 0, 0]) } as typeof st;
  assert.equal(straight.cam.straight, true);
  assert.equal(frameOf(straight, { w: 800, h: 600 }).panes.length, 0);
  assert.equal(paneAt(straight.cam, 800, 600, 400, 300), null);
});
