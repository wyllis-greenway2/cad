import { orderCandidates } from "../src/interaction/candidates.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as cam from "../src/camera.ts";
import { solveDefinition, modernise, systemOf } from "../src/engine/definition.ts";
import { helpersAt } from "../src/engine/helpers.ts";
import { candidatesFor, inRange, translating } from "../src/engine/probe.ts";
import type { SketchParams } from "../src/engine/sketch.ts";
import { RELATIONS, type System } from "../src/engine/solver.ts";
import { trimAt } from "../src/engine/trim.ts";
import { STATE } from "../src/chipdraw.ts";
import { iconOf, whereOf } from "../src/interaction/bubbles.ts";
import { dragRadius, dragTo, pinsOf } from "../src/interaction/dragging.ts";
import {
  addCircle,
  addLine,
  addRect,
  arcWay,
  constrain,
  emptySketch,
  keep,
  refOf,
  removeParts,
  retype,
  viewSystem,
  type Sol,
} from "../src/interaction/drawing.ts";
import { alphaAt, marksFor, rankNear } from "../src/interaction/marks.ts";
import { offersFor } from "../src/interaction/suggest.ts";
import { GROUPS, TOOLS, toolOf } from "../src/interaction/toolspec.ts";
import { cancelFigure, newTool, toolClick } from "../src/interaction/tools.ts";
import { worldFrame, type Frame } from "../src/planes.ts";
import { createSelection } from "../src/selection.ts";
import { settings } from "../src/settings.ts";
import { createSketch } from "../src/sketchcontrol.ts";

// ---- what the tests share: a sketch controller on a straight view of a plane, and the engine's own definition without it ----
const W = 1000,
  H = 1000;
const sol = (p: SketchParams): Sol => {
  const s = solveDefinition(p);
  return { points: s.points, radii: s.radii };
};
const grow = (p: SketchParams, f: (p: SketchParams, s: Sol) => SketchParams | null): SketchParams => {
  const n = f(p, sol(p));
  assert.ok(n, "nothing was drawn");
  const k = keep(n);
  assert.ok(k.ok, k.ok ? "" : k.why);
  return k.params;
};
const at = (p: SketchParams, s: Sol, x: number, y: number) => refOf(p, s, [x, y], 0.5);
const rect = (): SketchParams => grow(emptySketch(), (q, s) => addRect(q, s, at(q, s, 0, 0), at(q, s, 40, 25)));
const P = (id: string, x: number, y: number) => ({ id, x, y });
const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pos = (p: SketchParams) => solveDefinition(p).points;

/** a sketch controller looking straight at plane "xy" (ortho, 1000 px for `ortho` mm), with what it said and what it gave the history */
function rig(ortho = 100) {
  const c: cam.Cam = { eye: [0, 0, 100], yaw: 0, pitch: -Math.PI / 2, ortho, lens: 1 };
  const selection = createSelection();
  const notes: string[] = [];
  const history: string[] = [];
  const frames = new Map<string, Frame>([["xy", worldFrame(2)]]);
  let on = "xy";
  const host = {
    selection,
    notify: (t: string) => void notes.push(t),
    startEdit: () => false,
    editing: () => false,
    view: () => ({ cam: c, w: W, h: H }),
    planes: () => ({ all: frames, on, step: 1 }),
    ray: (x: number, y: number) => cam.rayFrom(c, (x / W) * 2 - 1, -((y / H) * 2 - 1), W / H),
    inFront: () => false, // (no bodies in these tests)
  };
  const sk = createSketch(host as never, (label) => void history.push(label));
  const px = (x: number, y: number) => {
    const q = cam.project(c, [x, y, 0], W, H);
    return [q.x, q.y] as const;
  };
  return {
    sk,
    selection,
    notes,
    history,
    frames,
    px,
    mmPerPx: ortho / H,
    // a tool on: a click is the sketch's; no tool: the page picks the first of what is under the pointer (`interaction/candidates.ts`)
    click: (x: number, y: number, n = 1, shift = false) => {
      const [sx, sy] = px(x, y);
      if (sk.active()) return sk.click(sx, sy, n, shift);
      const first = orderCandidates(sk.candidates(sx, sy))[0];
      return first ? sk.pickItem(first.item, shift) : false;
    },
    grab: (x: number, y: number) => {
      const [sx, sy] = px(x, y),
        first = orderCandidates(sk.candidates(sx, sy))[0];
      return !!first && sk.grab(first.item, sx, sy, false);
    },
    move: (x: number, y: number) => sk.grabMove(...px(x, y)),
    plane: (key: string) => void (on = key),
    def: () => sk.sketchOf("xy")!,
  };
}
type Rig = ReturnType<typeof rig>;
const load = (r: Rig, p: SketchParams) => r.sk.restore({ xy: p });
const sel = (r: Rig, ...ids: string[]) => r.selection.setSketch("xy", ids);
const free = (): SketchParams => ({
  points: [P("A", 0, 0), P("B", 10, 0), P("C", 20, 20), P("D", 30, 20)],
  lines: [
    { id: "L1", a: "A", b: "B" },
    { id: "L2", a: "C", b: "D" },
  ],
  circles: [],
  arcs: [],
  constraints: [],
});

// ---------------------------------------------------------------- S2 S4 S5 S6 the tools
test("[S2] a rectangle is two clicks at opposite corners, axis-aligned in the plane", () => {
  const r = rig();
  r.sk.start("rect");
  r.click(5, 5);
  assert.equal(r.sk.drawStep(), 1);
  r.click(45, 30);
  const d = r.def();
  assert.equal(d.points.length, 4);
  assert.equal(d.lines!.length, 4);
  const xs = new Set(d.points.map((p) => Math.round(p.x * 100)));
  const ys = new Set(d.points.map((p) => Math.round(p.y * 100)));
  assert.deepEqual(
    [...xs].sort((a, b) => a - b),
    [500, 4500],
  );
  assert.deepEqual(
    [...ys].sort((a, b) => a - b),
    [500, 3000],
  );
  const s = pos(d);
  for (const l of d.lines!) {
    const a = s[l.a]!,
      b = s[l.b]!;
    assert.ok(Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9, "every side is level or upright");
  }
});

test("[S2] a circle is the middle and then a point on it; an arc is the centre, the start and where it ends, the short way round", () => {
  const r = rig();
  r.sk.start("circle");
  r.click(0, 0);
  r.click(10, 0);
  const k = r.def().circles![0]!;
  assert.ok(Math.abs(k.r - 10) < 1e-6);
  assert.ok(dist(pos(r.def())[k.c]!, [0, 0]) < 1e-6);
  // the short way: whatever the end, the sweep is at most a half turn, and it goes clockwise only when that is shorter
  for (let deg = 10; deg < 360; deg += 10) {
    const t = (deg * Math.PI) / 180,
      w = arcWay([0, 0], [10, 0], [10 * Math.cos(t), 10 * Math.sin(t)]);
    assert.ok(w.sweep <= Math.PI + 1e-9, `${deg} degrees sweeps ${w.sweep}`);
    assert.equal(w.cw, deg > 180);
  }
  const a = rig();
  a.sk.start("arc");
  a.click(0, 0);
  a.click(10, 0);
  assert.equal(a.sk.drawStep(), 2);
  a.click(0, -10);
  const arc = a.def().arcs![0]!;
  assert.ok(arc, "the third click makes the arc");
  assert.equal(!!arc.cw, true, "from east to south the short way is clockwise");
});

test("[S2] a line goes on from a point already drawn, each click a segment from the last, and a double click ends the chain", () => {
  const r = rig();
  r.sk.start("line");
  r.click(0, 0);
  r.click(10, 0);
  assert.equal(r.def().lines!.length, 1);
  r.click(10, 0); // (on the end just drawn: the next segment goes on from it)
  assert.equal(r.sk.drawStep(), 1);
  r.click(10, 10);
  assert.equal(r.def().lines!.length, 2);
  assert.equal(r.def().points.length, 3, "the second segment shares the point");
  r.click(10, 10);
  assert.equal(r.sk.drawStep(), 1);
  r.click(10, 10, 2);
  assert.equal(r.sk.drawStep(), 0, "a double click ends the chain");
  assert.equal(r.def().lines!.length, 2);
});

test("[S2] a figure under way belongs to its plane: when another plane is on it is given up (it used to throw on every move of the pointer)", () => {
  const r = rig();
  r.frames.set("other", worldFrame(2)); // (another plane, as seen from above as the first)
  r.sk.start("line");
  r.click(0, 0);
  assert.equal(r.sk.drawStep(), 1);
  r.plane("other");
  assert.doesNotThrow(() => r.sk.lines({ x: 400, y: 300 }));
  assert.equal(r.sk.drawStep(), 0, "the figure begun on the other plane is given up");
  r.click(5, 5);
  assert.equal(r.sk.drawStep(), 1, "and a new one begins on this plane");
});

test("[S2] a second click on the same place makes nothing", () => {
  for (const kind of ["line", "rect", "circle"] as const) {
    const r = rig();
    r.sk.start(kind);
    r.click(5, 5);
    r.click(5, 5);
    const d = r.sk.sketchOf("xy");
    assert.equal((d?.lines?.length ?? 0) + (d?.circles?.length ?? 0), 0, kind);
    assert.equal(d?.points.length ?? 0, 0, `${kind} leaves no stray point`);
    assert.equal(r.sk.drawStep(), 1, `${kind} keeps its first click, to click again elsewhere`);
  }
  // the same through the tool's own rule
  const s = sol(emptySketch());
  const first = toolClick(newTool("line"), emptySketch(), s, { at: [1, 1] });
  const second = toolClick(first.tool, emptySketch(), s, { at: [1, 1] });
  assert.equal(second.made?.params ?? null, null);
});

test("[S4] a right click or Esc gives up the figure under way; with none it puts the tool away; Esc then clears the selection", () => {
  const r = rig();
  r.sk.start("rect");
  r.click(0, 0);
  assert.equal(r.sk.drawStep(), 1);
  assert.equal(r.sk.stop(), true);
  assert.equal(r.sk.drawStep(), 0, "the figure under way is given up");
  assert.equal(r.sk.tool(), "rect", "the tool is still on");
  assert.equal(r.sk.stop(), true);
  assert.equal(r.sk.tool(), null, "with no figure, the tool is put away");
  assert.equal(r.sk.stop(), false, "nothing left to put away, so Esc goes on to the selection");
  r.selection.setSketch("xy", ["P1"]);
  assert.equal(r.selection.clear(), true);
  assert.equal(r.selection.get(), null);
  // the tool's own rule
  const t = { ...newTool("arc"), pts: [{ at: [0, 0] }, { at: [1, 0] }] as never };
  assert.equal(cancelFigure(t).pts.length, 0);
  assert.equal(cancelFigure(t).kind, "arc");
});

test("[S5] a point sticks to a corner, a middle or a centre of an earlier figure within the same number of pixels at any zoom", () => {
  for (const ortho of [100, 400]) {
    const r = rig(ortho);
    const d = grow(
      grow(emptySketch(), (q, s) => addRect(q, s, at(q, s, 0, 0), at(q, s, 40, 25))),
      (q, s) => addCircle(q, s, at(q, s, 100, 100), [110, 100]),
    );
    const mm = (px: number) => px * r.mmPerPx;
    const startsAt = (x: number, y: number) => {
      load(r, d);
      r.sk.start("line");
      r.click(x, y);
      r.click(x + mm(60), y - mm(150));
      r.sk.stop();
      r.sk.stop();
      const nd = r.def();
      return nd.lines!.find((l) => l.id !== "L1" && !["L1", "L2", "L3", "L4"].includes(l.id))!;
    };
    // a corner: within the snap pixels it is that point, farther out it is a new one
    const near = startsAt(-mm(5), -mm(5));
    assert.equal(near.a, "P1", `the corner at zoom ${ortho}`);
    const far = startsAt(-mm(settings.sketch.snapPx + 30), -mm(settings.sketch.snapPx + 30));
    assert.notEqual(far.a, "P1", `not far out at zoom ${ortho}`);
    // a middle: a place a few pixels off the middle of a side is the middle
    load(r, d);
    r.sk.start("line");
    r.click(20 + mm(2), mm(3));
    r.click(20, 60);
    const mid = r.def().points.find((p) => !d.points.some((q) => q.id === p.id) && p.y < 1)!;
    assert.ok(Math.abs(mid.x - 20) < 1e-6 && Math.abs(mid.y) < 1e-6, `the middle at zoom ${ortho}: ${mid.x},${mid.y}`);
    // a centre
    const cen = startsAt(100 + mm(4), 100 + mm(4));
    assert.equal(cen.a, d.circles![0]!.c, `the centre at zoom ${ortho}`);
  }
});

test("[S6] figures are kept in the plane's own axes: each plane keeps its own, and they go with the plane when it is placed elsewhere", () => {
  const r = rig();
  r.frames.set("p", { origin: [0, 0, 5], normal: [0, 0, 1], u: [1, 0, 0] });
  r.sk.start("line");
  r.click(0, 0);
  r.click(10, 0);
  r.sk.stop();
  r.plane("p");
  r.sk.start("line");
  r.click(0, 0);
  r.click(0, 20);
  const snap = r.sk.snapshot();
  assert.deepEqual(Object.keys(snap).sort(), ["p", "xy"]);
  assert.equal(snap.xy!.points.length, 2);
  assert.equal(snap.p!.points.length, 2);
  assert.notDeepEqual(snap.xy!.points, snap.p!.points, "each plane keeps its own");
  const before = r.sk.lines(null).filter((l) => l.kind === "done" && l.pts[0]![2] === 5);
  assert.equal(before.length, 1);
  // the plane is moved: the figure (in the plane's own axes) is untouched, and stands on the moved plane
  r.frames.set("p", { origin: [30, 40, 5], normal: [0, 0, 1], u: [1, 0, 0] });
  assert.deepEqual(r.sk.snapshot().p, snap.p);
  const after = r.sk.lines(null).filter((l) => l.kind === "done" && l.pts[0]![2] === 5);
  assert.equal(after.length, 1);
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.abs(after[0]!.pts[i]![0] - (before[0]!.pts[i]![0] + 30)) < 1e-9);
    assert.ok(Math.abs(after[0]!.pts[i]![1] - (before[0]!.pts[i]![1] + 40)) < 1e-9);
  }
});

// ---------------------------------------------------------------- S7 S8 S9 the definition
test("[S7] a rectangle is four points, four lines, level and upright, in the engine's own definition", () => {
  const p = rect();
  assert.equal(p.points.length, 4);
  assert.equal(p.lines!.length, 4);
  const kinds = (p.constraints ?? []).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["horizontal", "horizontal", "vertical", "vertical"]);
  assert.equal(p.circles!.length + p.arcs!.length, 0);
});

test("[S7] an edit the solver refuses leaves the sketch as it was and says which constraints held it back", () => {
  const p = rect();
  const r = constrain(p, sol(p), ["L1"], "vertical");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.why.length > 0);
    assert.ok(r.victims.length > 0, "it names what held it back");
    const ids = new Set(p.constraints!.map((c) => c.id));
    assert.ok(r.victims.every((v) => ids.has(v)));
  }
  // through the controller: the sketch is the same object, and it is said in words
  const rg = rig();
  load(rg, p);
  const was = rg.def();
  sel(rg, "L1");
  assert.equal(rg.sk.constrain("vertical"), false);
  assert.equal(rg.def(), was);
  assert.ok(rg.notes.length > 0);
});

test("[S8] a solve holds the first-drawn corner: a number or a relation moves the far end", () => {
  const p = rect();
  const d = constrain(p, sol(p), ["L1"], "dimension");
  assert.ok(d.ok);
  const r = retype(d.params, d.added, 55);
  assert.ok(r.ok);
  const s = pos(r.params);
  assert.ok(dist(s.P1!, [0, 0]) < 1e-6, "the first corner stays");
  const L = r.params.lines!.find((l) => l.id === "L1")!;
  assert.ok(Math.abs(dist(s[L.a]!, s[L.b]!) - 55) < 1e-6);
  // a relation: a slanted free line made level
  const q = grow(emptySketch(), (a, c) => addLine(a, c, at(a, c, 0, 0), at(a, c, 10, 7)));
  const h = constrain(q, sol(q), ["L1"], "horizontal");
  assert.ok(h.ok);
  const t = pos(h.params);
  assert.ok(dist(t.P1!, [0, 0]) < 1e-6, "the first end stays");
  assert.ok(Math.abs(t.P2![1]) < 1e-6, "the far end moved to level");
});

test("[S9] a click on a side, or a place a helper moved the point to, makes no constraint", () => {
  const p = rect();
  const q = grow(p, (a, s) => addLine(a, s, at(a, s, 20, 0), at(a, s, 20, -10)));
  assert.equal(q.constraints!.length, p.constraints!.length, "a line started on a side is not held on it");
  assert.ok(Math.abs(q.points[4]!.y) < 1e-9, "but the point is put on the side");
  // the helpers place a line level and make nothing of it
  const r = rig();
  r.sk.start("line");
  r.click(0, 0);
  r.click(30, 0.3);
  const d = r.def();
  assert.equal(d.lines!.length, 1);
  assert.equal(d.constraints!.length, 0);
  assert.ok(Math.abs(pos(d).P2![1]) < 1e-9, "the helper put the end level");
  const h = helpersAt(systemOf(p), { shape: "point" }, [20.3, 0.2], 0.1, settings.helpers);
  assert.ok(h.acted.length > 0, "a helper acts");
  assert.equal(p.constraints!.length, 4, "and the sketch has no more constraints for it");
});

// ---------------------------------------------------------------- S10 selecting and deleting
test("[S10] with no tool a click selects a point, a line, a circle or an arc, Shift adds, and Delete takes them with their constraints and the end points nothing else uses", () => {
  const r = rig();
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 20, 0), P("C", 50, 50), P("D", 80, 0), P("E", 100, 0), P("F", 90, 10), P("G", 90, 0)],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 8 }],
    arcs: [{ id: "A1", c: "G", a: "E", b: "F" }],
    constraints: [{ id: "c1", kind: "horizontal", parts: ["L1"] }],
  };
  load(r, p);
  assert.equal(r.sk.active(), false);
  r.click(0, 0);
  assert.deepEqual(r.selection.sketch("xy"), ["A"]);
  r.click(10, 0);
  assert.deepEqual(r.selection.sketch("xy"), ["L1"]);
  r.click(58, 50);
  assert.deepEqual(r.selection.sketch("xy"), ["K1"]);
  r.click(90 + 10 * Math.cos(Math.PI / 4), 10 * Math.sin(Math.PI / 4));
  assert.deepEqual(r.selection.sketch("xy"), ["A1"]);
  r.click(10, 0);
  r.click(58, 50, 1, true);
  assert.deepEqual(r.selection.sketch("xy"), ["L1", "K1"], "Shift adds");
  assert.equal(r.sk.key("Delete"), true);
  const d = r.def();
  assert.equal(d.lines!.length, 0);
  assert.equal(d.circles!.length, 0);
  assert.equal(d.constraints!.length, 0, "the constraint that named the line went with it");
  assert.deepEqual(
    d.points.map((q) => q.id).sort(),
    ["E", "F", "G"],
    "the end points nothing else uses went; the arc's stay",
  );
  assert.equal(r.selection.get(), null);
});

test("[S10] deleting a side takes its constraints and not the corners the others use; deleting a free line takes its ends too", () => {
  const p = rect();
  const a = removeParts(p, ["L1"]);
  assert.ok(!a.lines!.some((l) => l.id === "L1"));
  assert.equal(a.points.length, 4);
  assert.ok(!a.constraints!.some((c) => c.parts.includes("L1")));
  const q = grow(p, (x, s) => addLine(x, s, at(x, s, -10, 12), at(x, s, 50, 12)));
  const b = removeParts(q, ["L5"]);
  assert.equal(b.points.length, q.points.length - 2);
  assert.equal(removeParts(p, ["P1"]).lines!.length, 2, "a corner takes the sides that end in it");
});

// ---------------------------------------------------------------- S12 S13 dragging
test("[S12] a drag moves a part, the solver following the pointer: a rectangle stays a rectangle", () => {
  const p = rect();
  const pins = pinsOf(p, "P3");
  assert.deepEqual(pins, ["P3"]);
  const r = dragTo(p, { P3: [60, 40] });
  assert.ok(r);
  const s = pos(r.params);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  // the pinned corner is where the pointer put it, and the four corners are still a level, upright box
  assert.ok(dist(s.P3!, [60, 40]) < 1e-6);
  const xs = [s.P1![0], s.P2![0], s.P3![0], s.P4![0]],
    ys = [s.P1![1], s.P2![1], s.P3![1], s.P4![1]];
  for (const l of r.params.lines!) {
    const a = s[l.a]!,
      b = s[l.b]!;
    assert.ok(near(a[0], b[0]) || near(a[1], b[1]), "every side is level or upright");
  }
  assert.equal(new Set(xs.map((v) => Math.round(v * 1e6))).size, 2);
  assert.equal(new Set(ys.map((v) => Math.round(v * 1e6))).size, 2);
});

test("[S12] a locked length holds the drag back, and what held it is named", () => {
  const p: SketchParams = {
    points: [P("A", 0, 0), P("B", 10, 0)],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [],
    arcs: [],
    constraints: [
      { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
      { id: "len", kind: "length", parts: ["L1"], value: 10 },
    ],
  };
  const r = dragTo(p, { B: [30, 0] });
  assert.ok(r);
  assert.ok(dist(pos(r.params).B!, [10, 0]) < 1e-4, "the end does not follow the pointer past the length");
  assert.ok(r.held.includes("len"), "the length that held it back is named");
});

test("[S12] a circle's edge changes its size, its centre moves the whole circle", () => {
  const p = grow(emptySketch(), (q, s) => addCircle(q, s, at(q, s, 10, 10), [15, 10]));
  const k = p.circles![0]!;
  assert.deepEqual(pinsOf(p, k.id), [k.c], "a press on the circle takes its centre");
  const moved = dragTo(p, { [k.c]: [30, 30] });
  assert.ok(moved);
  assert.ok(dist(pos(moved.params)[k.c]!, [30, 30]) < 1e-6);
  assert.ok(Math.abs(moved.params.circles![0]!.r - 5) < 1e-6, "the size is kept");
  const grown = dragRadius(p, k.id, 9);
  assert.ok(grown);
  assert.ok(Math.abs(grown.params.circles![0]!.r - 9) < 1e-6);
  assert.ok(dist(pos(grown.params)[k.c]!, [10, 10]) < 1e-6, "its centre stays");
  const locked = {
    ...p,
    constraints: [{ id: "r1", kind: "radius" as const, parts: [k.id], value: 5 }],
  };
  const held = dragRadius(locked, k.id, 9);
  assert.deepEqual(held?.held, ["r1"], "a locked size holds the edge back and is named");
  assert.equal(held?.params.circles![0]!.r, 5);
});

test("[S12] the whole drag is one change for the history, and a press that goes nowhere is a click", () => {
  const r = rig();
  load(r, free());
  r.history.length = 0;
  assert.equal(r.grab(10, 0), true);
  r.move(12, 5);
  r.move(15, 10);
  r.move(18, 14);
  assert.equal(r.history.length, 0, "nothing is given to the history while it is going on");
  r.sk.grabEnd();
  assert.deepEqual(r.history, ["Drag"], "one change for the whole drag");
  assert.ok(dist(pos(r.def()).B!, [10, 0]) > 1, "and the part moved");
  // a press that goes nowhere
  load(r, free());
  r.history.length = 0;
  r.selection.clear();
  assert.equal(r.grab(10, 0), true);
  r.move(10.1, 0);
  r.sk.grabEnd();
  assert.deepEqual(r.history, []);
  assert.deepEqual(r.selection.sketch("xy"), ["B"], "it selected the part");
  assert.ok(dist(pos(r.def()).B!, [10, 0]) < 1e-9);
});

test("[S13] a point dragged over another point or a curve shows a cross where it will stick, and lands there", () => {
  const r = rig();
  load(r, free());
  assert.equal(r.grab(10, 0), true);
  r.move(15, 10);
  const crosses = (cx: number, cy: number) =>
    r.sk
      .lines(null)
      .filter((l) => l.kind === "cursor")
      .some((l) => l.pts.some((q) => Math.abs(q[0] - cx) < 1 && Math.abs(q[1] - cy) < 1));
  assert.equal(crosses(20, 20), false, "no cross while it is free");
  r.move(20.1, 20.1);
  assert.equal(crosses(20, 20), true, "a cross shows over the point it will stick to");
  r.sk.grabEnd();
  assert.ok(dist(pos(r.def()).B!, [20, 20]) < 1e-6, "it lands on the other point");
  load(r, free());
  r.grab(10, 0);
  r.move(15, 10);
  r.move(25, 20.1);
  assert.equal(crosses(25, 20), true, "and a cross over the curve");
  r.sk.grabEnd();
  assert.ok(Math.abs(pos(r.def()).B![1] - 20) < 1e-6, "it lands on the line");
});

// ---------------------------------------------------------------- S14 trim
const trimSketch = (): SketchParams => ({
  points: [P("A", 0, 0), P("B", 10, 0), P("C", 4, -5), P("D", 4, 5)],
  lines: [
    { id: "h", a: "A", b: "B" },
    { id: "v", a: "C", b: "D" },
  ],
  arcs: [],
  circles: [],
  constraints: [
    { id: "hz", kind: "horizontal", parts: ["h"] },
    { id: "len", kind: "length", parts: ["h"], value: 10 },
    { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
    { id: "fc", kind: "fixed", parts: ["C"], at: [4, -5] },
    { id: "fd", kind: "fixed", parts: ["D"], at: [4, 5] },
  ],
});
test("[S14] trim shows in red the part between the places others cross it, and the click takes it off and says what it had to let go", () => {
  const r = rig();
  load(r, trimSketch());
  r.sk.start("trim");
  const [x, y] = r.px(8, 0);
  const cut = r.sk.lines({ x, y }).filter((l) => l.kind === "cut");
  assert.equal(cut.length, 1, "one red part");
  const xs = cut[0]!.pts.map((q) => q[0]);
  assert.ok(Math.abs(Math.min(...xs) - 4) < 1e-6, "from where the other line crosses it");
  assert.ok(Math.abs(Math.max(...xs) - 10) < 1e-6, "to the end");
  // the pointer on the other side shows the other part
  const [x2, y2] = r.px(2, 0);
  const cut2 = r.sk.lines({ x: x2, y: y2 }).filter((l) => l.kind === "cut")[0]!;
  assert.ok(Math.abs(Math.max(...cut2.pts.map((q) => q[0])) - 4) < 1e-6);
  r.click(8, 0);
  const d = r.def();
  const h = d.lines!.find((l) => l.id === "h")!;
  const s = pos(d);
  assert.ok(Math.abs(s[h.b]![0] - 4) < 1e-6, "the line now ends at the crossing");
  assert.ok(!d.constraints!.some((c) => c.id === "len"), "the length of the whole line went");
  const said = r.notes[r.notes.length - 1]!;
  assert.match(said, /Let go/);
  assert.match(said, /length/);
  // the same through the engine
  const t = trimAt(trimSketch(), "h", [8, 0]);
  assert.deepEqual(
    t.dropped.map((q) => q.id),
    ["len"],
  );
  assert.ok(t.span.every((q) => q[0] >= 4 - 1e-9 && q[0] <= 10 + 1e-9));
});

// ---------------------------------------------------------------- S15 S16 S17 the marks
const sysRect = () => {
  const p = rect();
  return { p, S: viewSystem(p, sol(p)) };
};
const tangentCase = (): System => ({
  points: [
    { id: "P1", x: 0, y: 5.3 },
    { id: "P2", x: 40, y: 5.3 },
    { id: "P3", x: 20, y: 10 },
  ],
  lines: [{ id: "L1", a: "P1", b: "P2" }],
  circles: [{ id: "K1", c: "P3", r: 5 }],
  constraints: [],
});

test("[S15] every constraint and every number is one bubble standing on the thing it is about, locked when applied, open when offered or only measured", () => {
  const { p, S } = sysRect();
  const ms = marksFor(S, ["L1"], { now: 0 });
  const ids = ms.map((m) => `${m.id}|${m.over?.join(",") ?? ""}`);
  assert.equal(new Set(ids).size, ids.length, "no two marks are one bubble");
  const applied = ms.filter((m) => m.state === "locked");
  assert.ok(applied.length > 0);
  for (const m of applied) {
    assert.ok(
      p.constraints!.some((c) => c.id === m.id),
      "a locked bubble is an applied constraint",
    );
    assert.deepEqual(m.at, whereOf(S, m.parts), "and it stands on what it is about");
  }
  const number = ms.find((m) => m.kind === "dimension");
  assert.ok(number);
  assert.equal(number.state, "offer");
  assert.equal(number.locked, false, "a number only measured is open");
  // a number that is applied is locked
  const d = constrain(p, sol(p), ["L1"], "dimension");
  assert.ok(d.ok);
  const S2 = viewSystem(d.params, d.sol);
  const fact = marksFor(S2, ["L1"], { now: 0 }).find((m) => m.id === d.added)!;
  assert.equal(fact.kind, "dimension");
  assert.equal(fact.state, "locked");
  assert.equal(
    marksFor(S2, ["L1"], { now: 0 }).filter((m) => m.kind === "dimension").length,
    1,
    "a number once, not as a fact and as a measure",
  );
  // two constraints at one spot stay two bubbles
  const two = marksFor(S, ["P1"], { now: 0 }).filter((m) => m.state === "locked");
  assert.equal(two.length, new Set(two.map((m) => m.id)).size);
});

test("[S16] what shows at rest: nothing unselected, a selected part's applied constraints and offers, and a refusal always", () => {
  const { p, S } = sysRect();
  assert.equal(marksFor(S, [], { now: 0 }).length, 0, "nothing selected and nothing recent shows nothing");
  const one = marksFor(S, ["L1"], { now: 0 });
  assert.ok(one.some((m) => m.state === "locked" && m.kind === "constraint"));
  assert.ok(one.some((m) => m.state === "offer"));
  assert.ok(one.every((m) => m.state !== "refused"));
  const refused = p.constraints![0]!.id;
  const red = marksFor(S, [], { flash: { refused: [refused] }, now: 0 });
  assert.equal(red.length, 1);
  assert.equal(red[0]!.state, "refused");
  assert.equal(red[0]!.id, refused);
  assert.ok(
    marksFor(S, ["L3"], { flash: { refused: [refused] }, now: 0 }).some(
      (m) => m.id === refused && m.state === "refused",
    ),
  );
});

test("[S16] the offers for what was just drawn show for a few seconds and fade, even unselected", () => {
  const T = viewSystem(
    grow(
      grow(emptySketch(), (a, s) => addLine(a, s, at(a, s, 0, 0), at(a, s, 40, 0))),
      (a, s) => addCircle(a, s, at(a, s, 20, 5), [25, 5]),
    ),
    { points: { P1: [0, 0], P2: [40, 0], P3: [20, 5] }, radii: { K1: 5 } },
  );
  const recent = { ids: ["L1"], until: 1000 };
  const soon = marksFor(T, [], { recent, now: 100 }),
    late = marksFor(T, [], { recent, now: 1000 - settings.marks.fadeMs / 2 }),
    gone = marksFor(T, [], { recent, now: 1000 });
  assert.ok(soon.length > 0);
  assert.ok(soon.every((m) => m.kind === "constraint" && m.state === "offer" && m.alpha === 1));
  assert.ok(late.length > 0 && late.every((m) => m.alpha > 0.4 && m.alpha < 0.6), "they fade");
  assert.equal(gone.length, 0, "and are gone after");
  assert.ok(alphaAt(1000, 0) === 1 && alphaAt(1000, 1000) === 0 && alphaAt(1000, 2000) === 0);
});

test("[S17] the only colours of a mark are yellow for what is suggested, neutral charcoal for what is applied and red for a refusal; red is for nothing else", () => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const [ar, ag, ab] = rgb(STATE.locked);
  assert.ok(Math.max(ar, ag, ab) - Math.min(ar, ag, ab) < 24, "applied is neutral: not green, not blue");
  const [or, og, ob] = rgb(STATE.offer);
  assert.ok(or > 200 && og > 150 && ob < 120, "an offer is yellow");
  const [rr, rg, rb] = rgb(STATE.refused);
  assert.ok(rr > 200 && rg < 140 && rb < 140, "a refusal is red");
  assert.equal(new Set(Object.values(STATE)).size, 3, "three states, three colours");
  // every mark is in one of those three states, and only a flash makes one red
  const { p, S } = sysRect();
  const all = [...marksFor(S, ["L1"], { now: 0 }), ...marksFor(S, ["L1", "L2"], { now: 0 })];
  assert.ok(all.every((m) => m.state === "locked" || m.state === "offer"));
  const flashed = marksFor(S, ["L1"], { now: 0, flash: { refused: [p.constraints![0]!.id] } });
  assert.deepEqual(
    flashed.filter((m) => m.state === "refused").map((m) => m.id),
    [p.constraints![0]!.id],
  );
});

test("[S21] a change that would break a constraint is refused in words, and the constraints that held it back flash red, selected or not", () => {
  const p = rect();
  const bad = constrain(p, sol(p), ["L1"], "vertical");
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.why.length > 0 && bad.victims.length > 0);
  const d = constrain(p, sol(p), ["L1"], "dimension");
  assert.ok(d.ok);
  const typed = retype(d.params, d.added, -4);
  assert.equal(typed.ok, false, "a typed number that cannot be is refused");
  assert.ok(!typed.ok && typed.why.length > 0);
  const S = viewSystem(p, sol(p));
  const victims = !bad.ok ? bad.victims : [];
  const shown = marksFor(S, [], { flash: { refused: victims }, now: 0 });
  assert.deepEqual(shown.map((m) => m.id).sort(), [...victims].sort());
  assert.ok(shown.every((m) => m.state === "refused"));
  assert.ok(
    marksFor(S, ["L3"], { flash: { refused: victims }, now: 0 }).filter((m) => m.state === "refused").length ===
      victims.length,
  );
  // a drag that a locked length holds back names it too
  const fixedLen: SketchParams = {
    points: [P("A", 0, 0), P("B", 10, 0)],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [],
    arcs: [],
    constraints: [
      { id: "f", kind: "fixed", parts: ["A"], at: [0, 0] },
      { id: "len", kind: "length", parts: ["L1"], value: 10 },
    ],
  };
  const dragged = dragTo(fixedLen, { B: [30, 0] });
  assert.ok(dragged && dragged.held.includes("len"));
  const shownDrag = marksFor(viewSystem(fixedLen, sol(fixedLen)), [], { flash: { refused: dragged.held }, now: 0 });
  assert.ok(shownDrag.length === dragged.held.length && shownDrag.every((m) => m.state === "refused"));
});

// ---------------------------------------------------------------- S23 S24 S25 offers
test("[S23] an offer is shown only if it is new (never already said), accepted by the solver, and of two different parts", () => {
  const p = grow(
    grow(rect(), (a, s) => addLine(a, s, at(a, s, 50, 0.3), at(a, s, 80, 0))),
    (a, s) => addCircle(a, s, at(a, s, 20, 40), [26, 40]),
  );
  const S = viewSystem(p, sol(p));
  const parts = S.points
    .map((q) => q.id)
    .concat(
      S.lines.map((l) => l.id),
      S.circles.map((k) => k.id),
    );
  const selections = [...parts.map((x) => [x]), ["L1", "L5"], ["P1", "L5"], ["K1", "L1"], ["P1", "P3"], ["L1", "L2"]];
  let offered = 0;
  for (const selection of selections)
    for (const reach of [undefined, 0.6, 3])
      for (const m of marksFor(S, selection, { now: 0, ...(reach ? { reach } : {}) })) {
        if (m.state !== "offer" || m.kind !== "constraint") continue;
        offered++;
        const c = { id: "t", kind: m.relation, parts: m.parts };
        assert.equal(new Set(m.parts).size, m.parts.length, `${m.id} is of a part with itself`);
        const said = (p.constraints ?? []).some(
          (k) => k.kind === m.relation && [...k.parts].sort().join() === [...m.parts].sort().join(),
        );
        assert.equal(said, false, `${m.id} is already said`);
        const o = offersFor(S, m.parts).offers.find((x) => x.kind === m.relation);
        if (o) assert.ok(o.state === "free" || o.state === "holds", `${m.id} is ${o.state}`);
        void c;
      }
  assert.ok(offered > 0, "the scenario offers something");
  // two sides of the rectangle: parallel is refused (they are upright and level), so it is not offered
  const pair = offersFor(S, ["L1", "L2"]).offers.find((o) => o.kind === "parallel");
  assert.ok(pair && (pair.state === "refused" || pair.state === "already"), "the solver does not take it");
  assert.ok(!marksFor(S, ["L1", "L2"], { now: 0 }).some((m) => m.state === "offer" && m.relation === "parallel"));
});

test("[S24] one distance for every relation: a near offer is shown if it holds within the reach, and not beyond it", () => {
  const R = tangentCase();
  const has = (reach?: number, S = R) =>
    marksFor(S, ["L1"], { now: 0, ...(reach ? { reach } : {}) }).some((m) => m.id.startsWith("near:tangent"));
  assert.equal(has(0.6), true);
  assert.equal(has(0.1), false);
  assert.equal(has(undefined), false);
  const far: System = { ...R, points: R.points.map((q) => (q.id === "P1" || q.id === "P2" ? { ...q, y: 9 } : q)) };
  assert.equal(has(0.6, far), false);
  // the probe says the same, for the line moved
  const mv = translating(R, ["P1", "P2"]),
    cands = candidatesFor(R, mv.affected);
  assert.ok(inRange(mv, [0, 0], cands, 0.6).some((x) => x.cand.relation === "tangent"));
  assert.ok(!inRange(mv, [0, 0], cands, 0.1).some((x) => x.cand.relation === "tangent"));
  // an offer that moves nothing by more than the distance shows, one that moves something farther does not
  const T: System = {
    points: [
      { id: "A", x: 4.7, y: 0 },
      { id: "C", x: 10, y: 0 },
    ],
    lines: [],
    circles: [{ id: "K1", c: "C", r: 5 }],
    constraints: [],
  } as unknown as System;
  const ask = (len: number) =>
    marksFor(T, ["A"], {
      now: 0,
      reach: 1,
      preview: () => [{ from: [0, 0] as [number, number], to: [len, 0] as [number, number], of: "A" }],
    }).some((x) => x.id.startsWith("near:on"));
  assert.equal(ask(0.8), true);
  assert.equal(ask(1.3), false);
});

test("[S24] zooming out adds no offers: the reach is never more than a tenth of the size of what is selected", () => {
  const T = {
    points: [
      { id: "A", x: 20, y: 40 },
      { id: "B", x: 40, y: 20 },
      { id: "C", x: 0, y: 0 },
    ],
    lines: [{ id: "L1", a: "A", b: "B" }],
    circles: [{ id: "K1", c: "C", r: 12.5 }],
    constraints: [],
  } as unknown as System;
  const count = (reach: number) =>
    marksFor(T, ["K1"], { now: 0, reach }).filter((m) => m.state === "offer" && m.id.startsWith("near:")).length;
  assert.equal(count(960), 0, "a huge reach (zoomed far out) finds nothing far away");
  assert.equal(count(960), count(12.5 * 0.1), "it is the same as the tenth of the size");
});

test("[S25] offers for one part are ranked by how little applying them moves, at most three show", () => {
  const pt = (id: string, x: number, y: number) => ({ id, x, y });
  const near = (S: System, sel: string[], cost: Record<string, number>) =>
    marksFor(S, sel, {
      now: 0,
      reach: 3,
      preview: (id) => {
        const key = Object.keys(cost).find((k) => id.includes(k));
        return [{ from: [0, 0] as [number, number], to: [key ? cost[key]! : 0.1, 0] as [number, number], of: "A" }];
      },
    })
      .filter((m) => m.state === "offer" && m.id.startsWith("near:"))
      .map((m) => m.id.replace(/^near:/, ""));
  const many = {
    points: [pt("A", 0, 0), pt("B", 20, 0.3), pt("C", 30, 0.5), pt("D", -20, 0.4), pt("E", 0.2, 20), pt("F", 0.3, -25)],
    lines: [],
    circles: [],
    constraints: [],
  } as unknown as System;
  const shown = near(many, ["A"], {
    "horizontal:A,B": 0.5,
    "horizontal:A,C": 0.9,
    "horizontal:A,D": 0.7,
    "vertical:A,E": 0.3,
    "vertical:A,F": 1.5,
  });
  assert.equal(shown.length, 3, "at most a few show");
  assert.deepEqual(shown.slice(0, 2), ["vertical:A,E", "horizontal:A,B"], "the least movement first");
  assert.equal(typeof rankNear, "function");
  // for another part only the cheapest of its alternatives is kept; a toss-up keeps both
  const alt = {
    points: [pt("A", 0, 0), pt("B", 0.2, 0.2)],
    lines: [],
    circles: [],
    constraints: [],
  } as unknown as System;
  const one = near(alt, ["A"], { "coincident:A,B": 9, "horizontal:A,B": 0.2, "vertical:A,B": 0.9 }),
    both = near(alt, ["A"], { "coincident:A,B": 9, "horizontal:A,B": 0.2, "vertical:A,B": 0.22 });
  assert.deepEqual(one, ["horizontal:A,B"]);
  assert.equal(both.length, 2, "near-equal ones are a toss-up");
});

test("[S25] when two parts touch, what follows from that (on, midpoint, level, upright) is not offered besides", () => {
  const pt = (id: string, x: number, y: number) => ({ id, x, y });
  const imp = {
    points: [pt("A", 0, 0.1), pt("B", 0.1, 0), pt("C", 10, 0)],
    lines: [{ id: "L1", a: "B", b: "C" }],
    circles: [],
    constraints: [],
  } as unknown as System;
  const sw = marksFor(imp, ["A"], {
    now: 0,
    reach: 3,
    preview: (id) => [
      {
        from: [0, 0] as [number, number],
        to: [id.includes("coincident") ? 0.3 : 0.05, 0] as [number, number],
        of: "A",
      },
    ],
  })
    .filter((m) => m.state === "offer" && m.id.startsWith("near:"))
    .map((m) => m.id.replace(/^near:/, ""));
  assert.ok(sw.some((x) => x.startsWith("coincident:A,B")));
  assert.ok(!sw.some((x) => x.startsWith("on:A,L1")));
  assert.ok(!sw.some((x) => /^(horizontal|vertical):A,B/.test(x)));
});

test("[S25] a pair picked together shows everything that fits", () => {
  const p = grow(
    grow(emptySketch(), (a, s) => addLine(a, s, at(a, s, 0, 0), at(a, s, 40, 0))),
    (a, s) => addCircle(a, s, at(a, s, 20, 5), [25, 5]),
  );
  const F = viewSystem(
    grow(p, (a, s) => addLine(a, s, at(a, s, 0, 40), at(a, s, 40, 45))),
    { points: {}, radii: {} } as never,
  );
  const offers = (sel: string[]) =>
    marksFor(F, sel, { now: 0 }).filter((m) => m.state === "offer" && m.kind === "constraint");
  assert.ok(
    offers(["L1", "K1"]).some((m) => m.id === "rel:tangent" && m.over?.join() === "L1,K1"),
    "a line and a circle far apart",
  );
  assert.ok(
    offers([F.points[0]!.id, "L2"]).some((m) => m.id === "rel:on"),
    "a point and a line",
  );
  assert.ok(
    !marksFor(F, ["L1"], { now: 0 }).some((m) => m.id === "rel:tangent" || m.id === "rel:on"),
    "a part alone only what is true of it",
  );
});

test("[S26] applying a constraint to two parts moves the first picked to the second, which stays", () => {
  const two = (): SketchParams => ({
    points: [P("A", 0, 0), P("B", 10, 3), P("C", 30, 30), P("D", 40, 30)],
    lines: [{ id: "L1", a: "C", b: "D" }],
    circles: [],
    arcs: [],
    constraints: [],
  });
  const run = (first: string, second: string, kind: "horizontal" | "coincident") => {
    const r = rig();
    // (the two points belong to figures; a line holds C and D, and A, B are ends of a second line)
    const p = { ...two(), lines: [...two().lines!, { id: "L2", a: "A", b: "B" }] };
    load(r, p);
    sel(r, first, second);
    assert.equal(r.sk.constrain(kind), true);
    return pos(r.def());
  };
  const ab = run("A", "B", "horizontal");
  assert.ok(Math.abs(ab.A![1] - 3) < 1e-6 && dist(ab.B!, [10, 3]) < 1e-6, "A goes level with B, which stays");
  const ba = run("B", "A", "horizontal");
  assert.ok(Math.abs(ba.B![1]) < 1e-6 && dist(ba.A!, [0, 0]) < 1e-6, "picked the other way, B goes and A stays");
  const co = run("A", "C", "coincident");
  assert.ok(dist(co.A!, co.C!) < 1e-6 && dist(co.C!, [30, 30]) < 1e-6, "A goes to C, which stays");
  assert.ok(dist(co.B!, [10, 3]) < 1e-6, "the far end of A's line does not move");
  // a line and a circle: the line moves to touch, the circle stays
  const r = rig();
  const q = grow(
    grow(emptySketch(), (a, s) => addLine(a, s, at(a, s, 0, 0), at(a, s, 40, 0))),
    (a, s) => addCircle(a, s, at(a, s, 20, 9), [25, 9]),
  );
  load(r, q);
  sel(r, "L1", "K1");
  assert.equal(r.sk.constrain("tangent"), true);
  const s = pos(r.def());
  assert.ok(dist(s.P3!, [20, 9]) < 1e-6, "the circle stays");
  assert.ok(Math.abs(r.def().circles![0]!.r - 5) < 1e-6);
});

test("[S27] a line on its own is offered the nearer of level or upright, once; two points are offered level or upright between them", () => {
  const line = (dx: number, dy: number): System =>
    ({
      points: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: dx, y: dy },
      ],
      lines: [{ id: "L1", a: "A", b: "B" }],
      circles: [],
      constraints: [],
    }) as unknown as System;
  const offers = (S: System) =>
    marksFor(S, ["L1"], { now: 0, reach: 0.7 })
      .filter((m) => m.state === "offer" && m.id !== "measure")
      .map((m) => m.id);
  assert.deepEqual(offers(line(40, 1)), ["rel:horizontal"]);
  assert.deepEqual(offers(line(40, 8)), ["rel:horizontal"]);
  assert.deepEqual(offers(line(10, 30)), ["rel:vertical"]);
  assert.deepEqual(offers(line(40, 0)), ["rel:horizontal"]);
  const pts = marksFor(line(40, 3), ["A", "B"], { now: 0 })
    .filter((m) => m.state === "offer" && m.kind === "constraint")
    .map((m) => m.id);
  assert.ok(pts.includes("rel:horizontal") && pts.includes("rel:vertical"), pts.join());
});

test("[S27] level and upright are separate tools with their own icons (the points' icon dashed), and the constraints group has a lock icon", () => {
  assert.equal(toolOf("rel:horizontal")?.only?.join(), "line");
  assert.equal(toolOf("rel:horizontal:points")?.only?.join(), "point,point");
  assert.equal(toolOf("rel:horizontal")?.icon, "horizontal");
  assert.equal(toolOf("rel:horizontal:points")?.icon, "horizontalPoints");
  assert.equal(toolOf("rel:vertical")?.icon, "vertical");
  assert.equal(toolOf("rel:vertical:points")?.icon, "verticalPoints");
  assert.equal(GROUPS.find((g) => g.id === "constraint")?.icon, "lock");
  assert.equal(iconOf("horizontal", ["P1", "P2"]), "horizontalPoints");
  assert.equal(iconOf("vertical", ["L1"]), "vertical");
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
});

test("[S28] the relations are the merged set, with no equal length or equal radius, and an old file's old names are read as these", () => {
  const names = Object.keys(RELATIONS);
  for (const k of [
    "on",
    "midpoint",
    "coincident",
    "horizontal",
    "vertical",
    "parallel",
    "perpendicular",
    "tangent",
    "fixed",
    "length",
    "radius",
    "distance",
    "horizontalDistance",
    "verticalDistance",
    "angle",
  ])
    assert.ok(names.includes(k), k);
  for (const k of [
    "equalLength",
    "equalRadius",
    "collinear",
    "concentric",
    "pointOnLine",
    "pointOnCircle",
    "tangentCircles",
  ])
    assert.ok(!names.includes(k), `${k} is not a relation any more`);
  const old = {
    points: [P("A", 0, 0), P("B", 4, 0), P("C", 6, 0.5), P("D", 9, -0.4), P("P", 0, 10), P("Q", 0.4, 10.3)],
    lines: [
      { id: "L1", a: "A", b: "B" },
      { id: "L2", a: "C", b: "D" },
    ],
    circles: [
      { id: "K1", c: "P", r: 3 },
      { id: "K2", c: "Q", r: 5 },
    ],
    constraints: [
      { id: "co", kind: "collinear", parts: ["L1", "L2"] },
      { id: "cc", kind: "concentric", parts: ["K1", "K2"] },
      { id: "a", kind: "pointOnLine", parts: ["C", "L1"] },
      { id: "b", kind: "pointOnCircle", parts: ["D", "K1"] },
      { id: "c", kind: "tangentCircles", parts: ["K1", "K2"], internal: true },
    ],
  } as unknown as SketchParams;
  const kinds = modernise(old).constraints!.map((c) => c.kind);
  assert.ok(
    kinds.every((k) => names.includes(k)),
    kinds.join(),
  );
  assert.ok(kinds.includes("coincident") && kinds.includes("on") && kinds.includes("tangent"));
  const eq = modernise({
    ...old,
    constraints: [
      { id: "e", kind: "equalRadius", parts: ["K1", "K2"] },
      { id: "f", kind: "equalLength", parts: ["L1", "L2"] },
    ],
  } as unknown as SketchParams).constraints!.map((c) => c.kind);
  assert.ok(eq.every((k) => names.includes(k)) && eq.includes("radius") && eq.includes("length"));
});

// ---------------------------------------------------------------- what the first tests left out (`in_1683`)
test("[S2] two clicks at free places make one segment and end the chain: it goes on only from a point already there", () => {
  const r = rig();
  r.sk.start("line");
  r.click(0, 0);
  r.click(10, 0);
  assert.equal(r.def().lines!.length, 1);
  assert.equal(r.sk.drawStep(), 0, "the chain is over");
  r.click(30, 30);
  assert.equal(r.def().lines!.length, 1, "a click at a free place starts a new figure, it makes no second segment");
});

test("[S13] the drop of a dragged point makes no constraint: it is placed, hints only place", () => {
  const r = rig();
  load(r, free());
  r.grab(10, 0);
  r.move(15, 10);
  r.move(20.1, 20.1);
  r.sk.grabEnd();
  assert.deepEqual(r.def().constraints, [], "no coincident");
  load(r, free());
  r.grab(10, 0);
  r.move(25, 20.1);
  r.sk.grabEnd();
  assert.deepEqual(r.def().constraints, [], "no on");
});

test("[S23] a length or distance of nothing is no number to offer: two points in one place show no measured number", () => {
  const p: SketchParams = {
    points: [P("A", 5, 5), P("B", 5, 5)],
    lines: [],
    circles: [],
    arcs: [],
    constraints: [],
  };
  const S = viewSystem(p, sol(p));
  const m = marksFor(S, ["A", "B"], { now: 0 });
  assert.equal(
    m.filter((x) => x.kind === "dimension").length,
    0,
    `no number: ${m.map((x) => x.id + ":" + (x.value ?? "")).join()}`,
  );
  const q: SketchParams = { ...p, points: [P("A", 5, 5), P("B", 15, 5)] };
  assert.ok(
    marksFor(viewSystem(q, sol(q)), ["A", "B"], { now: 0 }).some((x) => x.kind === "dimension"),
    "while a real distance is offered as a number",
  );
});

test("[S28] the relations are exactly the merged set and nothing else", () => {
  assert.deepEqual(Object.keys(RELATIONS).sort(), [
    "angle",
    "coincident",
    "distance",
    "fixed",
    "horizontal",
    "horizontalDistance",
    "length",
    "midpoint",
    "on",
    "parallel",
    "perpendicular",
    "pointLineDistance",
    "radius",
    "symmetric",
    "tangent",
    "vertical",
    "verticalDistance",
  ]);
});

test("[S17 S32] the strokes' colours by meaning: blue for selected and for what an applied constraint is about, yellow for what is suggested (the dashed line too), neutral for the applied dashed line, red only for a refusal", async () => {
  const { STROKE } = await import("../src/interaction/style.ts");
  assert.equal(STROKE.selected.tone, "figure", "selected is blue");
  assert.equal(STROKE.lit.tone, "figure", "what an applied constraint is about is lit blue");
  assert.equal(STROKE.litOffer.tone, "ties", "what an offer is about is yellow");
  assert.equal(STROKE.dashOffer.tone, "ties", "a suggested dashed line is yellow");
  assert.equal(STROKE.dash.tone, "note", "an applied or measured dashed line is neutral");
  assert.ok(STROKE.dash.dashed && STROKE.dashOffer.dashed, "the two dashed lines");
  const red = Object.entries(STROKE)
    .filter(([, v]) => v.tone === "refused")
    .map(([k]) => k);
  assert.deepEqual(red, ["cut"], "red is used for the part a trim would cut, and nothing else");
});
