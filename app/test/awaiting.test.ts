// A dimmed item of the menu can be pressed (`in_830`): it says what to select, the menu steps aside, and it runs by itself once that is selected; Esc gives it up. An operation chosen with nothing selected waits and says what it needs.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera, lookStraight, projector } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const env = { w: 900, h: 700, now: 0 };
const at = (ref: string, p: Vec3) => ({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref, kind: "corner", at: p } }) as never;
const session = run(createSession(kernel), { type: "batch", commands: [at("d/e_001.p0", [0, 0, 0]), at("d/e_001.p1", [20, 5, 0]), { type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref: "d/e_001.s0", kind: "line", a: "d/e_001.p0", b: "d/e_001.p1" } } as never] });
const start = (): AppState => ({ ...createState(session), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [10, 2.5, 0], distance: 60 } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const click = (st: AppState, p: Vec3) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count: 1, shift: false }, env);
const flat = (items: readonly { id: string; enabled: boolean; why: string | null; children?: readonly unknown[] }[]): { id: string; enabled: boolean; why: string | null }[] => items.flatMap((i) => [i, ...(i.children ? flat(i.children as never) : [])]);

test("Horizontal is dimmed with nothing selected; pressed, it asks for a line, and clicking the line makes the line horizontal by itself", () => {
  let st = start();
  st = reduce(st, { type: "menu", x: 300, y: 300 }, env);
  const item = flat(st.menu!.items as never).find((i) => i.id === "c:horizontal");
  assert.ok(item && !item.enabled && /^select a line/.test(item.why ?? ""), `${item?.why}`);
  st = reduce(st, { type: "runAction", id: "why:c:horizontal" }, env);
  assert.equal(st.awaiting?.id, "c:horizontal");
  assert.equal(st.menu, null, "the menu steps aside");
  assert.match(st.session.message ?? "", /Select a line, or two points first: click it/);
  assert.match(frameOf(st, env).confirm?.text ?? "", /^Select a line, or two points first/, "the bubble says what to select");
  st = click(st, [10, 2.5, 0]);
  assert.equal(st.awaiting, null, "it was run");
  assert.ok(scene(st.session).relations.some((r) => r.kind === "horizontal"), "the line is held horizontal");
});

test("Esc gives up what an item waits for; an item whose reason is not a selection is only explained", () => {
  let st = start();
  st = reduce(st, { type: "menu", x: 300, y: 300 }, env);
  st = reduce(st, { type: "runAction", id: "why:c:horizontal" }, env);
  assert.ok(st.awaiting);
  st = reduce(st, { type: "escape" }, env);
  assert.equal(st.awaiting, null);
  st = reduce(st, { type: "menu", x: 300, y: 300 }, env);
  const redo = flat(st.menu!.items as never).find((i) => i.id === "redo");
  assert.ok(redo && !redo.enabled);
  const said = reduce(st, { type: "runAction", id: "why:redo" }, env);
  assert.equal(said.awaiting, null, "nothing to select");
  assert.ok(said.menu, "the menu stays, as before");
  assert.match(said.session.message ?? "", /nothing to redo/);
});

test("an operation chosen with nothing selected says what it needs, not 'what it needs'", () => {
  let st = start();
  st = reduce(st, { type: "begin", name: "loft" }, env);
  assert.ok(st.picking?.why, "it knows what is missing");
  const text = frameOf(st, env).confirm?.text ?? "";
  assert.ok(/^Select /.test(text), text);
  assert.notEqual(text, "Click what it needs");
});
