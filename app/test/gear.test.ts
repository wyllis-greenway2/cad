// The involute gear outline (`dec_gear_tool`, `in_576`): its numbers, its arcs against the true involute, and that it makes a body.
import test from "node:test";
import assert from "node:assert/strict";
import { gearOutline, bulgeOf, moduleForOutside } from "../src/operation/gear.ts";
import type { GearOutline } from "../src/operation/gear.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { drawCircle } from "../src/operation/build.ts";
import { gearRefs } from "../src/operation/gearscene.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { loopFaceRef, diskFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";

await kernel.init();
const must = (o: ReturnType<typeof gearOutline>): GearOutline => { assert.ok(o.ok, o.ok ? "" : o.error); return (o as { value: GearOutline }).value; };
/** the circle through the two ends and the middle point of one side, from its bulge */
function arcOf(a: readonly [number, number], b: readonly [number, number], bulge: number) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  const m: [number, number] = [(a[0] + b[0]) / 2 + (-dy / len) * bulge * len, (a[1] + b[1]) / 2 + (dx / len) * bulge * len];
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  const ux = ((a[0] ** 2 + a[1] ** 2) * (m[1] - b[1]) + (m[0] ** 2 + m[1] ** 2) * (b[1] - a[1]) + (b[0] ** 2 + b[1] ** 2) * (a[1] - m[1])) / d;
  const uy = ((a[0] ** 2 + a[1] ** 2) * (b[0] - m[0]) + (m[0] ** 2 + m[1] ** 2) * (a[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (m[0] - a[0])) / d;
  return { c: [ux, uy] as [number, number], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

test("a 20 tooth, module 2 gear: pitch diameter 40, outside 44, root 35, base circle 37.59", () => {
  const g = must(gearOutline({ teeth: 20, module: 2 }));
  assert.ok(Math.abs(g.pitchRadius - 20) < 1e-9);
  assert.ok(Math.abs(g.tipRadius - 22) < 1e-9);
  assert.ok(Math.abs(g.rootRadius - 17.5) < 1e-9);
  assert.ok(Math.abs(g.baseRadius - 20 * Math.cos(Math.PI / 9)) < 1e-9);
  assert.equal(g.points.length, g.bulges.length);
  const rs = g.points.map((p) => Math.hypot(p[0], p[1]));
  assert.ok(Math.abs(Math.max(...rs) - 22) < 1e-9 && Math.abs(Math.min(...rs) - 17.5) < 1e-9);
  assert.deepEqual(g.warnings, []);
});

test("the tooth is as thick as a standard tooth at the pitch circle: pi m / 2, less the backlash", () => {
  for (const backlash of [0, 0.1]) {
    const g = must(gearOutline({ teeth: 24, module: 3, backlash }));
    // the chord at the pitch circle on tooth 0: find the two outline points nearest the pitch radius, one on each side of the +x axis
    const side = (sign: number) => g.points.filter((p) => Math.abs(Math.atan2(p[1], p[0])) < Math.PI / 24 && Math.sign(p[1]) === sign).sort((a, b) => Math.abs(Math.hypot(...a) - 36) - Math.abs(Math.hypot(...b) - 36))[0]!;
    const [lo, hi] = [side(-1), side(1)];
    // the tooth is symmetric about +x: half angle at the radius of each point, and the involute gives the thickness at 36
    const half = (p: [number, number]) => Math.atan2(Math.abs(p[1]), p[0]);
    assert.ok(Math.abs(half(lo) - half(hi)) < 1e-9, "symmetric");
    const r = Math.hypot(...lo);
    const rb = 36 * Math.cos(Math.PI / 9);
    const inv = (a: number) => Math.tan(a) - a;
    const thicknessAtPitch = 2 * 36 * (half(lo) + inv(Math.acos(rb / r)) - inv(Math.PI / 9));
    assert.ok(Math.abs(thicknessAtPitch - (Math.PI * 3 / 2 - backlash)) < 1e-6, `${backlash}: ${thicknessAtPitch}`);
  }
});

test("every arc of a flank lies on the true involute to a thousandth of the module (so does a ring's)", () => {
  for (const spec of [{ teeth: 12, module: 1 }, { teeth: 20, module: 2 }, { teeth: 60, module: 1.5 }, { teeth: 40, module: 2, internal: true }]) {
    const g = must(gearOutline(spec));
    const [rb, rp] = [g.baseRadius, g.pitchRadius];
    const alpha = Math.PI / 9;
    const inv = (a: number) => Math.tan(a) - a;
    const half0 = (Math.PI / 2) * spec.module / (2 * rp);
    const half = (r: number) => (spec.internal ? half0 + inv(Math.acos(rb / r)) - inv(alpha) : half0 + inv(alpha) - inv(Math.acos(rb / r)));
    let worst = 0, checked = 0;
    const n = g.points.length;
    for (let i = 0; i < n; i++) {
      const [a, b, bulge] = [g.points[i]!, g.points[(i + 1) % n]!, g.bulges[i]!];
      const [ra, rb2] = [Math.hypot(...a), Math.hypot(...b)];
      if (Math.abs(ra - rb2) < 1e-9 && Math.abs(Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0])) > 1e-9) continue; // a tip or a root: an arc about the centre
      if (Math.abs(bulge) < 1e-12) continue; // a straight radial side
      const { c, r } = arcOf(a, b, bulge);
      // points a quarter and three quarters along the true flank between the ends
      for (const f of [0.25, 0.75]) {
        const [t0, t1] = [Math.sqrt(Math.max(0, (ra / rb) ** 2 - 1)), Math.sqrt(Math.max(0, (rb2 / rb) ** 2 - 1))];
        const t = t0 + (t1 - t0) * f;
        const rr = rb * Math.sqrt(1 + t * t);
        const side = Math.sign(Math.atan2(a[1], a[0]) - Math.round(Math.atan2(a[1], a[0]) / (2 * Math.PI / spec.teeth)) * (2 * Math.PI / spec.teeth)) || 1;
        const k = Math.round(Math.atan2(a[1], a[0]) / (2 * Math.PI / spec.teeth));
        const phi = k * 2 * Math.PI / spec.teeth;
        const p: [number, number] = [rr * Math.cos(phi + side * half(rr)), rr * Math.sin(phi + side * half(rr))];
        worst = Math.max(worst, Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r));
        checked++;
      }
    }
    assert.ok(checked >= spec.teeth * 2 * 4 * 2 * 0.9, `${spec.teeth}: checked ${checked}`);
    assert.ok(worst < 0.001 * spec.module, `${spec.teeth} teeth: ${worst}`);
  }
});

test("the outline is one closed counter-clockwise loop, and it is the same after turning by one pitch", () => {
  const g = must(gearOutline({ teeth: 16, module: 2 }));
  let area = 0;
  g.points.forEach((p, i) => { const q = g.points[(i + 1) % g.points.length]!; area += p[0] * q[1] - q[0] * p[1]; });
  assert.ok(area > 0, "counter-clockwise");
  const per = g.points.length / 16;
  assert.equal(per, Math.round(per));
  const [p0, p1] = [g.points[0]!, g.points[per]!];
  const turn = (2 * Math.PI) / 16;
  assert.ok(Math.abs(p1[0] - (p0[0] * Math.cos(turn) - p0[1] * Math.sin(turn))) < 1e-9 && Math.abs(p1[1] - (p0[0] * Math.sin(turn) + p0[1] * Math.cos(turn))) < 1e-9);
});

test("few teeth are said (undercut), pointed tips are cut short and said, impossible gears are refused with the reason", () => {
  assert.ok(must(gearOutline({ teeth: 10, module: 2 })).warnings.some((w) => /few teeth/.test(w)));
  assert.ok(!must(gearOutline({ teeth: 10, module: 2, shift: 0.5 })).warnings.some((w) => /few teeth/.test(w)), "profile shift avoids the undercut");
  const hot = gearOutline({ teeth: 30, module: 2, shift: 2.5 });
  assert.ok(hot.ok ? hot.value.warnings.some((w) => /pointed/.test(w)) : /pointed|meet/.test(hot.error), "a great shift points the tips or is refused");
  for (const bad of [{ teeth: 2, module: 1 }, { teeth: 20, module: 0 }, { teeth: 20, module: 1, pressure: 0 }, { teeth: 600, module: 1 }]) assert.ok(!gearOutline(bad).ok);
});

test("a ring: the teeth point in, its tip circle is inside the pitch circle and its root outside, with a wall round it", () => {
  const g = must(gearOutline({ teeth: 40, module: 2, internal: true }));
  assert.ok(Math.abs(g.pitchRadius - 40) < 1e-9 && Math.abs(g.tipRadius - 38) < 1e-9 && Math.abs(g.rootRadius - 42.5) < 1e-9);
  assert.ok(g.outerRadius! > g.rootRadius);
  const rs = g.points.map((p) => Math.hypot(p[0], p[1]));
  assert.ok(Math.min(...rs) >= g.tipRadius - 1e-9 && Math.max(...rs) <= g.rootRadius + 1e-9);
});

test("bulgeOf: a half circle's middle is half its chord out, to the left of the way it goes; the module from an outside diameter", () => {
  assert.ok(Math.abs(bulgeOf([0, 0], [1, -1], [2, 0]) - -0.5) < 1e-12 && Math.abs(bulgeOf([0, 0], [1, 1], [2, 0]) - 0.5) < 1e-12);
  assert.ok(Math.abs(moduleForOutside(20, 44) - 2) < 1e-12);
});

/** the area of an outline: the corners' shoelace area, and each arc's segment added where it bulges out (to the right) and taken off where it bulges in */
function areaOf(g: GearOutline): number {
  let a = 0;
  g.points.forEach((p, i) => {
    const q = g.points[(i + 1) % g.points.length]!;
    a += (p[0] * q[1] - q[0] * p[1]) / 2;
    const b = g.bulges[i]!;
    if (!b) return;
    const [len, th] = [Math.hypot(q[0] - p[0], q[1] - p[1]), 4 * Math.atan(2 * Math.abs(b))]; // (the bulge is the middle's distance out over the chord: half the usual bulge, tan of a quarter of the turn)
    const r = (len * (1 + 4 * b * b)) / (8 * Math.abs(b));
    a += -Math.sign(b) * 0.5 * r * r * (th - Math.sin(th));
  });
  return a;
}
const bodyVolume = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts).filter((p) => p.kind === "body").reduce((t, p) => t + ((p as { volume?: number }).volume ?? 0), 0);
/** a gear made by the command, on the XY plane about the origin: the session and the refs of its outline (and of its wall, for a ring) */
function makeGear(s: ReturnType<typeof createSession>, spec: GearSpec, id = "g_001", at: [number, number, number] = [0, 0, 0]) {
  const next = run(s, { type: "gear", id, plane: worldRef("XY"), at, spec });
  assert.ok(!next.message, next.message ?? "");
  return { s: next, ...gearRefs({ id, plane: worldRef("XY"), at, spec }) };
}
const extrude = (s: ReturnType<typeof createSession>, face: string, depth: number) => {
  const op = startOp(scene(s), [face as never], "extrude");
  assert.ok(op.ok);
  return runOp(s, { ...(op as { op: Op }).op, value: depth })!.session;
};

test("a gear drawn on the XY plane is a figure that extrudes to a solid with the outline's area times the thickness (a bore is a hole)", () => {
  const g = must(gearOutline({ teeth: 20, module: 2 }));
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 });
  const s = d.s;
  const solid = extrude(s, loopFaceRef(d.lines), 5);
  assert.ok(Math.abs(bodyVolume(solid) - areaOf(g) * 5) < 0.001 * areaOf(g) * 5, `${bodyVolume(solid)} against ${areaOf(g) * 5}`);
  // with a bore drawn in its middle
  const bore = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], 4);
  const holed = extrude(run(s, bore.command), loopFaceRef(d.lines), 5);
  assert.ok(Math.abs(bodyVolume(holed) - (areaOf(g) - Math.PI * 16) * 5) < 0.001 * areaOf(g) * 5, `${bodyVolume(holed)}`);
});

test("a ring drawn on the XY plane extrudes to the wall's area, less the hole, times the thickness", () => {
  const g = must(gearOutline({ teeth: 40, module: 2, internal: true }));
  const d = makeGear(createSession(kernel), { teeth: 40, module: 2, internal: true });
  const s = d.s;
  const solid = extrude(s, diskFaceRef(d.wall!), 6);
  const want = (Math.PI * g.outerRadius! ** 2 - Math.abs(areaOf(g))) * 6;
  assert.ok(Math.abs(bodyVolume(solid) - want) < 0.001 * want, `${bodyVolume(solid)} against ${want}`);
});

test("a gear with 60 teeth is drawn and extruded in well under two seconds", () => {
  const g = must(gearOutline({ teeth: 60, module: 1.5 }));
  // (the fastest of three: a busy machine slows a single run, which says nothing of the code)
  const times: number[] = [];
  for (let k = 0; k < 3; k++) {
    const t0 = Date.now();
    const d = makeGear(createSession(kernel), { teeth: 60, module: 1.5 });
    extrude(d.s, loopFaceRef(d.lines), 4);
    times.push(Date.now() - t0);
    if (times[k]! < 2000) break;
  }
  assert.ok(Math.min(...times) < 2000, `${times.join(", ")} ms`);
});

// ---- the Gear tool ----
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import { entryOf, previewFor } from "../src/interaction/entry.ts";
import type { Vec3 } from "../src/math/vec.ts";
import { undoLast, selection } from "../src/interaction/session.ts";

const env = { w: 800, h: 600, now: 0 };
const top = (): AppState => ({ ...createState(createSession(kernel)), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 10, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const move = (st: AppState, p: Vec3) => reduce(st, { type: "hover", x: px(st, p)[0], y: px(st, p)[1] }, env);
const key = (st: AppState, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const typeText = (st: AppState, text: string) => [...text].reduce((t, c) => key(t, c), st);
const drawn = (st: AppState) => Object.values(scene(st.session).parts).filter((p) => p.origin === "drawn" && p.kind === "corner").map((p) => (p as { at: Vec3 }).at);
const C: Vec3 = [10, 10, 0]; // (a click on the very origin picks the origin, not the plane)
const reach = (st: AppState) => Math.max(...drawn(st).map((p) => Math.hypot(p[0] - C[0], p[1] - C[1])));

test("the Gear tool is in the Sketch ring; click the centre, the pointer sets the size (20 teeth, the module that makes the outside that wide), a click makes it, one undo takes it all away", () => {
  let st = top();
  const items = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(items.includes("tool:gear"));
  st = reduce(st, { type: "begin", name: "gear" }, env);
  assert.equal(st.tool!.kind, "gear");
  st = click(st, C);
  st = move(st, [C[0] + 22, C[1], 0]);
  assert.ok(previewFor(scene(st.session), st.tool)!.segments.length > 100, "the teeth are shown while the size is set");
  const e = entryOf(scene(st.session), st.tool, st.op);
  assert.deepEqual(e!.fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Shift", "Backlash", "Clearance", "Fillet", "Helix", "Width", "Bore", "Flat", "Key", "Key depth"]);
  assert.deepEqual(e!.fields.map((f) => f.value), ["20", "2", "20", "0", "0", "0.25", "0", "0", "0", "5", "0", "0", "0"]);
  st = click(st, [C[0] + 22, C[1], 0]);
  assert.equal(drawn(st).length, 0, "the click that sets the size makes nothing yet (`in_688`): the number box stays open");
  assert.ok(st.tool!.sized, "the tool is on, the size set");
  st = move(st, [C[0] + 60, C[1], 0]);
  assert.ok(entryOf(scene(st.session), st.tool, st.op), "the box is still there");
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.value)[1], "2", "moving the pointer no longer changes the size");
  st = click(st, [C[0] + 60, C[1] + 40, 0]); // (a click in space makes the gear at the size set, and starts the next one there)
  assert.ok(Math.abs(reach(st) - 22) < 1e-6, `outside radius ${reach(st)}`);
  assert.ok(selection(st.session).length === 1, "the figure is selected");
  assert.equal(st.tool!.points.length, 1, "the next gear starts where it was clicked");
  assert.ok(!st.tool!.sized);
  assert.equal(drawn(st).length, 20 * 12 + 1, "(and the bore, `in_691`) twelve corners to a tooth: two sides of five points and the two feet below the base circle");
  assert.equal(scene(st.session).gears!.length, 1, "it keeps its numbers");
  st = { ...st, session: undoLast(st.session) };
  assert.equal(drawn(st).length, 0);
});

test("typing teeth and module: 24 teeth, module 3, Enter: the outside is m (z + 2) wide; a module typed wins over the pointer; Tab goes between the two", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = move(st, [C[0] + 10, C[1], 0]);
  st = typeText(st, "24");
  st = key(st, "Tab");
  st = typeText(st, "3");
  st = key(st, "Enter");
  assert.ok(Math.abs(reach(st) - 39) < 1e-6, `outside radius ${reach(st)}`);
});

test("numbers that make no gear make none (3 teeth of a huge shift are not asked for, but 2 teeth are refused) and the tool stays on", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = move(st, [C[0] + 10, C[1], 0]);
  st = typeText(st, "2");
  st = key(st, "Enter");
  assert.equal(drawn(st).length, 0, "no gear of 2 teeth");
});

// ---- a gear keeps its numbers (`in_577`) ----
import { toJSON } from "../src/operation/scene.ts";
import { openSession, saveText } from "../src/interaction/session.ts";

const pick = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });
const stepOf = (st: ReturnType<typeof createSession>) => scene(st).steps.find((x) => x.type === "extrude")!;

test("changing a gear's teeth changes the body made from it: the step is given the new sides and the volume is the new outline's", () => {
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 });
  let s = extrude(d.s, loopFaceRef(d.lines), 5);
  assert.equal(stepOf(s).parts.length, 240);
  const before = bodyVolume(s);
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 30, module: 2 } });
  assert.ok(!s.message, s.message ?? "");
  const g = must(gearOutline({ teeth: 30, module: 2 }));
  assert.equal(stepOf(s).parts.length, g.points.length);
  assert.ok(bodyVolume(s) > before * 1.4, `${before} -> ${bodyVolume(s)}`);
  assert.ok(Math.abs(bodyVolume(s) - areaOf(g) * 5) < 0.001 * areaOf(g) * 5, `${bodyVolume(s)} against ${areaOf(g) * 5}`);
  // the same count with other numbers keeps the sides as they are
  const names = stepOf(s).parts.join();
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 30, module: 2, backlash: 0.2 } });
  assert.equal(stepOf(s).parts.join(), names);
  assert.ok(bodyVolume(s) < areaOf(g) * 5);
  // one undo each
  assert.equal(scene(undoLast(s)).gears![0]!.spec.backlash, undefined);
});

test("a gear with a bore keeps the bore when its teeth change; a ring's wall follows its numbers", () => {
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 });
  const bore = drawCircle(scene(d.s), worldRef("XY"), [0, 0, 0], 4);
  let s = extrude(run(d.s, bore.command), loopFaceRef(d.lines), 5);
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 24, module: 2 } });
  const g = must(gearOutline({ teeth: 24, module: 2 }));
  assert.ok(Math.abs(bodyVolume(s) - (areaOf(g) - Math.PI * 16) * 5) < 0.002 * areaOf(g) * 5, `${bodyVolume(s)}`);
  const r = makeGear(createSession(kernel), { teeth: 40, module: 2, internal: true });
  let t = extrude(r.s, diskFaceRef(r.wall!), 6);
  t = run(t, { type: "setGear", id: "g_001", spec: { teeth: 48, module: 2, internal: true } });
  assert.ok(!t.message, t.message ?? "");
  const g2 = must(gearOutline({ teeth: 48, module: 2, internal: true }));
  const want = (Math.PI * g2.outerRadius! ** 2 - Math.abs(areaOf(g2))) * 6;
  assert.ok(Math.abs(bodyVolume(t) - want) < 0.002 * want, `${bodyVolume(t)} against ${want}`);
});

test("numbers that make no gear are refused with the reason and the gear stays as it was; a constraint on a corner that would go refuses the change", () => {
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 });
  const bad = run(d.s, { type: "setGear", id: "g_001", spec: { teeth: 2, module: 2 } });
  assert.match(bad.message ?? "", /3 to 500 teeth/);
  assert.equal(scene(bad).gears![0]!.spec.teeth, 20);
  const corners = Object.values(scene(d.s).parts).filter((p) => p.kind === "corner" && p.ref.startsWith("d/g_001.p")).map((p) => p.ref);
  const fixed = run(d.s, { type: "addRelation", relation: { id: "r_900", kind: "fixed", parts: [corners[corners.length - 1]!] } });
  assert.ok(!fixed.message, fixed.message ?? "");
  const lost = run(fixed, { type: "setGear", id: "g_001", spec: { teeth: 10, module: 2 } });
  assert.match(lost.message ?? "", /constraint/);
});

test("a gear is saved as its numbers (the file holds the command, not the parts) and comes back whole; deleting it takes the record and the parts", () => {
  const d = makeGear(createSession(kernel), { teeth: 24, module: 2.5, pressure: 20, backlash: 0.1 }, "g_001", [10, 5, 0]);
  const text = saveText(d.s);
  assert.ok(text.length < 2000, `${text.length} bytes for 24 teeth`);
  const back = openSession(kernel, text);
  assert.ok(back.ok, back.ok ? "" : back.error);
  if (!back.ok) return;
  assert.equal(Object.keys(scene(back.value).parts).filter((r) => r.startsWith("d/g_001.p")).length, d.lines.length);
  assert.equal(JSON.stringify(scene(back.value).gears), JSON.stringify(scene(d.s).gears));
  // as the starting scene of a file, the record is kept and the parts are not
  const json = toJSON(scene(d.s));
  assert.equal(json.gears![0]!.spec.backlash, 0.1);
  assert.ok(!json.parts.some((p) => p.ref.startsWith("d/g_001.")), "no parts of the gear in it");
  const gone = run(d.s, { type: "deleteGear", id: "g_001" });
  assert.equal(Object.keys(scene(gone).parts).filter((r) => r.startsWith("d/g_001.")).length, 0);
  assert.equal(scene(gone).gears, undefined);
});

test("Edit gear: the number box opens on the selected gear with its numbers; typing teeth and Enter changes it and puts the tool away; Esc leaves it alone", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = typeText(st, "20");
  st = key(st, "Tab");
  st = typeText(st, "2");
  st = key(st, "Enter");
  const made = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.ref.includes("g_"))!;
  st = reduce(st, { type: "escape" }, env); // (the tool is on to make the next gear: put it away)
  st = pick({ ...st, tool: null }, [made.ref]);
  const items = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; enabled: boolean; children?: { id: string; enabled: boolean }[] }[]).flatMap(function walk(i: any): { id: string; enabled: boolean }[] { return [i, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(items.find((i) => i.id === "gear:edit")!.enabled);
  st = reduce(st, { type: "runAction", id: "gear:edit" }, env);
  assert.equal(st.tool!.gear!.editing, "g_001");
  const e = entryOf(scene(st.session), st.tool, st.op)!;
  assert.deepEqual(e.fields.map((f) => f.value), ["20", "2", "20", "0", "0", "0.25", "0", "0", "0", "5", "0", "0", "0"], "its numbers as they are");
  st = typeText(st, "30");
  st = key(st, "Tab"); st = key(st, "Tab"); st = key(st, "Tab"); st = key(st, "Tab");
  st = typeText(st, "0.1");
  st = key(st, "Enter");
  assert.equal(st.tool, null, "the tool is put away");
  assert.deepEqual([scene(st.session).gears![0]!.spec.teeth, scene(st.session).gears![0]!.spec.backlash], [30, 0.1]);
  assert.equal(selection(st.session).length, 1, "and the gear is still selected");
  // Esc leaves it alone
  let again = reduce(pick(st, [...selection(st.session)] as string[]), { type: "runAction", id: "gear:edit" }, env);
  again = typeText(again, "12");
  again = reduce(again, { type: "escape" }, env);
  assert.equal(scene(again.session).gears![0]!.spec.teeth, 30);
  // with nothing selected it says so
  const none = reduce(pick(st, []), { type: "runAction", id: "gear:edit" }, env);
  assert.match(none.session.message ?? "", /select a gear/);
});

test("Ring gear tool: the pointer sets the outside of the wall; typed Wall changes it; the ring is made with its wall and one undo takes it all", () => {
  let st = top();
  const ids = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: { id: string }[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(ids.includes("tool:ring") && ids.includes("gear:edit"));
  st = reduce(st, { type: "runAction", id: "tool:ring" }, env);
  assert.equal(st.tool!.gear!.internal, true);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  st = move(st, [C[0] + 45, C[1], 0]);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Wall", "Backlash", "Clearance"]);
  st = click(st, [C[0] + 45, C[1], 0]); // (sets the size)
  st = click(st, [C[0] + 45, C[1], 0]); // (makes it, `in_688`)
  const rec = scene(st.session).gears![0]!;
  assert.equal(rec.spec.internal, true);
  const g = must(gearOutline(rec.spec));
  assert.ok(Math.abs(g.outerRadius! - 45) < 0.5 * rec.spec.module * 1.2, `wall ${g.outerRadius}`);
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "circle" && p.ref.startsWith("d/g_001.")));
  assert.equal(drawn(undoed(st)).length, 0);
});
function undoed(st: AppState): AppState { return { ...st, session: undoLast(st.session) }; }

test("Delete on a selected gear takes the gear whole (record and parts), and one undo brings it back", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = typeText(st, "16");
  st = key(st, "Tab");
  st = typeText(st, "2");
  st = key(st, "Enter");
  const made = Object.values(scene(st.session).parts).find((p) => p.kind === "face" && p.ref.includes("g_"))!;
  st = pick({ ...reduce(st, { type: "escape" }, env), tool: null }, [made.ref]);
  const gone = reduce(st, { type: "runAction", id: "delete" }, env);
  assert.equal(scene(gone.session).gears, undefined);
  assert.equal(drawn(gone).length, 0);
  assert.equal(scene({ ...gone.session, history: undoLast(gone.session).history }).gears!.length, 1);
});

// ---- the bore and moving a gear (`in_578`) ----
import { opCommand } from "../src/interaction/operations.ts";

test("a bore is a number of the gear: the body made from it has the hole; a bore put in or taken out after the extrude follows; one too wide is refused", () => {
  const g0 = must(gearOutline({ teeth: 20, module: 2 }));
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2, bore: 8 });
  let s = extrude(d.s, loopFaceRef(d.lines), 5);
  const v = (bore: number) => (areaOf(g0) - Math.PI * (bore / 2) ** 2) * 5;
  assert.ok(Math.abs(bodyVolume(s) - v(8)) < 0.001 * v(0), `${bodyVolume(s)} against ${v(8)}`);
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2, bore: 12 } });
  assert.ok(!s.message, s.message ?? "");
  assert.ok(Math.abs(bodyVolume(s) - v(12)) < 0.001 * v(0), `${bodyVolume(s)} against ${v(12)}`);
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2 } });
  assert.ok(Math.abs(bodyVolume(s) - v(0)) < 0.001 * v(0), "no bore: solid again");
  s = run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2, bore: 5 } });
  assert.ok(Math.abs(bodyVolume(s) - v(5)) < 0.001 * v(0), "a bore put in after the extrude is a hole of it");
  assert.match(run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2, bore: 40 } }).message ?? "", /smaller than the gear's root/);
});

test("the Gear box has a Bore field; typing it in Edit gear applies it (a ring has no bore)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), st.tool, st.op)!.fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Shift", "Backlash", "Clearance", "Fillet", "Helix", "Width", "Bore", "Flat", "Key", "Key depth"]);
  st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2");
  for (let i = 0; i < 8; i++) st = key(st, "Tab");
  st = typeText(st, "6");
  st = key(st, "Enter");
  assert.equal(scene(st.session).gears![0]!.spec.bore, 6);
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "circle" && p.ref === "d/g_001.b"));
  const ring = reduce(top(), { type: "runAction", id: "tool:ring" }, env);
  assert.equal(entryOf(scene(ring.session), { ...ring.tool!, plane: worldRef("XY"), points: [C] }, null)!.fields.length, 6, "a ring has no Bore: Teeth, Module, Pressure, Wall, Backlash, Clearance");
});

test("Move on a gear moves it: its centre goes where the move takes it, as one command, and the body made from it follows; undo puts it back", () => {
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2, bore: 6 });
  let s = extrude(d.s, loopFaceRef(d.lines), 5);
  const face = loopFaceRef(d.lines);
  const op = startOp(scene(s), [face as never], "move");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const o = (op as { op: Op }).op;
  const cmd = opCommand(scene(s), { ...o, axis: 0, value: 30 })!;
  assert.ok(cmd, "a command is made");
  const moved = run(s, cmd);
  assert.ok(!moved.message, moved.message ?? "");
  assert.deepEqual(scene(moved).gears![0]!.at.map((x) => Math.round(x * 1e6) / 1e6), [30, 0, 0]);
  const bb = moved.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.min[0] - 8) < 1e-3 && Math.abs(bb.max[0] - 52) < 1e-3, `${bb.min[0]} .. ${bb.max[0]}`);
  assert.deepEqual(scene(undoLast(moved)).gears![0]!.at, [0, 0, 0]);
  // a move across the plane is not made
  assert.equal(opCommand(scene(s), { ...o, axis: 2, value: 10 }), null);
});

test("Rotate on a gear about its plane's axis turns it (tooth 0 points another way); the outline repeats itself so the body is the same, a part of the outline is where the turn puts it", () => {
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 }, "g_001", [10, 0, 0]);
  const s = d.s;
  const op = startOp(scene(s), [loopFaceRef(d.lines) as never], "rotate");
  assert.ok(op.ok, op.ok ? "" : op.why);
  const o = (op as { op: Op }).op;
  const cmd = opCommand(scene(s), { ...o, axis: 2, value: 9 })!; // (degrees: half a pitch of 20 teeth)
  assert.ok(cmd);
  const turned = run(s, cmd);
  assert.ok(!turned.message, turned.message ?? "");
  const rec = scene(turned).gears![0]!;
  assert.ok(Math.abs((rec.turn ?? 0) - Math.PI / 20) < 1e-9, `turn ${rec.turn}`);
  // about the pivot (the middle of the corners, which is the centre): the centre stays
  assert.ok(Math.hypot(rec.at[0] - 10, rec.at[1]) < 1e-6, `${rec.at}`);
  // the first corner is turned half a pitch about the centre
  const p0 = scene(turned).parts["d/g_001.p0" as never] as unknown as { at: number[] };
  const q0 = scene(s).parts["d/g_001.p0" as never] as unknown as { at: number[] };
  const a0 = Math.atan2(q0.at[1]! , q0.at[0]! - 10), a1 = Math.atan2(p0.at[1]!, p0.at[0]! - 10);
  assert.ok(Math.abs(a1 - a0 - Math.PI / 20) < 1e-9, `${a1 - a0}`);
});

// ---- the rack and the meshing helper (`in_579`) ----
const gearsOfState = (st: AppState) => scene(st.session).gears ?? [];
const faceOf = (st: AppState, id: string) => { const r = gearRefs(gearsOfState(st).find((g) => g.id === id)!); return scene(st.session).parts[(r.wall ? diskFaceRef(r.wall) : loopFaceRef(r.lines)) as never]!; };

test("Rack tool: click the middle of the pitch line, the pointer sets half its length; Teeth, Module, Pressure, Backlash and Base are typed; it extrudes to its area times the thickness", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:rack" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C);
  assert.deepEqual(entryOf(scene(st.session), { ...st.tool!, cursor: [C[0] + 30, C[1], 0] }, st.op)!.fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Backlash", "Base", "Clearance"]);
  st = typeText(st, "8"); st = key(st, "Tab"); st = typeText(st, "3");
  st = key(st, "Enter");
  const rec = gearsOfState(st)[0]!;
  assert.deepEqual([rec.spec.rack, rec.spec.teeth, rec.spec.module], [true, 8, 3]);
  assert.ok(Object.values(scene(st.session).parts).every((p) => p.kind !== "line" || !(p as { bulge?: number }).bulge), "all straight sides");
  const o = must(gearOutline(rec.spec));
  const solid = extrude(st.session, loopFaceRef(gearRefs(rec).lines), 4);
  assert.ok(Math.abs(bodyVolume(solid) - areaOf(o) * 4) < 0.001 * areaOf(o) * 4, `${bodyVolume(solid)} against ${areaOf(o) * 4}`);
  const bb = solid.outcome.kernel!.bbox!;
  assert.ok(Math.abs(bb.max[0] - bb.min[0] - 8 * Math.PI * 3) < 1e-3, "n pi m long");
});

test("Mesh gear: with a gear selected, the pointer says which way the partner stands, Teeth and Ratio (and Angle) can be typed; it is made at the centre distance, turned to fit, selected, and one undo takes it away", () => {
  let st = top();
  const made = (st0: AppState) => { let s = reduce(st0, { type: "begin", name: "gear" }, env); s = click(s, C); s = typeText(s, "20"); s = key(s, "Tab"); s = typeText(s, "2"); s = key(s, "Enter"); return reduce(s, { type: "escape" }, env); };
  st = made(st);
  const face = faceOf(st, "g_001");
  st = pick({ ...st, tool: null }, [face.ref]);
  const items = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; enabled: boolean; children?: { id: string; enabled: boolean }[] }[]).flatMap(function walk(i: any): { id: string; enabled: boolean }[] { return [i, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(items.find((i) => i.id === "gear:mesh")!.enabled && items.find((i) => i.id === "gear:meshrack")!.enabled);
  let m = reduce(st, { type: "runAction", id: "gear:mesh" }, env);
  assert.equal(m.tool!.gear!.mesh!.rack, false);
  m = move(m, [C[0], C[1] + 50, 0]); // (straight up from the gear)
  assert.deepEqual(entryOf(scene(m.session), m.tool, m.op)!.fields.map((f) => f.label), ["Teeth", "Ratio", "Angle", "Bore", "Flat", "Key", "Key depth"]);
  const shown = entryOf(scene(m.session), m.tool, m.op)!.fields.map((f) => f.value);
  assert.deepEqual(shown.slice(0, 2), ["20", "1"], "the same teeth, a ratio of 1");
  assert.ok(Math.abs(Number(shown[2]) - 90) < 2, `up is about 90 degrees: ${shown[2]}`);
  m = key(m, "Tab"); m = typeText(m, "1.5"); // (a ratio of 1.5: 30 teeth)
  m = key(m, "Enter");
  const [a, b] = gearsOfState(m);
  assert.equal(b!.spec.teeth, 30);
  assert.ok(Math.abs(Math.hypot(b!.at[0] - a!.at[0], b!.at[1] - a!.at[1]) - 2 * (20 + 30) / 2) < 1e-6, "m (z1 + z2) / 2 apart");
  assert.ok(Math.abs(b!.at[0] - a!.at[0]) < 2 && b!.at[1] > a!.at[1], "up");
  assert.equal(m.tool, null, "the tool is put away");
  assert.equal(selection(m.session).length, 1);
  assert.equal(gearsOfState({ ...m, session: undoLast(m.session) }).length, 1);
  // a typed angle: 180 degrees puts it to the left
  let l = reduce(st, { type: "runAction", id: "gear:mesh" }, env);
  l = move(l, [C[0] + 40, C[1], 0]);
  l = key(l, "Tab"); l = key(l, "Tab"); l = typeText(l, "180");
  l = key(l, "Enter");
  assert.ok(gearsOfState(l)[1]!.at[0] < gearsOfState(l)[0]!.at[0], "to the left");
});

test("Mesh rack and a gear on a rack: the rack goes where the pointer is, tangent to the pitch circle; a gear goes on a selected rack where the pointer is along it", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C); st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2"); st = key(st, "Enter");
  st = pick({ ...reduce(st, { type: "escape" }, env), tool: null }, [faceOf(st, "g_001").ref]);
  let m = reduce(st, { type: "runAction", id: "gear:meshrack" }, env);
  assert.equal(m.tool!.gear!.mesh!.rack, true);
  m = move(m, [C[0], C[1] - 40, 0]); // (below)
  assert.deepEqual(entryOf(scene(m.session), m.tool, m.op)!.fields.map((f) => f.label), ["Teeth", "Angle"]);
  m = typeText(m, "9"); m = key(m, "Enter");
  const [g, r] = gearsOfState(m);
  assert.equal(r!.spec.rack, true);
  assert.ok(Math.abs(Math.abs(r!.at[1] - g!.at[1]) - 20) < 0.01 * 20 + 3, `the pitch line is a pitch radius (20) below: ${r!.at[1] - g!.at[1]}`);
  // a gear on the rack, at a place along it
  const rackFace = faceOf(m, "g_002");
  let on = pick({ ...m, tool: null }, [rackFace.ref]);
  on = reduce(on, { type: "runAction", id: "gear:mesh" }, env);
  assert.deepEqual(entryOf(scene(on.session), on.tool, on.op)!.fields.map((f) => f.label), ["Teeth", "Offset", "Bore", "Flat", "Key", "Key depth"]);
  on = typeText(on, "12"); on = key(on, "Tab"); on = typeText(on, "5");
  on = key(on, "Enter");
  const third = gearsOfState(on)[2]!;
  assert.equal(third.spec.teeth, 12);
  assert.ok(Math.abs(Math.hypot(third.at[0] - r!.at[0], third.at[1] - r!.at[1]) - Math.hypot(5, 12)) < 1e-6, "5 along, a pitch radius (12) off the pitch line");
});

test("a gear that is profile shifted gets no partner (the tool stays for numbers that work)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C); st = typeText(st, "20"); st = key(st, "Tab"); st = typeText(st, "2"); st = key(st, "Tab"); st = key(st, "Tab"); st = typeText(st, "0.3");
  st = key(st, "Enter");
  assert.equal(gearsOfState(st)[0]!.spec.shift, 0.3);
  let m = reduce(pick({ ...reduce(st, { type: "escape" }, env), tool: null }, [faceOf(st, "g_001").ref]), { type: "runAction", id: "gear:mesh" }, env);
  m = move(m, [C[0], C[1] + 50, 0]);
  m = key(m, "Enter");
  assert.equal(gearsOfState(m).length, 1, "no partner is made for a shifted gear: the tool stays for a number that works");
  assert.match(m.session.message ?? "", /profile shift/, "and it says why (`in_580`)");
  assert.ok(m.tool, "the tool is still on");
});

test("Edit gear on a rack has the rack's own fields and changing the teeth changes its length; Move puts it somewhere else", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = reduce(st, { type: "runAction", id: "tool:rack" }, env);
  st = { ...st, tool: { ...st.tool!, plane: worldRef("XY") } };
  st = click(st, C); st = typeText(st, "6"); st = key(st, "Tab"); st = typeText(st, "2"); st = key(st, "Enter");
  const sel = pick({ ...reduce(st, { type: "escape" }, env), tool: null }, [faceOf(st, "g_001").ref]);
  let e = reduce(sel, { type: "runAction", id: "gear:edit" }, env);
  assert.deepEqual(entryOf(scene(e.session), e.tool, e.op)!.fields.map((f) => f.label), ["Teeth", "Module", "Pressure", "Backlash", "Base", "Clearance"]);
  e = typeText(e, "9"); e = key(e, "Enter");
  assert.equal(gearsOfState(e)[0]!.spec.teeth, 9);
  assert.equal(gearsOfState(e)[0]!.spec.rack, true);
  const o = startOp(scene(e.session), [faceOf(e, "g_001").ref as never], "move");
  assert.ok(o.ok);
  const cmd = opCommand(scene(e.session), { ...(o as { op: Op }).op, axis: 1, value: 25 })!;
  const moved = run(e.session, cmd);
  assert.ok(Math.abs(scene(moved).gears![0]!.at[1] - (C[1] + 25)) < 1e-6);
});

test("a gear, a rack or a partner that is not made says why, and the tool stays on (`in_580`)", () => {
  const say = (st: AppState) => st.session.message ?? "";
  // too few teeth, by Enter and by a click
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C); st = typeText(st, "2"); st = move(st, [C[0] + 10, C[1], 0]);
  st = key(st, "Enter");
  assert.match(say(st), /3 to 500 teeth/);
  assert.equal(drawn(st).length, 0);
  assert.ok(st.tool, "the tool is still on");
  st = reduce(st, { type: "typed", key: "Backspace", shift: false }, env); st = typeText(st, "12"); // (12 teeth with a pressure angle that is no angle)
  st = key(st, "Tab"); st = key(st, "Tab"); st = typeText(st, "0");
  const clicked = click(click(st, [C[0] + 10, C[1], 0]), [C[0] + 10, C[1], 0]); // (the first sets the size, the second makes it, `in_688`)
  assert.match(say(clicked), /pressure angle/);
  // a rack too thin at its tips; backlash larger than the tooth
  let r = reduce(top(), { type: "begin", name: "gear" }, env);
  r = reduce(r, { type: "runAction", id: "tool:rack" }, env);
  r = { ...r, tool: { ...r.tool!, plane: worldRef("XY") } };
  r = click(r, C); r = typeText(r, "6"); r = key(r, "Tab"); r = typeText(r, "2"); r = key(r, "Tab"); r = key(r, "Tab"); r = typeText(r, "4");
  r = key(r, "Enter");
  assert.match(say(r), /pointed/);
  // a gear as big as its ring
  let ring = reduce(top(), { type: "begin", name: "gear" }, env);
  ring = reduce(ring, { type: "runAction", id: "tool:ring" }, env);
  ring = { ...ring, tool: { ...ring.tool!, plane: worldRef("XY") } };
  ring = click(ring, C); ring = typeText(ring, "30"); ring = key(ring, "Tab"); ring = typeText(ring, "2"); ring = key(ring, "Enter");
  let m = reduce(pick({ ...reduce(ring, { type: "escape" }, env), tool: null }, [faceOf(ring, "g_001").ref]), { type: "runAction", id: "gear:mesh" }, env);
  m = move(m, [C[0], C[1] + 30, 0]); m = typeText(m, "30"); m = key(m, "Enter");
  assert.match(say(m), /fewer teeth than the ring/);
  // a rack on a ring
  let rr = reduce(pick({ ...reduce(ring, { type: "escape" }, env), tool: null }, [faceOf(ring, "g_001").ref]), { type: "runAction", id: "gear:meshrack" }, env);
  rr = move(rr, [C[0], C[1] + 30, 0]); rr = key(rr, "Enter");
  assert.match(say(rr), /rack does not mesh with a ring/);
});

test("a gear's clearance field: the root clearance in modules (0.25 shown), typed it moves the root circle; an edit changes the body; a clearance outside 0 to 1 is refused with the reason (`in_587`)", () => {
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = typeText(st, "24"); st = key(st, "Tab"); st = typeText(st, "2");
  for (let i = 0; i < 4; i++) st = key(st, "Tab"); // (pressure, shift, backlash, clearance)
  st = typeText(st, "0.4");
  st = key(st, "Enter");
  const rec = scene(st.session).gears![0]!;
  assert.equal(rec.spec.clearance, 0.4);
  const g = must(gearOutline(rec.spec));
  assert.ok(Math.abs(g.rootRadius - (24 - 2 * 1.4)) < 1e-9, `root radius ${g.rootRadius}`);
  // a clearance of 2 modules is no clearance
  const bad = run(st.session, { type: "setGear", id: "g_001", spec: { ...rec.spec, clearance: 2 } });
  assert.match(bad.message ?? "", /clearance is from 0 to 1 module/);
  // the same on a body: changing it after the extrude changes the volume
  const d = makeGear(createSession(kernel), { teeth: 20, module: 2 });
  const s = extrude(d.s, loopFaceRef(d.lines), 5);
  const more = run(s, { type: "setGear", id: "g_001", spec: { teeth: 20, module: 2, clearance: 0.6 } });
  assert.ok(!more.message, more.message ?? "");
  assert.ok(bodyVolume(more) < bodyVolume(s), "a deeper root takes more away");
});

test("a flat and a keyway typed together: the one typed last wins and the other goes to nothing, not a failed sketch; the preview shows the bore's own shape (`in_689`)", async () => {
  const { gearTyped, finish } = await import("../src/interaction/tools.ts");
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = move(st, [C[0] + 22, C[1], 0]);
  const f = (t: typeof st.tool, field: number, text: string) => gearTyped(t!, field, text);
  const round = f(st.tool, 9, "10"); // bore 10
  const plain = previewFor(scene(st.session), round)!;
  assert.ok(plain.circle, "a round bore is the one circle");
  let t = f(round, 10, "1"); // and a flat of 1
  const withFlat = previewFor(scene(st.session), t)!;
  assert.equal(withFlat.circle, null, "a bore with a flat is drawn as its own outline");
  assert.ok(withFlat.segments.length > plain.segments.length + 10);
  t = f(t, 11, "3"); // a key 3 wide with the flat still typed: the key (typed last) wins
  const fin = finish(scene(st.session), t!)!;
  assert.ok(fin, "it makes a gear");
  const spec = (fin.command as { spec: { flat?: number; key?: number } }).spec;
  assert.equal(spec.flat, undefined, "the flat is dropped");
  assert.equal(spec.key, 3);
  const back = finish(scene(st.session), f(t, 10, "1"))!; // the flat typed again: the flat wins
  const spec2 = (back.command as { spec: { flat?: number; key?: number } }).spec;
  assert.equal(spec2.key, undefined);
  assert.equal(spec2.flat, 1);
});

test("a number that makes no gear is taken back to the nearest that does, and flashes red (`in_690`); the box says what the standard key is for the bore; no Detail field", async () => {
  const { gearTyped } = await import("../src/interaction/tools.ts");
  let st = top();
  st = reduce(st, { type: "begin", name: "gear" }, env);
  st = click(st, C);
  st = move(st, [C[0] + 22, C[1], 0]);
  assert.ok(!entryOf(scene(st.session), st.tool, st.op)!.fields.some((f) => f.label === "Detail"));
  // too few teeth: Enter takes it up to the least that works and makes nothing yet
  st = typeText(st, "2");
  st = key(st, "Enter");
  assert.equal(drawn(st).length, 0, "nothing made yet");
  assert.ok(Number(st.tool!.gear!.typed[0]) >= 3 && Number(st.tool!.gear!.typed[0]) <= 8, `2 teeth go up to the least that works (${st.tool!.gear!.typed[0]})`);
  assert.equal(st.tool!.gear!.bad?.field, 0, "and the field is marked");
  assert.match(st.session.message ?? "", /Teeth 2 is taken back to \d/);
  const e = entryOf(scene(st.session), st.tool, st.op)!;
  assert.equal(e.fields[0]!.bad, true);
  assert.equal(previewFor(scene(st.session), st.tool)!.red, true, "the drawing is red");
  // a fillet too large: taken back to the largest that works (field 6)
  let t = gearTyped(st.tool!, 0, "20");
  t = gearTyped(t, 6, "50");
  const sc = scene(st.session);
  const fix = (await import("../src/interaction/tools.ts")).gearFix(sc, t)!;
  assert.ok(fix, "a fillet of 50 modules is put right");
  assert.equal(fix.field, 6);
  const v = parseFloat(fix.tool.gear!.typed[6]!);
  assert.ok(v > 0 && v < 50, `fillet ${v}`);
  assert.equal((await import("../src/interaction/tools.ts")).gearProblem(sc, fix.tool), null, "what it is taken back to makes a gear");
  // the standard key for the bore
  const withBore = gearTyped(t, 9, "10");
  const keyHint = entryOf(sc, withBore, null)!.fields.find((f) => f.label === "Key")!.hint!;
  assert.match(keyHint, /10 mm bore the standard key is 3 wide and the keyway 1.4 deep/);
});
