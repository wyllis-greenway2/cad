// The ring menu's tooltips and navigation (`in_538`): every tooltip is one or two words, every category opens, the Actions area, select all bodies.
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

test("Delete is one item of the ring with no list under it, and undo and redo are in the ⋯ list (`in_1268`)", () => {
  const { st } = states().find((x) => x.name === "figure")!;
  const items = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[];
  assert.ok(!items.some((i) => i.id === "actions"), "no Actions list");
  const del = items.find((i) => i.id === "delete")!;
  assert.ok(del && !del.children && del.icon === "trash", "a trash bubble that does it at once");
  assert.ok(!every(items).some((i) => i.id === "undo" || i.id === "redo"), "undo and redo are not in the ring");
  const rows = appRows("", { undo: true, redo: false });
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.id, r.enabled]), [["undo", true], ["redo", false]]);
  // undo and redo still work as actions
  const gone = reduce(st, { type: "runAction", id: "undo" }, env);
  assert.ok(scene(gone.session).steps.length === 0);
  const again = reduce(gone, { type: "runAction", id: "redo" }, env);
  assert.ok(again.session.history.cursor > gone.session.history.cursor);
});

test("a dimmed bubble is pressed and says why (`in_538`; Delete now waits for what to click, `in_951`)", () => {
  const { st } = states().find((x) => x.name === "empty")!;
  const open = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env);
  const said = reduce(open, { type: "runAction", id: "why:delete" }, env);
  assert.match(said.session.message ?? "", /[Ss]elect something to delete/);
});

test("Select has All bodies: every body is selected; with none it says so (`in_538`)", () => {
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

test("paste and push / pull have icons of their own (`in_538`)", () => {
  const items = every(reduce(states()[1]!.st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[]);
  assert.equal(items.find((i) => i.id === "clipboard:paste")!.icon, "paste");
  assert.notEqual(iconSvg("paste"), iconSvg("copy"));
  assert.ok(iconSvg("pushpull").split("<path").length <= 4, "simple: a face and an arrow");
});

import { appRows, fabricateRows } from "../src/interaction/appmenu.ts";
test("every row of the ⋯ list is one or two words, with every optional row there and in each state (`in_541`)", () => {
  for (const flag of [true, false]) {
    for (const r of [...appRows("abc123", { export: flag, clearAnswers: true }), ...fabricateRows({ laser: flag, laserLayers: flag, laserTable: true }, 0.25)]) {
      assert.ok(r.label.replace(/^✓ /, "").trim().split(/\s+/).length <= 2 && !/[():]/.test(r.label), `"${r.label}" (${r.id})`);
    }
  }
});
test("a dimmed row says why when pressed, and has no long tooltip (`in_541`)", () => {
  const { st } = states()[0]!;
  const said = reduce(st, { type: "runAction", id: "say:nothing to export yet: make a body, or draw something" }, env);
  assert.equal(said.session.message, "nothing to export yet: make a body, or draw something");
});

test("Esc ends the ring (and the ⋯ list): the menu is gone from the state and what is selected stays (`in_542`)", () => {
  const { st } = states().find((x) => x.name === "figure")!;
  const open = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env);
  assert.ok(open.menu);
  const sel = selection(open.session);
  const closed = reduce(open, { type: "escape" }, env);
  assert.equal(closed.menu, null);
  assert.deepEqual(selection(closed.session), sel, "the first Esc only ends the menu");
  assert.equal(selection(reduce(closed, { type: "escape" }, env).session).length, 0, "the next clears the selection");
});

import { actionsFor } from "../src/interaction/actions.ts";
import { CONSTRAINT_ENTRIES, resolveEntry } from "../src/interaction/constraintlist.ts";
test("nothing is left out of the ring: every relation that fits the selection is made by an entry of the list, which is lit exactly when one of what it stands for can be applied (`in_661`, `in_975`)", () => {
  let blocked = 0;
  for (const { name, st } of states()) {
    const items = reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as Item[];
    const kids = every(items.find((i) => i.id === "constraints")!.children!);
    const acts = actionsFor(scene(st.session), selection(st.session)).filter((x) => x.group === "relation");
    for (const a of acts) assert.ok(CONSTRAINT_ENTRIES.some((e) => e.of.includes(a.id)), `${name}: ${a.id} is in an entry`);
    for (const e of CONSTRAINT_ENTRIES) {
      const kid = kids.find((k) => k.id === e.id)!;
      assert.ok(kid, `${name}: ${e.id} is in the ring`);
      assert.equal(kid.enabled, !!resolveEntry(e, acts), `${name}: ${e.id} is clickable only when something it stands for can be applied`);
      if (!kid.enabled) { blocked++; assert.match(kid.why ?? "", /^select /, `${name}: ${e.id} says what to select`); }
    }
  }
  assert.ok(blocked > 0, "the test met an entry that cannot be applied");
});

test("the Constraints ring is one flat list of the same entries whatever is selected, each once, no rings inside it: dimmed unless the selection fits, with what to select said (`in_666`, `in_975`)", () => {
  const kidsOf = (st: AppState) => reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items.find((i) => i.id === "constraints")!.children!;
  const shapes = states().map(({ st }) => JSON.stringify(kidsOf(st).map((i) => i.id)));
  assert.equal(new Set(shapes).size, 1, "no constraint comes or goes with the selection");
  const { st } = states().find((x) => x.name === "empty")!;
  const kids = kidsOf(st) as Item[];
  assert.ok(kids.every((k) => !k.children), "flat: no ring inside it");
  assert.deepEqual(kids.map((k) => k.label), ["Horizontal", "Vertical", "Parallel", "Perpendicular", "Angle", "Coincident", "On", "Tangent", "Concentric", "Equal", "Dimension", "Fix", "Hard body", "Fixed body"]);
  assert.equal(new Set(kids.map((k) => k.label)).size, kids.length, "each once: tangent is tangent");
  assert.ok(kids.filter((k) => k.id.startsWith("c:")).every((k) => !k.enabled && k.why), "with nothing selected all are dimmed and say what to select");
  assert.match(kids.find((k) => k.id === "c:parallel")!.why!, /select two lines/);
  const litFor = (name: string) => (kidsOf(states().find((x) => x.name === name)!.st) as Item[]).filter((k) => k.enabled && k.id.startsWith("c:")).map((k) => k.id.slice(2));
  const lines = litFor("two lines");
  for (const want of ["parallel", "perpendicular", "equal", "angle"]) assert.ok(lines.includes(want), `two lines: ${want} (${lines})`);
  assert.ok(!lines.includes("coincident"), "two lines are not points");
  assert.ok(litFor("line and circle").includes("tangent"), "a line and a circle: tangent");
  assert.ok(litFor("circle").includes("dimension"), "a circle: its size");
});

test("an entry makes the relation or mate the selection fits: Parallel on two lines is the parallel relation (`in_975`)", () => {
  const two = states().find((x) => x.name === "two lines")!.st;
  const made = reduce(two, { type: "runAction", id: "c:parallel" }, env);
  assert.ok(scene(made.session).relations.some((r) => r.kind === "parallel"), "the parallel relation");
  const none = states().find((x) => x.name === "empty")!.st;
  assert.equal(scene(reduce(none, { type: "runAction", id: "c:parallel" }, env).session).relations.length, 0, "nothing is made of nothing");
});
