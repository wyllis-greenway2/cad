// A cut that goes through both ways from its plane (`dec_cut_tools`, `in_1339`): the tool is the depth one way and the depth the other.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import type { Session } from "../src/interaction/session.ts";
import { nextId } from "../src/operation/scene.ts";

await kernel.init();
const volume = (s: Session): number => Object.values(scene(s).parts).reduce((t, p) => t + (p.kind === "body" ? (p.volume ?? 0) : 0), 0);
// a 40 x 40 x 20 block, and a circle of radius 3 on the middle plane of the block (the plane y = 20), cut 20 deep toward -y: only half of the block's way through
function setup(): { s: Session; circle: string; step: (extra: Record<string, number | string>) => Session } {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 40, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 20 } } });
  const c = drawCircle(scene(s), worldRef("XZ"), [20, 0, 10], 3);
  s = run(s, c.command);
  const base = s;
  return { s: base, circle: c.circle, step: (extra) => run(base, { type: "addStep", step: { id: "s_cut", type: "extrude", parts: [c.circle as never], params: { depth: 20, mode: "cut", ...extra } } }) };
}
test("a cut from a plane goes one way; with both ways it goes the same depth the other way as well", () => {
  const { s, step } = setup();
  const v0 = volume(s);
  const area = Math.PI * 9;
  const out = step({ depth: 20 }); // (the way the plane faces: away from the block, so nothing is cut)
  const into = step({ depth: -20 });
  assert.ok(!out.message && !into.message, `${out.message} ${into.message}`);
  const cutOut = v0 - volume(out), cutInto = v0 - volume(into);
  assert.ok(Math.abs(cutOut) < 1e-6, `one way cuts nothing: ${cutOut}`);
  assert.ok(Math.abs(cutInto - area * 20) < 0.01 * area * 20, `the other way cuts 20 mm: ${cutInto}`);
  for (const depth of [20, -20]) {
    const both = step({ depth, both: 1 });
    assert.ok(!both.message, both.message ?? "");
    const cut = v0 - volume(both);
    assert.ok(Math.abs(cut - area * 20) < 0.01 * area * 20, `both ways cuts the 20 mm that is the block's, whichever way the depth points (${depth}): ${cut}`);
  }
  const deep = step({ depth: -30, both: 1 }); // (30 mm each way: the block is 40 deep, so it cuts 40 - 10 = the whole way from the plane 0 to 30 only, as the block starts at the plane)
  assert.ok(!deep.message);
  assert.ok(Math.abs((v0 - volume(deep)) - area * 30) < 0.01 * area * 30, `${v0 - volume(deep)}`);
});

import { cutGhosts, ghostHit } from "../src/interaction/cutghost.ts";
test("the ghost of a cut: the tool's triangles (both ways when asked), the figure's face to select, and a ray through it", () => {
  const { s, step } = setup();
  const cut = step({ depth: -20 });
  const g1 = cutGhosts(scene(cut));
  assert.equal(g1.length, 1, "one ghost for the one cut");
  assert.equal(g1[0]!.step, "s_cut");
  assert.ok(g1[0]!.parts.length === 1 && scene(cut).parts[g1[0]!.parts[0]!]?.kind === "face", "a click selects the figure's face");
  const ys = (g: { tris: number[] }): [number, number] => { const v: number[] = []; for (let i = 1; i < g.tris.length; i += 3) v.push(g.tris[i]!); return [Math.min(...v), Math.max(...v)]; };
  const [lo1, hi1] = ys(g1[0]!);
  assert.ok(Math.abs(hi1 - lo1 - 20) < 1e-6, `20 mm long: ${lo1}..${hi1}`);
  const both = cutGhosts(scene(step({ depth: -20, both: 1 })))[0]!;
  const [lo2, hi2] = ys(both);
  assert.ok(Math.abs(hi2 - lo2 - 40) < 1e-6 && both.both, `40 mm long both ways: ${lo2}..${hi2}`);
  // a ray along y through the middle of the circle crosses it; one far to the side does not
  assert.ok(ghostHit(g1, [20, -50, 10], [0, 1, 0]), "through");
  assert.equal(ghostHit(g1, [30, -50, 10], [0, 1, 0]), null, "beside");
  assert.equal(cutGhosts(scene(setup().s)).length, 0, "a model with no cut has none");
});

import { readFileSync } from "node:fs";
import { openSession } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { selection } from "../src/interaction/session.ts";
test("the human's holes (`in_1337`): Show cuts draws the cut, a click on it selects its figure, the bar offers both ways, and it goes through (`in_1339`)", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/holes-in_1338.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  const env = { w: 800, h: 600, now: 0 };
  let st = createState(o.ok ? o.value : (undefined as never));
  assert.equal(frameOf(st, env).cutGhosts, null, "not shown until asked");
  const g = cutGhosts(scene(st.session)).find((x) => x.step === "s_019")!;
  assert.ok(g, "the hole's cut has a ghost");
  st = { ...st, showCuts: true, cam: { ...homeCamera(), target: [17.21, 21.04, 9] } };
  assert.ok(frameOf(st, env).cutGhosts, "shown with View, Show cuts");
  // a point inside the ghost's first triangle, as it is seen
  const T = g.tris;
  const mid: [number, number, number] = [(T[0]! + T[3]! + T[6]!) / 3, (T[1]! + T[4]! + T[7]!) / 3, (T[2]! + T[5]! + T[8]!) / 3];
  const pj = projector(st.cam, env.w, env.h);
  const px = pj.project(mid)!;
  st = reduce(st, { type: "click", x: px[0], y: px[1], count: 1, shift: false }, env);
  const ray = pj.ray(px[0], px[1]);
  const nearest = ghostHit(cutGhosts(scene(st.session)), ray.o, ray.d)!;
  assert.deepEqual(selection(st.session), nearest.ghost.parts, "the figure of the nearest cut under the click is selected");
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: g.parts } } }; // (the hole's own, whatever lies in front of it from here)
  const bar = frameOf(st, env).bar;
  assert.ok(bar?.icons.some((x) => x.id === "cut:both:s_019"), "the bar offers both ways");
  const v0 = volume(st.session);
  st = reduce(st, { type: "runAction", id: "cut:both:s_019" } as never, env);
  assert.equal(scene(st.session).steps.find((x) => x.id === "s_019")!.params.both, 1);
  assert.ok(volume(st.session) < v0 - 1, `the cut goes through both ways: ${v0} to ${volume(st.session)}`);
  st = reduce(st, { type: "runAction", id: "cut:both:s_019" } as never, env);
  assert.ok(Math.abs(volume(st.session) - v0) < 1e-6, "one way again");
});

test("the selected cut's figure is moved by the Move tool and the cut is made again where it now stands (`in_1339`)", () => {
  const o = openSession(kernel, readFileSync(new URL("./fixtures/holes-in_1338.cad.json", import.meta.url), "utf8"));
  assert.ok(o.ok);
  const env = { w: 800, h: 600, now: 0 };
  const sess = o.ok ? o.value : (undefined as never);
  const g = cutGhosts(scene(sess)).find((x) => x.step === "s_019")!;
  const centreZ = (s: Session): number => { const ghost = cutGhosts(scene(s)).find((x) => x.step === "s_019")!; const t = ghost.tris; let z = 0; for (let i = 0; i < t.length; i += 3) z += t[i]! + 7 * t[i + 1]! + 13 * t[i + 2]!; return z / (t.length / 3); }; // (a weighted sum of the three coordinates: any move shows)
  const z0 = centreZ(sess);
  let st = createState({ ...sess, click: { ...sess.click, selection: g.parts } });
  st = reduce(st, { type: "begin", name: "move" }, env);
  assert.ok(st.op, `the Move tool starts on the cut's figure: ${st.session.message ?? ""}`);
  for (const k of "-2") st = reduce(st, { type: "typed", key: k, shift: false }, env);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  const z1 = centreZ(st.session);
  assert.ok(Math.abs(z1 - z0) > 1e-6, `the cut moved: ${z0} to ${z1} ${st.session.message ?? ""}`);
});
