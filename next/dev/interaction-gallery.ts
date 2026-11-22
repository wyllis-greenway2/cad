// Draws what the interaction layer says, in the old project's look, into one page (docs/rebuild/interaction-gallery.html): every picture is made from the real `hold`, `referenceSet` and `offersFor`, not drawn by hand.
//   node --experimental-strip-types dev/interaction-gallery.ts
import { writeFileSync } from "node:fs";
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { edgeRef, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import type { Constraint, System } from "../src/engine/solver.ts";
import { tryAdd } from "../src/engine/solver.ts";
import { hold, type HoldResult } from "../src/interaction/hold.ts";
import { type Ref, referenceSet } from "../src/interaction/refs.ts";
import { constraintsOn, offersFor } from "../src/interaction/suggest.ts";
import { COLOUR, OPACITY, WEIGHT } from "../src/interaction/style.ts";
import { type Item, type View, fromGuide, svg } from "../src/interaction/svg.ts";
import type { Sketch, Step } from "../src/engine/steps.ts";
await initKernel();
const V = (box: [number, number, number, number]): View => ({ box, w: 460, h: 300 });
const drawn = (refs: Ref[]): Item[] => refs.flatMap((r): Item[] => r.origin === "world" ? [] : r.kind === "line" ? [{ t: "line", a: r.a!, b: r.b!, tone: r.origin === "drawn" ? "figure" : r.origin === "anchor" ? "bodyEdge" : "hidden", w: r.origin === "drawn" ? WEIGHT.figure : WEIGHT.edge, opacity: r.origin === "projection" ? OPACITY.hiddenEdge : 1 }] : r.kind === "circle" ? [{ t: "circle", c: r.c!, r: r.r!, tone: "figure" }] : r.kind === "point" ? [{ t: "ball", p: r.p!, tone: r.origin === "drawn" ? "axis" : "bodyEdge", r: 3.2 }] : []);
const heldGuides = (r: HoldResult): Item[] => r.taken.flatMap((h) => h.guides.flatMap(fromGuide));
const P = (key: string, x: number, y: number): Ref => ({ key, kind: "point", name: key, origin: "drawn", p: [x, y], visible: true }), L = (key: string, a: [number, number], b: [number, number]): Ref => ({ key, kind: "line", name: key, origin: "drawn", a, b, visible: true }), C = (key: string, c: [number, number], r: number): Ref => ({ key, kind: "circle", name: key, origin: "drawn", c, r, visible: true });
const panels: { title: string; note: string; body: string }[] = [];
const add = (title: string, note: string, view: View, items: Item[]) => panels.push({ title, note, body: svg(view, items) });
const opt = { reach: 0.45, angle: 3 };

// 1. placing a point near a corner: the corner holds, the dashed guides of the others
{ const refs = [P("A", 0, 0), P("B", 10, 0), P("C", 10, 6), P("D", 0, 6), L("AB", [0, 0], [10, 0]), L("BC", [10, 0], [10, 6]), L("CD", [10, 6], [0, 6]), L("DA", [0, 6], [0, 0])], pointer = [10.25, -0.2] as [number, number], r = hold(pointer, refs, { what: "point" }, opt);
  add("A point lands on a corner", `${r.taken[0]!.label}; the draft is "${r.taken[0]!.draft!.kind}" and is made only when asked`, V([-2, -3, 14, 9]), [...drawn(refs), ...heldGuides(r), { t: "cursor", p: pointer }, { t: "text", p: [10.3, -0.9], s: "would be coincident", tone: "figure" }]); }
// 2. aligned with two corners: two dashed guides
{ const refs = [P("A", 0, 0), P("B", 10, 0), P("Q", 14, 6), L("AB", [0, 0], [10, 0])], pointer = [10.2, 6.25] as [number, number], r = hold(pointer, refs, { what: "point" }, opt);
  add("Lined up with two corners", `${r.taken.map((h) => h.label).join(" and ")}: the point goes where the guides cross`, V([-2, -3, 18, 9]), [...drawn(refs), ...heldGuides(r), { t: "ball", p: r.at, tone: "figure" }, { t: "cursor", p: pointer }]); }
// 3. a line end: level; the figure turns orange
{ const refs = [P("S", 0, 0), L("R", [0, 5], [8, 7])], pointer = [8, 0.28] as [number, number], r = hold(pointer, refs, { what: "lineEnd", from: [0, 0] }, opt);
  add("A line drawn nearly level", `the figure is ${r.figure === "aligned" ? "orange" : "teal"} while a direction holds, with a dashed guide through its start`, V([-2, -3, 12, 9]), [...drawn(refs), ...heldGuides(r), { t: "line", a: [0, 0], b: r.at, tone: r.figure, w: WEIGHT.figure }, { t: "ball", p: [0, 0], tone: "axis", r: 3.2 }, { t: "cursor", p: pointer }, { t: "text", p: [4, -0.9], s: r.taken[0]!.label, tone: "aligned" }]); }
// 4. parallel to another line
{ const refs = [L("R", [0, 6], [9, 9]), P("S", 0, 0)], a = Math.atan2(3, 9) + 0.02, pointer: [number, number] = [8 * Math.cos(a), 8 * Math.sin(a)], r = hold(pointer, refs, { what: "lineEnd", from: [0, 0] }, opt);
  add("Parallel to another line", `${r.taken[0]!.label}: the other line is lit teal and linked by a dashed line`, V([-2, -3, 12, 11]), [...drawn(refs), ...heldGuides(r), { t: "line", a: [0, 0], b: r.at, tone: r.figure }, { t: "cursor", p: pointer }]); }
// 5. tangent to a circle
{ const refs = [C("K", [10, 5], 2.5), P("S", 0, 0)], dist = Math.hypot(10, 5), half = Math.asin(2.5 / dist), a = Math.atan2(5, 10) + half + 0.015, pointer: [number, number] = [9 * Math.cos(a), 9 * Math.sin(a)], r = hold(pointer, refs, { what: "lineEnd", from: [0, 0] }, opt);
  add("A line that touches a circle", `${r.taken[0]?.label ?? "(none)"}: the circle's ring is dashed, the line goes along the tangent`, V([-2, -3, 16, 11]), [...drawn(refs), ...heldGuides(r), { t: "line", a: [0, 0], b: r.at, tone: r.figure }, { t: "cursor", p: pointer }]); }
// 6. on a body's edge (a real body and sketch): in-plane anchors, projected edges faint
{ const top = mint("A", "end"), side = (i: number) => mint("A", "side", mint("b", "line", i));
  const steps: Step[] = [{ id: "b", kind: "sketchPolygon", params: { points: [[0, 0], [20, 0], [20, 14], [0, 14]] }, inputs: [] }, { id: "A", kind: "extrude", params: { d: 8 }, inputs: ["b"] },
    { id: "s", kind: "sketch", params: { ...rectangle(11, 3, 4, 5, { fixCorner: false }), plane: "XY", offset: 8, anchors: [{ id: "e1", edge: edgeRef(top, side(1)) }], constraints: [...rectangle(11, 3, 4, 5, { fixCorner: false }).constraints!, { id: "gap", kind: "pointLineDistance", parts: ["B", "e1"], value: 3 }] }, inputs: ["A"] }];
  const e = new Engine(steps); e.build(); const refs = referenceSet({ sketch: e.result("s").value as Sketch, body: e.result("A").value as any }), pointer: [number, number] = [0.25, 9], r = hold(pointer, refs, { what: "point" }, opt);
  add("The body's edges are lines too", `${r.taken[0]?.label}: an edge of the body in this plane, held through an anchor ("needs" ${r.taken[0]?.draft?.needs.length} anchor first); the edges below the plane (the bottom of the block) are held through their projection onto the plane: here they fall on the same lines as the rim, so they are drawn faint underneath`, V([-2, -2, 24, 17]), [...drawn(refs), ...heldGuides(r), { t: "cursor", p: pointer }]); e.release(); }
// 7. the selection: amber for what a relation ties it to
{ const r = rectangle(0, 0, 10, 5), S: System = { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! }, sel = ["bottom"], tied = constraintsOn(S, sel), by = Object.fromEntries(S.points.map((p) => [p.id, p])), seg = (id: string) => { const l = S.lines.find((q) => q.id === id)!; return [[by[l.a]!.x, by[l.a]!.y], [by[l.b]!.x, by[l.b]!.y]] as [[number, number], [number, number]]; };
  const items: Item[] = S.lines.flatMap((l): Item[] => { const [a, b] = seg(l.id), tie = tied.some((t) => t.ties.includes(l.id)); return [{ t: "line", a, b, tone: l.id === "bottom" ? "figure" : tie ? "ties" : "figure", w: l.id === "bottom" ? 5 : WEIGHT.figure, opacity: l.id === "bottom" || tie ? 1 : 0.55 }]; });
  add("Only what is selected shows its constraints", `the bottom side is selected (thick teal): ${tied.length} constraints touch it; the sides they tie it to are amber`, V([-2, -3, 14, 9]), [...items, { t: "chip", p: [5, 2.5], s: "length 10", tone: "note" }, { t: "chip", p: [5, -1.3], s: "level", tone: "figure" }, { t: "chip", p: [-1.2, 2.5], s: "fixed", tone: "figure" }]); }
// 8. refused: red, flashing, with the way out
{ const r = rectangle(0, 0, 10, 5), S: System = { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! }, t = tryAdd(S, { id: "w3", kind: "length", parts: ["bottom"], value: 12 }), by = Object.fromEntries(S.points.map((p) => [p.id, p]));
  const items: Item[] = S.lines.map((l) => ({ t: "line", a: [by[l.a]!.x, by[l.a]!.y], b: [by[l.b]!.x, by[l.b]!.y], tone: l.id === "bottom" ? "refused" : "figure", w: l.id === "bottom" ? 4 : WEIGHT.figure } as Item));
  add("A change that a constraint holds back", `a width of 12 asked for: refused. "${t.holding.join(", ")}" holds it (red, flashing); the button offers to delete it`, V([-2, -3, 14, 9]), [...items, { t: "chip", p: [5, 2.5], s: "length 10", tone: "refused", flash: true }, { t: "chip", p: [5, -1.5], s: "Delete constraint to proceed", tone: "refused" }]); }
// 9. already applied: green
{ const r = rectangle(0, 0, 10, 5), S: System = { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! }, t = tryAdd(S, { id: "sq", kind: "perpendicular", parts: ["bottom", "right"] }), by = Object.fromEntries(S.points.map((p) => [p.id, p]));
  const items: Item[] = S.lines.map((l) => ({ t: "line", a: [by[l.a]!.x, by[l.a]!.y], b: [by[l.b]!.x, by[l.b]!.y], tone: l.id === "bottom" || l.id === "right" ? "applied" : "figure", w: l.id === "bottom" || l.id === "right" ? 4 : WEIGHT.figure } as Item));
  add("Already applied", `"square" asked for: it ${t.outcome === "already" ? "already holds (the level and upright sides say it); nothing is added twice" : t.outcome}`, V([-2, -3, 14, 9]), [...items, { t: "chip", p: [7, -1.6], s: "square: already applied", tone: "applied", flash: true }]); }
// 10. the offers for two lines
{ const r = rectangle(0, 0, 10, 5), S: System = { points: r.points!.map((p) => ({ ...p, fixed: false })), lines: r.lines!, circles: [], constraints: r.constraints! }, o = offersFor(S, ["bottom", "right"]);
  const tone = (s: string) => (s === "already" || s === "holds" ? "applied" : s === "refused" ? "refused" : "figure");
  add("What is offered for two lines", "in one table, in the order selected (the first moves): green already holds, red would be refused, teal is free; a number is measured, then locked", V([0, 0, 460, 300]), o.offers.flatMap((x, i): Item[] => [{ t: "chip", p: [110 + (i % 3) * 120, 160 - Math.floor(i / 3) * 40], s: `${x.label}${x.dimensional ? " " + x.measure!.toFixed(0) : ""}`, tone: tone(x.state) }])); }
const html = `<!doctype html><meta charset="utf-8"><title>Sketching: what the interaction layer says</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f6;color:#2b2b30}h1{font-size:20px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:18px}figure{margin:0;background:#fff;border:1px solid #d8d8de;border-radius:8px;padding:10px}figcaption{font-size:13px;margin-top:6px;color:#55575c}figcaption b{color:#2b2b30}.key{display:flex;gap:14px;flex-wrap:wrap;margin:10px 0 20px}.key span{display:inline-flex;align-items:center;gap:6px}.sw{width:14px;height:14px;border-radius:3px;display:inline-block}</style>
<h1>Sketching: what the interaction layer says</h1><p>Every picture below is made from the real <code>referenceSet</code>, <code>hold</code>, <code>offersFor</code> and <code>tryAdd</code>, in the colours and line weights of the old project (<code>next/src/interaction/style.ts</code>, each with its source). The interaction layer returns data; a screen draws it. This page is one way to draw it.</p>
<div class="key">${(["figure", "candidate", "aligned", "ties", "refused", "applied", "temp", "note"] as const).map((t) => `<span><i class="sw" style="background:${COLOUR[t]}"></i>${({ figure: "figure / selection (teal)", candidate: "a suggestion: dashed teal", aligned: "a hint holds (orange)", ties: "what a relation ties it to (amber)", refused: "refused (red, flashing)", applied: "already applied (green)", temp: "temporary (blue)", note: "a dimension's line (grey)" })[t]}</span>`).join("")}</div>
<div class="g">${panels.map((p) => `<figure>${p.body}<figcaption><b>${p.title}.</b> ${p.note}</figcaption></figure>`).join("\n")}</div>`;
writeFileSync(new URL("../../docs/rebuild/interaction-gallery.html", import.meta.url), html); console.log("written", panels.length, "pictures,", html.length, "bytes");
