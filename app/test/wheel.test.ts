// The wheel model (`dec_hub_spoke`): numbers that make no wheel are said, each spoke style is built as ONE body of the right height and with a bore, and a selected round object is filled.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawCircle } from "../src/operation/build.ts";
import { WHEEL_START, wheelProblem, wheelGeometry, wheelLines } from "../src/operation/modelwheel.ts";
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
  assert.match(wheelProblem(S({ rim: 0.8 })) ?? "", /rim and the web/);
  assert.match(wheelProblem(S({ bore: 19 })) ?? "", /hub must be/);
  assert.match(wheelProblem(S({ join: 0.5 })) ?? "", /not castable/);
  assert.match(wheelProblem(S({ corner: 0.5 })) ?? "", /not castable/);
  assert.match(wheelProblem(S({ web: 12, width: 14 })) ?? "", /stand proud/);
  assert.match(wheelProblem(S({ hub: 60 })) ?? "", /too big for the rim/);
  assert.match(wheelProblem(S({ spokes: 2 })) ?? "", /3 to 24/);
  assert.match(wheelProblem(S({ spokes: 24, spokeW: 14 })) ?? "", /too wide|too small/);
  assert.match(wheelProblem(S({ corner: 7 })) ?? "", /too short|too small/);
  assert.match(wheelProblem(S({ taper: 0.95 })) ?? "", /taper/);
});
function placed(typed: Record<string, string>, fill?: boolean) {
  typed = { outer: "80", ...typed }; // (the first number typed, if it is a size, sets the scale of the rest: the outside diameter is kept as it is)
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
const area = (l: [number, number][]): number => Math.abs(l.slice(0, -1).reduce((s, p, i) => s + p[0] * l[i + 1]![1] - l[i + 1]![0] * p[1], 0)) / 2;
const bodyOf = (st: ReturnType<typeof placed>): B[] => Object.values(scene(st.session).parts).filter((p) => p.kind === "body") as unknown as B[];
test("a plain web is one body of the rim's height with its hub and bore; cutouts take away what their outlines enclose, in the web's thickness", () => {
  const s = S(), plain = bodyOf(placed({ spokes: "0" }));
  assert.equal(plain.length, 1, "one body");
  assert.ok(Math.abs(plain[0]!.bbox.max[2]! - plain[0]!.bbox.min[2]! - Math.max(s.width, s.hubLen)) < 1e-3, "as high as the longer of rim and hub");
  assert.ok(Math.abs(plain[0]!.bbox.max[0]! - plain[0]!.bbox.min[0]! - s.outer) < 0.2, "as wide as the outside diameter");
  // the section: rim, hub and web, their areas turned about the axis (the fillets add a little more)
  const g = wheelGeometry(s), box = Math.PI * ((g.R ** 2 - g.Rin ** 2) * s.width + (g.hubR ** 2 - (s.bore / 2) ** 2) * s.hubLen + (g.Rin ** 2 - g.hubR ** 2) * s.web);
  assert.ok(plain[0]!.volume > box && plain[0]!.volume < box * 1.06, `volume ${plain[0]!.volume} is the plain section's ${box.toFixed(0)} and the fillets`);
  for (const o of [{} as Record<string, string>, { spiral: "15" }, { spokeW: "6", taper: "-0.2", hubOff: "0", rimOff: "0" }, { joinKind: "1", spokes: "6", corner: "2", spokeW: "6" }]) {
    const st = placed(o), made = bodyOf(st), sp = { ...s, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)])) } as WheelSpec;
    const plainSp = bodyOf(placed({ ...o, spokes: "0" }))[0]!.volume;
    assert.equal(made.length, 1, `${JSON.stringify(o)}: one body`);
    const cuts = wheelLines(sp).slice(4).reduce((a, l) => a + area(l), 0) * sp.web;
    const drop = plainSp - made[0]!.volume, exact = sp.hubOff > sp.join + 0.4 && sp.rimOff > sp.join + 0.4; // (a cutout that reaches into a fillet takes the fillet's metal too)
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
