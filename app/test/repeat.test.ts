// A repeat of a drawn figure keeps its numbers (`in_257`, `q_repeat_parameters`): the copies are made from a record, follow the original, keep their names when the count changes, and a change that would
// take away a copy a step is made from is refused.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Ref } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { patternsOf } from "../src/operation/repeat.ts";

await kernel.init();
const XY = worldRef("XY");

function repeated(count = 3): { s: Session; src: Ref[] } {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const src = [...r.corners, ...r.lines] as Ref[];
  return { s: run(s, { type: "pattern", id: "q_1", kind: "linear", parts: src, plane: XY, params: [count, 15, 1, 0, 1, 0] }), src };
}
const faces = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "face");
const copyFace = (s: Session, k: number) => faces(s).find((f) => f.ref.includes(`q_1.c${k}_`))!;
const corner = (s: Session, ref: string) => { const p = scene(s).parts[ref as Ref]; return p?.kind === "corner" ? p.at : null; };

test("the copies are made from the record: locked, named by which copy of which part, and the numbers change them", () => {
  const { s } = repeated(3);
  assert.equal(faces(s).length, 3);
  const c1 = scene(s).parts["d/q_1.c0_e_001_p0" as Ref];
  assert.ok(c1 && c1.origin === "drawn" && !c1.movable, "locked");
  const more = run(s, { type: "setPattern", id: "q_1", params: [5, 15, 1, 0, 1, 0] });
  assert.equal(more.message, null);
  assert.equal(faces(more).length, 5);
  assert.deepEqual(corner(more, "d/q_1.c0_e_001_p0"), corner(s, "d/q_1.c0_e_001_p0"), "the copies that were there keep their names and places");
  const wider = run(more, { type: "setPattern", id: "q_1", params: [5, 20, 1, 0, 1, 0] });
  assert.deepEqual(corner(wider, "d/q_1.c0_e_001_p0"), [20, 0, 0].map((v, i) => v + (corner(s, "d/e_001.p0")?.[i] ?? 0)));
  assert.equal(undoLast(wider).history.scene.patterns?.[0]?.params[1], 15);
  assert.equal(run(s, { type: "pattern", id: "q_2", kind: "linear", parts: [], plane: XY, params: [2, 15, 1, 0, 1, 0] }).history.cursor, s.history.cursor + 0, "a repeat of nothing is refused");
});

test("the copies follow the original when it changes", () => {
  const { s, src } = repeated(2);
  const first = src.find((r) => scene(s).parts[r]?.kind === "corner")!;
  const before = corner(s, "d/q_1.c0_e_001_p0")!;
  const at = corner(s, first)!;
  const moved = run(s, { type: "movePart", ref: first, to: [at[0] - 2, at[1], at[2]] });
  assert.equal(moved.message, null);
  const after = corner(moved, "d/q_1.c0_e_001_p0");
  const origin = corner(moved, first)!;
  assert.ok(Math.abs(origin[0] - at[0]) > 0.5, "the original moved");
  assert.ok(after && Math.abs(after[0] - origin[0] - 15) < 1e-6 && Math.abs(before[0] - at[0] - 15) < 1e-6, `the copy stays 15 from the original: ${before} to ${after}`);
});

test("a step made from a copy keeps working when the count grows, and a count that would take that copy away is refused, naming the step", () => {
  const { s } = repeated(3);
  const f = copyFace(s, 1); // the second copy
  const st = startOp(scene(s), [f.ref], "extrude");
  assert.ok(st.ok);
  if (!st.ok) return;
  const solid = run(s, opCommand(scene(s), { ...st.op, value: 4 })!);
  assert.equal(solid.message, null);
  assert.equal(scene(solid).steps.length, 1);
  const grown = run(solid, { type: "setPattern", id: "q_1", params: [6, 15, 1, 0, 1, 0] });
  assert.equal(grown.message, null);
  assert.equal(scene(grown).steps.length, 1);
  assert.ok(grown.outcome.kernel?.mesh, "the body is still there");
  const cut = run(solid, { type: "setPattern", id: "q_1", params: [2, 15, 1, 0, 1, 0] }); // only copy 0 would be left
  assert.match(cut.message ?? "", /would take away copies: step s_\d+ is made from a copy that would go/);
  assert.deepEqual(patternsOf(scene(cut))[0]!.params, [3, 15, 1, 0, 1, 0], "nothing changed");
  // one copy fewer than were made is fine when the step's copy stays
  assert.equal(run(solid, { type: "setPattern", id: "q_1", params: [3, 25, 1, 0, 1, 0] }).message, null);
});

test("breaking a repeat frees its copies as ordinary parts, and they stay when the original is changed", () => {
  const { s, src } = repeated(3);
  const broken = run(s, { type: "breakPattern", id: "q_1" });
  assert.equal(broken.message, null);
  assert.equal(patternsOf(scene(broken)).length, 0);
  const c = scene(broken).parts["d/q_1.c0_e_001_p0" as Ref];
  assert.ok(c && c.movable, "free to move");
  assert.equal(faces(broken).length, 3);
  const first = src.find((r) => scene(s).parts[r]?.kind === "corner")!;
  const at = corner(broken, first)!;
  const moved = run(broken, { type: "movePart", ref: "d/q_1.c0_e_001_p0" as Ref, to: [at[0] + 1, at[1] + 1, 0] });
  assert.equal(moved.message, null, "a copy can be moved now");
});

test("deleting the original takes the repeat and its copies away; the repeat is in the saved file and opens again", () => {
  const { s, src } = repeated(3);
  const reopened = openSession(kernel, saveText(s));
  assert.ok(reopened.ok);
  if (reopened.ok) { assert.equal(patternsOf(scene(reopened.value)).length, 1); assert.equal(faces(reopened.value).length, 3); }
  const gone = run(s, { type: "deleteParts", refs: src });
  assert.equal(patternsOf(scene(gone)).length, 0);
  assert.equal(faces(gone).length, 0);
  assert.ok(!scene(gone).parts["d/q_1.c0_e_001_p0" as Ref]);
});

test("a circular repeat keeps its numbers too: the count changes the copies round the point", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "pattern", id: "q_1", kind: "circular", parts: [...r.corners, ...r.lines] as Ref[], plane: XY, params: [4, 360, 2, 20, 0, 0] });
  assert.equal(faces(s).length, 4);
  s = run(s, { type: "setPattern", id: "q_1", params: [6, 360, 2, 20, 0, 0] });
  assert.equal(faces(s).length, 6);
  s = run(s, { type: "setPattern", id: "q_1", params: [6, 180, 2, 20, 0, 0] });
  assert.equal(faces(s).length, 6, "the angle is the other number");
});

import { createState, reduce } from "../src/interaction/controller.ts";
import type { AppState } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { frameOf } from "../src/interaction/frame.ts";
const env = { w: 800, h: 600, now: 0 };
const pick = (st: AppState, refs: Ref[]): AppState => ({ ...st, session: { ...st.session, click: { ...st.session.click, selection: refs } } });
const menu = (st: AppState) => reduce(st, { type: "menu", x: 10, y: 10, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]);

test("Edit repeat reopens the repeat with its numbers: more copies on Apply, the copies stay on Cancel; a copy a step is made from cannot be taken away, and the repeat stays open to try again", () => {
  const { s } = repeated(3);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  assert.equal(menu(st).find((i) => i.id === "repeat:edit")!.enabled, false, "nothing selected");
  st = pick(st, [copyFace(s, 1).ref]);
  assert.equal(menu(st).find((i) => i.id === "repeat:edit")!.enabled, true, "a copy's face is enough");
  st = reduce(st, { type: "runAction", id: "repeat:edit" }, env);
  assert.deepEqual(st.repeat?.op.patStart, [3, 15, 1, 0, 1, 0], "its own numbers");
  assert.equal(st.repeat?.op.editPattern, "q_1");
  assert.equal(frameOf(st, env).confirm?.kind, "linear");
  st = reduce(st, { type: "entry", field: 0, text: "5" }, env);
  assert.equal(faces(st.session).length, 3, "nothing is changed until Apply");
  const f = frameOf(st, env);
  assert.ok(f.entries.length > 0, "the bubbles show");
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(st.repeat, null);
  assert.equal(st.session.message, null);
  assert.equal(faces(st.session).length, 5);
  assert.equal(patternsOf(scene(st.session)).length, 1, "the same repeat, not another");
  // Cancel leaves it
  st = reduce(pick(st, [copyFace(st.session, 1).ref]), { type: "runAction", id: "repeat:edit" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "2" }, env);
  st = reduce(st, { type: "repeatCancel" }, env);
  assert.equal(faces(st.session).length, 5);
  // a step made from copy 4 (the fifth shape) stops a count of 3
  const f4 = copyFace(st.session, 3);
  const ex = startOp(scene(st.session), [f4.ref], "extrude");
  assert.ok(ex.ok);
  if (!ex.ok) return;
  st = { ...st, session: run(st.session, opCommand(scene(st.session), { ...ex.op, value: 4 })!) };
  st = reduce(pick(st, [copyFace(st.session, 1).ref]), { type: "runAction", id: "repeat:edit" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "3" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  assert.match(st.session.message ?? "", /would take away copies/);
  assert.ok(st.repeat, "still open to try another number");
  assert.equal(patternsOf(scene(st.session))[0]!.params[0], 5);
});

test("Break repeat turns the copies into ordinary parts from the menu, and is only offered with a repeat selected", () => {
  const { s } = repeated(3);
  let st: AppState = pick({ ...createState(s), cam: homeCamera() }, [copyFace(s, 0).ref]);
  assert.equal(menu(st).find((i) => i.id === "repeat:break")!.enabled, true);
  st = reduce(st, { type: "runAction", id: "repeat:break" }, env);
  assert.equal(patternsOf(scene(st.session)).length, 0);
  assert.equal(st.session.message, "repeat broken: its copies are ordinary parts now");
  assert.equal(menu(pick(st, [copyFace(st.session, 0).ref])).find((i) => i.id === "repeat:break")!.enabled, false);
});

test("a repeat of the body is reopened from its row in the History list, and Apply changes that step", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 5, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const st0 = startOp(scene(s), [Object.values(scene(s).parts).find((p) => p.kind === "face")!.ref], "extrude");
  if (!st0.ok) throw new Error("no extrude");
  s = run(s, opCommand(scene(s), { ...st0.op, value: 5 })!);
  let st: AppState = { ...createState(s), cam: homeCamera() };
  st = reduce(pick(st, [Object.values(scene(st.session).parts).find((p) => p.kind === "body")!.ref]), { type: "runAction", id: "op:linear" }, env);
  st = reduce(st, { type: "entry", field: 0, text: "2" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  const step = scene(st.session).steps.find((x) => x.type === "pattern")!;
  assert.equal(step.params.nx ?? step.params.ny ?? step.params.nz, 2);
  st = reduce(st, { type: "panel", name: "history" }, env);
  const row = frameOf(st, env).panel!.rows.find((x) => x.id === step.id)!;
  assert.equal(row.edit, true);
  st = reduce(st, { type: "panelRow", id: step.id, act: "edit" }, env);
  assert.equal(st.repeat?.op.editStep, step.id);
  const along = st.repeat!.op.along ?? 0;
  st = reduce(st, { type: "entry", field: along, text: "4" }, env);
  st = reduce(st, { type: "repeatApply" }, env);
  assert.equal(scene(st.session).steps.filter((x) => x.type === "pattern").length, 1, "the step is changed, not another one added");
  assert.equal(scene(st.session).steps.find((x) => x.type === "pattern")!.params[["nx", "ny", "nz"][along]!], 4);
});
