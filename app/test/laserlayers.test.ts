// The laser route's own layers (`in_603`, `prin_manufacture_agnostic`): what a line is for (cut through, score, engrave) is not on the drawn line: it is a mark of the laser route, kept in the project's manufacturing section by the line's ref
// and used only when the laser route runs. The drawing itself does not change, and the ring has no layer category.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, saveText, openSession, undoLast } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { drawRectangle, drawCircle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera } from "../src/interaction/camera.ts";
import { layersTarget, whyNoLayers, layersDialog, layersCommand, marksFor, marksKey, marksSummary, runLaser, laserDialog, laserDefaults, recordCommands, planFor, LASER_ROUTE } from "../src/interaction/manufacture.ts";
import { flatSnapshot } from "../src/interaction/partsnapshot.ts";
import { fabricateRows } from "../src/interaction/appmenu.ts";
import { runRoute, builtInRoutes, defaultSettings, CONTRACT_VERSION } from "../src/manufacturing/index.ts";
import type { PartSnapshot, MachineDefinition } from "../src/manufacturing/index.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
function plate() {
  let s = createSession(kernel);
  const r = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [40, 20, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  const c = drawCircle(scene(s), worldRef("XY"), [10, 10, 0], 4);
  s = run(s, c.command);
  const pick = (refs: string[], from = s): Session => ({ ...from, click: { ...from.click, selection: refs as never } });
  return { s, r, c, pick };
}
const text = (b: Uint8Array) => new TextDecoder().decode(b);

test("the lines to mark are the selected ones (a figure's lines and holes), of one drawing; nothing selected, or lines of two planes, says why", () => {
  const { s, r, c, pick } = plate();
  assert.deepEqual(layersTarget(s), { ok: false, error: "select the lines, or a figure, to mark first" });
  const one = layersTarget(pick([r.lines[0]!]));
  assert.ok(one.ok);
  if (one.ok) { assert.deepEqual(one.value.refs, [r.lines[0]]); assert.equal(one.value.part, "sketch/w/XY"); }
  const fig = layersTarget(pick([loopFaceRef(r.lines)]));
  assert.ok(fig.ok);
  if (fig.ok) assert.deepEqual([...fig.value.refs].sort(), [...r.lines, c.circle].sort(), "the four sides and the hole in it");
  assert.equal(whyNoLayers(s), "select the lines, or a figure, to mark first");
  assert.equal(whyNoLayers(pick([worldRef("XY")])), "select drawn lines or a figure of the drawing to mark", "a world plane is not a drawn line");
  let two = createSession(kernel);
  const a = drawCircle(scene(two), worldRef("XY"), [0, 0, 0], 3); two = run(two, a.command);
  const b = drawCircle(scene(two), worldRef("XZ"), [0, 0, 0], 3); two = run(two, b.command);
  assert.match(whyNoLayers({ ...two, click: { ...two.click, selection: [a.circle, b.circle] as never } })!, /more than one plane/);
});

test("marking sets the lines' marks in the project's manufacturing section and changes nothing in the drawing; cut takes a mark off; one undo takes it back", () => {
  const { s, r, c, pick } = plate();
  const before = JSON.stringify(Object.values(scene(s).parts));
  const cmd = layersCommand(pick([loopFaceRef(r.lines)]), "score");
  assert.ok(cmd.ok);
  if (!cmd.ok) return;
  const s1 = run(pick([loopFaceRef(r.lines)]), cmd.value);
  assert.equal(JSON.stringify(Object.values(scene(s1).parts)), before, "the drawn parts are as they were: no field on them");
  assert.deepEqual(marksFor(scene(s1), "sketch/w/XY"), Object.fromEntries([...r.lines, c.circle].map((x) => [x, "score"])));
  assert.equal(marksSummary(scene(s1), "sketch/w/XY"), "5 lines score");
  const back = layersCommand(pick([c.circle], s1), "engrave");
  assert.ok(back.ok);
  const s2 = run(pick([c.circle], s1), (back as { ok: true; value: never }).value);
  assert.equal(marksSummary(scene(s2), "sketch/w/XY"), "4 lines score, 1 line engrave");
  const cut = layersCommand(pick([loopFaceRef(r.lines)], s2), "cut");
  const s3 = run(pick([loopFaceRef(r.lines)], s2), (cut as { ok: true; value: never }).value);
  assert.deepEqual(marksFor(scene(s3), "sketch/w/XY"), {}, "cut takes every mark off");
  assert.equal(scene(s3).manufacturing?.marks?.[marksKey("sketch/w/XY")], undefined, "and leaves nothing of the key");
  assert.equal(marksSummary(scene(undoLast(s2)), "sketch/w/XY"), "5 lines score", "one undo");
  assert.deepEqual(layersCommand(pick([c.circle]), "sparkle"), { ok: false, error: "a line is cut, scored or engraved" });
});

test("the marks are saved with the project and come back; a mark of a deleted line is not counted", () => {
  const { s, r, pick } = plate();
  const cmd = layersCommand(pick([r.lines[0]!, r.lines[1]!]), "engrave");
  const s1 = run(pick([r.lines[0]!, r.lines[1]!]), (cmd as { ok: true; value: never }).value);
  const back = openSession(kernel, saveText(s1));
  assert.ok(back.ok);
  if (back.ok) assert.equal(marksSummary(scene(back.value), "sketch/w/XY"), "2 lines engrave");
  const gone = run(s1, { type: "deletePart", ref: r.lines[0]! });
  assert.equal(marksSummary(scene(gone), "sketch/w/XY"), "1 line engrave", "the deleted line's mark is left behind and unused");
  assert.equal(marksSummary(scene(s), "sketch/w/XY"), "");
});

test("the laser route takes the marks: marked lines are scored or engraved at their own power and speed, the rest cut; the plan keeps the marks; the same drawing without marks cuts everything", () => {
  const { s, r, c, pick } = plate();
  const none = runLaser(s, { ...laserDefaults(), kerf: 0 });
  assert.ok(none.ok);
  if (!none.ok) return;
  assert.deepEqual(none.value.run.toolpath!.operations.map((o) => o.id), ["cut"]);
  assert.deepEqual(none.value.marks, {});
  const m1 = run(pick([c.circle]), (layersCommand(pick([c.circle]), "engrave") as { ok: true; value: never }).value);
  const m2 = run(pick([r.lines[0]!], m1), (layersCommand(pick([r.lines[0]!], m1), "score") as { ok: true; value: never }).value);
  const all = { ...m2, click: { ...m2.click, selection: [] } }; // (a selection is what is cut: nothing selected, the whole drawing)
  const out = runLaser(all, { ...laserDefaults(), kerf: 0, scorePower: 30, engravePower: 5 });
  assert.ok(out.ok);
  if (!out.ok) return;
  const ops = out.value.run.toolpath!.operations;
  assert.deepEqual(ops.map((o) => o.id), ["cut", "score", "engrave"]);
  assert.equal((ops[1]!.moves.find((m) => m.op === "cut") as { power: number }).power, 0.3);
  assert.equal((ops[2]!.moves.find((m) => m.op === "arc") as { power: number }).power, 0.05);
  assert.equal(ops[0]!.moves.filter((m) => m.op === "cut").length, 3, "the other three sides");
  assert.deepEqual(out.value.marks, { [c.circle]: "engrave", [r.lines[0]!]: "score" });
  const s1 = run(all, { type: "batch", commands: recordCommands(out.value) });
  const part = flatSnapshot(all);
  assert.ok(part.ok);
  if (part.ok) assert.deepEqual(planFor(scene(s1), part.value.id, LASER_ROUTE)!.marks, out.value.marks);
});

test("the route applies marks by ref through its context; a mark that names nothing, or something that is not a layer, is ignored", () => {
  const route = builtInRoutes[0]!;
  const part: PartSnapshot = { contract: CONTRACT_VERSION, id: "p", name: "P", kind: "flat", units: "mm", bbox: { min: [0, 0, 0], max: [10, 10, 0] },
    outlines: [{ plane: { origin: [0, 0, 0], xDir: [1, 0, 0], normal: [0, 0, 1] }, pieces: [{ kind: "line", p: [0, 0], q: [10, 0], ref: "a" }, { kind: "line", p: [0, 5], q: [10, 5], ref: "b", layer: "engrave" }, { kind: "line", p: [0, 8], q: [10, 8], ref: "c" }] }] };
  const machine = { process: "laser", name: "m", envelope: { min: [0, 0, 0], max: [100, 100, 0] }, limits: { feed: 6000 } } as unknown as MachineDefinition;
  const ids = (marks?: Record<string, string>) => runRoute(route, part, { machine, settings: { ...defaultSettings(route), kerf: 0 }, ...(marks ? { marks } : {}) }).toolpath!.operations.map((o) => o.id);
  assert.deepEqual(ids(), ["cut", "engrave"], "the part's own layer is used when there is no mark");
  assert.deepEqual(ids({ a: "score" }), ["cut", "score", "engrave"]);
  assert.deepEqual(ids({ b: "cut" }), ["cut"], "a mark wins over the part's own layer");
  assert.deepEqual(ids({ zzz: "score", a: "sparkle" }), ["cut", "engrave"], "nothing named, or not a layer: ignored");
});

test("the dialog says which layers are marked; the dialog and the menu: Laser layers… is live with drawn lines selected; the ring has no layer category and no drawn line has a field for one", () => {
  assert.equal(laserDialog(laserDefaults(), [], "2 lines score").fields[0]!.value, "2 lines score");
  assert.equal(laserDialog(laserDefaults()).fields.some((f) => f.id === "layers"), false);
  const { s, r, pick } = plate();
  const d = layersDialog(pick([r.lines[0]!]), { role: "score" });
  assert.equal(d.title, "Laser layers: 1 line"); assert.equal(d.ok, "Set");
  assert.deepEqual(d.fields[0]!.choices!.map((c) => c.value), ["cut", "score", "engrave"]);
  assert.match(String(d.fields[1]!.value), /for the laser route only/);
  const rows = (can: boolean) => fabricateRows({ laserLayers: can }).filter((x) => x.id === "laserLayers");
  assert.deepEqual(rows(true).map((x) => [x.label, x.enabled]), [["Laser layers…", true]]);
  assert.deepEqual(rows(false).map((x) => [x.enabled, x.why]), [[false, "select lines or a figure of the drawing first"]]);
  const ring = reduce({ ...createState(pick([loopFaceRef(r.lines)])), cam: homeCamera() }, { type: "menu", x: 400, y: 300, button: true }, env).menu!.items.map((i) => i.id);
  assert.ok(!ring.includes("layer") && !ring.some((id) => id.startsWith("use:")));
  assert.ok(Object.values(scene(s).parts).every((p) => !("use" in p)));
});

test("a project saved before the marks moved (its history has the old command that marked a drawn line) still opens: the marks become the laser route's, and the drawing is untouched", () => {
  const { s, r, c } = plate();
  const old = run(run(s, { type: "setUse", refs: [c.circle], use: "engrave" }), { type: "setUse", refs: [r.lines[0]!, r.lines[1]!], use: "score" });
  assert.equal(marksSummary(scene(old), "sketch/w/XY"), "2 lines score, 1 line engrave");
  assert.ok(Object.values(scene(old).parts).every((p) => !("use" in p)), "no field on a drawn line");
  const back = openSession(kernel, saveText(old));
  assert.ok(back.ok);
  if (back.ok) assert.equal(marksSummary(scene(back.value), "sketch/w/XY"), "2 lines score, 1 line engrave");
  const cleared = run(old, { type: "setUse", refs: [c.circle], use: "cut" });
  assert.equal(marksSummary(scene(cleared), "sketch/w/XY"), "2 lines score", "cut took the old mark off");
});
