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

test("with a face selected and a sketch tool on, the face cuts the view: the half it looks out to is cut away, and it goes when the tool does", () => {
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
  assert.equal(cutsNow(st).length, sections0, "the tool is put away: the view is whole again");
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
