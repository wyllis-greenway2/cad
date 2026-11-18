// The path repeat of a drawn figure (`dec_path_repeat`, step (b)): the selection, the dialog, the record, the copies, changing the rules, saving.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawChain, drawCircle } from "../src/operation/build.ts";
import { diskFaceRef, loopFaceRef } from "../src/operation/loops.ts";
import { toJSON as toJson, fromJSON as fromJson } from "../src/operation/scene.ts";
import { pathRepeatTarget, pathRepeatDialog, pathRepeatCommand, pathRepeatStart, pathRepeatValuesOf, pathRepeatNumbers, whyNoPathRepeat } from "../src/interaction/pathrepeat.ts";
import type { PathRepeatValues } from "../src/interaction/pathrepeat.ts";
import { patternsOf } from "../src/operation/repeat.ts";
import { pathMaps, readPath } from "../src/operation/pathmaps.ts";

await kernel.init();
const select = (s: Session, refs: string[]): Session => ({ ...s, click: { ...s.click, selection: refs as never } });
const XY = worldRef("XY");
const vals = (o: Partial<PathRepeatValues> = {}): PathRepeatValues => ({ ...pathRepeatStart(), ...o });
const at = (s: Session, ref: string): readonly number[] => (scene(s).parts[ref as never] as { at: readonly number[] }).at;
const near = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => assert.ok(Math.abs(x - b[i]!) < 1e-6, `${a} against ${b}`));

/** a circle of radius 3 at the origin and an open path from (0, 0) to (60, 0); the circle's face and the path's line selected */
const circleAndLine = (): { s: Session; circle: string; line: string } => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 3);
  s = run(s, c.command);
  const l = drawChain(scene(s), XY, [[0, -10, 0], [60, -10, 0]]);
  s = run(s, l.command);
  return { s: select(s, [diskFaceRef(c.circle), l.lines[0]!]), circle: c.circle, line: l.lines[0]! };
};
const make = (s: Session, v: PathRepeatValues): Session => {
  const t = pathRepeatTarget(s);
  assert.ok(t.ok, t.ok ? "" : t.error);
  const c = pathRepeatCommand(s, t.value, v);
  assert.ok(c.ok, c.ok ? "" : c.error);
  const next = run(s, c.value);
  assert.ok(!next.message, next.message ?? "");
  return next;
};
const circles = (s: Session): { at: readonly number[]; r: number }[] => Object.values(scene(s).parts).flatMap((p) => (p.kind === "circle" && p.ref.includes(".c") ? [{ at: (scene(s).parts[p.center] as { at: readonly number[] }).at, r: p.radius }] : [])).sort((a, b) => a.at[0]! - b.at[0]!);

test("the figure and the path are told apart by what is selected, and the reasons are said", () => {
  const { s } = circleAndLine();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok);
  assert.equal(t.value.path.length, 1);
  assert.ok(t.value.figure.length >= 2, "the circle and its centre");
  assert.equal(whyNoPathRepeat(s), null);
  const none = whyNoPathRepeat(select(s, []));
  assert.ok(none?.includes("select the figure"));
  const noPath = whyNoPathRepeat(select(s, [diskFaceRef(Object.values(scene(s).parts).find((p) => p.kind === "circle")!.ref)]));
  assert.ok(noPath?.includes("select the lines or arcs of the path"));
});
test("a circle repeated along a line, 20 mm apart with the spacing fitted: the figure is the first and three copies stand at 20, 40 and 60", () => {
  const { s } = circleAndLine();
  const made = make(s, vals({ by: "distance", value: "20" }));
  assert.equal(patternsOf(scene(made)).length, 1);
  assert.equal(patternsOf(scene(made))[0]!.kind, "path");
  const c = circles(made);
  assert.equal(c.length, 3);
  near(c[0]!.at, [20, 0, 0]); near(c[1]!.at, [40, 0, 0]); near(c[2]!.at, [60, 0, 0]);
  assert.ok(c.every((x) => x.r === 3));
});
test("by count: five copies of the figure in all are the figure and four more, from one end of the path to the other", () => {
  const { s } = circleAndLine();
  const c = circles(make(s, vals({ by: "count", value: "5" })));
  assert.deepEqual(c.map((x) => Math.round(x.at[0]!)), [15, 30, 45, 60]);
});
test("the copies are moved as the path's places move from the first, so a figure not at the start keeps its place beside the path", () => {
  const { s } = circleAndLine();
  const c = circles(make(select(s, [...s.click.selection] as string[]), vals({ by: "distance", value: "30" })));
  near(c[0]!.at, [30, 0, 0]); // (the figure stays at the origin: the path's first place is at (0, -10), and every copy is moved by how far its place is from that)
});
test("the offset moves the path first: 10 mm in from the edge of a rectangle path, the first copy is where the figure is and the others follow the moved outline", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [10, 10, 0], 2);
  s = run(s, c.command);
  const r = drawChain(scene(s), XY, [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]], true);
  s = run(s, r.command);
  const made = make(select(s, [diskFaceRef(c.circle), ...r.lines]), vals({ by: "count", value: "4", offset: "10" }));
  const found = circles(made);
  assert.equal(found.length, 3);
  // the first place of the offset rectangle is (10, 10): the figure is there; the others are a quarter of the way (the outline is 240 long, 60 apart)
  // (the copies in order of x: the places are (70, 10), (90, 50) and (30, 50))
  near(found[0]!.at, [30, 50, 0]); near(found[1]!.at, [70, 10, 0]); near(found[2]!.at, [90, 50, 0]);
});
test("turn with the path: a copy at a corner of the path is turned as the way the path runs has turned, about the first place; keep leaves it as it was", () => {
  let s = createSession(kernel);
  const sq = drawChain(scene(s), XY, [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]], true);
  s = run(s, sq.command);
  const p = drawChain(scene(s), XY, [[0, -20, 0], [30, -20, 0], [30, 10, 0]]);
  s = run(s, p.command);
  const sel = select(s, [loopFaceRef(sq.lines), ...p.lines]);
  const corner2 = (made: Session): readonly number[] => {
    const q = Object.values(scene(made).parts).filter((x) => x.kind === "corner" && x.ref.includes(".c") && x.ref.includes(sq.corners[1]!.slice(2).replace(/[./]/g, "_")));
    return ((q.sort((a, b) => (b as unknown as { at: number[] }).at[1]! - (a as unknown as { at: number[] }).at[1]!)[0]) as unknown as { at: readonly number[] }).at;
  };
  const keep = make(sel, vals({ by: "distance", value: "15", corners: "each", turn: "keep" }));
  const turn = make(sel, vals({ by: "distance", value: "15", corners: "each", turn: "turn" }));
  // the places: (0,-20) (15,-20) (30,-20) (30,-5) (30,10); the last one: moved by (30, 30)
  near(corner2(keep), [32, 30, 0]); // (the figure's corner (2, 0), moved by (30, 30))
  near(corner2(turn), [10, 12, 0]); // (the figure's corner is 20 above the path's first place: turned a quarter turn about it, that is (-20, 2) from the last place (30, 10))
});
test("changing the rules of the repeat selected changes the copies and keeps their names", () => {
  const { s } = circleAndLine();
  const made = make(s, vals({ by: "distance", value: "20" }));
  const names = circles(made).length;
  const sel = select(made, [Object.values(scene(made).parts).find((p) => p.kind === "circle" && p.ref.includes(".c"))!.ref]);
  const t = pathRepeatTarget(sel);
  assert.ok(t.ok && !!t.value.edit);
  assert.equal(pathRepeatValuesOf(t.value.edit!).value, "20");
  const c = pathRepeatCommand(sel, t.value, vals({ by: "distance", value: "10" }));
  assert.ok(c.ok && c.value.type === "setPattern");
  const again = run(sel, c.value);
  assert.ok(!again.message, again.message ?? "");
  assert.equal(circles(again).length, 6);
  assert.ok(names === 3 && circles(again).length > names);
});
test("the rules are kept with the file: saved and opened, the repeat and its copies are the same", () => {
  const { s } = circleAndLine();
  const made = scene(make(s, vals({ by: "count", value: "4" })));
  const back = fromJson(JSON.parse(JSON.stringify(toJson(made))));
  assert.deepEqual(patternsOf(back)[0]!.path, patternsOf(made)[0]!.path);
  assert.deepEqual(patternsOf(back)[0]!.params, patternsOf(made)[0]!.params);
});
test("a path that cannot be read, or rules that make no copy, are refused with the reason", () => {
  const { s } = circleAndLine();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ value: "0" })).ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ by: "count", value: "2.5" })).ok);
  const e = pathRepeatCommand(s, t.value, vals({ by: "count", value: "3", corners: "each" }));
  assert.ok(!e.ok && e.error.includes("distance"));
  assert.ok(!pathRepeatCommand(s, t.value, vals({ value: "abc" })).ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ by: "distance", value: "20", startInset: "50", endInset: "50" })).ok);
  assert.ok(!pathRepeatCommand(s, t.value, vals({ by: "count", value: "1" })).ok, "one place is the figure itself: no copy");
  assert.ok(!pathRepeatNumbers(vals({ offset: "x" })).ok);
  // a path on another plane
  let o = createSession(kernel);
  const c = drawCircle(scene(o), XY, [0, 0, 0], 3);
  o = run(o, c.command);
  const l = drawChain(scene(o), worldRef("XZ"), [[0, 0, 0], [60, 0, 0]]);
  o = run(o, l.command);
  const t2 = pathRepeatTarget(select(o, [diskFaceRef(c.circle), l.lines[0]!]));
  assert.ok(t2.ok);
  const r = pathMaps(scene(o), { plane: t2.value.plane, path: t2.value.path, params: [0, 20, 0, 0, 0, 0, 0, 0, 0] });
  assert.ok(r.why?.includes("same plane"));
  assert.ok(!readPath(scene(o), t2.value.path, scene(o).parts[t2.value.plane] as never).ok);
});
test("the dialog says how many places and how far apart, draws the path and the places, and follows the rules typed", () => {
  const { s } = circleAndLine();
  const t = pathRepeatTarget(s);
  assert.ok(t.ok);
  const d = pathRepeatDialog(s, t.value, vals({ by: "distance", value: "20" }));
  assert.deepEqual(d.fields.map((f) => f.id), ["picture", "by", "value", "ends", "corners", "startInset", "endInset", "offset", "turn", "reverse"]);
  const pic = d.fields[0]!;
  assert.equal(pic.type, "picture");
  assert.ok(String(pic.value).startsWith("<svg") && String(pic.value).includes("<circle") && String(pic.value).includes("<path"));
  assert.ok(pic.note?.startsWith("4 places (the first is the figure itself, so 3 copies), 20 mm apart; the path is 60 mm long"));
  assert.ok(!pathRepeatDialog(s, t.value, vals({ by: "count", value: "3" })).fields.some((f) => f.id === "ends"), "no end rule for a count");
  assert.ok(!pathRepeatDialog(s, t.value, vals({ corners: "each" })).fields.some((f) => f.id === "startInset"), "no insets when the corners decide");
  assert.ok(pathRepeatDialog(s, t.value, vals({ value: "abc" })).fields[0]!.note?.includes("number"));
  assert.ok(pathRepeatDialog(s, t.value, vals({ by: "count", value: "3", corners: "each" })).fields.find((f) => f.id === "corners")!.note?.includes("needs a distance"));
});
test("the Path repeat item is in the Repeat group of the ring, dimmed with its reason until a figure and a path are selected", async () => {
  const { createState, reduce } = await import("../src/interaction/controller.ts");
  type Item = { id: string; label: string; enabled: boolean; why: string | null; children?: Item[] };
  const items = (session: Session): Item[] => reduce({ ...createState(session) }, { type: "menu", x: 400, y: 300, button: true }, { w: 800, h: 600, now: 0 }).menu!.items as unknown as Item[];
  const find = (xs: Item[], id: string): Item | undefined => { for (const i of xs) { if (i.id === id) return i; const f = i.children ? find(i.children, id) : undefined; if (f) return f; } return undefined; };
  const { s } = circleAndLine();
  const repeat = items(s).find((i) => i.id === "repeat")!;
  assert.ok(repeat.children!.some((c) => c.id === "repeat:path" && c.label === "Path repeat"));
  assert.equal(find(items(s), "repeat:path")!.enabled, true);
  assert.equal(find(items(select(s, [])), "repeat:path")!.enabled, false);
  assert.ok(find(items(select(s, [])), "repeat:path")!.why!.includes("select the figure"));
});
