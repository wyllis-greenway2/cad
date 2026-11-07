// `in_195`: tangent lines make closed regions, constraints show when their parts are selected, suggested constraints, and the trim tool.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, openSession } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera, lookStraight, projector } from "../src/interaction/camera.ts";
import { drawCircle, drawChain } from "../src/operation/build.ts";
import { annotationsFor } from "../src/interaction/annotations.ts";
import { suggestionsFor } from "../src/interaction/suggest.ts";
import { trimAt } from "../src/operation/trim.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import type { Part } from "../src/operation/part.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const XY = worldRef("XY");
const env = { w: 800, h: 600, now: 0 };
const parts = (s: ReturnType<typeof createSession>) => Object.values(scene(s).parts) as Part[];
const file = () => { const r = openSession(kernel, readFileSync(new URL("./fixtures/tangent-lines.cad.json", import.meta.url), "utf8")); assert.ok(r.ok); return r.value; };

test("lines the solver made tangent to a circle touch it (within a hair): the circle is cut by them and the regions between them are closed sketches", () => {
  const faces = parts(file()).filter((p) => p.kind === "face");
  assert.ok(faces.length >= 4, `${faces.length} regions`);
  assert.ok(!faces.some((f) => f.kind === "face" && f.disk === "d/e_002.k"), "the tangent circle is cut at its two touching points, not a plain disk");
});

test("selecting a line or a circle shows the constraints it has, tangent and point-on-circle ones too, and those of its end points", () => {
  const s = file();
  const kinds = (sel: string[]) => annotationsFor(scene(s), sel as never, null).map((a) => a.kind);
  assert.ok(kinds(["d/e_003.s0"]).includes("tangent"), "the line shows its tangent");
  assert.ok(kinds(["d/e_003.s0"]).includes("onCircle"), "and its end's point-on-circle");
  assert.ok(kinds(["d/e_002.k"]).includes("tangent"), "the circle shows the tangents on it");
});

test("with one or two parts selected, the constraints that could go on them are offered, not the ones already there; applying one: the first selected stays and the one after it moves (`in_196`)", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [20, 3, 0]]); s = run(s, a.command);
  const c = drawCircle(scene(s), XY, [10, 12, 0], 4); s = run(s, c.command);
  const offered = (sel: string[]) => suggestionsFor(scene(s), sel as never)?.items.map((i) => i.id) ?? [];
  assert.ok(offered([a.lines[0]!]).includes("horizontal"));
  assert.ok(offered([a.lines[0]!, c.circle]).includes("tangent"));
  assert.equal(suggestionsFor(scene(s), []), null);
  const st0 = { ...createState(s), session: { ...s, click: { ...s.click, selection: [c.circle, a.lines[0]!] } } }; // (the circle is picked first and stays; the line moves to it)
  const st = reduce(st0, { type: "runAction", id: "tangent" }, env);
  assert.deepEqual(scene(st.session).relations.map((r) => r.kind), ["tangent"]);
  assert.ok(!(suggestionsFor(scene(st.session), [a.lines[0]!, c.circle])?.items.map((i) => i.id) ?? []).includes("tangent"), "no longer offered once it holds");
  // the first selected (the circle) stayed
  const circleAfter = scene(st.session).parts[c.circle] as { center: string };
  assert.deepEqual((scene(st.session).parts[circleAfter.center] as unknown as { at: Vec3 }).at, [10, 12, 0]);
});

test("trim: the part of a line between two crossing lines is cut off and the two pieces stay, on the lines that cut them", () => {
  let s = createSession(kernel);
  const base = drawChain(scene(s), XY, [[0, 0, 0], [40, 0, 0]]); s = run(s, base.command);
  s = run(s, drawChain(scene(s), XY, [[10, -10, 0], [10, 10, 0]]).command);
  s = run(s, drawChain(scene(s), XY, [[30, -10, 0], [30, 10, 0]]).command);
  const plan = trimAt(scene(s), base.lines[0]!, [20, 0, 0])!;
  assert.ok(plan);
  assert.equal(plan.span.length, 2);
  assert.ok(Math.abs(plan.span[0]![0] - 10) < 1e-6 && Math.abs(plan.span[1]![0] - 30) < 1e-6, "the middle is what goes");
  const t = run(s, plan.command);
  assert.equal(t.message, null);
  const lines = parts(t).filter((p) => p.kind === "line" && p.origin === "drawn");
  assert.equal(lines.length, 4, "two cutting lines and the two pieces");
  assert.ok(!parts(t).some((p) => p.ref === base.lines[0]!), "the old line is gone");
  assert.equal(scene(t).relations.filter((r) => r.kind === "onLine").length, 2, "the new ends stay on the lines that cut them");
  // the end of a line: cut at the first crossing only
  const end = trimAt(scene(s), base.lines[0]!, [3, 0, 0])!;
  const t2 = run(s, end.command);
  assert.equal(parts(t2).filter((p) => p.kind === "line" && p.origin === "drawn").length, 3, "one piece left");
});

test("trim: a circle cut by two lines becomes the arc that is left (about its own centre)", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), XY, [0, 0, 0], 10); s = run(s, c.command);
  s = run(s, drawChain(scene(s), XY, [[-15, 4, 0], [15, 4, 0]]).command);
  s = run(s, drawChain(scene(s), XY, [[-15, -4, 0], [15, -4, 0]]).command);
  const plan = trimAt(scene(s), c.circle, [0, 10, 0])!; // the top between the two lines? the lines cut the left and right sides: the top arc is between four cuts
  assert.ok(plan);
  const t = run(s, plan.command);
  assert.equal(t.message, null);
  assert.ok(!parts(t).some((p) => p.kind === "circle"), "the circle is gone");
  const arcs = parts(t).filter((p) => p.kind === "line" && p.origin === "drawn" && p.center && !p.derived);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0]!.kind === "line" && arcs[0]!.center, c.centre, "an arc about the circle's own centre");
});

test("the trim tool: it is in the right-click list, stays on, and a click cuts the part under the pointer", () => {
  let s = createSession(kernel);
  const base = drawChain(scene(s), XY, [[0, 0, 0], [40, 0, 0]]); s = run(s, base.command);
  s = run(s, drawChain(scene(s), XY, [[10, -10, 0], [10, 10, 0]]).command);
  let st = { ...createState(s), cam: { ...lookStraight(homeCamera(), [0, 0, 1], [1, 0, 0]), target: [20, 0, 0] as Vec3 } };
  st = reduce(st, { type: "begin", name: "trim" }, env);
  assert.equal(st.tool!.kind, "trim");
  const [x, y] = projector(st.cam, 800, 600).project([25, 0, 0]);
  const hovered = reduce(st, { type: "hover", x, y }, env);
  assert.ok(hovered.tool!.trimming, "the part that would go is shown");
  const done = reduce(hovered, { type: "click", x, y, count: 1, shift: false }, env);
  assert.ok(done.tool && done.tool.kind === "trim", "the tool stays on");
  assert.equal(parts(done.session).filter((p) => p.kind === "line" && p.origin === "drawn").length, 2, "the part right of the crossing is gone, the left piece and the cutting line stay");
});

test("two circles joined by two lines that leave them tangentially (a belt): the two disks and the belt between are closed sketches, and the belt extrudes (`in_197`)", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/belt.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const s = r.value;
  const faces = parts(s).filter((p) => p.kind === "face");
  assert.equal(faces.length, 3);
  const belt = faces.find((f) => f.kind === "face" && f.loop.length === 4)!;
  const st = startOp(scene(s), [belt.ref], "extrude") as { ok: true; op: Parameters<typeof opCommand>[1] };
  const t = run(s, opCommand(scene(s), { ...st.op, value: 5 })!);
  assert.deepEqual(t.outcome.errors, {});
  assert.ok(t.outcome.kernel!.volume! > 100, `${t.outcome.kernel!.volume}`);
});
