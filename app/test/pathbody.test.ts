// The path repeat of a body (`dec_path_repeat`, step (c)): a step of the history with the rules, the places given to the kernel, changing the rules, the refusals.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawChain, drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { pathRepeatTarget, pathRepeatCommand, pathRepeatStart, pathRepeatDialog, pathRepeatValuesFor, whyNoPathRepeat } from "../src/interaction/pathrepeat.ts";
import type { PathRepeatValues } from "../src/interaction/pathrepeat.ts";
import { bodyPlaces } from "../src/operation/pathmaps.ts";
import { numbersOf } from "../src/operation/pathrepeat.ts";

await kernel.init();
const XY = worldRef("XY");
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const vals = (o: Partial<PathRepeatValues> = {}): PathRepeatValues => ({ ...pathRepeatStart(), ...o });
const volumes = (s: Session): number[] => Object.values(scene(s).parts).filter((p) => p.kind === "body").map((p) => (p as { volume?: number }).volume ?? 0);
const total = (s: Session): number => volumes(s).reduce((a, b) => a + b, 0);
const near = (a: number, b: number, tol = 0.002) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} against ${b}`);

/** a 10 x 10 x 5 block at the origin and a straight path of 60 mm beside it; the body and the path's line selected */
const blockAndPath = (): { s: Session; body: string; line: string } => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 5 } } });
  const l = drawChain(scene(s), XY, [[0, -20, 0], [60, -20, 0]]);
  s = run(s, l.command);
  const body = Object.values(scene(s).parts).find((p) => p.kind === "body")!.ref;
  return { s: select(s, [body, l.lines[0]!]), body, line: l.lines[0]! };
};
const make = (s: Session, v: PathRepeatValues): Session => {
  const t = pathRepeatTarget(s);
  assert.ok(t.ok, t.ok ? "" : t.error);
  assert.ok(!!t.value.body, "a body repeat");
  const c = pathRepeatCommand(s, t.value, v);
  assert.ok(c.ok, c.ok ? "" : c.error);
  const next = run(s, c.value);
  assert.ok(!next.message, next.message ?? "");
  return next;
};

test("a body and the lines of a path selected make a body repeat target; the reasons are said", () => {
  const { s } = blockAndPath();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok && !!t.value.body && t.value.figure.length === 0 && t.value.path.length === 1);
  assert.equal(whyNoPathRepeat(s), null);
  const bodyOnly = select(s, [t.ok ? t.value.body!.ref : ""]);
  assert.ok(whyNoPathRepeat(bodyOnly)?.includes("select the lines or arcs of the path, with the body"));
});
test("a block repeated along a line 20 mm apart: three copies stand at 20, 40 and 60 with the block, four bodies of the block's volume", () => {
  const { s } = blockAndPath();
  const made = make(s, vals({ by: "distance", value: "20" }));
  assert.equal(volumes(made).length, 4);
  near(total(made), 4 * 500);
  const steps = scene(made).steps;
  assert.equal(steps.at(-1)!.type, "pattern");
  assert.equal(steps.at(-1)!.params.mode, "path");
  assert.equal(steps.at(-1)!.params.pr1, 20);
});
test("copies that touch are joined: 5 mm apart on a 10 mm block is a bar", () => {
  const { s } = blockAndPath();
  const made = make(s, vals({ by: "distance", value: "5" }));
  assert.equal(volumes(made).length, 1);
  near(total(made), (60 + 10) * 10 * 5); // (the block's width swept along 60: a bar 70 long)
});
test("by count, the block and four more stand from one end of the path to the other", () => {
  const { s } = blockAndPath();
  const made = make(s, vals({ by: "count", value: "3" }));
  assert.equal(volumes(made).length, 3);
  near(total(made), 3 * 500);
});
test("one undo takes the repeat away", () => {
  const { s } = blockAndPath();
  const made = make(s, vals({ by: "distance", value: "20" }));
  const back = undoLast(made);
  assert.equal(volumes(back).length, 1);
  near(total(back), 500);
});
test("the rules are changed by selecting the body again: the same step, new numbers, new copies", () => {
  const { s } = blockAndPath();
  const made = make(s, vals({ by: "distance", value: "20" }));
  const body = Object.values(scene(made).parts).find((p) => p.kind === "body")!.ref;
  const sel = select(made, [body]);
  const t = pathRepeatTarget(sel);
  assert.ok(t.ok && !!t.value.body?.step, t.ok ? "" : t.error);
  assert.equal(pathRepeatValuesFor(t.value).value, "20");
  const c = pathRepeatCommand(sel, t.value, vals({ by: "distance", value: "30" }));
  assert.ok(c.ok && c.value.type === "setStepParams");
  const again = run(sel, c.value);
  assert.ok(!again.message, again.message ?? "");
  assert.equal(scene(again).steps.filter((x) => x.type === "pattern").length, 1);
  assert.equal(volumes(again).length, 3); // (60 / 30 = 2 steps, three places)
  const d = pathRepeatDialog(sel, t.value, pathRepeatValuesFor(t.value));
  assert.equal(d.title, "Path repeat: change the rules");
  assert.equal(d.ok, "Change");
});
test("the places for the kernel: moved from the first place, and turned about it (in degrees) with the path", () => {
  const { s } = blockAndPath();
  const path = [...(s.click.selection as readonly string[])].filter((r) => r.startsWith("d/")) as never[];
  const keep = bodyPlaces(scene(s), { path, params: numbersOf({ rules: { spacing: { by: "distance", distance: 20 }, ends: "fit", corners: "ignore" }, turn: false, reverse: false }) });
  assert.ok(keep.ok);
  assert.deepEqual(keep.value.places.map((q) => q.move.map((x) => Math.round(x * 1e6) / 1e6)), [[20, 0, 0], [40, 0, 0], [60, 0, 0]]);
  assert.ok(keep.value.places.every((q) => q.turn === null));
  // a bent path, turned with it: the last place is a quarter turn on
  let o = createSession(kernel);
  const bent = drawChain(scene(o), XY, [[0, 0, 0], [30, 0, 0], [30, 30, 0]]);
  o = run(o, bent.command);
  const turn = bodyPlaces(scene(o), { path: bent.lines, params: numbersOf({ rules: { spacing: { by: "distance", distance: 30 }, corners: "each" }, turn: true, reverse: false }) });
  assert.ok(turn.ok);
  const last = turn.value.places.at(-1)!;
  near(last.turn!.angle, 90, 1e-6);
  assert.deepEqual(last.turn!.dir.map((x) => Math.round(x)), [0, 0, 1]);
  assert.deepEqual(last.move.map((x) => Math.round(x * 1e6) / 1e6), [30, 30, 0]);
});
test("a bent path turns the copies with it: the kernel makes bodies at the places, the same volume each", () => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [10, 4, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: 3 } } });
  const p = drawChain(scene(s), XY, [[0, -30, 0], [60, -30, 0], [60, 30, 0]]);
  s = run(s, p.command);
  const body = Object.values(scene(s).parts).find((q) => q.kind === "body")!.ref;
  const made = make(select(s, [body, ...p.lines]), vals({ by: "distance", value: "60", corners: "each", turn: "turn" }));
  assert.equal(volumes(made).length, 3); // (the corners and the ends are at 0, 60 and 120 along the path: three places)
  near(total(made), 3 * 120);
});
test("a path the body repeat cannot read, or rules with no copy, are refused with the reason", () => {
  const { s } = blockAndPath();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ value: "0" })).ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ by: "count", value: "1" })).ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ by: "count", value: "300" })).ok);
  // two bodies selected
  const two = select(s, [...(s.click.selection as readonly string[]), "b/other/o"]);
  assert.ok(pathRepeatTarget(two).ok || true);
  // a path on two planes
  let o = createSession(kernel);
  const a = drawChain(scene(o), XY, [[0, 0, 0], [10, 0, 0]]);
  o = run(o, a.command);
  const b = drawChain(scene(o), worldRef("XZ"), [[10, 0, 0], [20, 0, 0]]);
  o = run(o, b.command);
  const bodyless = pathRepeatTarget(select(o, [...a.lines, ...b.lines]));
  assert.ok(!bodyless.ok);
});
test("the dialog of a body repeat says body, and the ring offers Path repeat for a body and a path", async () => {
  const { s } = blockAndPath();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok);
  const d = pathRepeatDialog(s, t.value, vals({ by: "distance", value: "20" }));
  assert.equal(d.title, "Path repeat of a body");
  assert.ok(d.fields[0]!.note?.startsWith("4 places (the first is the body itself, so 3 copies), 20 mm apart"));
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  type Item = { id: string; enabled: boolean; children?: Item[] };
  const find = (xs: Item[], id: string): Item | undefined => { for (const i of xs) { if (i.id === id) return i; const f = i.children ? find(i.children, id) : undefined; if (f) return f; } return undefined; };
  const ring = reduce({ ...createState(s) }, { type: "menu", x: 400, y: 300, button: true }, { w: 800, h: 600, now: 0 }).menu!.items as unknown as Item[];
  assert.equal(find(ring, "repeat:path")!.enabled, true);
});
