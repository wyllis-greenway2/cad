// The wheel model (`dec_hub_spoke`): numbers that make no wheel are said, each spoke style is built as ONE body of the right height and with a bore, and a selected round object is filled.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { WHEEL_START, wheelProblem, wheelGeometry, wheelLines, wheelSection, effective } from "../src/operation/modelwheel.ts";
import type { WheelSpec } from "../src/operation/modelwheel.ts";
import { modelFields } from "../src/operation/modelkinds.ts";
import { modelTarget } from "../src/interaction/modeltool.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
const S = (o: Partial<WheelSpec> = {}): WheelSpec => ({ ...WHEEL_START, ...o });
type B = { ref: string; id: string; volume: number; bbox: { min: number[]; max: number[] } };

test("only what is no solid at all is refused; every other number is met (a radius may be 0, spokes may merge, a radius too big is made as big as the room allows)", () => {
  assert.equal(wheelProblem(S()), null);
  assert.equal(wheelProblem(S({ spokes: 0 })), null);
  assert.match(wheelProblem(S({ rimD: 80 })) ?? "", /rim diameter must be less/);
  assert.match(wheelProblem(S({ bore: 25 })) ?? "", /hub diameter must be more than the bore/);
  assert.match(wheelProblem(S({ hub: 75 })) ?? "", /hub diameter must be less than the rim/);
  assert.match(wheelProblem(S({ spokes: 2 })) ?? "", /3 to 60/);
  assert.match(wheelProblem(S({ draft: 20 })) ?? "", /0 \(machined\) to 15/);
  for (const o of [{ rimJoin: 0 }, { hubJoin: 0 }, { corner: 0 }, { edge: 0 }, { obtuse: 0 }, { spokeW: 200 }, { taper: 5 }, { taper: -5 }, { corner: 100 }, { rimJoin: 50 }, { hubJoin: 50 }, { web: 13.9 }, { spiral: 150 }, { rimOff: 0, hubOff: 0 }, { hub: 9, bore: 8.5, draft: 0 }, { web: 15 }, { web: 20, rimT: 5, hubT: 5 }, { rimT: 0.5, hubT: 0.5, web: 0.5 }, { rimT: 4, hubT: 4, web: 4 }, { draft: 10, rimD: 76 }, { draft: 10, hub: 13, bore: 8, hubT: 40 }, { edge: 3 }, { spokes: 60, spokeW: 30 }, { rimOff: 0.2, hubOff: 0.2 }]) assert.equal(wheelProblem(S(o)), null, JSON.stringify(o));
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
  assert.match(wheelProblem(S({ draft: 20 })) ?? "", /0 \(machined\) to 15/);
  assert.ok(effective(S({ draft: 10, rimD: 76 })).draft < 10, "a draft that leaves the rim no wall is the most that leaves one");
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
  assert.deepEqual(labels.slice(0, 17), ["Outer diameter", "Rim diameter", "Hub diameter", "Bore diameter", "Bore flat", "Key width", "Key depth", "Rim thickness", "Spoke thickness", "Hub thickness", "Spoke count", "Spoke width", "Spoke taper", "Spoke spiral", "Spoke rim offset", "Spoke hub offset", "Spoke radius"], "the diameters, then the thicknesses, then the spoke numbers");
  assert.deepEqual(labels.slice(17), ["Spoke join radius", "Rim join radius", "Hub join radius", "Draft"], "the obtuse radius is not there while the spokes are straight");
  assert.equal(modelEntry(sc, t)!.fields.filter((f) => f.toggle).length, 4, "four radii have the fillet or chamfer toggle");
  const sp = modelEntry(sc, toolWith({ spiral: "30" }, "80"))!.fields.map((f) => f.label);
  assert.deepEqual(sp.slice(17, 20), ["Spoke join radius", "Spoke obtuse radius", "Rim join radius"], "with a spiral the obtuse radius is next to the spoke join radius");
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
  assert.ok(at({ web: "10" }).nums.rimT! >= 10, "and a rim at least as thick");
  // random single numbers, random sizes: always a wheel, with no number taken back unless it is the one typed
  let seed = 7; const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const keys = modelFields("wheel").map((f) => f.key).filter((k) => k !== "outer" && !k.endsWith("Kind"));
  let taken = 0;
  for (let i = 0; i < 400; i++) {
    const size = String(Math.round(10 ** (1.2 + rnd() * 1.7))), typed: Record<string, string> = {};
    const sz = Number(size), range: Record<string, [number, number, number]> = { rimT: [0.05, 0.3, 1], rimD: [0.6, 0.97, 1], hub: [0.06, 0.4, 1], hubT: [0.05, 0.35, 1], bore: [0.02, 0.2, 1], flat: [0, 0.08, 1], key: [0.02, 0.1, 1], keyDepth: [0, 0.05, 1], web: [0.02, 0.1, 1], rimJoin: [0.01, 0.08, 1], hubJoin: [0.01, 0.08, 1], hubOff: [0, 0.12, 1], rimOff: [0, 0.12, 1], edge: [0, 0.03, 1], obtuse: [0.01, 0.08, 1], corner: [0.01, 0.08, 1], spokeW: [0.02, 0.2, 1] };
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
test("a Size that is no wheel at all (0 or less) is taken back to one that is, and the box marks the Size", () => {
  const sc = scene(createSession(kernel)), t = toolWith({}, "-5"), fx = modelFix(sc, t)!;
  assert.ok(fx && fx.field === 0, "the Size is the number to blame");
  const g = modelTarget(sc, fx.tool)!;
  assert.equal(g.problem, null);
  assert.ok(g.nums.outer! > 0, `a wheel of ${g.nums.outer} mm across`);
  assert.equal(modelEntry(sc, t)!.fields[0]!.bad, true);
});
test("Enter with a number that cannot be met takes it back and marks it, and the next Enter makes the wheel; the rim width it already had changes nothing", () => {
  const open = (typed: Record<string, string>) => {
    let st = { ...createState(createSession(kernel)), cam: homeCamera() };
    st = reduce(st, { type: "runAction", id: "model:wheel" }, env);
    const keys = modelFields("wheel").map((f) => f.key);
    return { ...st, tool: { ...st.tool!, plane: XY, points: [[0, 0, 0]] as [number, number, number][], cursor: [0, 0, 0] as [number, number, number], sized: true as const, model: { ...st.tool!.model!, field: 1 + keys.findIndex((k) => typed[k] !== undefined), typed: st.tool!.model!.typed.map((x, i) => (i === 0 ? "80" : i >= 1 && typed[keys[i - 1]!] !== undefined ? typed[keys[i - 1]!]! : x)) } } };
  };
  let st = reduce(open({ hub: "90" }), { type: "typed", key: "Enter", shift: false }, env);
  assert.ok(st.tool?.model?.bad, "the tool stays open with the number marked");
  assert.equal(bodyOf(st).length, 0, "nothing is made yet");
  assert.match(st.session.message ?? "", /Hub diameter 90 is taken back to/);
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

test("spokes that run into each other merge; a spoke join radius too big for the room is the biggest the room allows; none of it fails", () => {
  assert.equal(wheelLines(S({ spokeW: 200 })).length, 4, "spokes that fill the web leave no cutout, and that is no failure");
  const big = wheelLines(S({ corner: 100 })).slice(4)[0]!, small = wheelLines(S({ corner: 3 })).slice(4)[0]!;
  assert.ok(area(big) < area(small), "a bigger radius takes more off the corners");
  const pinched = wheelLines(S({ hub: 14, bore: 4, hubOff: 0, spokeW: 12 })).slice(4);
  assert.equal(pinched.length, 5, "spokes that meet before the hub leave a cutout that ends in a point");
  const st = placed({ hub: "14", bore: "4", hubOff: "0", spokeW: "12", edge: "0" });
  assert.equal(bodyOf(st).length, 1);
  assert.ok(!st.session.message, `no complaint: ${st.session.message}`);
  for (const o of [{ taper: "0.9" }, { taper: "-3" }, { corner: "0", rimJoin: "0", hubJoin: "0", edge: "0" }] as Record<string, string>[]) { const r = placed({ edge: "0", ...o }); assert.equal(bodyOf(r).length, 1, JSON.stringify(o)); assert.ok(!r.session.message, `${JSON.stringify(o)}: ${r.session.message}`); }
});
test("a spiral gets a bigger obtuse radius that follows the spoke join radius and the spiral while it is not typed", () => {
  const at = (typed: Record<string, string>): Record<string, number> => modelTarget(scene(createSession(kernel)), toolWith(typed, "80"))!.nums;
  assert.ok(at({ spiral: "30" }).obtuse! > at({ spiral: "30" }).corner! * 2, "the more the spiral, the bigger");
  assert.ok(at({ spiral: "30", corner: "5" }).obtuse! > at({ spiral: "30" }).obtuse!, "and the bigger the spoke join radius, the bigger it follows");
  assert.equal(at({ spiral: "30", obtuse: "4" }).obtuse, 4, "a number typed is kept");
  const flat = wheelLines(S({ spiral: 40, obtuse: 3 })).slice(4)[0]!, round = wheelLines(S({ spiral: 40, obtuse: 12 })).slice(4)[0]!;
  assert.notEqual(Math.round(area(round) * 10), Math.round(area(flat) * 10), "a bigger obtuse radius changes the outline");
});

test("a wheel may be as flat as the spokes, the rim and the hub being one thickness, and as thin as it likes: nothing is refused over the diameter to thickness ratio", () => {
  const flat = placed({ rimT: "6", hubT: "6", web: "6", edge: "0" }), b = bodyOf(flat);
  assert.equal(b.length, 1);
  assert.ok(!flat.session.message, `no complaint: ${flat.session.message}`);
  assert.ok(Math.abs(b[0]!.bbox.max[2]! - b[0]!.bbox.min[2]! - 6) < 1e-3, "6 thick all over");
  const full = Math.PI * (40 ** 2 - 4 ** 2) * 6, windows = wheelLines(S({ rimT: 6, hubT: 6, web: 6 })).slice(4).reduce((a, l) => a + area(l), 0) * 6;
  assert.ok(Math.abs(b[0]!.volume - (full - windows)) < 0.03 * full, `flat: ${b[0]!.volume.toFixed(0)} is the disc ${full.toFixed(0)} less the cutouts ${windows.toFixed(0)}`);
  for (const th of ["0.5", "1.5"]) { const thin = placed({ rimT: th, hubT: th, web: th, edge: "0", draft: "0" }); assert.equal(bodyOf(thin).length, 1, `${th} thick`); assert.ok(!thin.session.message, `${th}: ${thin.session.message}`); }
  const fat = placed({ web: "30", rimT: "8", hubT: "8", edge: "0", draft: "0" });
  assert.equal(bodyOf(fat).length, 1, "spokes thicker than the rim are as thick as it");
  assert.ok(!fat.session.message, fat.session.message ?? "");
  assert.equal(effective(S({ web: 30, rimT: 8, hubT: 8 })).web, 8);
});

test("a wheel's bore has the gear maker's flat and keyway: the flat leaves metal in the hole, the key cuts a slot, and both are one body (`in_1259`)", () => {
  const vol = (typed: Record<string, string>) => { const st = placed(typed); const b = bodyOf(st); assert.equal(b.length, 1, "one body"); return b[0]!.volume; };
  const round = vol({ bore: "10", hub: "24", spokes: "0" }), flat = vol({ bore: "10", hub: "24", spokes: "0", flat: "1.2" }), key = vol({ bore: "10", hub: "24", spokes: "0", key: "3" });
  assert.ok(flat > round + 10, `a D flat: ${flat} > ${round}`);
  assert.ok(key < round - 10, `a keyway: ${key} < ${round}`);
  assert.match(wheelProblem(S({ bore: 10, flat: 1, key: 3 })) ?? "", /flat or a keyway, not both/);
  assert.match(wheelProblem(S({ key: 3, keyDepth: 40, hub: 22 })) ?? "", /hub's wall/);
});
