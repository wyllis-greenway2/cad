// The highlight is drawn in a few batches and not built again while it is the same (`dec_highlight_batching`, `in_688`, `in_717`): a selected gear sketch (400 lines, 401 corners) was 800 objects built again on every frame.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

// the view's modules reach the page's kernel (a wasm file the bundler turns into a url): in Node that import is given a stand-in
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, n) { if (s.includes("?url")) return { url: "data:text/javascript,export default 'x'", shortCircuit: true }; return n(s, c); }`));
const THREE = await import("three");
const { kernel } = await import("../src/compiler/kernel/index.ts");
const { openSession, scene } = await import("../src/interaction/session.ts");
const { buildHighlight, highlightKey } = await import("../src/ui/view/highlight.ts");
const { createPen } = await import("../src/ui/view/pen.ts");
type Highlight = Parameters<typeof highlightKey>[0];
type Ref = Highlight["selection"][number];

await kernel.init();
const gear = () => scene((openSession(kernel, readFileSync(new URL("./fixtures/gear-selected-slow-in_688.cad.json", import.meta.url), "utf8")) as unknown as { value: Parameters<typeof scene>[0] }).value);
const cam = { target: [20, 20, 0], distance: 40, azimuth: 0, elevation: 1, straight: false, mix: 1, eyeDistance: 40, perspective: 1 } as unknown as Parameters<typeof buildHighlight>[5];
const nothing: Highlight = { hover: undefined, hoverPoint: null, selection: [], spread: null };
const objects = (g: InstanceType<typeof THREE.Group>) => { let n = 0; g.traverse((o) => { if ((o as { geometry?: unknown }).geometry) n++; }); return n; };

test("a gear sketch with every line and corner selected is a handful of objects, not one for each part", () => {
  const sc = gear();
  const refs = Object.values(sc.parts).filter((p) => p.origin === "drawn" && (p.kind === "line" || p.kind === "corner")).map((p) => p.ref as Ref);
  assert.ok(refs.length > 700, `${refs.length} parts selected`);
  const [overlay, marks, pen] = [new THREE.Group(), new THREE.Group(), createPen()];
  buildHighlight(overlay, marks, sc, null, { ...nothing, selection: refs }, cam, pen, 0);
  assert.ok(objects(overlay) <= 6, `${objects(overlay)} objects for ${refs.length} selected parts`);
  assert.ok(objects(overlay) >= 2, "the lines and the balls are drawn");
  assert.ok(objects(marks) <= 2, `the middle dots of the circles and arcs are one object: ${objects(marks)}`);
});

test("building the highlight again lets go of the lines' materials of the one before (they were kept for ever)", () => {
  const sc = gear();
  const refs = Object.values(sc.parts).filter((p) => p.origin === "drawn" && p.kind === "line").map((p) => p.ref as Ref);
  const [overlay, marks, pen] = [new THREE.Group(), new THREE.Group(), createPen()];
  buildHighlight(overlay, marks, sc, null, { ...nothing, selection: refs }, cam, pen, 0);
  const first = pen.count();
  for (let i = 0; i < 20; i++) buildHighlight(overlay, marks, sc, null, { ...nothing, selection: refs }, cam, pen, i * 16);
  assert.equal(pen.count(), first, "no more materials after twenty frames");
  assert.ok(first <= 4, `${first} materials for ${refs.length} lines`);
  buildHighlight(overlay, marks, sc, null, nothing, cam, pen, 0);
  assert.equal(pen.count(), 0, "a highlight of nothing keeps none");
});

test("the highlight is built again only when what it is made from changes (turning the view is not one), and always while it moves", () => {
  const sel: Highlight = { ...nothing, selection: ["d/a" as Ref, "d/b" as Ref] };
  const k = highlightKey(sel, 100, 40, "s1");
  assert.ok(k !== null);
  assert.equal(highlightKey({ ...sel }, 5000, 40, "s1"), k, "later, the same: nothing about it moves");
  assert.notEqual(highlightKey({ ...sel, selection: ["d/a" as Ref] }, 100, 40, "s1"), k, "another selection");
  assert.notEqual(highlightKey({ ...sel, hover: "d/c" as Ref }, 100, 40, "s1"), k, "another thing under the pointer");
  assert.notEqual(highlightKey({ ...sel, hoverPoint: [1, 2, 3] }, 100, 40, "s1"), k, "the pointer moved on a surface");
  assert.notEqual(highlightKey(sel, 100, 41, "s1"), k, "zoomed: the balls are sized by the distance");
  assert.notEqual(highlightKey(sel, 100, 40, "s2"), k, "the scene was built again");
  assert.equal(highlightKey({ ...sel, temp: ["d/x" as Ref] }, 100, 40, "s1"), null, "the copies of a repeat breathe");
  assert.equal(highlightKey({ ...sel, red: { refs: ["d/x" as Ref], alpha: 0.5 } }, 100, 40, "s1"), null, "a refused change flashes");
  assert.equal(highlightKey({ ...sel, spread: { ref: "d/a" as Ref, point: [0, 0, 0], startMs: 100 } }, 150, 40, "s1"), null, "the colour is spreading over a face");
  assert.ok(highlightKey({ ...sel, spread: { ref: "d/a" as Ref, point: [0, 0, 0], startMs: 100 } }, 100 + 100000, 40, "s1") !== null, "and has stopped");
});
