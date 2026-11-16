// Cycloidal (clock) gears (`dec_gear_tool`, `in_553`): the numbers of the profile, the curves against their equations, that gears of one generating circle mesh and others do not, and what the kernel makes of it.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../src/operation/gear.ts";
import { meshWith } from "../src/operation/mesh.ts";
import type { GearRecord } from "../src/operation/gearscene.ts";
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
function polygon(g: GearOutline, at: readonly number[] = [0, 0], turn = 0, per = 12): P[] {
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  const place = (q: P): P => [at[0]! + q[0] * c - q[1] * s, at[1]! + q[0] * s + q[1] * c];
  const out: P[] = [];
  g.points.forEach((a, i) => {
    const b = g.points[(i + 1) % g.points.length]!;
    const k = g.bulges[i]!;
    out.push(place(a));
    if (Math.abs(k) < 1e-6) return; // (a straight side)
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const m: P = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    const ux = ((a[0] ** 2 + a[1] ** 2) * (m[1] - b[1]) + (m[0] ** 2 + m[1] ** 2) * (b[1] - a[1]) + (b[0] ** 2 + b[1] ** 2) * (a[1] - m[1])) / d;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (b[0] - m[0]) + (m[0] ** 2 + m[1] ** 2) * (a[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (m[0] - a[0])) / d;
    const r = Math.hypot(a[0] - ux, a[1] - uy);
    const [a0, a1, am] = [Math.atan2(a[1] - uy, a[0] - ux), Math.atan2(b[1] - uy, b[0] - ux), Math.atan2(m[1] - uy, m[0] - ux)];
    const wrap = (v: number) => ((v % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const [sa, sm] = [wrap(a1 - a0), wrap(am - a0)];
    const sweep = Math.sign(sa) === Math.sign(sm) && Math.abs(sm) < Math.abs(sa) ? sa : sa - Math.sign(sa) * 2 * Math.PI;
    for (let j = 1; j < per; j++) out.push(place([ux + r * Math.cos(a0 + (sweep * j) / per), uy + r * Math.sin(a0 + (sweep * j) / per)]));
  });
  return out;
}
const inside = (p: P, poly: P[]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [a, b] = [poly[i]!, poly[j]!]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (p: P, poly: P[]): number => { let d = Infinity; for (let i = 0; i < poly.length; i++) { const [a, b] = [poly[i]!, poly[(i + 1) % poly.length]!]; const [dx, dy] = [b[0] - a[0], b[1] - a[1]]; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)); } return d; };
const penetration = (a: P[], b: P[]): number => Math.max(0, ...a.filter((p) => inside(p, b)).map((p) => edgeDist(p, b)), ...b.filter((p) => inside(p, a)).map((p) => edgeDist(p, a)));
const area = (poly: P[]): number => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
const rec = (spec: GearSpec, at: readonly number[] = [0, 0, 0], turn = 0): GearRecord => ({ id: "g_001", plane: "w/XY" as never, at: [...at] as unknown as GearRecord["at"], spec, ...(turn ? { turn } : {}) });

test("a clock gear of 12 teeth, module 2: tip radius R + m, root R - 1.25 m, the dedendum flank is a straight radial line (the generating circle is half the pitch circle), the tooth is pi m / 2 thick on the pitch circle and narrower at the tip", () => {
  const g = must({ teeth: 12, module: 2, cycloidal: {} });
  const rs = g.points.map((p) => Math.hypot(p[0], p[1]));
  assert.ok(Math.abs(Math.max(...rs) - 14) < 1e-9 && Math.abs(Math.min(...rs) - 9.5) < 1e-9, `${Math.min(...rs)} .. ${Math.max(...rs)}`);
  // the points of the first tooth's negative side below the pitch circle all lie on one ray (a radial flank)
  const below = g.points.filter((p) => Math.hypot(p[0], p[1]) < 12 - 1e-6 && Math.atan2(p[1], p[0]) < 0 && Math.atan2(p[1], p[0]) > -Math.PI / 12).map((p) => Math.atan2(p[1], p[0]));
  assert.ok(below.length >= 5 && Math.max(...below) - Math.min(...below) < 1e-9, `angles ${below}`);
  // thickness on the pitch circle: the points at radius 12 are at +-pi m / 2 / (2 R) = +-7.5 degrees
  const atPitch = g.points.filter((p) => Math.abs(Math.hypot(p[0], p[1]) - 12) < 1e-6 && Math.abs(Math.atan2(p[1], p[0])) < Math.PI / 12).map((p) => Math.atan2(p[1], p[0]));
  assert.ok(atPitch.some((a) => Math.abs(a + Math.PI / 24) < 1e-9) && atPitch.some((a) => Math.abs(a - Math.PI / 24) < 1e-9), `${atPitch}`);
  const tip = g.points.filter((p) => Math.abs(Math.hypot(p[0], p[1]) - 14) < 1e-9).map((p) => Math.abs(Math.atan2(p[1], p[0])));
  assert.ok(Math.min(...tip) > 0 && Math.min(...tip) < Math.PI / 24, "the tip is narrower than the tooth at the pitch circle");
  // backlash takes thickness off
  const loose = must({ teeth: 12, module: 2, backlash: 0.2, cycloidal: {} });
  const a2 = loose.points.filter((p) => Math.abs(Math.hypot(p[0], p[1]) - 12) < 1e-6 && Math.abs(Math.atan2(p[1], p[0])) < Math.PI / 12).map((p) => Math.abs(Math.atan2(p[1], p[0])));
  assert.ok(Math.abs(Math.max(...a2) - (Math.PI * 2 / 2 - 0.2) / 24) < 1e-9);
});

test("the flank follows the epicycloid and the hypocycloid of the generating circle to half a percent of the module", () => {
  for (const z of [12, 20, 50]) {
    const m = 2, R = (m * z) / 2, rg = 3 * m, thp = (Math.PI * m) / 2 / (2 * R);
    const pl = polygon(must({ teeth: z, module: m, cycloidal: {} }), [0, 0], 0, 40);
    const near = (p: P) => edgeDist(p, pl);
    let worst = 0;
    const thTip = (rg / R) * Math.acos(((R + rg) ** 2 + rg * rg - (R + m) ** 2) / (2 * rg * (R + rg)));
    for (let i = 0; i <= 200; i++) {
      const th = (thTip * i) / 200, k = (R + rg) / rg;
      const [x, y] = [(R + rg) * Math.cos(th) - rg * Math.cos(k * th), (R + rg) * Math.sin(th) - rg * Math.sin(k * th)];
      const [rho, phi] = [Math.hypot(x, y), Math.atan2(y, x)];
      worst = Math.max(worst, near([rho * Math.cos(-thp + phi), rho * Math.sin(-thp + phi)]));
    }
    const thRoot = (rg / R) * Math.acos((((R - 1.25 * m) ** 2) - (R - rg) ** 2 - rg * rg) / (2 * rg * (R - rg)));
    for (let i = 0; i <= 200; i++) {
      const th = (thRoot * i) / 200, k = (R - rg) / rg;
      const [x, y] = [(R - rg) * Math.cos(th) + rg * Math.cos(k * th), (R - rg) * Math.sin(th) - rg * Math.sin(k * th)];
      const [rho, phi] = [Math.hypot(x, y), Math.atan2(y, x)];
      worst = Math.max(worst, near([rho * Math.cos(-thp - phi), rho * Math.sin(-thp - phi)])); // (the hypocycloid leans the other way)
    }
    assert.ok(worst < 0.005 * m, `${z} teeth: ${worst}`);
  }
});

test("gears of one generating circle mesh: for several tooth counts and directions no tooth runs into another, they touch, and half a pitch out they run into each other", () => {
  for (const [z1, z2, turn1] of [[12, 12, 0], [20, 31, 0.3], [8, 40, 1.1], [48, 24, -0.7], [9, 40, 0.2], [11, 60, -1.3], [14, 14, 2], [30, 9, 0.5], [60, 10, 0.1]] as const) {
    for (const phi of [0, 0.7, 2.1]) {
      const a = rec({ teeth: z1, module: 2, cycloidal: {} }, [5, -3, 0], turn1);
      const r = meshWith(a, [1, 0, 0], [0, 1, 0], { teeth: z2 }, phi);
      assert.ok(r.ok, r.ok ? "" : r.error);
      if (!r.ok) return;
      assert.ok(r.value.spec.cycloidal, "the partner is a clock gear too");
      const [ga, gb] = [must(a.spec), must(r.value.spec)];
      const [pa, pb] = [polygon(ga, a.at, turn1), polygon(gb, r.value.at, r.value.turn)];
      assert.ok(penetration(pa, pb) < 0.012, `${z1}/${z2} at ${phi}: ${penetration(pa, pb)}`);
      assert.ok(penetration(pa, polygon(gb, r.value.at, r.value.turn + Math.PI / z2)) > 0.3, "half a pitch out");
      // the teeth touch (the closest the two outlines come is nothing, to a few thousandths of the module): the gears are not just standing apart
      const closest = Math.min(...pa.map((p) => edgeDist(p, pb)), ...pb.map((p) => edgeDist(p, pa)));
      assert.ok(closest < 0.01, `${z1}/${z2} at ${phi}: closest ${closest}`);
    }
  }
  assert.ok(!meshWith(rec({ teeth: 20, module: 2, cycloidal: {} }), [1, 0, 0], [0, 1, 0], { teeth: 10, rack: true }, 0).ok);
});

test("what makes no clock gear is refused with the reason: too few teeth, a generating circle as big as the pitch circle, an addendum or dedendum the circle cannot make, pointed teeth", () => {
  const why = (spec: GearSpec): string => { const o = gearOutline(spec); assert.ok(!o.ok, JSON.stringify(spec)); return (o as { error: string }).error; };
  assert.match(why({ teeth: 5, module: 2, cycloidal: {} }), /7 to 500 teeth/);
  assert.match(why({ teeth: 12, module: 2, cycloidal: { circle: 6 } }), /smaller than the pitch circle/);
  assert.match(why({ teeth: 30, module: 2, cycloidal: { circle: 0.4, addendum: 1.5 } }), /addendum is more than/);
  assert.match(why({ teeth: 30, module: 2, cycloidal: { addendum: 2.8 } }), /pointed/);
  assert.match(why({ teeth: 12, module: 2, backlash: 4, cycloidal: {} }), /backlash/);
});

test("extruded through the kernel a clock gear has the outline's area times its thickness, a bore is a hole, and the teeth can change", () => {
  const spec: GearSpec = { teeth: 30, module: 1, cycloidal: {}, bore: 4 };
  const g = must({ teeth: 30, module: 1, cycloidal: {} });
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
  const op = startOp(scene(s), [loopFaceRef(lines) as never], "extrude");
  assert.ok(op.ok);
  const done = runOp(s, { ...(op as { op: Op }).op, value: 3 })!.session;
  const vol = (x: ReturnType<typeof createSession>) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  const want = (area(polygon(g, [0, 0], 0, 40)) - Math.PI * 4) * 3;
  assert.ok(Math.abs(vol(done) - want) < 0.003 * want, `${vol(done)} against ${want}`);
  const more = run(done, { type: "setGear", id: "g_001", spec: { ...spec, teeth: 40 } });
  assert.ok(!more.message, more.message ?? "");
  assert.ok(vol(more) > vol(done) * 1.4);
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
const move = (st: AppState, p: Vec3) => reduce(st, { type: "hover", x: px(st, p)[0], y: px(st, p)[1] }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);

test("Clock gear tool: the box has Teeth, Module, Backlash, Circle, Addendum, Dedendum and Bore; Mesh gear makes a clock gear partner; a refused number says why", () => {
  let st = top();
  const ids = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap((i) => [i.id, ...(i.children ?? []).map((c) => c.id)]);
  assert.ok(ids.includes("tool:clock"));
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:clock" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), { ...st.tool!, cursor: [C[0] + 21, C[1], 0] }, st.op)!.fields.map((f) => f.label), ["Teeth", "Module", "Backlash", "Circle", "Addendum", "Dedendum", "Bore"]);
  st = typeText(st, "24"); st = key(st, "Tab"); st = typeText(st, "1.5");
  st = key(st, "Enter");
  const rec0 = scene(st.session).gears![0]!;
  assert.deepEqual([rec0.spec.teeth, rec0.spec.module, !!rec0.spec.cycloidal], [24, 1.5, true]);
  // a partner by Mesh gear
  const face = scene(st.session).parts[loopFaceRef(gearRefs(rec0).lines) as never]!;
  let m = reduce({ ...reduce(st, { type: "escape" }, env), tool: null, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] as never } } }, { type: "runAction", id: "gear:mesh" }, env);
  m = move(m, [C[0], C[1] + 40, 0]);
  m = typeText(m, "12");
  m = key(m, "Enter");
  const [a, b] = scene(m.session).gears!;
  assert.ok(b!.spec.cycloidal && b!.spec.teeth === 12 && b!.spec.module === 1.5);
  assert.ok(Math.abs(Math.hypot(b!.at[0] - a!.at[0], b!.at[1] - a!.at[1]) - 1.5 * (24 + 12) / 2) < 1e-6);
  // too few teeth
  let few = reduce(top(), { type: "begin", name: "gear" }, env);
  few = reduce(few, { type: "runAction", id: "tool:clock" }, env);
  few = { ...few, tool: { ...few.tool!, plane: worldRef("XY") } };
  few = click(few, C); few = typeText(few, "5"); few = key(few, "Tab"); few = typeText(few, "2"); few = key(few, "Enter");
  assert.match(few.session.message ?? "", /7 to 500 teeth/);
});
