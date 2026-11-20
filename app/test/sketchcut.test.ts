// Sketching on a face (`in_1351`): the surface being drawn on cuts the view along itself while the sketch tool is on (nothing is cut in the model); a second click that a snap would put on the first still makes the figure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { projector } from "../src/interaction/camera.ts";
import { cutsNow } from "../src/interaction/control/section.ts";
import { frameOf } from "../src/interaction/frame.ts";

await kernel.init();
const env = { w: 900, h: 700, now: 0 };
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/sketch-on-face.cad.json", import.meta.url), "utf8")) as unknown as { value: Parameters<typeof createState>[0] }).value;
const TOP = "b/body/f@0,0,1,20";

test("with a face selected and a sketch tool on, the face cuts the view: the half it looks out to is cut away, and it stays until Exit sketch", () => {
  const s = open();
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  const sections0 = cutsNow(st).length;
  st = reduce(st, { type: "begin", name: "rect" }, env);
  const cuts = cutsNow(st);
  assert.equal(cuts.length, sections0 + 1);
  const temp = cuts.find((c) => (c.ref as string) === "sketch:cut")!;
  assert.deepEqual(temp.n.map((x) => (Math.round(x) || 0)), [0, 0, 1], "the top face looks up: the half above it is cut away");
  assert.ok(Math.abs(temp.centre[2] - 20) < 1e-6);
  assert.equal(frameOf(st, { w: 900, h: 700 }).sections.length, sections0 + 1, "the picture is cut too");
  st = reduce(st, { type: "escape" }, env);
  assert.equal(cutsNow(st).length, sections0 + 1, "the tool is put away: the cut stays until Exit sketch (`in_1375`)");
  st = reduce(st, { type: "exitSketch" }, env);
  assert.equal(cutsNow(st).length, sections0, "Exit sketch: the view is whole again");
  assert.equal(scene(st.session).steps.length, scene(s).steps.length, "nothing is made in the model");
});

test("no tool, no temporary cut; a round face has no plane to cut along", () => {
  const s = open();
  const st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  assert.ok(!cutsNow(st).some((c) => (c.ref as string) === "sketch:cut"));
  const round = Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/c@"))!;
  let r = createState({ ...s, click: { ...s.click, selection: [round.ref] as never } });
  r = reduce(r, { type: "begin", name: "rect" }, env);
  assert.ok(!cutsNow(r).some((c) => (c.ref as string) === "sketch:cut"));
});

test("zoomed out, a rectangle on a small face is made: its second click is not snapped onto the first corner", () => {
  const s = open();
  const f = scene(s).parts["b/body/f@-1,0,0,-23.21" as never] as unknown as { ref: string; mesh: number[] };
  let st = createState({ ...s, click: { ...s.click, selection: [f.ref] as never } });
  st = reduce(st, { type: "begin", name: "rect" }, env);
  const m = f.mesh;
  const c = [0, 1, 2].map((i) => (m[i]! + m[3 + i]! + m[6 + i]!) / 3);
  const pr = projector(st.cam, env.w, env.h);
  const before = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !(p as { derived?: boolean }).derived).length;
  for (const k of [[0, 0], [0.4, 0.4]]) {
    const q = [0, 1, 2].map((i) => c[i]! + (m[i]! - c[i]!) * k[0]! + (m[3 + i]! - c[i]!) * k[1]!);
    const [x, y] = pr.project(q as never);
    st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env);
  }
  const after = Object.values(scene(st.session).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !(p as { derived?: boolean }).derived).length;
  assert.equal(after - before, 4, `${st.session.message}`);
});

test("the cut stays after the first enclosed sketch is drawn and after the tool is put away, until Exit sketch (`in_1375`)", () => {
  const s = open();
  const f = scene(s).parts[TOP as never] as unknown as { mesh: number[] };
  const m = f.mesh;
  let c: number[] = [0, 0, 0];
  for (let i = 0; i + 2 < m.length; i += 3) c = [c[0]! + m[i]!, c[1]! + m[i + 1]!, c[2]! + m[i + 2]!];
  c = c.map((v) => v / (m.length / 3));
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "begin", name: "line" }, env);
  const pr = projector(st.cam, env.w, env.h);
  const corners: [number, number][] = [[-2, -2], [2, -2], [0, 2], [-2, -2]];
  for (const [dx, dy] of corners) { const [x, y] = pr.project([c[0]! + dx, c[1]! + dy, c[2]!] as never); st = reduce(st, { type: "hover", x, y } as never, env); st = reduce(st, { type: "click", x, y, count: 1, shift: false }, env); }
  assert.ok(Object.values(scene(st.session).parts).some((p) => p.kind === "face" && p.origin === "drawn"), "a closed sketch was made");
  const temp = () => cutsNow(st).filter((q) => (q.ref as string) === "sketch:cut").length;
  assert.equal(temp(), 1);
  st = reduce(st, { type: "escape" }, env);
  if (st.tool) st = reduce(st, { type: "escape" }, env);
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [] } } };
  assert.equal(st.tool, null);
  assert.equal(temp(), 1, "no tool and nothing selected: still sketching on the plane");
  assert.equal(frameOf(st, { w: 900, h: 700 }).sketching, true, "the bar offers Exit sketch");
  st = reduce(st, { type: "exitSketch" }, env);
  assert.equal(temp(), 0, "Exit sketch");
  assert.equal(frameOf(st, { w: 900, h: 700 }).sketching, false);
});

test("going normal to a selected face, or to a selected world plane, cuts the view along it until Exit sketch", () => {
  const s = open();
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  const temp = (t: typeof st) => cutsNow(t).filter((q) => (q.ref as string) === "sketch:cut");
  assert.equal(temp(st).length, 1, "a face looked at straight");
  assert.deepEqual(temp(st)[0]!.n.map((x) => Math.round(x) || 0), [0, 0, 1], "the half it looks out to");
  st = reduce(st, { type: "exitSketch" }, env);
  assert.equal(temp(st).length, 0);
  let w = createState({ ...s, click: { ...s.click, selection: ["w/XY"] as never } });
  w = reduce(w, { type: "runAction", id: "look" }, env);
  assert.equal(temp(w).length, 1, "a world plane looked at straight");
  assert.equal(temp(w)[0]!.n[2] !== 0, true, "across z");
});

test("Escape leaves sketch mode when nothing else is open, and the X, Y, Z buttons leave it at once (`in_1376`)", () => {
  const s = open();
  const sketching = (t: ReturnType<typeof createState>) => cutsNow(t).some((q) => (q.ref as string) === "sketch:cut");
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  assert.ok(sketching(st));
  st = reduce(st, { type: "look", plane: "Z" } as never, env);
  assert.ok(!sketching(st), "a view along an axis leaves it");
  st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  st = reduce(st, { type: "begin", name: "rect" }, env);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.tool, null, "the first Escape puts the tool away");
  assert.ok(sketching(st), "and the sketch mode stays");
  st = reduce(st, { type: "escape" }, env);
  assert.ok(!sketching(st), "the next one leaves it");
  st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "look", plane: "N" } as never, env);
  assert.ok(sketching(st), "going normal to what is selected takes it");
});

test("the cut follows the surface being sketched on, and the bar's cut icon switches it on and off (`in_1377`)", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/sketch-two-faces.cad.json", import.meta.url), "utf8")) as unknown as { value: Parameters<typeof createState>[0] }).value;
  const SIDE = "b/body/f@1,0,0,28.75";
  const top = "b/body/f@0,0,1,25";
  const cut = (t: ReturnType<typeof createState>) => cutsNow(t).find((q) => (q.ref as string) === "sketch:cut");
  let st = createState({ ...s, click: { ...s.click, selection: [top] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  assert.deepEqual(cut(st)!.n.map((x) => Math.round(x) || 0), [0, 0, 1], "first on the top face");
  // a tool begun on another face takes the cut to that face
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [SIDE] as never } } };
  st = reduce(st, { type: "begin", name: "circle" }, env);
  assert.deepEqual(cut(st)!.n.map((x) => Math.round(x) || 0), [1, 0, 0], "then along the face the circle is drawn on");
  assert.ok(Math.abs(cut(st)!.centre[0] - 28.75) < 1e-6);
  // the icon
  assert.equal(frameOf(st, { w: 900, h: 700 }).sketchCut, true);
  st = reduce(st, { type: "sketchCut" }, env);
  assert.equal(cut(st), undefined, "off: the view is whole");
  assert.equal(frameOf(st, { w: 900, h: 700 }).sketching, true, "and sketch mode goes on");
  assert.equal(frameOf(st, { w: 900, h: 700 }).sketchCut, false);
  st = reduce(st, { type: "sketchCut" }, env);
  assert.ok(cut(st), "on again");
});
