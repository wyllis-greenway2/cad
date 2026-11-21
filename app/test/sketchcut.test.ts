// Sketching on a face (`in_1351`): the surface being drawn on cuts the view along itself while the sketch tool is on (nothing is cut in the model); a second click that a snap would put on the first still makes the figure.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { projector } from "../src/interaction/camera.ts";
import { cutsNow, newFaces } from "../src/interaction/control/section.ts";
import { pickOpts } from "../src/interaction/control/state.ts";
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

test("Escape leaves sketch mode when nothing else is open, and the X, Y, Z buttons only turn the view (`in_1376`, then `in_1385`)", () => {
  const s = open();
  const sketching = (t: ReturnType<typeof createState>) => cutsNow(t).some((q) => (q.ref as string) === "sketch:cut");
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  assert.ok(sketching(st));
  const sel0 = [...st.session.click.selection];
  st = reduce(st, { type: "look", plane: "Z" } as never, env);
  assert.ok(sketching(st), "a view along an axis keeps sketch mode and its cut (`in_1385`)");
  assert.deepEqual(st.session.click.selection, sel0, "nothing is selected by it");
  assert.ok(st.anim, "the view turns");
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

test("every way of going normal to a surface cuts to it, and the icon's choice is kept (`in_1378`)", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/sketch-two-faces.cad.json", import.meta.url), "utf8")) as unknown as { value: Parameters<typeof createState>[0] }).value;
  const top = "b/body/f@0,0,1,25";
  const cutN = (t: ReturnType<typeof createState>) => cutsNow(t).find((q) => (q.ref as string) === "sketch:cut")?.n.map((x) => Math.round(x) || 0);
  const sel = (t: ReturnType<typeof createState>, r: string) => ({ ...t, session: { ...t.session, click: { ...t.session.click, selection: [r] as never } } });
  // N
  let st = reduce(sel(createState(s), top), { type: "look", plane: "N" }, env);
  assert.deepEqual(cutN(st), [0, 0, 1], "N");
  // the icon off: going normal to another surface keeps it off
  st = reduce(st, { type: "sketchCut" }, env);
  st = reduce(sel(st, "b/body/f@1,0,0,28.75"), { type: "look", plane: "N" }, env);
  assert.equal(cutN(st), undefined, "off stays off");
  st = reduce(st, { type: "sketchCut" }, env);
  assert.deepEqual(cutN(st), [1, 0, 0], "on again, at the new surface");
  // the Look action of the ring
  st = reduce(sel(createState(s), top), { type: "runAction", id: "look" }, env);
  assert.deepEqual(cutN(st), [0, 0, 1], "the ring");
});

test("a double click on a flat face selects the whole body; a third is the face and goes normal to it, cutting along it (`in_1386`)", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/sketch-two-faces.cad.json", import.meta.url), "utf8")) as unknown as { value: Parameters<typeof createState>[0] }).value;
  let st = createState(s);
  const top = scene(st.session).parts["b/body/f@0,0,1,25" as never] as unknown as { mesh: Float32Array };
  let x = 0, y = 0, z = 0, k = 0;
  for (let i = 0; i + 2 < top.mesh.length; i += 3) { x += top.mesh[i]!; y += top.mesh[i + 1]!; z += top.mesh[i + 2]!; k++; }
  const [px, py] = projector(st.cam, 900, 700).project([x / k, y / k, z / k]);
  for (const count of [1, 2]) st = reduce(st, { type: "click", x: px, y: py, count, shift: false }, env);
  assert.equal(scene(st.session).parts[st.session.click.selection[0]!]?.kind, "body", "two take the body");
  assert.ok(!st.anim && !st.sketchOn, "the view does not turn");
  st = reduce(st, { type: "click", x: px, y: py, count: 3, shift: false }, env);
  assert.ok(st.sketchOn, "three: the cut is on");
  assert.deepEqual(st.sketchOn!.n.map((v) => Math.round(v) || 0), [0, 0, 1]);
  assert.ok(st.anim, "and the view turns to the face");
});

const sketchState = () => {
  const s = open();
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  st = reduce(st, { type: "runAction", id: "look" }, env);
  return { s, st };
};

test("what was made since sketch mode began is not cut: its faces are picked and drawn whole; what was there is cut", () => {
  const { st } = sketchState();
  assert.ok(st.sketchOn?.known?.length, "the faces of the body are known when sketch mode begins");
  assert.equal(frameOf(st, { w: 900, h: 700 }).unclipped, null, "nothing is new yet");
  // a face made since: take one out of what was known
  const gone = st.sketchOn!.known!.find((r) => r !== TOP && (scene(st.session).parts[r as never] as { mesh?: number[] })?.mesh)!;
  const later = { ...st, sketchOn: { ...st.sketchOn!, known: st.sketchOn!.known!.filter((r) => r !== gone) } };
  assert.deepEqual(newFaces(later), [gone]);
  const f = frameOf(later, { w: 900, h: 700 });
  assert.ok(f.unclipped && f.unclipped.length >= 9, "its triangles are drawn whole");
  assert.ok(pickOpts(later).unclipped?.has(gone as never), "and it can be pointed at");
  const off = { ...later, sketchOn: { ...later.sketchOn!, off: true as const } };
  assert.deepEqual(newFaces(off), [], "no cut, nothing to leave out");
});

test("the bar's button keeps the view square to the sketch plane: not turned by hand, pan and zoom go; the X Y Z buttons let it go", () => {
  const { st: s0 } = sketchState();
  let st = reduce(s0, { type: "keepNormal" }, env);
  assert.equal(st.keepNormal, true);
  assert.equal(frameOf(st, { w: 900, h: 700 }).keepNormal, true, "the bar shows it on");
  st = { ...st, cam: st.anim ? st.anim.to : st.cam, anim: null };
  const before = JSON.stringify(st.cam);
  st = reduce(st, { type: "orbit", dx: 80, dy: 40, x: 0, y: 0 }, env);
  assert.equal(JSON.stringify(st.cam), before, "turning by hand does nothing");
  const zoomed = reduce(st, { type: "zoom", factor: 1.2, x: 450, y: 350 }, env);
  assert.notEqual(JSON.stringify(zoomed.cam), before, "zoom goes");
  const looked = reduce(st, { type: "look", plane: "X" } as never, env);
  assert.equal(looked.keepNormal, false, "a view along an axis lets it go");
  assert.ok(looked.sketchOn, "and keeps sketch mode");
  st = reduce(st, { type: "keepNormal" }, env);
  st = reduce(st, { type: "orbit", dx: 80, dy: 40, x: 0, y: 0 }, env);
  assert.notEqual(JSON.stringify(st.cam), before, "let go: the view turns again");
});

test("the pencil of the ring begins sketch mode on the surface under the right click: square to it, cut along it; with none under it nothing happens", () => {
  const s = open();
  const st = { ...createState(s), menu: { x: 0, y: 0, items: [], plane: TOP as never, over: TOP as never } as never };
  const turned = reduce(st, { type: "runAction", id: "sketch:open" }, env);
  assert.deepEqual(turned.session.click.selection, [TOP]);
  assert.ok(turned.anim, "the view turns");
  assert.ok(turned.sketchOn, "sketch mode is on");
  assert.ok(turned.menu, "the ring stays open for the tools");
  const none = reduce({ ...st, menu: { x: 0, y: 0, items: [], plane: null, over: null } as never }, { type: "runAction", id: "sketch:open" }, env);
  assert.ok(!none.anim && !none.sketchOn && none.session.click.selection.length === 0);
});

test("the eye is one action: in sketch mode it turns the cut on and off, else it puts a cross section plane on what is selected; the pencil takes the selected plane when none was clicked (`in_1386`)", () => {
  const s = open();
  let st = createState({ ...s, click: { ...s.click, selection: [TOP] as never } });
  const planes = (t: typeof st) => Object.values(scene(t.session).parts).filter((p) => p.kind === "plane" && !!p.section).length;
  const before = planes(st);
  const sec = reduce(st, { type: "runAction", id: "view:eye" }, env);
  assert.equal(planes(sec), before + 1, "a cross section plane is put on");
  assert.ok(!sec.sketchOn);
  // the pencil with no right click on a plane: the selected plane
  st = reduce(st, { type: "runAction", id: "sketch:open" }, env);
  assert.ok(st.sketchOn && !st.sketchOn.off, "sketch mode, cut on");
  assert.ok(st.anim, "square to it");
  const off = reduce(st, { type: "runAction", id: "view:eye" }, env);
  assert.equal(off.sketchOn?.off, true, "the eye turns the cut off");
  assert.equal(planes(off), before, "no plane is added in sketch mode");
  assert.ok(!reduce(off, { type: "runAction", id: "view:eye" }, env).sketchOn?.off, "and on again");
  assert.ok(!reduce(off, { type: "runAction", id: "sketch:open" }, env).sketchOn?.off, "the pencil puts the cut on");
  const none = reduce(createState(s), { type: "runAction", id: "sketch:open" }, env);
  assert.ok(!none.sketchOn && /select a plane or a face/.test(none.session.message ?? ""), "with nothing it says what to select");
});
