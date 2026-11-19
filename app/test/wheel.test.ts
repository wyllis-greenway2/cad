// The wheel model (`dec_hub_spoke`): numbers that make no wheel are said, each spoke style is built as ONE body of the right height and with a bore, and a selected round object is filled.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { WHEEL_START, wheelProblem } from "../src/operation/modelwheel.ts";
import type { WheelSpec } from "../src/operation/modelwheel.ts";
import { modelFields } from "../src/operation/modelkinds.ts";
import { modelTarget } from "../src/interaction/modeltool.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
const S = (o: Partial<WheelSpec> = {}): WheelSpec => ({ ...WHEEL_START, ...o });
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };

test("numbers that make no wheel are said", () => {
  assert.equal(wheelProblem(S()), null);
  assert.match(wheelProblem(S({ rim: 0.8 })) ?? "", /rim/);
  assert.match(wheelProblem(S({ bore: 17 })) ?? "", /hub must be/);
  assert.match(wheelProblem(S({ hub: 50 })) ?? "", /too big for the rim/);
  assert.match(wheelProblem(S({ spokes: 1 })) ?? "", /spokes/);
  assert.match(wheelProblem(S({ spokeT: 20 })) ?? "", /thicker than the rim/);
  assert.match(wheelProblem(S({ spokes: 16, spokeW: 12 })) ?? "", /too wide/);
  assert.match(wheelProblem(S({ style: 3, spokes: 16, outer: 30, hub: 10, bore: 4 })) ?? "", /do not fit/);
  assert.equal(wheelProblem(S({ style: 3, spokes: 6 })), null);
});
function placed(typed: Record<string, string>, fill?: boolean) {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:wheel" }, env);
  const keys = modelFields("wheel").map((f) => f.key);
  st = { ...st, tool: { ...st.tool!, ...(fill ? {} : { plane: XY, points: [[0, 0, 0]] as [number, number, number][], cursor: [0, 0, 0] as [number, number, number] }), model: { ...st.tool!.model!, typed: st.tool!.model!.typed.map((x, i) => (i >= 2 && typed[keys[i - 2]!] !== undefined ? typed[keys[i - 2]!]! : x)) } } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0;
  while (st.building && n++ < 10) st = reduce(st, { type: "buildNext" }, env);
  assert.equal(st.building, null, "built");
  return st;
}
test("each style is one body with the wheel's height and a bore, and its volume is between the rim and a full disc", () => {
  for (const style of ["0", "1", "2", "3"]) {
    const st = placed({ style });
    const bodies = Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];
    assert.equal(bodies.length, 1, `style ${style}: one body`);
    const b = bodies[0]!, s = S();
    assert.ok(Math.abs(b.bbox.max[2]! - b.bbox.min[2]! - Math.max(s.width, s.hubLen)) < 1e-3, `style ${style}: as high as the hub is long`);
    assert.ok(Math.abs(b.bbox.max[0]! - b.bbox.min[0]! - s.outer) < 0.2, `style ${style}: as wide as the outside diameter`);
    const rimOnly = Math.PI * (30 ** 2 - 26 ** 2) * s.width, disc = Math.PI * 30 ** 2 * s.width;
    assert.ok(b.volume > rimOnly * 1.2 && b.volume < disc * 0.8, `style ${style}: volume ${b.volume}`);
  }
});
test("a round object that is selected is filled: the wheel is as wide as the circle and stands on its centre", () => {
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  const c = drawCircle(scene(st.session), XY, [10, 20, 0], 25);
  st = { ...st, session: run(st.session, c.command) };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [c.circle] } } };
  assert.equal(selection(st.session).length, 1);
  st = reduce(st, { type: "runAction", id: "model:wheel" }, env);
  assert.ok(st.tool?.fill, "the tool is filled");
  const g = modelTarget(scene(st.session), st.tool!)!;
  assert.equal(g.problem, null);
  assert.ok(Math.abs(g.size - 50) < 0.05, `the size is the circle's diameter: ${g.size}`);
  assert.deepEqual(g.place.at.map((v) => Math.round(v * 1000) / 1000), [10, 20, 0]);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0;
  while (st.building && n++ < 10) st = reduce(st, { type: "buildNext" }, env);
  const wheel = (Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[])[0]!;
  assert.ok(Math.abs((wheel.bbox.min[0]! + wheel.bbox.max[0]!) / 2 - 10) < 0.1 && Math.abs((wheel.bbox.min[1]! + wheel.bbox.max[1]!) / 2 - 20) < 0.1, "centred on the circle");
  assert.ok(Math.abs(wheel.bbox.max[0]! - wheel.bbox.min[0]! - 50) < 0.2, "50 mm across");
});
