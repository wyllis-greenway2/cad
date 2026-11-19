// The wheel model (`dec_hub_spoke`): numbers that make no wheel are said, each spoke style is built as ONE body of the right height and with a bore, and a selected round object is filled.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { WHEEL_START, wheelProblem, wheelGeometry, wheelLines, wheelSection } from "../src/operation/modelwheel.ts";
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
  assert.equal(wheelProblem(S({ spokes: 0 })), null);
  assert.match(wheelProblem(S({ rimD: 79 })) ?? "", /rim must be at least/);
  assert.match(wheelProblem(S({ bore: 19 })) ?? "", /hub must be/);
  assert.match(wheelProblem(S({ rimJoin: 0.5 })) ?? "", /not castable/);
  assert.match(wheelProblem(S({ corner: 0.5 })) ?? "", /not castable/);
  assert.match(wheelProblem(S({ web: 12, rimT: 14 })) ?? "", /stand proud/);
  assert.match(wheelProblem(S({ hub: 60 })) ?? "", /too big for the rim/);
  assert.match(wheelProblem(S({ spokes: 2 })) ?? "", /3 to 24/);
  assert.match(wheelProblem(S({ spokes: 24, spokeW: 14 })) ?? "", /too wide|too small/);
  assert.match(wheelProblem(S({ corner: 7 })) ?? "", /too short|too small/);
  assert.match(wheelProblem(S({ edge: 2.5 })) ?? "", /spoke join radius is too big for the spoke thickness/);
  assert.match(wheelProblem(S({ edge: 1.9, web: 5, spokeW: 4 })) ?? "", /too big for the spoke:/);
  assert.match(wheelProblem(S({ edge: 1, hubOff: 0.5 })) ?? "", /stop short/);
  assert.match(wheelProblem(S({ edge: 0.1 })) ?? "", /at least 0.3/);
  assert.match(wheelProblem(S({ taper: 0.95, edge: 0 })) ?? "", /taper/);
});
function placed(typed: Record<string, string>, fill?: boolean) {
  typed = { outer: "80", ...typed }; // (the first number typed, if it is a size, sets the scale of the rest: the outside diameter is kept as it is)
  let st = { ...createState(createSession(kernel)), cam: homeCamera() };
  st = reduce(st, { type: "runAction", id: "model:wheel" }, env);
  const keys = modelFields("wheel").map((f) => f.key);
  st = { ...st, tool: { ...st.tool!, ...(fill ? {} : { plane: XY, points: [[0, 0, 0]] as [number, number, number][], cursor: [0, 0, 0] as [number, number, number] }), model: { ...st.tool!.model!, typed: st.tool!.model!.typed.map((x, i) => (i >= 1 && typed[keys[i - 1]!] !== undefined ? typed[keys[i - 1]!]! : x)) } } };
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0;
  while (st.building && n++ < 10) st = reduce(st, { type: "buildNext" }, env);
  assert.equal(st.building, null, "built");
  return st;
}
const area = (l: [number, number][]): number => Math.abs(l.slice(0, -1).reduce((s, p, i) => s + p[0] * l[i + 1]![1] - l[i + 1]![0] * p[1], 0)) / 2;
const bodyOf = (st: ReturnType<typeof placed>): B[] => Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];
test("a plain web is one body of the rim's height with its hub and bore; cutouts take away what their outlines enclose, in the web's thickness", () => {
  const s = S({ draft: 0, edge: 0 }), plain = bodyOf(placed({ spokes: "0", draft: "0", edge: "0" }));
  assert.equal(plain.length, 1, "one body");
  assert.ok(Math.abs(plain[0]!.bbox.max[2]! - plain[0]!.bbox.min[2]! - Math.max(s.rimT, s.hubT)) < 1e-3, "as high as the longer of rim and hub");
  assert.ok(Math.abs(plain[0]!.bbox.max[0]! - plain[0]!.bbox.min[0]! - s.outer) < 0.2, "as wide as the outside diameter");
  // the section: rim, hub and web, their areas turned about the axis (the fillets add a little more)
  const g = wheelGeometry(s), box = Math.PI * ((g.R ** 2 - g.Rin ** 2) * s.rimT + (g.hubR ** 2 - (s.bore / 2) ** 2) * s.hubT + (g.Rin ** 2 - g.hubR ** 2) * s.web);
  assert.ok(plain[0]!.volume > box && plain[0]!.volume < box * 1.06, `volume ${plain[0]!.volume} is the plain section's ${box.toFixed(0)} and the fillets`);
  for (const o of [{} as Record<string, string>, { spiral: "15" }, { spokeW: "6", taper: "-0.2", hubOff: "0", rimOff: "0" }, { rimJoinKind: "1", hubJoinKind: "1", spokes: "6", corner: "2", spokeW: "6" }]) {
    const st = placed({ draft: "0", edge: "0", ...o }), made = bodyOf(st), sp = { ...s, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)])) } as WheelSpec;
    const plainSp = bodyOf(placed({ draft: "0", edge: "0", ...o, spokes: "0" }))[0]!.volume;
    assert.equal(made.length, 1, `${JSON.stringify(o)}: one body`);
    const cuts = wheelLines(sp).slice(4).reduce((a, l) => a + area(l), 0) * sp.web;
    const drop = plainSp - made[0]!.volume, exact = sp.hubOff > sp.hubJoin + 0.4 && sp.rimOff > sp.rimJoin + 0.4; // (a cutout that reaches into a fillet takes the fillet's metal too)
    assert.ok(exact ? Math.abs(drop - cuts) < 0.03 * cuts + 5 : drop > cuts * 0.97 && drop < cuts * 1.4, `${JSON.stringify(o)}: the cutouts take ${drop.toFixed(0)} mm3 and their outlines enclose ${cuts.toFixed(0)}`);
    assert.ok(made[0]!.volume < plainSp * 0.98, `${JSON.stringify(o)}: lighter than the plain web`);
  }
});
test("the cutout's corners are rounded: every side that is not straight is an arc about the corner fillet's size", () => {
  const lines = wheelLines(S({ corner: 3 })).slice(4);
  assert.equal(lines.length, 5);
  // the outline holds no sharp turn: the turn at each point is under 60 degrees once the arcs are sampled
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    const [a, b, c] = [l[(i + l.length - 2) % (l.length - 1)]!, l[i]!, l[i + 1]!], [u, v] = [[b[0] - a[0], b[1] - a[1]], [c[0] - b[0], c[1] - b[1]]];
    const turn = Math.acos(Math.max(-1, Math.min(1, (u[0]! * v[0]! + u[1]! * v[1]!) / ((Math.hypot(u[0]!, u[1]!) * Math.hypot(v[0]!, v[1]!)) || 1))));
    assert.ok(turn < 1.05, `a corner turns ${((turn * 180) / Math.PI).toFixed(0)} degrees at point ${i}`);
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
test("draft leans the rim's and the hub's walls away from the middle: the same wheel is as wide, lighter, and refused when it leaves the rim or the hub too thin", () => {
  const flat = bodyOf(placed({ spokes: "0", draft: "0" }))[0]!, cast = bodyOf(placed({ spokes: "0", draft: "3" }))[0]!;
  assert.ok(Math.abs(cast.bbox.max[0]! - cast.bbox.min[0]! - 80) < 0.2, "as wide at the middle plane as the outside diameter says");
  assert.ok(cast.volume < flat.volume * 0.995 && cast.volume > flat.volume * 0.9, `the cast wheel ${cast.volume.toFixed(0)} is a little lighter than the machined one ${flat.volume.toFixed(0)}`);
  assert.equal(wheelProblem(S({ draft: 0 })), null);
  assert.match(wheelProblem(S({ draft: 11 })) ?? "", /0 \(machined\) to 10/);
  assert.match(wheelProblem(S({ draft: 10, rimD: 76 })) ?? "", /rim is thinner/);
  assert.match(wheelProblem(S({ draft: 10, hub: 13, bore: 8, hubT: 40 })) ?? "", /hub is thinner/);
  const lean = wheelSection(S({ draft: 3 })), straight = wheelSection(S({ draft: 0 }));
  const xs = (sec: { pts: [number, number][] }): number[] => sec.pts.filter((p) => Math.abs(p[1]) > 6.9).map((p) => p[0]);
  assert.ok(Math.max(...xs(lean)) < Math.max(...xs(straight)) - 0.3, "the rim's outside is smaller at its faces");
});

// ---- numbers typed in the box (`in_1240`): never break the wheel; the rest follows, or the number is taken back ----
import { armModel } from "../src/interaction/tools.ts";
import { modelFix, modelEntry } from "../src/interaction/modeltool.ts";
const toolWith = (typed: Record<string, string>, size = ""): ReturnType<typeof armModel> => {
  const t = armModel("wheel"), keys = modelFields("wheel").map((f) => f.key);
  return { ...t, plane: XY, points: [[0, 0, 0]], cursor: [0, 0, 0], fill: { center: [0, 0, 0], normal: [0, 0, 1] }, model: { ...t.model!, typed: t.model!.typed.map((x, i) => (i === 0 ? size : i >= 1 && typed[keys[i - 1]!] !== undefined ? typed[keys[i - 1]!]! : x)) } } as ReturnType<typeof armModel>;
};
test("the Size is the outside diameter, listed once; typing the number a field already has changes nothing", () => {
  const sc = scene(createSession(kernel)), t = toolWith({}, "100");
  assert.equal(modelTarget(sc, t)!.nums.outer, 100);
  assert.equal(modelEntry(sc, t)!.fields.filter((f) => f.label === "Outer diameter").length, 1, "listed once");
  const labels = modelEntry(sc, t)!.fields.map((f) => f.label);
  assert.deepEqual(labels.slice(0, 14), ["Outer diameter", "Rim diameter", "Hub diameter", "Bore diameter", "Rim thickness", "Spoke thickness", "Hub thickness", "Spoke count", "Spoke width", "Spoke taper", "Spoke spiral", "Spoke rim offset", "Spoke hub offset", "Spoke radius"], "the diameters, then the thicknesses, then the spoke numbers");
  assert.deepEqual(labels.slice(14), ["Spoke join radius", "Rim join radius", "Hub join radius", "Draft"]);
  assert.equal(modelEntry(sc, t)!.fields.filter((f) => f.toggle).length, 4, "four radii have the fillet or chamfer toggle");
  assert.equal(modelEntry(sc, toolWith({ rimJoinKind: "1" }, "80"))!.fields.find((f) => f.label === "Rim join radius")!.toggle!.value, 1, "and it shows the kind it has");
  assert.equal(modelEntry(sc, t)!.fields[0]!.label, "Outer diameter");
  const base = modelTarget(sc, toolWith({}, "80"))!.nums;
  for (const k of ["rimD", "hub", "bore", "rimT", "web", "hubT", "spokes", "spokeW", "taper", "spiral", "rimOff", "hubOff", "corner", "edge", "rimJoin", "hubJoin", "draft"]) {
    const g = modelTarget(sc, toolWith({ [k]: String(base[k]) }, "80"))!;
    assert.equal(g.problem, null, `${k} typed as it already is: ${g.problem}`);
    assert.deepEqual(g.nums, base, `${k}: nothing else moves`);
  }
});
test("a number typed is met by the others: a small bore gives a small hub, a big hub a big bore, a thick web a bigger join, and any single number typed makes a wheel", () => {
  const sc = scene(createSession(kernel)), at = (typed: Record<string, string>, size = "80") => modelTarget(sc, toolWith(typed, size))!;
  assert.ok(at({ bore: "3" }).nums.hub! < 12, `a 3 mm bore has a hub of ${at({ bore: "3" }).nums.hub} mm`);
  assert.ok(at({ bore: "3" }, "400").nums.hub! < 12, "and so does a hub on a big wheel");
  assert.ok(at({ hub: "50" }, "200").nums.bore! > 12, "a big hub has a big bore");
  assert.ok(at({ web: "10" }).nums.rimJoin! > 5, "a thick web has a bigger join");
  assert.ok(at({ web: "10" }).nums.rimT! >= 10 + 2 * at({ web: "10" }).nums.rimJoin!, "and a rim that stands proud of it");
  // random single numbers, random sizes: always a wheel, with no number taken back unless it is the one typed
  let seed = 7; const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const keys = modelFields("wheel").map((f) => f.key).filter((k) => k !== "outer" && !k.endsWith("Kind"));
  let taken = 0;
  for (let i = 0; i < 400; i++) {
    const size = String(Math.round(10 ** (1.2 + rnd() * 1.7))), typed: Record<string, string> = {};
    const sz = Number(size), range: Record<string, [number, number, number]> = { rimT: [0.05, 0.3, 1], rimD: [0.6, 0.97, 1], hub: [0.06, 0.4, 1], hubT: [0.05, 0.35, 1], bore: [0.02, 0.2, 1], web: [0.02, 0.1, 1], rimJoin: [0.01, 0.08, 1], hubJoin: [0.01, 0.08, 1], hubOff: [0, 0.12, 1], rimOff: [0, 0.12, 1], edge: [0, 0.03, 1], corner: [0.01, 0.08, 1], spokeW: [0.02, 0.2, 1] };
    for (let j = 0, n = 1 + Math.floor(rnd() * 3); j < n; j++) {
      const k = keys[Math.floor(rnd() * keys.length)]!, r = range[k];
      typed[k] = k === "spokes" ? String(rnd() < 0.15 ? 0 : 3 + Math.floor(rnd() * 22)) : k === "taper" ? String(Math.round((rnd() - 0.3) * 80) / 100) : k === "spiral" ? String(Math.round((rnd() - 0.5) * 60)) : k === "draft" ? String(Math.round(rnd() * 80) / 10) : String(Math.round(sz * (r![0] + rnd() * (r![1] - r![0])) * 10) / 10);
    }
    const t = toolWith(typed, size), g = modelTarget(sc, t)!;
    if (!g.problem) continue;
    taken++;
    const fx = modelFix(sc, t);
    assert.ok(fx, `${JSON.stringify(typed)} at ${size}: ${g.problem}, and no number is taken back`);
    assert.equal(modelTarget(sc, fx!.tool)!.problem, null, `${JSON.stringify(typed)} at ${size}: taken back to something that makes a wheel`);
  }
  assert.ok(taken < 160, `${taken} of 400 random numbers had to be taken back (the others met them)`);
  for (const size of [15, 20, 40, 80, 150, 300, 600, 1500]) { const g = modelTarget(sc, toolWith({}, String(size)))!; assert.equal(g.problem, null, `a ${size} mm wheel with nothing typed: ${g.problem}`); }
});
test("a Size too small for any wheel is taken back to the least that makes one, and the box marks the Size", () => {
  const sc = scene(createSession(kernel)), t = toolWith({}, "8"), fx = modelFix(sc, t)!;
  assert.ok(fx && fx.field === 0, "the Size is the number to blame");
  const g = modelTarget(sc, fx.tool)!;
  assert.equal(g.problem, null);
  assert.ok(g.nums.outer! >= 13 && g.nums.outer! < 20, `the least wheel is ${g.nums.outer} mm across`);
  assert.equal(modelEntry(sc, t)!.fields[0]!.bad, true);
});
test("Enter with a number that cannot be met takes it back and marks it, and the next Enter makes the wheel; the rim width it already had changes nothing", () => {
  const open = (typed: Record<string, string>) => {
    let st = { ...createState(createSession(kernel)), cam: homeCamera() };
    st = reduce(st, { type: "runAction", id: "model:wheel" }, env);
    const keys = modelFields("wheel").map((f) => f.key);
    return { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]] as [number, number, number][], cursor: [0, 0, 0] as [number, number, number], sized: true as const, model: { ...st.tool!.model!, field: 1 + keys.findIndex((k) => typed[k] !== undefined), typed: st.tool!.model!.typed.map((x, i) => (i === 0 ? "80" : i >= 1 && typed[keys[i - 1]!] !== undefined ? typed[keys[i - 1]!]! : x)) } } };
  };
  let st = reduce(open({ hub: "79" }), { type: "typed", key: "Enter", shift: false }, env);
  assert.ok(st.tool?.model?.bad, "the tool stays open with the number marked");
  assert.equal(bodyOf(st).length, 0, "nothing is made yet");
  assert.match(st.session.message ?? "", /Hub diameter 79 is taken back to/);
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  let n = 0; while (st.building && n++ < 10) st = reduce(st, { type: "buildNext" }, env);
  assert.equal(bodyOf(st).length, 1, "the next Enter makes it");
  const same = reduce(open({ width: "14" }), { type: "typed", key: "Enter", shift: false }, env);
  assert.ok(!same.tool?.model?.bad && (same.building || same.tool === null), "the rim width it already had is no trouble");
});

test("a fillet or a chamfer on the edges of the cutouts is a second part made once the wheel is: it takes the metal its profile says, round every cutout, top and bottom", () => {
  const flat = bodyOf(placed({ edge: "0", draft: "0" }))[0]!.volume;
  const [a, b] = [wheelLines(S({ draft: 0 })).slice(4).reduce((s, l) => s + l.slice(0, -1).reduce((q, p, i) => q + Math.hypot(l[i + 1]![0] - p[0], l[i + 1]![1] - p[1]), 0), 0), 1];
  for (const [kind, per] of [["0", 1 - Math.PI / 4], ["1", 0.5]] as const) {
    const st = placed({ edge: String(b), edgeKind: kind, draft: "0" }), made = bodyOf(st);
    assert.equal(made.length, 1, `one body (${kind})`);
    assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
    const took = flat - made[0]!.volume, expect = per * b * b * a * 2;
    assert.ok(Math.abs(took - expect) < 0.12 * expect, `the ${kind === "0" ? "fillet" : "chamfer"} takes ${took.toFixed(0)} mm3 and its profile says ${expect.toFixed(0)}`);
  }
  // an edge with the cutouts running into the hub is met by moving the offsets, not by failing
  const g = modelTarget(scene(createSession(kernel)), toolWith({ hubOff: "0", rimOff: "0", edge: "1" }, "80"))!;
  assert.equal(g.problem, null);
});
test("a spoke with a spiral has smooth faces (three arcs a side) and takes a fillet", () => {
  const st = placed({ spiral: "12", edge: "0.8", draft: "0" }), made = bodyOf(st);
  assert.equal(made.length, 1);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
  assert.ok(wheelLines(S({ spiral: 12 })).slice(4)[0]!.length < 70, "few points");
});
test("a chamfer in place of a radius: the corners of a cutout cut straight, and it is made", () => {
  const round = wheelLines(S({ cornerKind: 0, corner: 3 })).slice(4)[0]!, cut = wheelLines(S({ cornerKind: 1, corner: 3 })).slice(4)[0]!;
  assert.ok(cut.length < round.length, "straight corners need fewer points than arcs");
  assert.ok(area(cut) < area(round), "a chamfer of 3 mm takes more off a corner than a radius of 3 mm, so the cutout is smaller");
  const st = placed({ cornerKind: "1", edge: "0", draft: "0" });
  assert.equal(bodyOf(st).length, 1);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
});
