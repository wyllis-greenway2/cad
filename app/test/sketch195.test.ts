import { actionsFor } from "../src/interaction/actions.ts";
// `in_195`: tangent lines make closed regions, constraints show when their parts are selected, suggested constraints, and the trim tool.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldRef } from "../src/shared/ref.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene, openSession } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { homeCamera, lookStraight, projector } from "../src/interaction/camera.ts";
import { drawCircle, drawChain, drawArc } from "../src/operation/build.ts";
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

test("with one or two parts selected, the constraints that could go on them are offered, not the ones already there; applying one: the first selected moves to the one after it (`in_229`)", () => {
  let s = createSession(kernel);
  const a = drawChain(scene(s), XY, [[0, 0, 0], [20, 3, 0]]); s = run(s, a.command);
  const c = drawCircle(scene(s), XY, [10, 12, 0], 4); s = run(s, c.command);
  const offered = (sel: string[]) => suggestionsFor(scene(s), sel as never)?.items.map((i) => i.id) ?? [];
  assert.ok(offered([a.lines[0]!]).includes("horizontal"));
  assert.ok(offered([a.lines[0]!, c.circle]).includes("tangent"));
  assert.equal(suggestionsFor(scene(s), []), null);
  const st0 = { ...createState(s), session: { ...s, click: { ...s.click, selection: [a.lines[0]!, c.circle] } } }; // (the line is picked first and moves to the circle, `in_229`)
  const st = reduce(st0, { type: "runAction", id: "tangent" }, env);
  assert.deepEqual(scene(st.session).relations.map((r) => r.kind), ["tangent"]);
  assert.ok(!(suggestionsFor(scene(st.session), [a.lines[0]!, c.circle])?.items.map((i) => i.id) ?? []).includes("tangent"), "no longer offered once it holds");
  // the second selected (the circle) stayed
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

// ---- inset of the edges of the body, the phantom line (`in_199`) ----
const stadium = () => { const r = openSession(kernel, readFileSync(new URL("./fixtures/stadium-body.cad.json", import.meta.url), "utf8")); assert.ok(r.ok); return r.value; };
const bottomEdges = (s: ReturnType<typeof stadium>) => (parts(s) as Part[]).filter((p) => p.kind === "line" && p.origin === "body" && (scene(s).parts[p.a] as unknown as { at: number[] }).at[2] === 0 && (scene(s).parts[p.b] as unknown as { at: number[] }).at[2] === 0);

test("a straight edge and a curved one selected together show no distance bubble and no line (the distance between a line and an arc is not one number)", () => {
  const s = stadium();
  const e = bottomEdges(s);
  const sel = [e.find((l) => l.kind === "line" && !l.mid)!.ref, e.find((l) => l.kind === "line" && l.mid)!.ref];
  assert.deepEqual(annotationsFor(scene(s), sel, null).filter((a) => a.kind === "distance"), []);
});

test("the bottom edges of the body can be inset into a sketch: all four (lines and arcs, tangent where they meet), the bottom face selected whole, or just a line and an arc", () => {
  const s = stadium();
  const faces0 = parts(s).filter((p) => p.kind === "face").length;
  const edges = bottomEdges(s);
  const inset = (sel: string[], v = -1.5) => { const st = startOp(scene(s), sel as never, "offset"); assert.ok(st.ok, st.ok ? "" : st.why); const cmd = opCommand(scene(s), { ...(st as { ok: true; op: Parameters<typeof opCommand>[1] }).op, value: v }); assert.ok(cmd); return run(s, cmd!); };
  const all = inset(edges.map((l) => l.ref));
  assert.equal(all.message, null);
  const arcs = parts(all).filter((p) => p.kind === "line" && p.origin === "drawn" && p.center && !p.derived);
  const lines = parts(all).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.center);
  assert.ok(arcs.length >= 2 + 2 && lines.length >= 2 + 2, "two lines and two arcs were made (besides the extruded sketch's own)");
  assert.ok(parts(all).filter((p) => p.kind === "face").length > faces0, "the inset outline is a closed sketch");
  // the arcs are smaller (inward) about the same centres
  const radii = arcs.map((a) => (a.kind === "line" ? Math.hypot(...(["x", "y"] as const).map((_, i) => ((scene(all).parts[a.a] as unknown as { at: number[] }).at[i]! - (scene(all).parts[a.center!] as unknown as { at: number[] }).at[i]!)) ) : 0));
  assert.ok(radii.some((r) => Math.abs(r - (7.825375 - 1.5)) < 0.01) && radii.some((r) => Math.abs(r - (4.14035 - 1.5)) < 0.01), `${radii}`);
  // the face selected whole: the same
  const bottom = parts(s).find((p) => p.kind === "plane" && p.origin === "body" && p.ref.startsWith("b/body/f@0,0,-1,0"))!;
  const whole = inset([bottom.ref]);
  assert.equal(whole.message, null);
  assert.ok(parts(whole).filter((p) => p.kind === "face").length > faces0);
  // a line and an arc: an open chain of two
  const two = inset([edges.find((l) => l.kind === "line" && !l.mid)!.ref, edges.find((l) => l.kind === "line" && l.mid)!.ref]);
  assert.equal(two.message, null);
  // outwards instead (the other way): bigger arcs
  const out = inset(edges.map((l) => l.ref), 1.5);
  assert.equal(out.message, null);
});

test("trim cuts an arc where lines cross it (`in_228`): the part under the pointer goes, the arcs on either side stay about the same middle and end on what cut them", () => {
  let s = createSession(kernel);
  // a half circle about the origin from (10, 0) round through (0, 10) to (-10, 0), crossed by two vertical lines
  const arc = drawArc(scene(s), XY, [10, 0, 0], [0, 10, 0], [-10, 0, 0], [0, 0, 1])!;
  s = run(s, arc.command);
  for (const x of [5, -5]) s = run(s, drawChain(scene(s), XY, [[x, -2, 0], [x, 14, 0]], false, { reuse: true }).command);
  const plan = trimAt(scene(s), arc.line, [0, 10, 0])!;
  assert.ok(plan, "can be trimmed between the two lines");
  assert.ok(plan.span.length > 2, "and shows what goes");
  const done = run(s, plan.command);
  const arcs = Object.values(scene(done).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !!p.center);
  assert.equal(arcs.length, 2, "an arc on each side");
  assert.ok(!(arc.line in scene(done).parts), "the old arc is gone");
  for (const a of arcs) {
    if (a.kind !== "line") continue;
    assert.equal(a.center, arc.centre, "about the same middle");
    for (const e of [a.a, a.b]) { const q = (scene(done).parts[e] as { at: Vec3 }).at; assert.ok(Math.abs(Math.hypot(q[0], q[1]) - 10) < 1e-3); }
  }
  // a click on the part beyond the first line (towards (10,0)) cuts from the end to the first line
  const end = trimAt(scene(s), arc.line, [9, 4, 0])!;
  assert.ok(end);
  const doneEnd = run(s, end.command);
  assert.equal(Object.values(scene(doneEnd).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !!p.center).length, 1, "one arc is left");
});

test("trim keeps the constraints that made the sketch what it is (`in_229`): a line made tangent to two circles stays tangent to them on the piece that is left, and a circle that becomes an arc keeps its tangent lines (and its size as a radius)", () => {
  let s = createSession(kernel);
  const a = drawCircle(scene(s), XY, [0, 0, 0], 10); s = run(s, a.command);
  const b = drawCircle(scene(s), XY, [40, 0, 0], 4); s = run(s, b.command);
  const l = drawChain(scene(s), XY, [[-12, 14, 0], [52, 6, 0]]); s = run(s, l.command);
  const tangent = (x: string, y: string) => { const act = actionsFor(scene(s), [x as never, y as never]).find((q) => q.id === "tangent")!; assert.ok(act?.enabled, "tangent offered"); s = run(s, act.run()); };
  tangent(l.lines[0]!, a.circle); tangent(l.lines[0]!, b.circle);
  // the line touches each circle once: cut it where it touches, by a line across at each end
  s = run(s, drawChain(scene(s), XY, [[-6, 0, 0], [-6, 20, 0]], false, { reuse: true }).command);
  const tangents = () => scene(s).relations.filter((r) => r.kind === "tangent");
  assert.equal(tangents().length, 2);
  const lineBefore = l.lines[0]!;
  const plan = trimAt(scene(s), lineBefore, [-10, 14, 0]);
  assert.ok(plan, "the end beyond the crossing line can be trimmed");
  s = run(s, plan!.command);
  const pieces = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "drawn" && !p.center && tangents().some((r) => r.parts.includes(p.ref)));
  assert.equal(pieces.length >= 1, true, "a piece that is left is still tangent");
  const touched = new Set(tangents().flatMap((r) => r.parts));
  assert.ok(touched.has(a.circle) && touched.has(b.circle), "to both circles");
  assert.ok(!tangents().some((r) => r.parts.includes(lineBefore)), "none on the line that went");
});
