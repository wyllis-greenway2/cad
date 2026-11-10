// Select similar (`in_257`): the same kind, size and angle between faces; not direction unless asked.
import test from "node:test";
import fs from "node:fs";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene, openSession } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Command } from "../src/operation/commands.ts";
import type { Part } from "../src/operation/part.ts";
import { drawSquaredRectangle } from "../src/operation/build.ts";
import { nextId } from "../src/operation/scene.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";
import { similarTo } from "../src/interaction/similar.ts";
import { faceEdges } from "../src/interaction/offsetbody.ts";

await kernel.init();
const XY = worldRef("XY");
const box = (w = 40, d = 20, h = 20): Session => {
  let s = createSession(kernel);
  const r = drawSquaredRectangle(scene(s), XY, [0, 0, 0], [w, d, 0], [1, 0, 0], [0, 1, 0]);
  s = run(s, r.command);
  return run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: r.lines, params: { depth: h } } });
};
const bodyLines = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body");
const ends = (s: Session, l: Extract<Part, { kind: "line" }>) => { const a = scene(s).parts[l.a], b = scene(s).parts[l.b]; return a?.kind === "corner" && b?.kind === "corner" ? [a.at, b.at] : []; };

test("edges: the same length, and the same angle between faces, are similar; a different length is not; direction only when asked", () => {
  const s = box();
  const lines = bodyLines(s);
  assert.equal(lines.length, 12);
  const longX = lines.find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[0] - b[0]) - 40) < 1e-6; })!;
  const r = similarTo(scene(s), [longX.ref]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.refs.length, 4, "the four 40 mm edges of the box");
  assert.equal(r.noun, "edge");
  const equalLen = similarTo(scene(s), [lines.find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[1] - b[1]) - 20) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6; })!.ref]);
  assert.ok(equalLen.ok && equalLen.refs.length === 4 + 4, "the 20 mm edges along y (4) and along z (4): a turned copy matches");
  const withDir = similarTo(scene(s), [lines.find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[1] - b[1]) - 20) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6; })!.ref], ["kind", "size", "angle", "direction"]);
  assert.ok(withDir.ok && withDir.refs.length === 4, "only the ones along y");
  const anySize = similarTo(scene(s), [longX.ref], ["kind", "angle"]);
  assert.ok(anySize.ok && anySize.refs.length === 12, "loosened: size off, every straight edge between two flat faces at 90 degrees");
});

test("the angle between the faces is a rule: a bevelled edge is not like a sharp one, and a concave corner is not like a convex one", () => {
  let s = box();
  const edge = bodyLines(s).find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(a[2] - 20) < 1e-6 && Math.abs(b[2] - 20) < 1e-6 && Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6; })!;
  const st = startOp(scene(s), [edge.ref], "edge");
  assert.ok(st.ok);
  if (!st.ok) return;
  s = run(s, opCommand(scene(s), { ...st.op, value: -3 })! as Command); // chamfer one top edge
  const lines = bodyLines(s);
  const chamfered = lines.filter((l) => { const r = similarTo(scene(s), [l.ref]); return r.ok && r.refs.length >= 1; });
  assert.ok(chamfered.length > 0);
  // the two edges of the 45 degree face (they are 135 degrees between faces) are like each other and not like the rest
  const slanted = lines.filter((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[0] - b[0]) - 40) < 1e-6; });
  const groups = new Set(slanted.map((l) => { const r = similarTo(scene(s), [l.ref]); return r.ok ? r.refs.sort().join("|") : ""; }));
  assert.deepEqual([...groups].map((g) => g.split("|").length).sort(), [2, 3], "the three sharp 40 mm edges, and the two at 135 degrees (the bevel's own)");
});

test("faces: flat faces of the same area are similar", () => {
  const s = box(40, 20, 10);
  const faces = Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh);
  assert.equal(faces.length, 6);
  const f = faces.find((p) => p.mesh!.every((_, i) => i % 3 !== 2 || Math.abs(p.mesh![i]! - 10) < 1e-6))!; // the top: 40 x 20 (the sides are 40 x 10 and 20 x 10)
  const r = similarTo(scene(s), [f.ref]);
  assert.ok(r.ok && r.refs.length === 2 && r.noun === "face", "top and bottom");
  const looser = similarTo(scene(s), [f.ref], ["kind"]);
  assert.ok(looser.ok && looser.refs.length === 6);
  assert.deepEqual(faceEdges(scene(s), f).length, 4);
});

test("a message when the selection cannot say what is similar", () => {
  const s = box();
  const none = similarTo(scene(s), []);
  assert.ok(!none.ok);
  const mixed = similarTo(scene(s), [bodyLines(s)[0]!.ref, Object.values(scene(s).parts).find((p) => p.kind === "plane" && p.origin === "body" && !!(p as { mesh?: unknown }).mesh)!.ref]);
  assert.ok(!mixed.ok);
  assert.ok(!similarTo(scene(s), [XY]).ok);
});

const pt = (r: number, deg: number): [number, number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), 0];
function twoTips(): Session {
  let s = createSession(kernel);
  const cmds: Command[] = [];
  const corner = (ref: string, at: [number, number, number]) => cmds.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref, kind: "corner", at } } as unknown as Command);
  const line = (ref: string, a: string, b: string, center?: string) => cmds.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref, kind: "line", a, b, ...(center ? { center, ccw: true } : {}) } } as unknown as Command);
  corner("d/o", [0, 0, 0]);
  corner("d/a1", pt(20, 10)); corner("d/a2", pt(20, 40)); corner("d/b1", pt(20, 100)); corner("d/b2", pt(20, 130));
  line("d/arc1", "d/a1", "d/a2", "d/o"); line("d/l1", "d/a2", "d/b1"); line("d/arc2", "d/b1", "d/b2", "d/o"); line("d/l2", "d/b2", "d/o"); line("d/l3", "d/o", "d/a1");
  s = run(s, { type: "batch", commands: cmds });
  const face = Object.values(scene(s).parts).find((p) => p.kind === "face")!;
  const st = startOp(scene(s), [face.ref], "extrude");
  if (!st.ok) throw new Error("no extrude");
  return run(s, opCommand(scene(s), { ...st.op, value: 6 })!);
}

test("the arcs along the tips of two teeth (turned from each other) are similar; their top and bottom edges match each other too", () => {
  const s = twoTips();
  const arcs = bodyLines(s).filter((l) => (l.mid || l.circle) && !l.twin && l.a !== l.b);
  assert.equal(arcs.length, 4);
  const r = similarTo(scene(s), [arcs[0]!.ref]);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.refs.length, 4, "both tips, top and bottom");
  const sketch = similarTo(scene(s), []);
  assert.ok(!sketch.ok);
});

test("sketch parts: the lines of a sketch of the same length are similar, and an arc is not like a line", () => {
  const s = twoTips();
  const l = scene(s).parts["d/l1"]!;
  const r = similarTo(scene(s), [l.ref]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.noun, "sketch part");
  assert.ok(r.refs.includes("d/l1" as never));
  assert.ok(!r.refs.includes("d/arc1" as never));
  const arc = similarTo(scene(s), ["d/arc1" as never]);
  assert.ok(arc.ok && arc.refs.includes("d/arc2" as never) && !arc.refs.includes("d/l1" as never));
});

import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import { selection } from "../src/interaction/session.ts";
const env = { w: 800, h: 600, now: 0 };

test("the menu item selects what is similar, the chip's boxes loosen a rule and tighten another, and the chip goes when the selection changes", () => {
  const s = box();
  const longX = bodyLines(s).find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[0] - b[0]) - 40) < 1e-6; })!;
  let st = { ...createState(s), };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [longX.ref] } } };
  st = reduce(st, { type: "runAction", id: "select:similar" }, env);
  assert.equal(selection(st.session).length, 4);
  assert.equal(st.session.message, "selected 4 similar edges");
  let f = frameOf(st, env);
  assert.deepEqual(f.similar?.rules.map((r) => [r.id, r.on]), [["kind", true], ["size", true], ["angle", true], ["direction", false]]);
  st = reduce(st, { type: "similarRule", rule: "size" }, env);
  assert.equal(selection(st.session).length, 12, "size off: every straight edge between two faces at a right angle");
  st = reduce(st, { type: "similarRule", rule: "size" }, env);
  st = reduce(st, { type: "similarRule", rule: "direction" }, env);
  assert.equal(selection(st.session).length, 4, "size back on and direction on: the 40 mm edges along x");
  // a click that changes the selection takes the chip away
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [longX.ref] } } };
  f = frameOf(st, env);
  assert.equal(f.similar, null);
  // the menu says why when it cannot
  const empty = reduce(createState(s), { type: "menu", x: 100, y: 100, button: true }, env).menu!.items.flatMap((i) => i.children ?? [i]).find((i) => i.id === "select:similar")!;
  assert.equal(empty.enabled, false);
  assert.match(empty.why ?? "", /select an edge, a face/);
});


test("every outer edge of the gear's teeth is similar to one of them: corners that are the same point fall either side of a rounding boundary and must still be found (`in_267`)", { skip: !fs.existsSync("test/fixtures/gear-outer.cad.json") }, () => {
  const o = openSession(kernel, fs.readFileSync("test/fixtures/gear-outer.cad.json", "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const sc = scene(o.value);
  const seed = Object.values(sc.parts).find((p) => {
    if (p.kind !== "line" || p.origin !== "body" || p.mid) return false;
    const a = sc.parts[p.a];
    return a?.kind === "corner" && Math.abs(a.at[0] - 20.04) < 0.01 && Math.abs(a.at[1] - 38.85) < 0.01;
  })!;
  const r = similarTo(sc, [seed.ref]);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.refs.length, 30, "the thirty outer tooth edges");
});

import { suggestionsFor } from "../src/interaction/suggest.ts";
test("select similar is offered as a suggestion button when there are others like what is selected, and not when there are none or all are already selected (`in_268`)", () => {
  const s = box();
  const longX = bodyLines(s).find((l) => { const [a, b] = ends(s, l); return a && b && Math.abs(Math.abs(a[0] - b[0]) - 40) < 1e-6; })!;
  const offer = suggestionsFor(scene(s), [longX.ref]);
  assert.ok(offer);
  assert.deepEqual(offer!.items.map((i) => i.id), ["select:similar"]);
  assert.match(offer!.items[0]!.label, /3 more/);
  const all = similarTo(scene(s), [longX.ref]);
  assert.ok(all.ok);
  if (all.ok) assert.equal(suggestionsFor(scene(s), all.refs), null, "all four are selected: nothing more to select");
  const top = Object.values(scene(s).parts).find((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!p.mesh && p.mesh.every((_, i) => i % 3 !== 2 || Math.abs(p.mesh![i]! - 20) < 1e-6))!;
  assert.equal(suggestionsFor(scene(s), [top.ref])?.items[0]?.id, "select:similar", "a face too (the bottom is like it)");
});
