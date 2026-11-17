// Names for flat faces that last through the steps (`dec_stable_reference_mechanism`, `in_559`): the kernel gives each flat face a name when it is made and carries it through the steps after.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";

await kernel.init();
type R = { ops: { id: string; error: string | null }[]; volume: number; bbox: { min: number[]; max: number[] }; faceNames?: { name: string; n: number[]; c: number[] }[] };
const rect = (w: number) => ({ id: "s_a", type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, 10], [0, 10]], plane: "XY", origin: 0 });
const ev = (ops: unknown[]) => kernel.evaluate({ params: {}, names: true, ops } as never) as unknown as R;
const nameAt = (r: R, n: number[], z: number) => r.faceNames!.find((f) => f.n.every((v, i) => Math.abs(v - n[i]!) < 1e-6) && Math.abs(f.c[2]! * (n[2] ? 1 : 0) - z * (n[2] ? 1 : 0)) < 1e-6)?.name;

test("an extruded block has six named faces, and the names are the same for any size", () => {
  const a = ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }]);
  const b = ev([rect(14), { id: "x_a", type: "extrude", profile: "s_a", distance: 25 }]);
  assert.equal(a.faceNames!.length, 6);
  assert.deepEqual(a.faceNames!.map((f) => f.name).sort(), b.faceNames!.map((f) => f.name).sort());
  assert.equal(new Set(a.faceNames!.map((f) => f.name)).size, 6);
  assert.equal(nameAt(a, [0, 0, 1], 10), nameAt(b, [0, 0, 1], 25), "the top is the top, taller or not");
});

test("a push of the top face by its name follows the top when the extrusion is made taller", () => {
  const top = nameAt(ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }]), [0, 0, 1], 10)!;
  const run = (depth: number) => ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }, { id: "p", type: "faceExtrude", target: "x_a", ref: { name: top, n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 3 }]);
  const r10 = run(10), r20 = run(20);
  assert.equal(r10.ops.find((o) => o.id === "p")!.error, null);
  assert.ok(Math.abs(r10.volume - 1300) < 1e-3);
  assert.equal(r20.ops.find((o) => o.id === "p")!.error, null);
  assert.ok(Math.abs(r20.volume - 2300) < 1e-3, `the top of the taller one was pushed: ${r20.volume}`);
});

test("a step put between two others does not change what a later step names", () => {
  const base = [rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }];
  const top = nameAt(ev(base), [0, 0, 1], 10)!;
  const later = { id: "p", type: "faceExtrude", target: "m", ref: { name: top, n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 2 };
  // the later step names the top of the block; a step that moves the block up by 7 is put between: the name still finds the top (now at 17)
  const without = ev([...base, { ...later, target: "x_a" }]);
  const withMove = ev([...base, { id: "m", type: "transform", mode: "move", target: "x_a", axis: 2, value: 7 }, later]);
  assert.equal(withMove.ops.find((o) => o.id === "p")!.error, null, withMove.ops.map((o) => o.error).join());
  assert.ok(Math.abs(without.volume - 1200) < 1e-3);
  assert.ok(Math.abs(withMove.volume - 1200) < 1e-3);
  assert.ok(Math.abs(withMove.bbox.max[2]! - 19) < 1e-6, `the pushed top is at 19: ${withMove.bbox.max[2]}`);
});

test("a name the body has lost is an error, never another face", () => {
  const r = ev([rect(10), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }, { id: "p", type: "faceExtrude", target: "x_a", ref: { name: "nothing:9", n: [0, 0, 1], d: 10, point: [5, 5, 10] }, distance: 3 }]);
  assert.match(r.ops.find((o) => o.id === "p")!.error ?? "", /not a face of the body/);
});

import { createSession, scene, run } from "../src/interaction/session.ts";
import { worldRef } from "../src/shared/ref.ts";
import { drawRectangle } from "../src/operation/build.ts";

test("in the model: the faces of the body carry their lasting names, and a push keeps the top's name through a change of the depth", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const planes = Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { ref: string; stable?: string; at: number[] }[];
  assert.equal(planes.length, 6);
  assert.ok(planes.every((p) => p.stable), "every flat face has a lasting name");
  const top = planes.find((p) => Math.abs(p.at[2]! - 10) < 1e-6 && p.ref.includes("0,0,1"))!;
  s = run(s, { type: "addStep", step: { id: "s_101", type: "pushPull", parts: [top.ref], params: { depth: 3, nx: 0, ny: 0, nz: 1, fd: 10, px: 5, py: 5, pz: 10, fname: top.stable! } } } as never);
  assert.deepEqual(s.outcome.errors, {});
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 20 } });
  assert.deepEqual(s.outcome.errors, {});
  const vol = (s.outcome.kernel as { volume: number }).volume;
  assert.ok(Math.abs(vol - 2300) < 1e-3, `the taller block with its top pushed by 3: ${vol}`);
});

type RE = R & { edgeNames?: { name: string; a: number[]; b: number[]; mid: number[] }[] };
const evE = (ops: unknown[]) => kernel.evaluate({ params: {}, names: true, ops } as never) as unknown as RE;
const edgeAt = (r: RE, mid: number[]) => r.edgeNames!.find((e) => e.mid.every((v, i) => Math.abs(v - mid[i]!) < 1e-6))!;
const block = (depth: number, w = 10) => [rect(w), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }];

test("the twelve edges of a block are named by their two faces, the same for any size", () => {
  const a = evE(block(10)), b = evE(block(25, 14));
  assert.equal(a.edgeNames!.length, 12);
  assert.equal(new Set(a.edgeNames!.map((e) => e.name)).size, 12);
  assert.deepEqual(a.edgeNames!.map((e) => e.name).sort(), b.edgeNames!.map((e) => e.name).sort());
  assert.equal(edgeAt(a, [5, 0, 10]).name, edgeAt(b, [7, 0, 25]).name, "the top front edge is the same edge, wider and taller");
});

test("a fillet by an edge's name follows it when the extrusion is made taller, and when a step is put before it", () => {
  const name = edgeAt(evE(block(10)), [5, 0, 10]).name;
  const fillet = (target: string) => ({ id: "f", type: "edgeMod", target, mode: "fillet", value: 1, ref: [{ name, a: [0, 0, 10], b: [10, 0, 10], mid: [5, 0, 10] }] });
  const vol = (r: RE) => r.volume;
  const f10 = evE([...block(10), fillet("x_a")]);
  assert.equal(f10.ops.find((o) => o.id === "f")!.error, null);
  assert.ok(Math.abs(vol(f10) - (1000 - (1 - Math.PI / 4) * 10)) < 1e-3);
  // taller: the old numbers (an edge at z = 10) would find nothing or the wrong edge; the name finds the top front edge, now at z = 25
  const f25 = evE([...block(25), fillet("x_a")]);
  assert.equal(f25.ops.find((o) => o.id === "f")!.error, null, f25.ops.map((o) => o.error).join());
  assert.ok(Math.abs(vol(f25) - (2500 - (1 - Math.PI / 4) * 10)) < 1e-3);
  // a step put before: the block is moved up by 7; the name still finds the edge
  const moved = evE([...block(10), { id: "m", type: "transform", mode: "move", target: "x_a", axis: 2, value: 7 }, fillet("m")]);
  assert.equal(moved.ops.find((o) => o.id === "f")!.error, null, moved.ops.map((o) => o.error).join());
  // it was the top edge: the corner of the filleted top front edge is rounded, so the box's lowest corner edge is untouched
  assert.ok(Math.abs(vol(moved) - (1000 - (1 - Math.PI / 4) * 10)) < 1e-3);
  // a lost name is an error
  const lost = evE([...block(10), { ...fillet("x_a"), ref: [{ name: "nothing|else", a: [0, 0, 10], b: [10, 0, 10], mid: [5, 0, 10] }] }]);
  assert.match(lost.ops.find((o) => o.id === "f")!.error ?? "", /not an edge of the body/);
});

test("in the model: the edges between flat faces carry lasting names, and a fillet keeps its edge through a change of the depth", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const lines = Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "body") as unknown as { ref: string; stable?: string; a: string; b: string }[];
  assert.equal(lines.length, 12);
  assert.ok(lines.every((l) => l.stable), "every edge of the block has a lasting name");
  const pt = (r: string) => (scene(s).parts[r] as unknown as { at: number[] }).at;
  const top = lines.find((l) => pt(l.a)[2] === 10 && pt(l.b)[2] === 10 && pt(l.a)[1] === 0 && pt(l.b)[1] === 0)!;
  s = run(s, { type: "addStep", step: { id: "s_101", type: "edgeMod", parts: [top.ref], params: { mode: "fillet", value: 1, enames: top.stable! } } } as never);
  assert.deepEqual(s.outcome.errors, {});
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 25 } });
  assert.deepEqual(s.outcome.errors, {});
  const vol = (s.outcome.kernel as { volume: number }).volume;
  assert.ok(Math.abs(vol - (2500 - (1 - Math.PI / 4) * 10)) < 1e-3, `the taller block, its top front edge rounded: ${vol}`);
});

// the sketch's own edges name the faces of an extrusion (`in_561`)
const poly = (pts: number[][], ids: string[]) => ({ id: "s_a", type: "sketch", shape: "polygon", points: pts, sides: ids, plane: "XY", origin: 0 });
const L = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
const LIDS = ["d/e1", "d/e2", "d/e3", "d/e4", "d/e5", "d/e6"];
const ext = (pts: number[][], ids: string[], depth = 10) => evE([poly(pts, ids), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }]);

test("the sides of an extrusion are named by the sketch edge they came from, in any order of ranks", () => {
  const r = ext(L, LIDS);
  const names = r.faceNames!.map((f) => f.name).sort();
  assert.deepEqual(names, ["x_a:end", "x_a:side:d/e1", "x_a:side:d/e2", "x_a:side:d/e3", "x_a:side:d/e4", "x_a:side:d/e5", "x_a:side:d/e6", "x_a:start"].sort());
  const at = (name: string) => r.faceNames!.find((f) => f.name === name)!;
  assert.deepEqual(at("x_a:side:d/e1").n.map((v) => Math.round(v) + 0), [0, -1, 0], "edge 1 runs along the front");
  assert.deepEqual(at("x_a:side:d/e4").n.map((v) => Math.round(v) + 0), [1, 0, 0]);
  assert.deepEqual(at("x_a:side:d/e6").n.map((v) => Math.round(v) + 0), [-1, 0, 0]);
  assert.deepEqual(at("x_a:end").n.map((v) => Math.round(v) + 0), [0, 0, 1]);
});

test("a side is still the same side when another side is added to the sketch or the shape is changed", () => {
  const before = ext(L, LIDS);
  // a corner cut off the far end of the 20 wide arm: a new side e7 between e2 and e3 (a vertex is inserted)
  const cut = [[0, 0], [20, 0], [20, 4], [16, 10], [10, 10], [10, 20], [0, 20]];
  const after = ext(cut, ["d/e1", "d/e2", "d/e7", "d/e3", "d/e4", "d/e5", "d/e6"]);
  const nameOf = (r: RE, n: number[], x: number, y: number) => r.faceNames!.find((f) => f.n.every((v, i) => Math.abs(v - n[i]!) < 1e-6) && Math.abs(f.c[0]! - x) < 1e-6 && Math.abs(f.c[1]! - y) < 1e-6)?.name;
  assert.equal(nameOf(before, [0, -1, 0], 10, 0), "x_a:side:d/e1");
  assert.equal(nameOf(after, [0, -1, 0], 10, 0), "x_a:side:d/e1");
  assert.equal(nameOf(before, [-1, 0, 0], 0, 10), "x_a:side:d/e6");
  assert.equal(nameOf(after, [-1, 0, 0], 0, 10), "x_a:side:d/e6", "the left side keeps its name when a side is added elsewhere");
  assert.equal(nameOf(after, [0, 1, 0], 5, 20), "x_a:side:d/e5");
  assert.ok(after.faceNames!.some((f) => f.name === "x_a:side:d/e7"), "the new side is named for its own sketch edge");
  assert.equal(new Set(after.faceNames!.map((f) => f.name)).size, after.faceNames!.length);
});

test("a pocket cut by an extrusion names its walls and floor by the sketch edges, and the old names stay", () => {
  const pocket = { ...poly([[5, 2], [15, 2], [15, 8], [5, 8]], ["d/p1", "d/p2", "d/p3", "d/p4"]), id: "s_b", origin: 10 };
  const r = evE([rect(30), { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }, pocket, { id: "x_b", type: "extrude", profile: "s_b", target: "x_a", mode: "cut", distance: -4 }]);
  assert.equal(r.ops.find((o) => o.id === "x_b")!.error, null);
  const names = r.faceNames!.map((f) => f.name);
  for (const w of ["x_b:side:d/p1", "x_b:side:d/p2", "x_b:side:d/p3", "x_b:side:d/p4", "x_b:end"]) assert.ok(names.includes(w), `${w} in ${names.join(" ")}`);
  assert.equal(names.filter((n) => n.startsWith("x_a:")).length, 6, "the block's six faces keep their names (the top, now with a hole, too)");
  assert.equal(new Set(names).size, names.length);
});

test("in the model: the faces of an extruded drawing are named by the lines it was drawn with", () => {
  let s = createSession(kernel);
  const a = drawRectangle(scene(s), worldRef("XY"), [0, 0, 0], [10, 10, 0], [1, 0, 0], [0, 1, 0]); s = run(s, a.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: a.lines, params: { depth: 10 } } } as never);
  const stable = (Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { stable?: string }[]).map((p) => p.stable!).sort();
  assert.ok(stable.every(Boolean));
  assert.equal(stable.filter((n) => n.startsWith("x_s_100:side:d/")).length, 4, stable.join(" "));
  for (const l of a.lines) assert.ok(stable.includes(`x_s_100:side:${l}`), `${l} names a side`);
  assert.ok(stable.includes("x_s_100:start") && stable.includes("x_s_100:end"));
  // the depth changed: the same names
  s = run(s, { type: "setStepParams", id: "s_100", params: { depth: 25 } });
  const after = (Object.values(scene(s).parts).filter((p) => p.kind === "plane" && p.origin === "body") as unknown as { stable?: string }[]).map((p) => p.stable!).sort();
  assert.deepEqual(after, stable);
});

// ---- round faces (`in_613`) ----
const disc = (r: number) => ({ id: "s_a", type: "sketch", shape: "circle", radius: r, at: [0, 0], sides: ["d/c1"], plane: "XY", origin: 0 });
const post = (r: number, depth: number) => [disc(r), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }];

test("a post has a named round wall, and the rim edges beside it are named by the top and the wall", () => {
  const a = evE(post(5, 10)), b = evE(post(7, 25));
  const wall = (r: RE) => r.faceNames!.filter((f) => (f as { kind?: string }).kind === "cyl").map((f) => f.name).sort();
  assert.ok(wall(a).length >= 1 && wall(a).every((n) => n.startsWith("x_a:side:d/c1")), wall(a).join());
  assert.deepEqual(wall(a), wall(b), "the same names for any radius and height");
  const rim = (r: RE) => r.edgeNames!.filter((e) => e.name.startsWith("x_a:end|x_a:side:d/c1")).map((e) => e.name).sort();
  assert.ok(rim(a).length >= 1, "the rim has a name");
  assert.deepEqual(rim(a), rim(b));
  assert.ok(r2(a));
  function r2(r: RE) { return r.faceNames!.some((f) => f.name === "x_a:start") && r.faceNames!.some((f) => f.name === "x_a:end"); }
});

test("a fillet of the top rim by its names follows when the post is made wider and taller, and when a move is put before it", () => {
  const rimNames = (r: RE) => r.edgeNames!.filter((e) => e.name.startsWith("x_a:end|x_a:side:d/c1"));
  const names = rimNames(evE(post(5, 10)));
  const fillet = (target: string, rim: RE) => ({ id: "f", type: "edgeMod", target, mode: "fillet", value: 1, ref: rimNames(rim).map((e) => ({ name: e.name, a: e.a, b: e.b, mid: e.mid })) });
  assert.ok(names.length >= 1);
  const base = evE(post(5, 10));
  const f1 = evE([...post(5, 10), fillet("x_a", base)]);
  assert.equal(f1.ops.find((o) => o.id === "f")!.error, null, f1.ops.map((o) => o.error).join());
  const v1 = Math.PI * 25 * 10 - f1.volume;
  assert.ok(v1 > 6 && v1 < 7, `a 1 mm round off the rim of a 5 mm post: ${v1}`);
  // the names are what finds the rim, not the numbers in the refs: refs with wrong numbers (made for the first post) still find the rim of the wider, taller one
  const f2 = evE([...post(7, 25), fillet("x_a", base)]);
  assert.equal(f2.ops.find((o) => o.id === "f")!.error, null, f2.ops.map((o) => o.error).join());
  const v2 = Math.PI * 49 * 25 - f2.volume;
  assert.ok(v2 > 8.5 && v2 < 10 && Math.abs(v2 - v1) > 0.5, `the rim of the 7 mm post, 25 high: ${v2}`);
  const moved = evE([...post(5, 10), { id: "m", type: "transform", mode: "move", target: "x_a", axis: 2, value: 7 }, fillet("m", base)]);
  assert.equal(moved.ops.find((o) => o.id === "f")!.error, null, moved.ops.map((o) => o.error).join());
  assert.ok(Math.abs(Math.PI * 25 * 10 - moved.volume - v1) < 1e-3, "the same round after a move");
});

test("an arc side of a drawn shape is named for its sketch edge", () => {
  // a half disc: a straight side d/l1 and an arc d/a1 through the mid point
  const half = { id: "s_a", type: "sketch", shape: "polygon", points: [[-5, 0], [5, 0]], mids: [null, [0, 5]], sides: ["d/l1", "d/a1"], plane: "XY", origin: 0 };
  const r = evE([half, { id: "x_a", type: "extrude", profile: "s_a", distance: 10 }]);
  const names = r.faceNames!.map((f) => f.name);
  assert.ok(names.includes("x_a:side:d/l1"), names.join(" "));
  assert.ok(names.some((n) => n.startsWith("x_a:side:d/a1")), names.join(" "));
});

import { drawCircle } from "../src/operation/build.ts";
test("in the model: the rim of a post is named, and a fillet of it follows when the circle is made bigger", () => {
  let s = createSession(kernel);
  const c = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], 5); s = run(s, c.command);
  s = run(s, { type: "addStep", step: { id: "s_100", type: "extrude", parts: [c.circle], params: { depth: 10 } } } as never);
  const rim = () => (Object.values(scene(s).parts).filter((p) => p.kind === "line" && p.origin === "body") as unknown as { ref: string; stable?: string; circle?: unknown; a: string; b: string }[]).filter((l) => l.stable?.startsWith("x_s_100:end|x_s_100:side"));
  const top = rim();
  assert.ok(top.length >= 1, "the rim edges have lasting names");
  s = run(s, { type: "addStep", step: { id: "s_101", type: "edgeMod", parts: top.map((l) => l.ref), params: { mode: "fillet", value: 1, enames: top.map((l) => l.stable).join(";") } } } as never);
  assert.deepEqual(s.outcome.errors, {});
  const v1 = (s.outcome.kernel as { volume: number }).volume;
  s = run(s, { type: "setRadius", ref: c.circle, radius: 8 } as never);
  assert.deepEqual(s.outcome.errors, {}, JSON.stringify(s.outcome.errors));
  const v2 = (s.outcome.kernel as { volume: number }).volume;
  assert.ok(Math.PI * 25 * 10 - v1 > 6 && Math.PI * 25 * 10 - v1 < 7, `round off a 5 mm post: ${Math.PI * 25 * 10 - v1}`);
  assert.ok(Math.PI * 64 * 10 - v2 > 10.4 && Math.PI * 64 * 10 - v2 < 11.5, `round off the 8 mm post: ${Math.PI * 64 * 10 - v2}`);
});

// ---- the faces a fillet or chamfer makes are named for the edge they round (`in_614`) ----
test("a fillet's face is named for the edge it rounds, and so are the edges beside it, for any size and after a step put before", () => {
  const sq = (w: number, depth: number) => [poly([[0, 0], [w, 0], [w, 10], [0, 10]], ["d/a", "d/b", "d/c", "d/d"]), { id: "x_a", type: "extrude", profile: "s_a", distance: depth }];
  const base = evE(sq(10, 10));
  const topFront = edgeAt(base, [5, 0, 10]);
  const fillet = (target: string, e = topFront) => ({ id: "f", type: "edgeMod", target, mode: "fillet", value: 2, ref: [{ name: e.name, a: e.a, b: e.b, mid: e.mid }] });
  const withFillet = evE([...sq(10, 10), fillet("x_a")]);
  assert.equal(withFillet.ops.find((o) => o.id === "f")!.error, null);
  const roundName = `f:round:${topFront.name.replaceAll("|", "+")}`;
  assert.ok(withFillet.faceNames!.some((n) => n.name === roundName), `the round face is named: ${withFillet.faceNames!.map((n) => n.name).join(" ")}`);
  const seamNames = (r: RE) => r.edgeNames!.filter((e) => e.name.includes(roundName)).map((e) => e.name).sort();
  assert.equal(seamNames(withFillet).length, 4, "the round has four edges: two long seams and two ends");
  // wider and taller: the edge the step names is the same one, so the same names come out
  const bigger = evE([...sq(14, 25), fillet("x_a", edgeAt(evE(sq(14, 25)), [7, 0, 25]))]);
  assert.deepEqual(seamNames(bigger), seamNames(withFillet));
  assert.ok(bigger.faceNames!.some((n) => n.name === roundName));
  // a step put before: the same names
  const moved = evE([...sq(10, 10), { id: "m", type: "transform", mode: "move", target: "x_a", axis: 2, value: 7 }, fillet("m")]);
  assert.equal(moved.ops.find((o) => o.id === "f")!.error, null);
  assert.deepEqual(seamNames(moved), seamNames(withFillet));
  // a chamfer is named the same way
  const cham = evE([...sq(10, 10), { ...fillet("x_a"), id: "c", mode: "chamfer" }]);
  assert.ok(cham.faceNames!.some((n) => n.name === `c:round:${topFront.name.replaceAll("|", "+")}`));
});

// ---- a revolve's faces are named by the profile's own edges (`in_614`) ----
test("a turned tube: the walls and rings are named by the profile's edges, the same for any size, and a half turn has caps", () => {
  const prof = (x0: number, x1: number, h: number) => ({ id: "s_a", type: "sketch", shape: "polygon", points: [[x0, 0], [x1, 0], [x1, h], [x0, h]], sides: ["d/a", "d/b", "d/c", "d/d"], plane: "XZ", origin: 0 });
  const rev = (x0: number, x1: number, h: number, angle = 360) => evE([prof(x0, x1, h), { id: "x_r", type: "revolve", profile: "s_a", axis: { p: [0, 0, 0], d: [0, 0, 1] }, angle }]);
  const names = (r: RE) => r.faceNames!.map((f) => f.name).sort();
  const a = rev(3, 5, 10), b = rev(4, 7, 25);
  assert.equal(a.ops.find((o) => o.id === "x_r")!.error, null);
  for (const n of ["x_r:side:d/a", "x_r:side:d/c"]) assert.ok(names(a).includes(n), `${n} in ${names(a).join(" ")}`);
  assert.ok(names(a).some((n) => n.startsWith("x_r:side:d/b")) && names(a).some((n) => n.startsWith("x_r:side:d/d")), names(a).join(" "));
  assert.deepEqual(names(a), names(b));
  const half = rev(3, 5, 10, 180);
  assert.ok(names(half).includes("x_r:start") && names(half).includes("x_r:end"), names(half).join(" "));
});

// ---- loft and sweep (`in_618`) ----
test("a ruled loft's caps and flat sides are named by the sketches' edges, the same for any size and height", () => {
  const sq = (id: string, w: number, z: number, sides: string[]) => ({ id, type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, w], [0, w]], sides, plane: "XY", origin: z });
  const loft = (w1: number, w2: number, h: number) => evE([sq("s_a", w1, 0, ["d/a", "d/b", "d/c", "d/d"]), sq("s_b", w2, h, ["d/e", "d/f", "d/g", "d/h"]), { id: "x_l", type: "loft", sections: [{ profile: "s_a", holes: [] }, { profile: "s_b", holes: [] }], smooth: false }]);
  const a = loft(20, 10, 15), b = loft(30, 8, 40);
  assert.equal(a.ops.find((o) => o.id === "x_l")!.error, null, a.ops.map((o) => o.error).join());
  const names = (r: RE) => r.faceNames!.map((f) => f.name).sort();
  for (const n of ["x_l:start", "x_l:end", "x_l:side:d/a", "x_l:side:d/b", "x_l:side:d/c", "x_l:side:d/d"]) assert.ok(names(a).includes(n), `${n} in ${names(a).join(" ")}`);
  assert.deepEqual(names(a), names(b));
  assert.equal(new Set(names(a)).size, 6);
});

test("a loft made smooth still has its two caps named", () => {
  const sq = (id: string, w: number, z: number, sides: string[]) => ({ id, type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, w], [0, w]], sides, plane: "XY", origin: z });
  const r = evE([sq("s_a", 20, 0, ["d/a", "d/b", "d/c", "d/d"]), sq("s_b", 10, 15, ["d/e", "d/f", "d/g", "d/h"]), { id: "x_l", type: "loft", sections: [{ profile: "s_a", holes: [] }, { profile: "s_b", holes: [] }], smooth: true }]);
  assert.equal(r.ops.find((o) => o.id === "x_l")!.error, null);
  const names = r.faceNames!.map((f) => f.name);
  assert.ok(names.includes("x_l:start") && names.includes("x_l:end"), names.join(" "));
});

test("a sweep along a straight path names its start and end caps", () => {
  const prof = (w: number) => ({ id: "s_a", type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, w], [0, w]], sides: ["d/a", "d/b", "d/c", "d/d"], plane: "XY", origin: 0 });
  const sweep = (w: number, len: number) => evE([prof(w), { id: "x_w", type: "sweep", profile: "s_a", path: [{ a: [0, 0, 0], b: [0, 0, len] }] }]);
  const a = sweep(5, 30), b = sweep(8, 50);
  assert.equal(a.ops.find((o) => o.id === "x_w")!.error, null, a.ops.map((o) => o.error).join());
  for (const r of [a, b]) { const n = r.faceNames!.map((f) => f.name); assert.ok(n.includes("x_w:start") && n.includes("x_w:end"), n.join(" ")); }
  const cap = (r: RE, name: string) => r.faceNames!.find((f) => f.name === name)!.c[2]!;
  assert.ok(Math.abs(cap(a, "x_w:start")) < 1e-6 && Math.abs(cap(a, "x_w:end") - 30) < 1e-6);
  assert.ok(Math.abs(cap(b, "x_w:end") - 50) < 1e-6, "the end cap is the one at the end of the longer path");
  for (const r of [a, b]) { const n = r.faceNames!.map((f) => f.name).sort(); assert.deepEqual(n, ["x_w:end", "x_w:side:d/a", "x_w:side:d/b", "x_w:side:d/c", "x_w:side:d/d", "x_w:start"], "a straight path: the sides are named for the profile's edges, as in an extrusion"); }
});

test("a loft through three sections: ruled, each side of each pair is named; bent, one side for each edge, for any size", () => {
  const sq = (id: string, w: number, z: number, sides: string[]) => ({ id, type: "sketch", shape: "polygon", points: [[0, 0], [w, 0], [w, w], [0, w]], sides, plane: "XY", origin: z });
  const loft = (smooth: boolean, w: number, h: number) => evE([sq("s_a", w, 0, ["d/a", "d/b", "d/c", "d/d"]), sq("s_b", w / 2, h / 2, ["d/e", "d/f", "d/g", "d/h"]), sq("s_c", w * 0.7, h, ["d/i", "d/j", "d/k", "d/l"]), { id: "x_l", type: "loft", sections: [{ profile: "s_a", holes: [] }, { profile: "s_b", holes: [] }, { profile: "s_c", holes: [] }], smooth }]);
  const names = (r: RE) => r.faceNames!.map((f) => f.name).sort();
  const ruled = loft(false, 20, 30);
  assert.deepEqual(names(ruled), ["x_l:end", "x_l:side:d/a", "x_l:side:d/b", "x_l:side:d/c", "x_l:side:d/d", "x_l:side:d/e", "x_l:side:d/f", "x_l:side:d/g", "x_l:side:d/h", "x_l:start"]);
  const bent = loft(true, 20, 30), bent2 = loft(true, 26, 44);
  assert.deepEqual(names(bent), ["x_l:end", "x_l:side:d/a", "x_l:side:d/b", "x_l:side:d/c", "x_l:side:d/d", "x_l:start"]);
  assert.deepEqual(names(bent2), names(bent));
});
