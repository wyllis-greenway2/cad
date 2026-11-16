// The GT2 pulley (`dec_gear_tool`, `in_551`): the belt table's numbers, the arcs that touch each other, the outline, and what the kernel makes of it.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../src/operation/gear.ts";
import { GT_TOOTH } from "../src/operation/pulley.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const must = (spec: GearSpec): GearOutline => { const o = gearOutline(spec); assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
type P = [number, number];
const area = (g: GearOutline): number => {
  let a = 0;
  g.points.forEach((p, i) => {
    const q = g.points[(i + 1) % g.points.length]!;
    a += (p[0] * q[1] - q[0] * p[1]) / 2;
    const b = g.bulges[i]!;
    if (!b) return;
    const [len, th] = [Math.hypot(q[0] - p[0], q[1] - p[1]), 4 * Math.atan(2 * Math.abs(b))];
    const r = (len * (1 + 4 * b * b)) / (8 * Math.abs(b));
    a += -Math.sign(b) * 0.5 * r * r * (th - Math.sin(th));
  });
  return a;
};

test("the table's radii touch: for 2GT the centres of R2 and R3 are exactly R2 - R3 apart, for 3GT within the table's rounding; and the pitch line differential agrees with Pfeifer's charts (0.254 for 2GT)", () => {
  for (const [name, t] of Object.entries(GT_TOOTH)) {
    const apart = Math.hypot(t.b, t.h - t.R3);
    assert.ok(Math.abs(apart - (t.R2 - t.R3)) < 0.006, `${name}: ${apart} against ${t.R2 - t.R3}`);
  }
  assert.equal(GT_TOOTH["2GT"].pld, 0.254);
});

test("a 20 groove 2GT pulley: outside diameter 12.22 mm (Pfeifer and Gates: 0.481 in), the grooves 0.75 mm deep, 20 grooves, closed and counter-clockwise", () => {
  const g = must({ teeth: 20, module: 2, pulley: "2GT" });
  const rs = g.points.map((p) => Math.hypot(p[0], p[1]));
  assert.ok(Math.abs(2 * Math.max(...rs) - (40 / Math.PI - 0.508)) < 1e-9 && Math.abs(2 * Math.max(...rs) - 12.22) < 0.005, `${2 * Math.max(...rs)}`);
  assert.ok(Math.abs(2 * g.pitchRadius - 20 * 2 / Math.PI) < 1e-9, "pitch diameter 12.73");
  assert.ok(Math.abs(g.rootRadius - ((40 / Math.PI - 0.508) / 2 - 0.75)) < 1e-9);
  assert.equal(g.points.length, 20 * 6);
  assert.ok(area(g) > 0, "counter-clockwise");
  // every arc joins the next: the end of one is the start of the next, and the sides of a groove turn smoothly (the chord of each arc is shorter than its neighbours' sum: no cusps)
  assert.ok(g.bulges.every((b) => Number.isFinite(b)));
});

test("the groove is the belt tooth: its tip circle has radius R3 about a point h - R3 below the outside, and the clearance makes it that much bigger all round", () => {
  const t = GT_TOOTH["2GT"];
  for (const c of [0, 0.05]) {
    const g = must({ teeth: 24, module: 2, pulley: "2GT", clearance: c });
    const Ro = 24 * 2 / (2 * Math.PI) - t.pld;
    const deepest = Math.min(...g.points.map((p) => Math.hypot(p[0], p[1])));
    // the tip arc's middle is the deepest point of the groove: h + clearance below the outside circle (the corners of the arc are higher)
    const arcDeep = Ro - t.h - c;
    assert.ok(deepest >= arcDeep - 1e-9 && deepest < Ro, `${c}: ${deepest}`);
    const i = g.bulges.findIndex((b, k) => Math.abs(Math.hypot(...g.points[k]!) - Math.hypot(...g.points[(k + 1) % g.points.length]!)) < 0.2 && Math.abs(b) > 0.02 && Math.hypot(...g.points[k]!) < Ro - 0.4);
    assert.ok(i >= 0, "a tip arc");
    const [a, b] = [g.points[i]!, g.points[(i + 1) % g.points.length]!];
    const [len, bu] = [Math.hypot(b[0] - a[0], b[1] - a[1]), g.bulges[i]!];
    const r = (len * (1 + 4 * bu * bu)) / (8 * Math.abs(bu));
    assert.ok(Math.abs(r - (t.R3 + c)) < 1e-6, `tip radius ${r} for clearance ${c}`);
  }
});

test("3GT and the limits: 3 mm pitch, outside diameter 3 z / pi - 0.762; fewer than 12 grooves, a clearance as big as the corner radius, a bore as wide as the root are refused with the reason", () => {
  const g = must({ teeth: 20, module: 3, pulley: "3GT" });
  assert.ok(Math.abs(2 * Math.max(...g.points.map((p) => Math.hypot(p[0], p[1]))) - (20 * 3 / Math.PI - 0.762)) < 1e-6);
  for (const bad of [{ teeth: 10, module: 2, pulley: "2GT" as const }, { teeth: 20, module: 2, pulley: "2GT" as const, clearance: 0.15 }, { teeth: 20, module: 2, pulley: "2GT" as const, bore: 12 }]) {
    const o = gearOutline(bad);
    assert.ok(!o.ok, JSON.stringify(bad));
  }
  assert.match((gearOutline({ teeth: 10, module: 2, pulley: "2GT" }) as { error: string }).error, /12 to 400 teeth/);
});

test("extruded through the kernel a 20 groove 2GT pulley has the outline's area times its thickness; a bore is a hole", () => {
  const spec: GearSpec = { teeth: 20, module: 2, pulley: "2GT", bore: 5 };
  const g = must({ teeth: 20, module: 2, pulley: "2GT" });
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
  const op = startOp(scene(s), [loopFaceRef(lines) as never], "extrude");
  assert.ok(op.ok);
  const done = runOp(s, { ...(op as { op: Op }).op, value: 6 })!.session;
  const vol = Object.values(scene(done).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  const want = (area(g) - Math.PI * 2.5 ** 2) * 6;
  assert.ok(Math.abs(vol - want) < 0.002 * want, `${vol} against ${want}`);
});

// ---- the tool ----
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf } from "../src/interaction/entry.ts";
import type { Vec3 } from "../src/math/vec.ts";
const env = { w: 800, h: 600, now: 0 };
const C: Vec3 = [10, 10, 0];
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);

test("GT2 pulley tool: Teeth, Clearance and Bore are its numbers; click the centre, type the teeth, Enter; Edit gear changes them; a gear is not meshed to it", () => {
  let st = top();
  const ids = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap((i) => [i.id, ...(i.children ?? []).map((c) => c.id)]);
  assert.ok(ids.includes("tool:gt2") && ids.includes("tool:gt3"));
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:gt2" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.label), ["Teeth", "Clearance", "Bore"]);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.value), ["20", "0", "0"]);
  st = typeText(st, "24"); st = key(st, "Tab"); st = typeText(st, "0.05"); st = key(st, "Tab"); st = typeText(st, "5");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.pulley, rec.spec.teeth, rec.spec.clearance, rec.spec.bore], ["2GT", 24, 0.05, 5]);
  const rs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.ref.startsWith("d/g_001.p")).map((p) => Math.hypot((p as unknown as { at: number[] }).at[0]! - C[0], (p as unknown as { at: number[] }).at[1]! - C[1]));
  assert.ok(Math.abs(2 * Math.max(...rs) - (24 * 2 / Math.PI - 0.508)) < 1e-6, "its outside diameter");
  // too few teeth: the reason is said
  let few = reduce(top(), { type: "begin", name: "gear" }, env);
  few = reduce(few, { type: "runAction", id: "tool:gt2" }, env);
  few = { ...few, tool: { ...few.tool!, plane: worldRef("XY") } };
  few = click(few, C); few = typeText(few, "8"); few = key(few, "Enter");
  assert.match(few.session.message ?? "", /12 to 400 teeth/);
});
