// The gear's icon is the only way to Edit, Helix and Mesh (`in_771`), it is there for the body of a gear extruded from its outline too (`in_770`), the meshing gear is drawn in orange before the second click, and Helix from the icon starts at 15 degrees.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, selection } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { gearRefs, gearOfSelection } from "../src/operation/gearscene.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Op } from "../src/interaction/operations.ts";
import { entryOf, previewFor } from "../src/interaction/entry.ts";
import { projector, lookStraight, homeCamera } from "../src/interaction/camera.ts";
import type { Vec3 } from "../src/math/vec.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const spec: GearSpec = { teeth: 20, module: 2, bore: 5 };
const AT: Vec3 = [20, 0, 0];
const extruded = () => {
  const s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: AT, spec });
  const face = loopFaceRef(gearRefs({ id: "g_001", plane: worldRef("XY"), at: AT, spec }).lines);
  return runOp(s, { ...(startOp(scene(s), [face as never], "extrude") as unknown as { op: Op }).op, value: 10 })!.session;
};
const top = (s = extruded()): AppState => ({ ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 0, 0] } });
const px = (st: AppState, p: Vec3) => projector(st.cam, env.w, env.h).project(p);
const move = (st: AppState, p: Vec3) => reduce(st, { type: "hover", x: px(st, p)[0], y: px(st, p)[1] }, env);
const click = (st: AppState, p: Vec3, count = 1) => reduce(st, { type: "click", x: px(st, p)[0], y: px(st, p)[1], count, shift: false }, env);
const bodyOf = (st: AppState) => Object.values(scene(st.session).parts).find((p) => p.kind === "body")!.ref;
const select = (st: AppState, refs: string[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs as never } } });

test("the body of a gear extruded from its outline is a gear to the icon: Edit, Mesh and Helix work on it, and Mesh opens the number box", () => {
  const st = select(top(), [bodyOf(top())]);
  assert.equal(gearOfSelection(scene(st.session), bodyOf(st))?.id, "g_001");
  const chip = frameOf(st, env).gearChip!;
  assert.deepEqual(chip.items.map((i) => i.id), ["gear:edit", "gear:helix", "gear:mesh", "gear:meshrack", "gear:meshring"]);
  const m = reduce(st, { type: "runAction", id: "gear:mesh" }, env);
  assert.ok(m.tool?.gear?.mesh, "the Mesh gear tool is on");
  assert.equal(frameOf(m, env).entry?.panel, "Gear (meshing)", "and its box is shown");
  assert.deepEqual(frameOf(m, env).entry!.fields.map((f) => f.label).slice(0, 4), ["Teeth", "Ratio", "Angle", "Bore"]);
  // a face of the body is the gear too
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !(p as { curved?: unknown }).curved)!;
  assert.equal(gearOfSelection(scene(st.session), face.ref)?.id, "g_001");
});

test("the Sketch ring has no Edit, Helix or Mesh: they are on the gear's icon", () => {
  const st = select(top(), [bodyOf(top())]);
  const ids = (reduce(st, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items as { id: string; children?: unknown[] }[]).flatMap(function walk(i: any): string[] { return [i.id, ...(i.children ?? []).flatMap(walk)]; });
  assert.ok(ids.includes("tool:gear"));
  for (const gone of ["gear:edit", "gear:helix", "gear:mesh", "gear:meshrack", "gear:meshring"]) assert.ok(!ids.includes(gone), gone);
});

test("Helix from the icon puts 15 degrees on a gear that has none, the box opens on that number and takes the keyboard there; a gear that has a helix keeps it", () => {
  const st = select(top(), [bodyOf(top())]);
  const h = reduce(st, { type: "runAction", id: "gear:helix" }, env);
  const e = entryOf(scene(h.session), h.tool, h.op)!;
  const at = e.fields.findIndex((f) => f.label === "Helix");
  assert.equal(e.fields[at]!.value, "15");
  assert.ok(e.fields[at]!.active && e.fields[at]!.typed);
  assert.ok(e.focus, "the box is told to focus and scroll to it");
  const plain = reduce(st, { type: "runAction", id: "gear:edit" }, env);
  assert.ok(!entryOf(scene(plain.session), plain.tool, plain.op)!.focus, "Edit gear does not");
  // a gear that already has a helix: the number is not changed
  const s2 = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: AT, spec: { ...spec, helix: 25, width: 10 } });
  const st2 = select(top(s2), [bodyOf(top(s2))]);
  const h2 = reduce(st2, { type: "runAction", id: "gear:helix" }, env);
  const e2 = entryOf(scene(h2.session), h2.tool, h2.op)!;
  assert.equal(e2.fields.find((f) => f.label === "Helix")!.value, "25");
  assert.ok(!e2.fields.find((f) => f.label === "Helix")!.typed);
});

test("a gear being sized next to a gear it meshes with is drawn orange as that meshed gear, before the second click", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = click(st, [60, 0, 0]);
  st = move(st, [60 + 22, 0, 0]); // (centre 40 from the first gear: a pitch radius of 20 + 20)
  const p = previewFor(scene(st.session), st.tool);
  assert.ok(p?.orange, "orange");
  const plain = previewFor(scene(st.session), { ...st.tool!, points: [[200, 0, 0]], cursor: [222, 0, 0] });
  assert.ok(!plain?.orange, "not next to a gear: not orange");
  const e = entryOf(scene(st.session), st.tool, st.op)!;
  assert.match(e.suggest ?? "", /orange.*tooth gear that meshes/);
  // the second click makes it the Mesh gear tool with the teeth set
  st = click(st, [60 + 22, 0, 0]);
  assert.ok(st.tool?.gear?.mesh && st.tool.sized);
});

test("a double click on a body while the gear tool waits for the next gear's centre puts the tool away and selects the body", () => {
  let st = reduce(top(), { type: "begin", name: "gear" }, env);
  st = move(st, [29, 3, 10]);
  st = click(st, [29, 3, 10], 1);
  st = click(st, [29, 3, 10], 2);
  assert.equal(st.tool, null);
  assert.deepEqual(selection(st.session), [bodyOf(st)]);
});

test("the icon of a gear that is only pointed at works: Edit, Helix and Mesh select that gear first (`in_809`); a gear's number box is shown when a face of it is selected", () => {
  const st = top();
  const face = Object.values(scene(st.session).parts).find((p) => p.kind === "plane" && p.origin === "body" && !(p as { curved?: unknown }).curved)!;
  // nothing selected, the pointer over the gear: the icon is there for that part, and a click on its Edit item works
  const hovered: AppState = { ...st, session: { ...st.session, hover: face.ref as never } };
  const chip = frameOf(hovered, env).gearChip!;
  assert.equal(chip.part, face.ref);
  const e = reduce(hovered, { type: "runAction", id: "gear:edit", part: chip.part }, env);
  assert.ok(e.tool?.gear?.editing, "the editor opened");
  assert.deepEqual(selection(e.session), [face.ref], "and the gear is selected");
  // a face of the gear selected: its box is shown, not the size bubble of the face
  const sel = select(st, [face.ref]);
  const h = reduce(sel, { type: "runAction", id: "gear:helix", part: face.ref }, env);
  const f = frameOf(h, env).entry!;
  assert.equal(f.panel, "Gear");
  assert.ok(f.focus);
  assert.equal(f.fields.find((x) => x.label === "Helix")!.value, "15");
});

test("a click on a gear selects the whole gear; a click on it again selects the face clicked (`in_812`)", () => {
  const st = top();
  const p: Vec3 = [29, 3, 8]; // (the top of the gear)
  const one = click(move(st, p), p, 1);
  assert.deepEqual(selection(one.session), [bodyOf(one)], "the whole gear");
  const two = click(move(one, p), p, 1);
  const face = selection(two.session)[0]!;
  assert.equal(scene(two.session).parts[face]?.kind, "plane", "then the face");
  assert.equal(scene(two.session).parts[face]?.origin, "body");
  // a double click: the gear first, the face on the second click of the pair
  const dbl = click(click(move(st, p), p, 1), p, 2);
  assert.equal(scene(dbl.session).parts[selection(dbl.session)[0]!]?.kind, "plane");
});

test("a gear selected as a whole is filled all over: the frame names every triangle of its body, the teeth too (`in_812`)", () => {
  const s = run(extruded(), { type: "gear", id: "g_002", plane: worldRef("XY"), at: [60, 0, 0], spec: { teeth: 20, module: 2, bore: 5, width: 8 } }); // (a second body: a body of several)
  const body = Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => p.ref);
  assert.equal(body.length, 2);
  const st = select({ ...top(s) }, [body[0]!]);
  const tris = frameOf(st, env).highlight.bodyTris?.[body[0]!];
  assert.ok(tris && tris.length > 50, `ranges ${tris?.length}`);
  const total = tris!.reduce((t, [, c]) => t + c, 0);
  assert.ok(total / 3 > 1000, `${total / 3} triangles: a whole 20 tooth gear, not its two faces`);
});
