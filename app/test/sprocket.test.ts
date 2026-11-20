// The roller chain sprocket (`dec_gear_tool`, `in_584`): the ANSI B29.1 tooth form's numbers, that a roller sits in each gap and the chain's rollers clear the teeth, and what the kernel makes of it.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../src/operation/gear.ts";
import { CHAINS, chainOf } from "../src/operation/chains.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const IN = 25.4;
const must = (spec: GearSpec): GearOutline => { const o = gearOutline(spec); assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
type P = [number, number];
/** the outline as a polygon, each arc as several points on it (the circle through the ends and the middle) */
function polygon(g: GearOutline, per = 8): P[] {
  const out: P[] = [];
  g.points.forEach((a, i) => {
    const b = g.points[(i + 1) % g.points.length]!;
    const k = g.bulges[i]!;
    out.push(a);
    if (!k) return;
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const m: P = [(a[0] + b[0]) / 2 - dy * k, (a[1] + b[1]) / 2 + dx * k];
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    const ux = ((a[0] ** 2 + a[1] ** 2) * (m[1] - b[1]) + (m[0] ** 2 + m[1] ** 2) * (b[1] - a[1]) + (b[0] ** 2 + b[1] ** 2) * (a[1] - m[1])) / d;
    const uy = ((a[0] ** 2 + a[1] ** 2) * (b[0] - m[0]) + (m[0] ** 2 + m[1] ** 2) * (a[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (m[0] - a[0])) / d;
    const r = Math.hypot(a[0] - ux, a[1] - uy);
    const [a0, a1, am] = [Math.atan2(a[1] - uy, a[0] - ux), Math.atan2(b[1] - uy, b[0] - ux), Math.atan2(m[1] - uy, m[0] - ux)];
    const wrap = (v: number) => ((v % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const [sa, sm] = [wrap(a1 - a0), wrap(am - a0)];
    const sweep = Math.sign(sa) === Math.sign(sm) && Math.abs(sm) < Math.abs(sa) ? sa : sa - Math.sign(sa) * 2 * Math.PI; // (the way round that passes the middle)
    for (let j = 1; j < per; j++) out.push([ux + r * Math.cos(a0 + (sweep * j) / per), uy + r * Math.sin(a0 + (sweep * j) / per)]);
  });
  return out;
}
const area = (poly: P[]): number => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);

test("a #40 chain on 17 teeth: pitch diameter 2.7212 in (the check of the generators), outside diameter P (0.6 + cot(180/N)), root circle, and the tooth counts it takes", () => {
  const g = must({ teeth: 17, module: 12.7, sprocket: { chain: 40 } });
  const P = 0.5 * IN;
  assert.ok(Math.abs((2 * g.pitchRadius) / IN - 2.7212) < 2e-4, `${(2 * g.pitchRadius) / IN}`);
  const OD = P * (0.6 + 1 / Math.tan(Math.PI / 17));
  const rs = g.points.map((p) => Math.hypot(p[0], p[1]));
  assert.ok(2 * Math.max(...rs) <= OD + 1e-9, "the teeth come to a point at or below the blank's outside diameter (the blank is the most it may be)");
  const few = must({ teeth: 7, module: 1, sprocket: { chain: 40 } });
  assert.ok(Math.abs(2 * Math.max(...few.points.map((p) => Math.hypot(p[0], p[1]))) - 0.5 * IN * (0.6 + 1 / Math.tan(Math.PI / 7))) < 1e-6, "with few teeth the tips are cut at the blank's outside diameter");
  assert.equal(few.points.length, 7 * 8, "a flat tip is another corner");
  assert.ok(Math.abs(g.rootRadius - (g.pitchRadius - (0.5025 * 0.312 + 0.0015) * IN)) < 1e-9, "the root circle is the seat's bottom");
  assert.equal(g.points.length, 17 * 7, "seven corners to a tooth: a pointed tooth has no flat top");
  assert.ok(!gearOutline({ teeth: 6, module: 1, sprocket: { chain: 40 } }).ok);
  assert.ok(!gearOutline({ teeth: 17, module: 1, sprocket: { chain: 99 } }).ok);
});

test("the chains are Martin's numbers: #25 .250 / .130, #35 .375 / .200, #40 .500 / .312, #41 .500 / .306, #50 .625 / .400, #60 .750 / .469, #80 1.000 / .625; a pitch and roller of one's own work too", () => {
  assert.deepEqual(Object.entries(CHAINS).map(([k, v]) => [Number(k), v.pitch, v.roller]).slice(0, 7), [[25, 0.25, 0.13], [35, 0.375, 0.2], [40, 0.5, 0.312], [41, 0.5, 0.306], [50, 0.625, 0.4], [60, 0.75, 0.469], [80, 1, 0.625]]);
  const own = chainOf({ pitch: 12.7, roller: 7.75 })!;
  assert.deepEqual([own.pitch, own.roller], [12.7, 7.75]);
  assert.ok(gearOutline({ teeth: 20, module: 12.7, sprocket: { pitch: 12.7, roller: 7.75 } }).ok);
});

test("a roller of the chain stands in every gap without touching a tooth, and rests on the seat; the rollers of a whole chain at the pitch fit round the sprocket", () => {
  for (const [chain, N] of [[40, 17], [40, 34], [25, 30], [80, 12], [50, 21]] as const) {
    const g = must({ teeth: N, module: 1, sprocket: { chain } });
    const poly = polygon(g);
    const { pitch, roller } = chainOf({ chain })!;
    const rr = roller / 2;
    const rc = g.pitchRadius;
    let nearest = Infinity;
    for (let i = 0; i < N; i++) {
      const c: P = [rc * Math.cos((2 * Math.PI * i) / N), rc * Math.sin((2 * Math.PI * i) / N)];
      for (const p of poly) nearest = Math.min(nearest, Math.hypot(p[0] - c[0], p[1] - c[1]) - rr);
    }
    // the roller clears the metal (a few hundredths at most touching the seat, never into it) and does not float far off it
    assert.ok(nearest > -0.002 && nearest < 0.1 * roller, `#${chain} ${N}: clearance ${nearest}`);
    // consecutive roller centres of a chain are one pitch apart: the pitch circle's chord
    assert.ok(Math.abs(2 * rc * Math.sin(Math.PI / N) - pitch) < 1e-9);
    assert.ok(area(poly) > 0, "counter-clockwise");
  }
});

test("the construction closes: the topping curve's centre is 1.4 roller diameters from the roller's; the tip arc is cut at the blank", () => {
  const g = must({ teeth: 18, module: 1, sprocket: { chain: 40 } });
  // the working and topping radii of a commercial #40 of 18 teeth, to four decimals in inches: 0.4079 and 0.2582
  const radii: number[] = [];
  g.points.forEach((a, i) => {
    const b = g.points[(i + 1) % g.points.length]!;
    const k = g.bulges[i]!;
    if (!k) return;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    radii.push((len * (1 + 4 * k * k)) / (8 * Math.abs(k)) / IN);
  });
  assert.ok(radii.some((r) => Math.abs(r - 0.4079) < 5e-5), "the working curve");
  assert.ok(radii.some((r) => Math.abs(r - 0.2582) < 5e-5), "the topping curve");
  assert.ok(radii.some((r) => Math.abs(r - (0.5025 * 0.312 + 0.0015)) < 5e-5), "the seating curve");
});

test("extruded through the kernel a #40 sprocket of 17 teeth has the outline's area times its thickness, a bore is a hole, and the numbers can change", () => {
  const spec: GearSpec = { teeth: 17, module: 12.7, sprocket: { chain: 40 }, bore: 10 };
  const g = must({ teeth: 17, module: 12.7, sprocket: { chain: 40 } });
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
  const op = startOp(scene(s), [loopFaceRef(lines) as never], "extrude");
  assert.ok(op.ok);
  const done = runOp(s, { ...(op as { op: Op }).op, value: 7 })!.session;
  const vol = (x: ReturnType<typeof createSession>) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  const want = (area(polygon(g, 60)) - Math.PI * 25) * 7;
  assert.ok(Math.abs(vol(done) - want) < 0.003 * want, `${vol(done)} against ${want}`);
  const more = run(done, { type: "setGear", id: "g_001", spec: { teeth: 21, module: 12.7, sprocket: { chain: 40 }, bore: 10 } });
  assert.ok(!more.message, more.message ?? "");
  assert.ok(vol(more) > vol(done) * 1.3, `${vol(done)} -> ${vol(more)}`);
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

test("Sprocket tool: Teeth, Chain (the ANSI number), Pitch, Roller and Bore; #40 by default; a chain of one's own by its pitch and roller; a chain number there is none of says so", () => {
  let st = top();
  const ids = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(ids.includes("tool:sprocket"));
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:sprocket" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.label), ["Teeth", "Chain", "Pitch", "Roller", "Bore"]);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.value), ["18", "40", "12.7", "7.92", "0"]);
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "50");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.teeth, rec.spec.sprocket!.chain], [20, 50]);
  const rs = Object.values(scene(st.session).parts).filter((p) => p.kind === "corner" && p.ref.startsWith("d/g_001.p")).map((p) => Math.hypot((p as unknown as { at: number[] }).at[0]! - C[0], (p as unknown as { at: number[] }).at[1]! - C[1]));
  assert.ok(Math.max(...rs) * 2 <= 0.625 * IN * (0.6 + 1 / Math.tan(Math.PI / 20)) + 1e-6);
  // a chain number that is none
  let bad = reduce(top(), { type: "begin", name: "gear" }, env);
  bad = reduce(bad, { type: "runAction", id: "tool:sprocket" }, env);
  bad = { ...bad, tool: { ...bad.tool!, plane: worldRef("XY") } };
  bad = click(bad, C); bad = key(bad, "Tab"); bad = typeText(bad, "77"); bad = key(bad, "Enter");
  assert.match(bad.session.message ?? "", /no chain numbered 77/);
  // a chain of one's own: pitch 12.7 and roller 7.75 (the chain number is not used then)
  let own = reduce(top(), { type: "begin", name: "gear" }, env);
  own = reduce(own, { type: "runAction", id: "tool:sprocket" }, env);
  own = { ...own, tool: { ...own.tool!, plane: worldRef("XY") } };
  own = click(own, C); own = typeText(own, "16"); own = key(own, "Tab"); own = key(own, "Tab"); own = typeText(own, "12.7"); own = key(own, "Tab"); own = typeText(own, "7.75"); own = key(own, "Enter");
  const spec = scene(own.session).gears![0]!.spec;
  assert.deepEqual([spec.sprocket!.pitch, spec.sprocket!.roller], [12.7, 7.75]);
});
