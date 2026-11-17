// ISO 606 sprockets (`dec_gear_tool`, `in_588`): the chain table, the limits of the tooth form, a roller in every gap, the kernel, the tool, and the menu that holds the gear tools.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec, GearOutline } from "../src/operation/gear.ts";
import { ISO_B, chainOf } from "../src/operation/chains.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf } from "../src/interaction/entry.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
type P = [number, number];
const must = (spec: GearSpec): GearOutline => { const o = gearOutline(spec); assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
const iso = (teeth: number, chain = 8, fit?: number, extra: Partial<GearSpec> = {}): GearSpec => ({ teeth, module: 1, sprocket: { chain, iso: true, ...(fit !== undefined ? { fit } : {}) }, ...extra });
function polygon(g: GearOutline, per = 10): P[] {
  const out: P[] = [];
  g.points.forEach((a, i) => {
    const b = g.points[(i + 1) % g.points.length]!;
    const k = g.bulges[i]!;
    out.push(a);
    if (Math.abs(k) < 1e-9) return;
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
    for (let j = 1; j < per; j++) out.push([ux + r * Math.cos(a0 + (sweep * j) / per), uy + r * Math.sin(a0 + (sweep * j) / per)]);
  });
  return out;
}
const area = (poly: P[]): number => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
const radiusOf = (g: GearOutline, i: number): number | null => {
  const [a, b, k] = [g.points[i]!, g.points[(i + 1) % g.points.length]!, g.bulges[i]!];
  if (Math.abs(k) < 1e-9) return null;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return (len * (1 + 4 * k * k)) / (8 * Math.abs(k));
};

test("the B series: pitch and roller diameter as the sources agree (06B 9.525 / 6.35, 08B 12.7 / 8.51, 10B 15.875 / 10.16, 12B 19.05 / 12.07, 16B 25.4 / 15.88, 20B 31.75 / 19.05, 24B 38.1 / 25.4); the A series is the ANSI chains", () => {
  assert.deepEqual(Object.entries(ISO_B).map(([k, v]) => [Number(k), v.pitch, v.roller]), [[6, 9.525, 6.35], [8, 12.7, 8.51], [10, 15.875, 10.16], [12, 19.05, 12.07], [16, 25.4, 15.88], [20, 31.75, 19.05], [24, 38.1, 25.4]]);
  assert.deepEqual(chainOf({ iso: true, chain: 8 }), { pitch: 12.7, roller: 8.51 });
  const a = chainOf({ iso: true, chain: 80 })!; // (16A is the ANSI 80)
  assert.ok(Math.abs(a.pitch - 25.4) < 1e-9 && Math.abs(a.roller - 15.875) < 1e-9);
  assert.deepEqual(chainOf({ iso: true, pitch: 12.7, roller: 7.75 }), { pitch: 12.7, roller: 7.75 });
});

test("the tooth form is inside ISO 606's limits at every fit: the seat radius from 0.505 d1 to 0.505 d1 + 0.069 d1^(1/3), the seating angle from 120 - 90/z to 140 - 90/z degrees, the flank radius between 0.12 d1 (z + 2) and 0.008 d1 (z^2 + 180); the root is the seat's bottom, the pitch diameter p / sin(180/z)", () => {
  for (const [z, chain] of [[20, 8], [12, 6], [30, 10], [45, 12], [17, 16]] as const) {
    const { pitch, roller: d1 } = chainOf({ iso: true, chain })!;
    for (const fit of [0, 0.5, 1]) {
      const g = must(iso(z, chain, fit));
      assert.ok(Math.abs(g.pitchRadius * 2 - pitch / Math.sin(Math.PI / z)) < 1e-9);
      const radii = g.points.map((_, i) => radiusOf(g, i)).filter((r): r is number => r !== null && Math.abs(r - g.tipRadius) > 1e-6); // (the arcs of the blank's outside circle are not the tooth's)
      const ri = Math.min(...radii), re = Math.max(...radii.filter((r) => r > ri * 1.5));
      assert.ok(ri >= 0.505 * d1 - 1e-9 && ri <= 0.505 * d1 + 0.069 * Math.cbrt(d1) + 1e-9, `seat ${ri} for ${z}/${chain} at ${fit}`);
      const [lo, hi] = [0.12 * d1 * (z + 2), 0.008 * d1 * (z * z + 180)].sort((a, b) => a - b) as [number, number];
      assert.ok(re >= lo - 1e-6 && re <= hi + 1e-6, `flank ${re} not in ${lo}..${hi} (${z}/${chain} at ${fit})`);
      assert.ok(Math.abs(ri - (0.505 * d1 + fit * 0.069 * Math.cbrt(d1))) < 1e-9 && Math.abs(re - (lo + fit * (hi - lo))) < 1e-6, "the fit puts them that far along");
      assert.ok(Math.abs(g.rootRadius - (g.pitchRadius - ri)) < 1e-9);
      // the seating angle: the angle at the roller's centre between the two ends of the seat
      const i = g.points.findIndex((_, k) => Math.abs((radiusOf(g, k) ?? 0) - ri) < 1e-9);
      const [a, b] = [g.points[i]!, g.points[(i + 1) % g.points.length]!];
      const centre = Math.atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      const rc: P = [g.pitchRadius * Math.cos(centre), g.pitchRadius * Math.sin(centre)];
      const ang = Math.acos(((a[0] - rc[0]) * (b[0] - rc[0]) + (a[1] - rc[1]) * (b[1] - rc[1])) / (ri * ri)) * 180 / Math.PI;
      assert.ok(Math.abs(ang - (120 + 20 * fit - 90 / z)) < 1e-6, `seating angle ${ang} for ${z} at ${fit}`);
    }
  }
});

test("a roller of the chain stands in every gap without touching a tooth, and the whole sprocket is one counter-clockwise loop, for B and A series and for tight, middle and loose fits", () => {
  for (const [z, chain, fit] of [[20, 8, 0.5], [12, 6, 0], [30, 10, 1], [45, 12, 0.5], [17, 16, 0.2], [24, 80, 0.5], [18, 40, 1]] as const) {
    const g = must(iso(z, chain, fit));
    const poly = polygon(g);
    const { roller } = chainOf({ iso: true, chain })!;
    let nearest = Infinity;
    for (let i = 0; i < z; i++) {
      const c: P = [g.pitchRadius * Math.cos((2 * Math.PI * i) / z), g.pitchRadius * Math.sin((2 * Math.PI * i) / z)];
      for (const p of poly) nearest = Math.min(nearest, Math.hypot(p[0] - c[0], p[1] - c[1]) - roller / 2);
    }
    assert.ok(nearest > -0.003 && nearest < 0.12 * roller, `${z} teeth chain ${chain} fit ${fit}: clearance ${nearest}`);
    assert.ok(area(poly) > 0, "counter-clockwise");
  }
});

test("what makes no ISO sprocket is refused with the reason: fewer than 9 teeth, a fit outside 0 to 1, a chain number there is none of, a bore as wide as the root", () => {
  const why = (spec: GearSpec): string => { const o = gearOutline(spec); assert.ok(!o.ok, JSON.stringify(spec)); return (o as { error: string }).error; };
  assert.match(why(iso(8)), /9 to 400 teeth/);
  assert.match(why(iso(20, 8, 1.5)), /fit is from 0/);
  assert.match(why(iso(20, 7)), /no chain numbered 7: the B series 6, 8, 10/);
  assert.match(why(iso(20, 8, 0.5, { bore: 80 })), /bore must be smaller/);
});

test("extruded through the kernel an ISO sprocket has the outline's area times its thickness, with a bore and after a change of teeth", () => {
  const spec = iso(20, 8, 0.5, { bore: 8 });
  const g = must(iso(20, 8, 0.5));
  let s = createSession(kernel);
  s = run(s, { type: "gear", id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec });
  assert.ok(!s.message, s.message ?? "");
  const lines = gearRefs({ id: "g_001", plane: worldRef("XY"), at: [0, 0, 0], spec }).lines;
  const op = startOp(scene(s), [loopFaceRef(lines) as never], "extrude");
  assert.ok(op.ok);
  const done = runOp(s, { ...(op as { op: Op }).op, value: 6 })!.session;
  const vol = (x: ReturnType<typeof createSession>) => Object.values(scene(x).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
  const want = (area(polygon(g, 40)) - Math.PI * 16) * 6;
  assert.ok(Math.abs(vol(done) - want) < 0.003 * want, `${vol(done)} against ${want}`);
  const more = run(done, { type: "setGear", id: "g_001", spec: { ...spec, teeth: 30 } });
  assert.ok(!more.message, more.message ?? "");
  assert.ok(vol(more) > vol(done) * 1.3);
});

// ---- the tool and the menu ----
const env = { w: 800, h: 600, now: 0 };
const C: Vec3 = [10, 10, 0];
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);
type Item = { id: string; label: string; icon: string; enabled: boolean; children?: Item[] };

test("the Sketch ring holds one Gear icon that opens a submenu with every gear tool (Spur gear, Ring gear, Rack, Planetary set, Clock, Pulley and Sprocket submenus, Edit gear, Mesh gear, Mesh rack); none of them is in the Sketch ring itself", () => {
  const items = reduce(top(), { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[];
  const sketch = items.find((i) => i.id === "sketch")!;
  assert.deepEqual(sketch.children!.map((i) => i.id), ["tool:rect", "tool:circle", "tool:line", "tool:arc", "gears", "tool:trim", "op:offset"]);
  const gears = sketch.children!.find((i) => i.id === "gears")!;
  assert.equal(gears.label, "Gear");
  assert.deepEqual(gears.children!.map((i) => i.id), ["tool:gear", "tool:ring", "tool:rack", "tool:planetary", "worms", "clockgears", "pulleys", "sprockets", "gear:edit", "gear:helix", "meshes"]);
  assert.deepEqual(gears.children!.find((i) => i.id === "clockgears")!.children!.map((i) => i.id), ["tool:clock", "tool:clockring", "tool:clockrack"]);
  assert.deepEqual(gears.children!.find((i) => i.id === "pulleys")!.children!.map((i) => i.id), ["tool:gt2", "tool:gt3", "tool:htd5", "tool:htd8"]);
  assert.deepEqual(gears.children!.find((i) => i.id === "sprockets")!.children!.map((i) => i.id), ["tool:sprocket", "tool:isosprocket"]);
  assert.ok(gears.enabled && gears.children!.filter((i) => i.id.startsWith("tool:")).every((i) => i.enabled));
  // and each tool still starts from its place in the submenu
  for (const [id, variant] of [["tool:isosprocket", "isosprocket"], ["tool:clockrack", "clockrack"], ["tool:htd5", "htd5"]] as const) {
    const st = reduce(top(), { type: "runAction", id }, env);
    assert.ok(st.tool?.kind === "gear", `${id} (${variant}) is a gear tool`);
  }
});

test("ISO sprocket tool: Teeth, Chain (the B series number), Pitch, Roller, Fit and Bore; 08B by default; a chain number there is none of says so", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:isosprocket" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => [f.label, f.value]), [["Teeth", "20"], ["Chain", "8"], ["Pitch", "12.7"], ["Roller", "8.51"], ["Fit", "0.5"], ["Bore", "0"], ["Flat", "0"], ["Key", "0"], ["Key depth", "0"]]);
  st = typeText(st, "24"); st = key(st, "Tab"); st = typeText(st, "10"); st = key(st, "Tab"); st = key(st, "Tab"); st = key(st, "Tab"); st = typeText(st, "0.2"); st = key(st, "Tab"); st = typeText(st, "6");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.deepEqual([rec.spec.teeth, rec.spec.sprocket!.chain, rec.spec.sprocket!.iso, rec.spec.sprocket!.fit, rec.spec.bore], [24, 10, true, 0.2, 6]);
  let bad = reduce(top(), { type: "begin", name: "gear" }, env);
  bad = reduce(bad, { type: "runAction", id: "tool:isosprocket" }, env);
  bad = { ...bad, tool: { ...bad.tool!, plane: worldRef("XY") } };
  bad = click(bad, C); bad = key(bad, "Tab"); bad = typeText(bad, "7"); bad = key(bad, "Enter");
  assert.match(bad.session.message ?? "", /no chain numbered 7/);
});

test("a gear made by Mesh gear can have its bore at once (a Bore field after Angle); a rack partner has none; Edit gear still changes it (`in_588`)", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = click(st, C); st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2"); st = key(st, "Enter");
  const rec0 = scene(st.session).gears![0]!;
  const face = scene(st.session).parts[loopFaceRef(gearRefs(rec0).lines) as never]!;
  const sel = { ...reduce(st, { type: "escape" }, env), tool: null, session: { ...st.session, click: { ...st.session.click, selection: [face.ref] as never } } };
  let m = reduce(sel, { type: "runAction", id: "gear:mesh" }, env);
  m = { ...m, tool: { ...m.tool!, cursor: [C[0], C[1] + 40, 0] } };
  assert.deepEqual(entryOf(scene(m.session), m.tool, m.op)!.fields.map((f) => f.label), ["Teeth", "Ratio", "Angle", "Bore", "Flat", "Key", "Key depth"]);
  m = typeText(m, "30"); m = key(m, "Tab"); m = key(m, "Tab"); m = key(m, "Tab"); m = typeText(m, "5");
  m = key(m, "Enter");
  assert.equal(scene(m.session).gears![1]!.spec.bore, 5);
  assert.ok(Object.values(scene(m.session).parts).some((p) => p.kind === "circle" && p.ref === "d/g_002.b"), "its bore is drawn");
  let r = reduce(sel, { type: "runAction", id: "gear:meshrack" }, env);
  assert.deepEqual(entryOf(scene(r.session), { ...r.tool!, cursor: [C[0], C[1] - 40, 0] }, r.op)!.fields.map((f) => f.label), ["Teeth", "Angle"]);
});
