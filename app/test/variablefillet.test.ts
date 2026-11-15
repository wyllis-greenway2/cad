// A fillet whose size changes along its edge (`in_406`): a size at the start of the edge and a size at the other end, with the library's own variable fillet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { frameOf } from "../src/interaction/frame.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/block-fillet-in_405.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const vol = (s: Session) => s.outcome.kernel!.volume!;
const set = (s: Session, params: Record<string, unknown>) => run(s, { type: "setStepParams", id: "s_014", params } as never);
const env = { w: 800, h: 600, now: 0 } as never;
const key = (st: ReturnType<typeof createState>, k: string) => reduce(st, { type: "typed", key: k, shift: false }, env);
const type = (st: ReturnType<typeof createState>, text: string) => text.split("").reduce((a, k) => key(a, k), st);

test("a fillet that is 5 mm at one end of the edge and 12 mm at the other is between the two constant ones, and the same whichever end is which on a symmetric block", () => {
  const s = open();
  const [c5, c12] = [vol(set(s, { value: 5 })), vol(set(s, { value: 12 }))];
  const a = set(s, { value: 5, end: 12 });
  const b = set(s, { value: 12, end: 5 });
  assert.deepEqual(a.outcome.errors, {});
  assert.ok(vol(a) < c5 && vol(a) > c12, `${vol(a).toFixed(1)} between ${c5.toFixed(1)} and ${c12.toFixed(1)}`);
  assert.ok(Math.abs(vol(a) - vol(b)) < 0.5, "turned round it is the same on a block that is the same at both ends");
  assert.ok(Math.abs(vol(set(s, { value: 5, end: 5 })) - c5) < 1e-6, "the same at both ends is a constant fillet");
});

test("a size that the faces cannot take at one end is made as a region (a ruled loft, the cone the rolling ball makes), small where it starts and across the faces where it ends", () => {
  const s = set(open(), { value: 2, end: 20 });
  assert.deepEqual(s.outcome.errors, {});
  assert.match(Object.values(s.outcome.notes ?? {}).join(" "), /could not be made as a smooth round/);
  // how far the cut is from the corner (29.7, 8.37) along the start and the end of the edge (z = 0 and z = 17.9): 0.83 mm for a 2 mm round, far more at the other end
  const v = s.outcome.kernel!.mesh!.vertices as Float32Array;
  const near = (z: number) => { let best = Infinity; for (let i = 0; i < v.length; i += 3) if (Math.abs(v[i + 2]! - z) < 0.05) best = Math.min(best, Math.hypot(v[i]! - 29.7, v[i + 1]! - 8.37)); return best; };
  assert.ok(Math.abs(near(0) - 2 * (Math.SQRT2 - 1)) < 0.05, `at the start ${near(0).toFixed(2)}`);
  assert.ok(near(17.9) > 5, `at the other end ${near(17.9).toFixed(2)}`);
});

test("the chip, the two numbers and Tab: Variable, 5, Tab, 12, Enter makes one step with a size at each end", () => {
  const s = run(open(), { type: "removeStep", id: "s_014" } as never); // (the plain block: the file has the fillet already)
  assert.equal(scene(s).steps.length, 1);
  const sc = scene(s);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (() => {
    const [a, b] = [sc.parts[p.a] as unknown as { at: number[] }, sc.parts[p.b] as unknown as { at: number[] }];
    return a.at[2] !== b.at[2] && Math.abs(a.at[0]! - 29.7) < 1e-3 && Math.abs(a.at[1]! - 8.37) < 1e-3;
  })())!;
  let st = createState({ ...s, click: { ...s.click, selection: [edge.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).sizeKinds?.map((k) => k.id), ["constant", "variable"]);
  st = reduce(st, { type: "sizeKind", kind: "variable" }, env);
  st = type(st, "5");
  let fields = frameOf(st, { w: 800, h: 600 }).entry?.fields;
  assert.deepEqual(fields?.map((f) => [f.label, f.value, f.active]), [["Start", "5", true], ["End", "5", false], ["Middle", "-", false], ["1/4", "-", false], ["3/4", "-", false]]);
  st = key(st, "Tab");
  st = type(st, "12");
  fields = frameOf(st, { w: 800, h: 600 }).entry?.fields;
  assert.deepEqual(fields?.map((f) => [f.label, f.value, f.active]), [["Start", "5", false], ["End", "12", true], ["Middle", "-", false], ["1/4", "-", false], ["3/4", "-", false]]);
  st = key(st, "Enter");
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "edgeMod");
  assert.equal(step.params.mode, "fillet");
  assert.equal(step.params.value, 5);
  assert.equal(step.params.end, 12);
  assert.deepEqual(st.session.outcome.errors, {});
});

// ---- a chamfer that changes along its edge, and a size at each end of several edges (`in_410`) ----

test("a chamfer that is 3 mm at one end of the edge and 9 mm at the other is made as a region, and takes the volume of a wedge that grows in a straight line", () => {
  const s = open();
  const base = vol(run(s, { type: "removeStep", id: "s_014" } as never));
  const a = set(s, { mode: "chamfer", value: 3, end: 9 });
  assert.deepEqual(a.outcome.errors, {});
  assert.match(Object.values(a.outcome.notes ?? {}).join(" "), /no chamfer whose size changes along its edge/);
  // the section of the cut is a triangle of d * d / 2 and d changes from 3 to 9 along 17.9 mm: the volume is 17.9 / 2 * (3 * 3 + 3 * 9 + 9 * 9) / 3
  const removed = (17.9 / 2) * ((9 + 27 + 81) / 3);
  assert.ok(Math.abs(base - vol(a) - removed) < 0.1, `removed ${(base - vol(a)).toFixed(2)} of ${removed.toFixed(2)}`);
  assert.ok(Math.abs(vol(set(s, { mode: "chamfer", value: 9, end: 3 })) - vol(a)) < 0.1, "from either end on a block that is the same at both");
});

test("a size at each end of four edges at once: each from its own first end, and the same as four one at a time on a block whose corners do not meet", () => {
  const s = run(open(), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(s);
  const vertical = (Object.values(sc.parts) as Part[]).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (sc.parts[p.a] as unknown as { at: number[] }).at[2] !== (sc.parts[p.b] as unknown as { at: number[] }).at[2]);
  assert.equal(vertical.length, 4);
  const step = (parts: string[], params: Record<string, string | number>) => run(s, { type: "addStep", step: { id: "s_x", type: "edgeMod", parts: parts as never, params } });
  const one = step([vertical[0]!.ref], { mode: "fillet", value: 2, end: 5 });
  const all = step(vertical.map((v) => v.ref), { mode: "fillet", value: 2, end: 5 });
  assert.deepEqual(all.outcome.errors, {});
  const each = vol(s) - vol(one);
  assert.ok(each > 0);
  assert.ok(Math.abs(vol(s) - vol(all) - 4 * each) < 0.5, `${(vol(s) - vol(all)).toFixed(2)} against 4 x ${each.toFixed(2)}`);
});

test("the choice is offered for a chamfer and for several edges, not for a rim", () => {
  const s = run(open(), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(s);
  const lines = (Object.values(sc.parts) as Part[]).filter((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body");
  let st = createState({ ...s, click: { ...s.click, selection: lines.slice(0, 3).map((l) => l.ref) as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = type(st, "-2");
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).sizeKinds?.map((k) => k.id), ["constant", "variable", "twoDistances"]);
});

test("a size at the middle of the edge too: Start, End and Middle with Tab, and the round goes through the three", () => {
  const s = open();
  const lin = set(s, { value: 2, end: 6 });
  const mid = set(s, { value: 2, end: 6, mid: 4 });
  const bulge = set(s, { value: 2, end: 2.0001, mid: 8 });
  assert.deepEqual(bulge.outcome.errors, {});
  assert.ok(Math.abs(vol(mid) - vol(lin)) < 0.5, "a middle on the straight line is the straight line");
  assert.ok(vol(bulge) < vol(set(s, { value: 2 })) - 50, "a round that is bigger in the middle takes more");
  // it can be larger than the faces allow: made as a region through the three sizes, and said
  const past = set(s, { value: 2, end: 2.0001, mid: 30 });
  assert.deepEqual(past.outcome.errors, {});
  assert.match(Object.values(past.outcome.notes ?? {}).join(" "), /could not be made as a smooth round/);
  // through the keys: Tab, Tab goes to the middle
  const plain = run(open(), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(plain);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (sc.parts[p.a] as unknown as { at: number[] }).at[2] !== (sc.parts[p.b] as unknown as { at: number[] }).at[2])!;
  let st = createState({ ...plain, click: { ...plain.click, selection: [edge.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = reduce(st, { type: "sizeKind", kind: "variable" }, env);
  st = key(type(st, "2"), "Tab");
  st = key(type(st, "6"), "Tab");
  st = type(st, "4");
  st = key(st, "Enter");
  const made = scene(st.session).steps.at(-1)!;
  assert.deepEqual([made.params.value, made.params.end, made.params.mid], [2, 6, 4]);
  assert.deepEqual(st.session.outcome.errors, {});
});

test("sizes at a quarter and three quarters of the way too: five numbers, Tab goes round, and the round goes through all of them", () => {
  const s = open();
  const flat = set(s, { value: 2, end: 2.0001 });
  const bumps = set(s, { value: 2, end: 2.0001, q1: 6, mid: 2, q3: 6 });
  assert.deepEqual(bumps.outcome.errors, {});
  assert.ok(vol(bumps) < vol(flat) - 30, "bigger at a quarter and three quarters takes more");
  // the same through the keys
  const plain = run(open(), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(plain);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (sc.parts[p.a] as unknown as { at: number[] }).at[2] !== (sc.parts[p.b] as unknown as { at: number[] }).at[2])!;
  let st = createState({ ...plain, click: { ...plain.click, selection: [edge.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = reduce(st, { type: "sizeKind", kind: "variable" }, env);
  st = key(type(st, "2"), "Tab");        // end
  st = key(type(st, "2.5"), "Tab");      // middle
  st = key(type(st, "2"), "Tab");        // a quarter
  st = key(type(st, "6"), "Tab");        // three quarters
  st = type(st, "6");
  st = key(st, "Enter");
  const made = scene(st.session).steps.at(-1)!;
  assert.deepEqual([made.params.value, made.params.end, made.params.mid, made.params.q1, made.params.q3], [2, 2.5, undefined, 6, undefined].map((_, i) => [2, 2.5, 2, 6, 6][i]));
  assert.deepEqual(st.session.outcome.errors, {});
});

// ---- a size that changes round a rim (`in_411`) ----
test("a size that changes round the rim of a post: 1 mm at its start and 2.5 mm half way round, between the two constant ones, the same turned round, and made as a region past what the kernel can", () => {
  const post = () => (openSession(kernel, readFileSync(new URL("./fixtures/stacked-posts-in_411.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
  const s = post();
  const rim = (Object.values(scene(s).parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.center[2] - 20) < 1e-6)!;
  assert.equal(rim.a, rim.b, "one closed edge");
  const round = (params: Record<string, string | number>) => run(s, { type: "addStep", step: { id: "s_x", type: "edgeMod", parts: [rim.ref] as never, params: { mode: "fillet", ...params } } });
  const [c1, c25] = [vol(round({ value: 1 })), vol(round({ value: 2.5 }))];
  const varied = round({ value: 1, end: 1, mid: 2.5 });
  assert.deepEqual(varied.outcome.errors, {});
  assert.ok(vol(varied) < c1 && vol(varied) > c25, `${vol(varied).toFixed(1)} between ${c1.toFixed(1)} and ${c25.toFixed(1)}`);
  const turned = round({ value: 2.5, end: 2.5, mid: 1 });
  assert.ok(vol(turned) < c1 && vol(turned) > c25 && Math.abs(vol(turned) - vol(varied)) < 0.5, "a half turn round gives the same volume");
  const past = round({ value: 1, end: 1, mid: 30 });
  assert.deepEqual(past.outcome.errors, {});
  assert.match(Object.values(past.outcome.notes ?? {}).join(" "), /could not be made as a smooth round/);
  assert.ok(vol(past) < c25, "larger than the post allows: as large as it goes at the middle");
});

test("the choice is offered for a closed rim, with no End, and Tab goes Start, Middle, 1/4, 3/4", () => {
  const s = (openSession(kernel, readFileSync(new URL("./fixtures/stacked-posts-in_411.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
  const rim = (Object.values(scene(s).parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && !!p.circle && Math.abs(p.circle.center[2] - 20) < 1e-6)!;
  let st = createState({ ...s, click: { ...s.click, selection: [rim.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).sizeKinds?.map((k) => k.id), ["constant", "variable"]);
  st = reduce(st, { type: "sizeKind", kind: "variable" }, env);
  st = key(type(st, "1"), "Tab");
  st = key(type(st, "2.5"), "Enter");
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).entry, null, "applied");
  const made = scene(st.session).steps.at(-1)!;
  assert.deepEqual([made.params.value, made.params.end, made.params.mid], [1, 1, 2.5]);
});
