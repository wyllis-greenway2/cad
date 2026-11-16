// The operation bar's options and Tab stepping (`in_546`, `q_ui_unification`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/control/state.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const open = (f: string) => (openSession(kernel, readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8")) as unknown as { value: Session }).value;
const tab = (s: AppState, shift = false) => reduce(s, { type: "typed", key: "Tab", shift }, env);
const on = (s: AppState) => frameOf(s, { w: 800, h: 600 }).options.filter((o) => o.on).map((o) => o.id);

function pushpull(): AppState {
  const s = open("chamfered-block-in_405.cad.json");
  const top = (Object.values(scene(s).parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.includes("f@0,0,1,17.9"))!;
  return reduce(createState({ ...s, click: { ...s.click, selection: [top.ref] as never } }), { type: "begin", name: "pushpull" }, env);
}

test("Tab steps through what a push / pull of a face does, round, and Shift+Tab back; each step chooses it", () => {
  let st = pushpull();
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).options.map((o) => o.id), ["move", "extrude", "extend"]);
  assert.deepEqual(on(st), ["move"]);
  st = tab(st); assert.deepEqual(on(st), ["extrude"]);
  assert.equal(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)?.id, "extrude", "the bar outlines the one Tab is on");
  st = tab(st); assert.deepEqual(on(st), ["extend"]);
  st = tab(st); assert.deepEqual(on(st), ["move"], "round to the first");
  st = tab(st, true); assert.deepEqual(on(st), ["extend"], "Shift+Tab goes back");
  assert.equal(st.op!.faceKind, "extend", "the choice is the operation's, as a click makes it");
});

test("a click on an option puts Tab where the click was, not where Tab last was", () => {
  let st = pushpull();
  st = tab(st); st = tab(st); // extend
  st = reduce(st, { type: "faceKind", kind: "move" }, env);
  assert.equal(st.op!.optionAt, undefined);
  st = tab(st); assert.deepEqual(on(st), ["extrude"], "the next after the one clicked");
});

test("a fillet's Tab: with one number Tab steps the ways (constant, variable, two distances); with several numbers Tab goes between them and Shift+Tab steps the ways", () => {
  const s = run(open("block-fillet-in_405.cad.json"), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(s);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (() => {
    const [a, b] = [sc.parts[p.a] as unknown as { at: number[] }, sc.parts[p.b] as unknown as { at: number[] }];
    return a.at[2] !== b.at[2] && Math.abs(a.at[0]! - 29.7) < 1e-3 && Math.abs(a.at[1]! - 8.37) < 1e-3;
  })())!;
  let st = reduce(createState({ ...s, click: { ...s.click, selection: [edge.ref] as never } }), { type: "begin", name: "edge" }, env);
  assert.deepEqual(on(st), ["constant"]);
  st = tab(st); assert.deepEqual(on(st), ["variable"]);
  // now several numbers: Tab goes to the next number, Shift+Tab steps the way
  const f = (x: AppState) => frameOf(x, { w: 800, h: 600 }).entry?.fields.findIndex((q) => q.active);
  st = reduce(st, { type: "typed", key: "5", shift: false }, env);
  assert.equal(f(st), 0);
  st = tab(st); assert.equal(f(st), 1, "Tab: the next number");
  assert.deepEqual(on(st), ["variable"]);
  st = tab(st, true); assert.deepEqual(on(st), ["constant"], "Shift+Tab: the previous way");
  // the right arrow goes between the numbers too
  st = reduce(st, { type: "sizeKind", kind: "variable" }, env);
  const before = f(st);
  st = reduce(st, { type: "typed", key: "ArrowRight", shift: false }, env);
  assert.notEqual(f(st), before);
});

import { createSession } from "../src/interaction/session.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { worldRef, drawnRef } from "../src/shared/ref.ts";
import { nextId } from "../src/operation/scene.ts";
import { homeCamera } from "../src/interaction/camera.ts";

test("the loft steps only through the choices between ways (smooth or ruled, along the normal or straight), not the switches", () => {
  let s = createSession(kernel);
  const r1 = drawRectangle(scene(s), worldRef("XY"), [-5, -5, 0], [5, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r1.command);
  const ref = drawnRef(nextId(scene(s), "p"));
  s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at: [0, 0, 20], u: [1, 0, 0], v: [0, 1, 0] } } as never);
  const r2 = drawRectangle(scene(s), ref as never, [-2, -2, 20], [2, 2, 20], [1, 0, 0], [0, 1, 0]);
  s = run(s, r2.command);
  let st = { ...createState({ ...s, click: { ...s.click, selection: [loopFaceRef(r1.lines), loopFaceRef(r2.lines)] as never } }), cam: homeCamera() };
  st = reduce(st, { type: "begin", name: "loft" }, env);
  const ways = ["smooth", "ruled", "normal", "straight"];
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).options.filter((o) => o.radio).map((o) => o.id), ways);
  assert.ok(frameOf(st, { w: 800, h: 600 }).options.some((o) => !o.radio && o.id === "split"), "the switches are shown, but Tab leaves them");
  const seen: string[] = [];
  for (let k = 0; k < 5; k++) { st = tab(st); seen.push(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)!.id); }
  assert.deepEqual(seen, ["ruled", "normal", "straight", "smooth", "ruled"]);
});
