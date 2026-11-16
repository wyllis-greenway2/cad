// Hidden bodies (`dec_hidden_bodies`, `in_489`, `in_497`): the command, the saved file, what the pointer can reach.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run, openSession, saveText } from "../src/interaction/session.ts";
import { undoLast } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { candidatesAt } from "../src/interaction/picking.ts";
import { projector, homeCamera } from "../src/interaction/camera.ts";

await kernel.init();
const XY = worldRef("XY");
function two() {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const b = drawRectangle(scene(s), XY, [30, 0, 0], [40, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, b.command);
  s = run(s, { type: "addStep", step: { id: "s_101", type: "extrude", parts: b.lines, params: { depth: 10, mode: "new" } } } as never);
  return s;
}
const A = "b/x_s_100/o", B = "b/x_s_101/o";

test("hiding a body is a command that is kept, undone and saved with the file", () => {
  let s = two();
  assert.equal(scene(s).hiddenBodies, undefined);
  s = run(s, { type: "hideBodies", refs: [B], hidden: true } as never);
  assert.deepEqual(scene(s).hiddenBodies, [B]);
  assert.equal(scene(s).steps.length, 2, "no step is made");
  const again = openSession(kernel, saveText(s));
  assert.ok(again.ok);
  assert.deepEqual(again.ok && scene(again.value).hiddenBodies, [B], "it is in the file");
  s = run(s, { type: "hideBodies", refs: [A, B], hidden: true } as never);
  assert.deepEqual(scene(s).hiddenBodies, [A, B]);
  s = run(s, { type: "hideBodies", refs: [A], hidden: false } as never);
  assert.deepEqual(scene(s).hiddenBodies, [B]);
  s = run(s, { type: "hideBodies", refs: [B], hidden: false } as never);
  assert.equal(scene(s).hiddenBodies, undefined, "none hidden: no list");
  s = undoLast(s);
  assert.deepEqual(scene(s).hiddenBodies, [B], "undone");
});

test("a hidden body, and its faces, edges and corners, cannot be pointed at, and hides nothing behind it", () => {
  let s = two();
  const cam = { ...homeCamera(), target: [20, 5, 5] as [number, number, number], distance: 90 };
  const pr = projector(cam, 800, 600);
  const [x, y] = pr.project([40, 10, 10]); // a corner of the second body
  const [cx, cy] = pr.project([5, 5, 10]); // the middle of the top of the first
  const before = candidatesAt(scene(s), pr.view(x, y), { pointTol: 14, lineTol: 8 });
  assert.ok(before.some((c) => (scene(s).parts[c.ref] as { of?: string }).of === B), "the corner of the second body is under the pointer");
  s = run(s, { type: "hideBodies", refs: [B], hidden: true } as never);
  const after = candidatesAt(scene(s), pr.view(x, y), { pointTol: 14, lineTol: 8 });
  assert.ok(after.every((c) => (scene(s).parts[c.ref] as { of?: string }).of !== B && c.ref !== B), `nothing of the hidden body: ${after.map((c) => c.ref).join(" ")}`);
  const first = candidatesAt(scene(s), pr.view(cx, cy), { pointTol: 14, lineTol: 8 });
  assert.ok(first.some((c) => (scene(s).parts[c.ref] as { of?: string }).of === A), "the first body can still be pointed at");
});

// ---- the Bodies list, the eye, the frame ----
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { panelOf } from "../src/interaction/panels.ts";
const env = { w: 800, h: 600, now: 0 };
const state = () => createState(two());
const hiddenOf = (st: ReturnType<typeof state>) => scene(st.session).hiddenBodies;

test("the Bodies list shows an eye for each body and the buttons for the whole list", () => {
  let s = two();
  let p = panelOf("bodies", scene(s), [])!;
  assert.deepEqual(p.rows.map((r) => [r.id, r.hidden, r.removable]), [[A, false, true], [B, false, true]]);
  assert.deepEqual(p.actions!.map((a) => a.id), ["bodies:all", "bodies:none", "bodies:hide", "bodies:show"]);
  s = run(s, { type: "hideBodies", refs: [B], hidden: true } as never);
  p = panelOf("bodies", scene(s), [])!;
  assert.deepEqual(p.rows.map((r) => r.hidden), [false, true]);
});

test("the eye of a row hides and shows a body; hide all and show all do the whole list; hiding takes a body out of the selection", () => {
  let st = state();
  st = reduce(st, { type: "panelRow", id: A, act: "select" }, env);
  assert.deepEqual([...st.session.click.selection], [A]);
  st = reduce(st, { type: "panelRow", id: A, act: "hide" }, env);
  assert.deepEqual(hiddenOf(st), [A], "hidden");
  assert.deepEqual([...st.session.click.selection], [], "a hidden body is not selected");
  st = reduce(st, { type: "panelRow", id: A, act: "hide" }, env);
  assert.equal(hiddenOf(st), undefined, "shown again");
  st = reduce(st, { type: "panelAction", id: "bodies:hide" }, env);
  assert.deepEqual(hiddenOf(st), [A, B], "hide all");
  st = reduce(st, { type: "panelAction", id: "bodies:all" }, env);
  assert.deepEqual([...st.session.click.selection], [], "select all takes the bodies that are shown: none");
  st = reduce(st, { type: "panelAction", id: "bodies:show" }, env);
  assert.equal(hiddenOf(st), undefined, "show all");
  st = reduce(st, { type: "panelAction", id: "bodies:all" }, env);
  assert.deepEqual([...st.session.click.selection].sort(), [A, B], "select all");
  st = reduce(st, { type: "panelAction", id: "bodies:none" }, env);
  assert.deepEqual([...st.session.click.selection], [], "select none");
});

test("the cross of a row deletes the body (with its steps); the other body stays", () => {
  let st = state();
  st = reduce(st, { type: "panelRow", id: B, act: "remove" }, env);
  const bodies = Object.values(scene(st.session).parts).filter((p) => p.kind === "body");
  assert.equal(bodies.length, 1, "one body left");
  assert.equal(scene(st.session).steps.length, 1, "its step went with it");
  assert.equal(Math.round((bodies[0] as unknown as { volume: number }).volume), 1000);
});

test("the frame says which triangles are hidden, and gives each body an eye", () => {
  let st = state();
  const quiet = frameOf(st, { w: 800, h: 600 });
  assert.equal(quiet.hiddenBodies, null, "none hidden");
  assert.equal(quiet.eyesQuiet, false, "nothing is in use");
  assert.deepEqual(quiet.bodyEyes.map((e) => [e.ref, e.hidden, e.corners.length]), [[A, false, 8], [B, false, 8]]);
  st = reduce(st, { type: "panelRow", id: B, act: "hide" }, env);
  const f = frameOf(st, { w: 800, h: 600 });
  assert.equal(f.hiddenBodies?.length, 1, "one hidden body");
  const tris = f.hiddenBodies![0]!.tris.reduce((a, [, n]) => a + n, 0);
  const all = (st.session.outcome.kernel!.mesh!.triangles.length);
  assert.ok(tris > 0 && tris < all, `its triangles are some of the mesh's: ${tris} of ${all}`);
  assert.deepEqual(f.bodyEyes.map((e) => e.hidden), [false, true]);
});
