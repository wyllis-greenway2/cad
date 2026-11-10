// Layered selection groups (`in_257`, `dec_selection_tools` section 3).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { createSession, run, scene, selection, clickOn, undoLast, saveText, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { membersOf, chainOf, groupsOf } from "../src/operation/groups.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { keyIntents } from "../src/interaction/input/keys.ts";
import { settings } from "../src/shared/settings.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const XY = worldRef("XY");

function sketch(): { s: Session; c: Ref[]; l: Ref[] } {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [10, 10, 0], [50, 30, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return { s, c: r.corners as Ref[], l: r.lines as Ref[] };
}
const select = (st: AppState, refs: Ref[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs } } });
const group = (st: AppState): AppState => reduce(st, { type: "group" }, env);

test("grouping and ungrouping are commands: undone, saved and opened again", () => {
  const { s, c } = sketch();
  const g = run(s, { type: "group", id: nextId(scene(s), "g"), items: [c[0]!, c[1]!] });
  assert.equal(g.message, null);
  assert.equal(groupsOf(scene(g)).length, 1);
  assert.deepEqual(membersOf(scene(g), groupsOf(scene(g))[0]!.id), [c[0], c[1]]);
  const reopened = openSession(kernel, saveText(g));
  assert.ok(reopened.ok);
  if (reopened.ok) assert.equal(groupsOf(scene(reopened.value)).length, 1, "the group is in the file");
  const undone = undoLast(g);
  assert.equal(groupsOf(scene(undone)).length, 0);
  assert.ok(run(s, { type: "group", id: "g_99", items: [c[0]!] }).message, "one thing is not a group");
  assert.ok(run(g, { type: "group", id: "g_98", items: [c[0]!, c[2]!] }).message, "a part is in one group only");
});

test("a click on a member selects the whole group; a second click goes one level in; Shift takes the whole group in or out", () => {
  const { s, c } = sketch();
  let g = run(s, { type: "group", id: "g_1", items: [c[0]!, c[1]!] });
  g = run(g, { type: "group", id: "g_2", items: ["g_1", c[2]!] });
  assert.deepEqual(chainOf(scene(g), c[0]!).map((x) => x.id), ["g_2", "g_1"]);
  let t = clickOn(g, [c[0]!]);
  assert.deepEqual([...selection(t)].sort(), [c[0], c[1], c[2]].sort(), "the outermost group");
  t = clickOn(t, [c[0]!]);
  assert.deepEqual([...selection(t)].sort(), [c[0], c[1]].sort(), "one level in: the inner group");
  t = clickOn(t, [c[0]!]);
  assert.deepEqual(selection(t), [c[0]], "then the part");
  // another part, then Shift on a member adds its whole group, Shift again takes it out
  t = clickOn(clickOn(g, [c[3]!]), [c[1]!], true);
  assert.equal(selection(t).length, 4);
  t = clickOn(t, [c[1]!], true);
  assert.deepEqual(selection(t), [c[3]]);
});

test("ungroup breaks only the outermost group: the group inside it stays", () => {
  const { s, c } = sketch();
  let st = select({ ...createState(s) }, [c[0]!, c[1]!]);
  st = group(st);
  assert.equal(groupsOf(scene(st.session)).length, 1);
  st = select(st, [c[0]!, c[1]!, c[2]!]);
  st = group(st);
  assert.equal(groupsOf(scene(st.session)).length, 2);
  st = reduce(st, { type: "ungroup" }, env);
  const left = groupsOf(scene(st.session));
  assert.equal(left.length, 1, "the outer one is gone");
  assert.deepEqual(membersOf(scene(st.session), left[0]!.id), [c[0], c[1]], "the inner one still holds its two");
  assert.equal(st.session.message, "group broken");
  // a part that is not wholly a group cannot be ungrouped
  const none = reduce(select(st, [c[3]!]), { type: "ungroup" }, env);
  assert.equal(none.session.message, "select a whole group to break it");
  assert.equal(groupsOf(scene(none.session)).length, 1);
});

test("grouping a selection that holds a group groups that group, whole; fewer than two things says so", () => {
  const { s, c } = sketch();
  let st = group(select({ ...createState(s) }, [c[0]!, c[1]!]));
  st = select(st, [c[0]!, c[3]!]); // one member of the group and a free part
  st = group(st);
  const gs = groupsOf(scene(st.session));
  assert.equal(gs.length, 2);
  assert.deepEqual(membersOf(scene(st.session), gs[1]!.id).sort(), [c[0], c[1], c[3]].sort());
  assert.equal(group(select(st, [c[3]!])).session.message, "select two or more things to group");
  assert.equal(group(select(createState(s), [worldRef("O"), c[0]!])).session.message, "the world's planes and axes cannot be grouped");
});

test("deleting parts takes them out of their groups, and a group left with one thing is dissolved", () => {
  const { s, c, l } = sketch();
  let g = run(s, { type: "group", id: "g_1", items: [l[0]!, l[1]!] });
  g = run(g, { type: "group", id: "g_2", items: ["g_1", l[2]!] });
  const d = run(g, { type: "deleteParts", refs: [l[0]!] });
  const gs = groupsOf(scene(d));
  assert.equal(gs.length, 1, "g_1 had one line left: it is dissolved into g_2");
  assert.deepEqual(membersOf(scene(d), gs[0]!.id).filter((r) => r === l[1] || r === l[2]).length, 2);
  void c;
});

test("the keys, the ⋯ list, the ring and the Groups panel", () => {
  const { s, c } = sketch();
  assert.deepEqual(keyIntents({ kind: "key", key: "g", mods: { shift: false, ctrl: true, alt: false } } as never, settings.input), [{ type: "group" }]);
  assert.deepEqual(keyIntents({ kind: "key", key: "g", mods: { shift: true, ctrl: true, alt: false } } as never, settings.input), [{ type: "ungroup" }]);
  let st = select({ ...createState(s) }, [c[0]!, c[1]!]);
  const items = (x: AppState) => reduce(x, { type: "menu", x: 10, y: 10, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]);
  assert.equal(items(st).find((i) => i.id === "select:group")!.enabled, true);
  assert.equal(items(st).find((i) => i.id === "select:ungroup")!.enabled, false);
  st = reduce(st, { type: "runAction", id: "select:group" }, env);
  assert.equal(items(st).find((i) => i.id === "select:ungroup")!.enabled, true);
  st = reduce(st, { type: "panel", name: "groups" }, env);
  const f = frameOf(st, env);
  assert.equal(f.panel?.kind, "groups");
  assert.deepEqual(f.panel?.rows.map((r) => [r.label, r.active]), [["Group 1 · 2 parts", true]]);
  const id = f.panel!.rows[0]!.id;
  const other = reduce(select(st, []), { type: "panelRow", id, act: "select" }, env);
  assert.deepEqual([...selection(other.session)].sort(), [c[0], c[1]].sort());
  const broken = reduce(st, { type: "panelRow", id, act: "remove" }, env);
  assert.equal(groupsOf(scene(broken.session)).length, 0);
});

test("a drag rectangle that touches part of a group takes the whole group", () => {
  const { s } = sketch();
  const corners = Object.values(scene(s).parts).filter((p) => p.kind === "corner" && p.origin === "drawn").map((p) => p.ref);
  const [a, b] = [corners[0]!, corners[1]!];
  let st: AppState = { ...createState(run(s, { type: "group", id: "g_1", items: [a, b] })), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [30, 20, 0] } };
  const pa = scene(st.session).parts[a]!;
  assert.equal(pa.kind, "corner");
  const at = pa.kind === "corner" ? pa.at : ([0, 0, 0] as [number, number, number]);
  const px = projector(st.cam, env.w, env.h).project(at);
  st = reduce(st, { type: "hold", x: px[0] - 6, y: px[1] - 6, shift: false }, env);
  st = reduce(st, { type: "orbit", dx: 6, dy: 6, x: px[0], y: px[1] }, env);
  st = reduce(st, { type: "orbit", dx: 6, dy: 6, x: px[0] + 6, y: px[1] + 6 }, env);
  st = reduce(st, { type: "dragEnd" }, env);
  assert.ok(selection(st.session).includes(a) && selection(st.session).includes(b), "the corner in the rectangle brings the one it is grouped with");
});
