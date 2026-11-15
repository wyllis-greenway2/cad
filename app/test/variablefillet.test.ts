// A fillet whose size changes along its edge (`in_387`): a size at the start of the edge and a size at the other end, with the library's own variable fillet.
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
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/block-fillet-in_386.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
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
  assert.deepEqual(fields?.map((f) => [f.label, f.value, f.active]), [["Start", "5", true], ["End", "5", false]]);
  st = key(st, "Tab");
  st = type(st, "12");
  fields = frameOf(st, { w: 800, h: 600 }).entry?.fields;
  assert.deepEqual(fields?.map((f) => [f.label, f.value, f.active]), [["Start", "5", false], ["End", "12", true]]);
  st = key(st, "Enter");
  const step = scene(st.session).steps.at(-1)!;
  assert.equal(step.type, "edgeMod");
  assert.equal(step.params.mode, "fillet");
  assert.equal(step.params.value, 5);
  assert.equal(step.params.end, 12);
  assert.deepEqual(st.session.outcome.errors, {});
});

test("a chamfer has one size: the choice is not offered for it, and the end number is ignored", () => {
  const s = open();
  const sc = scene(s);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body")!;
  let st = createState({ ...s, click: { ...s.click, selection: [edge.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  st = type(st, "-2");
  assert.equal(frameOf(st, { w: 800, h: 600 }).sizeKinds, null);
});

test("while the size is set, the end where the first size applies is shown in amber", () => {
  const s = run(open(), { type: "removeStep", id: "s_014" } as never);
  const sc = scene(s);
  const edge = (Object.values(sc.parts) as Part[]).find((p): p is Extract<Part, { kind: "line" }> => p.kind === "line" && p.origin === "body" && (() => {
    const [a, b] = [sc.parts[p.a] as unknown as { at: number[] }, sc.parts[p.b] as unknown as { at: number[] }];
    return a.at[2] !== b.at[2] && Math.abs(a.at[0]! - 29.7) < 1e-3 && Math.abs(a.at[1]! - 8.37) < 1e-3;
  })())!;
  let st = createState({ ...s, click: { ...s.click, selection: [edge.ref] as never } });
  st = reduce(st, { type: "begin", name: "edge" }, env);
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).highlight.amber, []);
  st = type(reduce(st, { type: "sizeKind", kind: "variable" }, env), "4");
  assert.deepEqual(frameOf(st, { w: 800, h: 600 }).highlight.amber, [edge.a]);
});
