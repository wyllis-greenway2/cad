// The operation bar's options and Tab stepping (`in_557`, `q_ui_unification`).
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
  assert.equal(st.optionAt, null);
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

test("the loft: Tab goes through every option, choosing the ways it lands on; Shift+Enter flips the switch it is on", () => {
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
  assert.deepEqual(seen, ["ruled", "normal", "straight", "split", "start:0"], "Tab goes through every option; it chooses a way by landing on it");
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.options.find((o) => o.id === "ruled")!.on, true, "the ruled way was chosen as Tab passed it");
  const split = (x: AppState) => frameOf(x, { w: 800, h: 600 }).options.find((o) => o.id === "split")!.on;
  assert.equal(split(st), false, "landing on a switch does not flip it");
  st = tab(st, true); // back to split
  assert.equal(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)!.id, "split");
  st = reduce(st, { type: "typed", key: "Enter", shift: true }, env);
  assert.equal(split(st), true, "Shift+Enter flips the switch the focus is on");
  assert.ok(st.op, "and does not apply the operation");
});

import { drawSquaredRectangle } from "../src/operation/build.ts";
import { selection } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
const box = (ses: Session, x: number, w: number, h: number): Session => {
  const r = drawSquaredRectangle(scene(ses), worldRef("XY"), [x, 0, 0], [x + w, w, 0], [1, 0, 0], [0, 1, 0]);
  ses = run(ses, r.command);
  return run(ses, { type: "addStep", step: { id: nextId(scene(ses), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
};
const bodiesOf = (ses: Session) => Object.values(scene(ses).parts).filter((p) => p.kind === "body");

test("Select similar's rules are in the bar: Tab lands on each, Shift+Enter flips it, Enter closes them and keeps the selection (`in_563`)", () => {
  const ses = box(createSession(kernel), 0, 10, 10);
  const edges = (Object.values(scene(ses).parts) as Part[]).filter((p) => p.kind === "line" && p.origin === "body");
  let st = reduce({ ...createState({ ...ses, click: { ...ses.click, selection: [edges[0]!.ref] as never } }), cam: homeCamera() }, { type: "runAction", id: "select:similar" }, env);
  const n = selection(st.session).length;
  assert.ok(n > 1);
  let f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.options.length >= 2 && f.options.every((o) => o.group === "Similar" && !o.radio));
  assert.equal(f.confirm?.kind, "similar", "the bar is there, with its check");
  assert.match(f.confirm!.text!, /similar/);
  const rule = f.options[0]!;
  st = tab(st);
  assert.equal(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)?.id, f.options[0]!.id, "Tab lands on the first rule");
  st = reduce(st, { type: "typed", key: "Enter", shift: true }, env);
  assert.notEqual(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.id === rule.id)!.on, rule.on, "Shift+Enter flipped it");
  assert.equal(frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)?.id, rule.id, "and the focus stays");
  st = reduce(st, { type: "typed", key: "Enter", shift: false }, env);
  assert.equal(frameOf(st, { w: 800, h: 600 }).options.length, 0, "Enter puts the rules away");
  assert.ok(selection(st.session).length >= 1, "what is selected stays");
});

test("Cut's parts and join are in the bar: Tab lands on each, Shift+Enter keeps or tosses a part, Enter makes the cut (`in_563`)", () => {
  let ses = box(box(createSession(kernel), 0, 10, 10), 40, 10, 10);
  const b = bodiesOf(ses)[1]!;
  const mv = startOp(scene(ses), [b.ref], "move");
  if (!mv.ok) return assert.fail("no move");
  ses = run(ses, opCommand(scene(ses), { ...mv.op, axis: 0, value: -35 })!); // the second overlaps the first
  const [a2, b2] = bodiesOf(ses);
  let st = reduce({ ...createState({ ...ses, click: { ...ses.click, selection: [a2!.ref, b2!.ref] as never } }), cam: homeCamera() }, { type: "runAction", id: "combine:parts" }, env);
  let f = frameOf(st, { w: 800, h: 600 });
  assert.ok(f.options.length >= 3 && f.options.every((o) => o.group === "Cut"), `the parts and the join: ${f.options.map((o) => o.id)}`);
  assert.equal(f.confirm?.label, "Cut");
  st = tab(st);
  const first = frameOf(st, { w: 800, h: 600 }).options.find((o) => o.focus)!;
  assert.ok(first.id.startsWith("cut:"));
  st = reduce(st, { type: "typed", key: "Enter", shift: true }, env);
  const after = frameOf(st, { w: 800, h: 600 }).options.find((o) => o.id === first.id)!;
  assert.notEqual(after.on, first.on, "a part kept is tossed, or the other way");
  assert.ok(st.cut, "and the cut is still open");
});
