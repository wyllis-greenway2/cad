// The ring menu's tooltips and navigation (`in_493`): every tooltip is one or two words, every category opens, the Actions area, select all bodies.
import test from "node:test";
import assert from "node:assert/strict";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, selection } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { nextId } from "../src/operation/scene.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { iconSvg } from "../src/ui/icons.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
const XY = worldRef("XY");
type Item = { id: string; label: string; icon: string; enabled: boolean; why: string | null; children?: Item[] };
const every = (items: Item[]): Item[] => items.flatMap((i) => [i, ...(i.children ? every(i.children) : [])]);

function states(): { name: string; st: AppState }[] {
  const out: { name: string; st: AppState }[] = [];
  let s = createSession(kernel);
  out.push({ name: "empty", st: { ...createState(s), cam: homeCamera() } });
  const r = drawRectangle(scene(s), XY, [0, 0, 0], [20, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), XY, [40, 0, 0], 3);
  s = run(s, c.command);
  const pick = (refs: string[]) => ({ ...createState({ ...s, click: { ...s.click, selection: refs as never } }), cam: homeCamera() });
  out.push({ name: "figure", st: pick([loopFaceRef(r.lines)]) });
  out.push({ name: "two lines", st: pick([r.lines[0]!, r.lines[1]!]) });
  out.push({ name: "circle", st: pick([c.circle]) });
  out.push({ name: "line and circle", st: pick([r.lines[0]!, c.circle]) });
  const solid = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 5 } } });
  const body = Object.values(scene(solid).parts).find((p) => p.kind === "body")!;
  out.push({ name: "body", st: { ...createState({ ...solid, click: { ...solid.click, selection: [body.ref] as never } }), cam: homeCamera() } });
  return out;
}

test("every tooltip of the ring is one or two words, in every state, and every ring opens (a category never goes dead)", () => {
  for (const { name, st } of states()) {
    const items = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[];
    for (const i of every(items)) {
      assert.ok(i.label.trim().split(/\s+/).length <= 2 && !/[():/]/.test(i.label), `${name}: "${i.label}" (${i.id})`);
    }
    for (const c of items.filter((x) => x.children)) assert.ok(c.enabled, `${name}: ${c.label} opens`);
  }
});

test("the Actions area holds undo, redo and delete; the Delete bubble is gone from the top of the ring (`in_493`)", () => {
  const { st } = states().find((x) => x.name === "figure")!;
  const items = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[];
  assert.ok(!items.some((i) => i.id === "delete"), "not at the top");
  const actions = items.find((i) => i.id === "actions")!;
  assert.equal(actions.label, "Actions");
  assert.deepEqual(actions.children!.map((i) => i.id), ["undo", "redo", "delete"]);
  assert.ok(actions.children!.find((i) => i.id === "undo")!.enabled, "there is something to undo");
  assert.ok(!actions.children!.find((i) => i.id === "redo")!.enabled);
  // undo and redo work from the ring
  const gone = reduce(st, { type: "runAction", id: "undo" }, env);
  assert.ok(scene(gone.session).steps.length === 0);
  const again = reduce(gone, { type: "runAction", id: "redo" }, env);
  assert.ok(again.session.history.cursor > gone.session.history.cursor);
});

test("a dimmed bubble is pressed and says why, the ring stays open (`in_493`)", () => {
  const { st } = states().find((x) => x.name === "empty")!;
  const open = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env);
  const said = reduce(open, { type: "runAction", id: "why:undo" }, env);
  assert.match(said.session.message ?? "", /nothing to undo/);
  assert.ok(said.menu, "the ring is still open");
});

test("Select has All bodies: every body is selected; with none it says so (`in_493`)", () => {
  const { st: none } = states().find((x) => x.name === "empty")!;
  const items = every(reduce(none, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[]);
  assert.ok(!items.find((i) => i.id === "select:bodies")!.enabled, "dimmed with no body");
  const { st } = states().find((x) => x.name === "body")!;
  const cleared = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [] } } };
  const done = reduce(cleared, { type: "runAction", id: "select:bodies" }, env);
  const bodies = Object.values(scene(done.session).parts).filter((p) => p.kind === "body").map((p) => p.ref);
  assert.deepEqual(selection(done.session), bodies);
  assert.ok(bodies.length > 0);
});

test("paste and push / pull have icons of their own (`in_493`)", () => {
  const items = every(reduce(states()[1]!.st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[]);
  assert.equal(items.find((i) => i.id === "clipboard:paste")!.icon, "paste");
  assert.notEqual(iconSvg("paste"), iconSvg("copy"));
  assert.ok(iconSvg("pushpull").split("<path").length <= 4, "simple: a face and an arrow");
});

import { appRows } from "../src/interaction/appmenu.ts";
test("every row of the ⋯ list is one or two words, with every optional row there and in each state (`in_496`)", () => {
  for (const mode of ["auto", "pan", "zoom"] as const) for (const flag of [true, false]) {
    for (const r of appRows(mode, "abc123", { exportStl: flag, exportBody: true, matesOff: 2, clearAnswers: true }, flag, 0.3, flag, 0.25)) {
      assert.ok(r.label.replace(/^✓ /, "").trim().split(/\s+/).length <= 2 && !/[():]/.test(r.label), `"${r.label}" (${r.id})`);
    }
  }
});
test("a dimmed row says why when pressed, and has no long tooltip (`in_496`)", () => {
  const { st } = states()[0]!;
  const said = reduce(st, { type: "runAction", id: "say:nothing to export yet: make a body" }, env);
  assert.equal(said.session.message, "nothing to export yet: make a body");
});

test("Esc ends the ring (and the ⋯ list): the menu is gone from the state and what is selected stays (`in_497`)", () => {
  const { st } = states().find((x) => x.name === "figure")!;
  const open = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env);
  assert.ok(open.menu);
  const sel = selection(open.session);
  const closed = reduce(open, { type: "escape" }, env);
  assert.equal(closed.menu, null);
  assert.deepEqual(selection(closed.session), sel, "the first Esc only ends the menu");
  assert.equal(selection(reduce(closed, { type: "escape" }, env).session).length, 0, "the next clears the selection");
});
