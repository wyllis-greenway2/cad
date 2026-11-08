import test from "node:test";
import assert from "node:assert/strict";
import type { Intent, RawInput, Mods, Device } from "../src/shared/input.ts";
import { createRecognizer } from "../src/interaction/recognizer.ts";
import { keyAction } from "../src/interaction/keymap.ts";
import { settings } from "../src/shared/settings.ts";

const none: Mods = { shift: false, ctrl: false, alt: false };
const m = (o: Partial<Mods> = {}): Mods => ({ ...none, ...o });
let clock = 0;
const ev = (kind: "down" | "move" | "up" | "cancel", x: number, y: number, o: { id?: number; device?: Device; button?: number; mods?: Mods; dt?: number } = {}): RawInput => ({
  kind, id: o.id ?? 1, device: o.device ?? "mouse", x, y, button: o.button ?? 0, mods: o.mods ?? none, t: (clock += o.dt ?? 20),
});
const run = (r: ReturnType<typeof createRecognizer>, evs: RawInput[]): Intent[] => evs.flatMap((e) => r.feed(e));
const types = (is: Intent[]) => is.map((i) => i.type);

test("mouse: a click is a click; moving a little still is; hover when nothing is down", () => {
  const r = createRecognizer();
  assert.deepEqual(run(r, [ev("move", 5, 5)]), [{ type: "hover", x: 5, y: 5 }]);
  assert.deepEqual(run(r, [ev("down", 10, 10), ev("move", 12, 11), ev("up", 12, 11)]), [{ type: "click", x: 12, y: 11, count: 1, shift: false }]);
});

test("mouse: double and triple click are counted by time and place; far apart or slow starts again", () => {
  const r = createRecognizer();
  const click = (x: number, dt: number) => run(r, [ev("down", x, 10, { dt }), ev("up", x, 10, { dt: 10 })]);
  assert.equal((click(10, 20)[0] as { count: number }).count, 1);
  assert.equal((click(11, 100)[0] as { count: number }).count, 2);
  assert.equal((click(10, 100)[0] as { count: number }).count, 3);
  assert.equal((click(10, 2000)[0] as { count: number }).count, 1, "too slow");
  assert.equal((click(60, 100)[0] as { count: number }).count, 1, "too far");
});

test("mouse: dragging on empty space orbits; right-drag orbits; Alt + left-drag orbits; the deltas add up", () => {
  for (const [button, mods] of [[0, none], [2, none], [0, m({ alt: true })]] as const) {
    const r = createRecognizer();
    const out = run(r, [ev("down", 100, 100, { button, mods }), ev("move", 110, 100, { button }), ev("move", 130, 90, { button }), ev("up", 130, 90, { button })]);
    assert.deepEqual(types(out), ["orbit", "orbit", "dragEnd"]);
    assert.deepEqual(out.filter((o) => o.type === "orbit").map((o) => (o as { dx: number }).dx), [10, 20]);
  }
});

test("mouse: a right-drag only turns the view (it is marked, so it never drags a handle or a corner); a left drag is not", () => {
  const right = run(createRecognizer(), [ev("down", 100, 100, { button: 2 }), ev("move", 120, 100, { button: 2 })]);
  assert.equal((right[0] as { view?: boolean }).view, true);
  const left = run(createRecognizer(), [ev("down", 100, 100), ev("move", 120, 100)]);
  assert.equal((left[0] as { view?: boolean }).view, undefined);
});

test("mouse: the left button held still for a while is a hold (the cursor changes, a drag from there draws a rectangle, `in_235`); moving or letting up first, or another button, is not", () => {
  const tick = (t: number): RawInput => ({ kind: "tick", t });
  const down = (o: { button?: number } = {}) => { const e = ev("down", 100, 100, o); return { e, t0: (e as { t: number }).t }; };
  const H = settings.input.boxHoldMs;
  const held = createRecognizer();
  const d = down();
  const out = run(held, [d.e, tick(d.t0 + 200), tick(d.t0 + H + 10), tick(d.t0 + H + 50)]);
  assert.deepEqual(out, [{ type: "hold", x: 100, y: 100, shift: false }], "once");
  assert.deepEqual(types(run(held, [ev("move", 160, 100), ev("up", 160, 100)])), ["orbit", "dragEnd"], "what follows are the ordinary drag intents: the controller makes the rectangle of them");
  const d2 = down();
  const moved = run(createRecognizer(), [d2.e, ev("move", 140, 100), tick(d2.t0 + H + 10)]);
  assert.ok(!moved.some((o) => o.type === "hold"), "moved before the time: an orbit, not a hold");
  const d3 = down({ button: 2 });
  assert.ok(!run(createRecognizer(), [d3.e, tick(d3.t0 + H + 10)]).some((o) => o.type === "hold"), "the right button does not");
  const d4 = down();
  assert.ok(!run(createRecognizer(), [d4.e, ev("up", 100, 100, { dt: 100 }), tick(d4.t0 + H + 10)]).some((o) => o.type === "hold"), "let up in time: a click");
});

test("mouse: a press whose release never came ends that drag when the next press begins, and a cancel ends a drag", () => {
  const r = createRecognizer();
  const out = run(r, [ev("down", 100, 100, { button: 2 }), ev("move", 120, 100, { button: 2 }), ev("down", 50, 50)]);
  assert.deepEqual(types(out), ["orbit", "dragEnd"]);
  const r2 = createRecognizer();
  assert.deepEqual(types(run(r2, [ev("down", 100, 100, { button: 2 }), ev("move", 120, 100, { button: 2 }), ev("cancel", 120, 100)])), ["orbit", "dragEnd"]);
});

test("mouse: right click is the menu; middle-drag, Shift + right-drag, Alt + Shift + left-drag and Space + drag pan", () => {
  const r = createRecognizer();
  assert.deepEqual(run(r, [ev("down", 50, 60, { button: 2 }), ev("up", 50, 60, { button: 2 })]), [{ type: "menu", x: 50, y: 60 }]);
  for (const [button, mods] of [[1, none], [2, m({ shift: true })], [0, m({ alt: true, shift: true })]] as const) {
    const out = run(createRecognizer(), [ev("down", 0, 0, { button, mods }), ev("move", 20, 0, { button })]);
    assert.deepEqual(types(out), ["pan"]);
  }
  const s = createRecognizer();
  run(s, [{ kind: "key", key: " ", down: true, mods: none, t: 1 }]);
  assert.deepEqual(types(run(s, [ev("down", 0, 0), ev("move", 20, 0)])), ["pan"]);
});

test("a drag is never also a click, and a cancel gives nothing", () => {
  const r = createRecognizer();
  assert.deepEqual(types(run(r, [ev("down", 0, 0), ev("move", 30, 0), ev("up", 30, 0)])), ["orbit", "dragEnd"]);
  assert.deepEqual(run(r, [ev("down", 0, 0), ev("cancel", 0, 0)]), []);
});

const wheel = (dx: number, dy: number, o: { unit?: 0 | 1 | 2; wheelDeltaY?: number | null; mods?: Mods; t?: number } = {}): RawInput => ({
  kind: "wheel", x: 300, y: 200, dx, dy, unit: o.unit ?? 0, wheelDeltaY: o.wheelDeltaY === undefined ? null : o.wheelDeltaY, mods: o.mods ?? none, t: o.t ?? (clock += 500),
});
test("scroll: a wheel notch zooms, a trackpad's fine scroll pans like a phone, a pinch (ctrl) zooms, Shift + scroll pans", () => {
  const r = createRecognizer();
  assert.deepEqual(types(r.feed(wheel(0, 100, { wheelDeltaY: -120 }))), ["zoom"]);
  assert.deepEqual(r.feed(wheel(3, 7)), [{ type: "pan", dx: -3, dy: -7 }]);
  assert.deepEqual(types(r.feed(wheel(0, 4, { mods: m({ ctrl: true }) }))), ["zoom"]);
  assert.deepEqual(types(r.feed(wheel(0, 100, { wheelDeltaY: -120, mods: m({ shift: true }) }))), ["pan"]);
  assert.deepEqual(types(r.feed(wheel(0, 3, { unit: 1 }))), ["zoom"], "counted in lines: a wheel");
});

test("scroll: a trackpad gesture keeps its kind while its events (inertia) keep coming, even if one looks like a notch", () => {
  const r = createRecognizer();
  assert.equal(r.feed(wheel(2, 6, { t: 10000 }))[0]!.type, "pan");
  assert.equal(r.feed(wheel(0, 100, { t: 10050, wheelDeltaY: -120 }))[0]!.type, "pan");
  assert.equal(r.feed(wheel(0, 100, { t: 11000, wheelDeltaY: -120 }))[0]!.type, "zoom", "a new gesture is judged again");
});

test("scroll: the mode can be forced, and zoom speed is limited", () => {
  const r = createRecognizer();
  r.setScrollMode("pan");
  assert.equal(r.feed(wheel(0, 100, { wheelDeltaY: -120 }))[0]!.type, "pan");
  r.setScrollMode("zoom");
  assert.equal(r.feed(wheel(5, 5))[0]!.type, "zoom");
  const z = r.feed({ ...(wheel(0, 100000, { wheelDeltaY: -120, t: 50000 }) as Extract<RawInput, { kind: "wheel" }>) })[0] as { factor: number };
  assert.ok(z.factor <= Math.exp(Math.log(settings.input.maxZoomFactorPerSecond) * 0.12) + 1e-9, "a flick cannot fling the view");
});

test("Safari pinch gestures zoom by the change of scale", () => {
  const r = createRecognizer();
  r.feed({ kind: "gesture", phase: "start", scale: 1, x: 0, y: 0, t: 1 });
  const z = r.feed({ kind: "gesture", phase: "change", scale: 2, x: 5, y: 5, t: 2 })[0] as { factor: number };
  assert.equal(z.factor, 0.5);
});

test("finger: a tap is a click; taps in a row count; a drag orbits; a long press is the menu and then lifting does nothing", () => {
  const r = createRecognizer();
  const tap = (x: number, dt: number) => run(r, [ev("down", x, 10, { device: "touch", dt }), ev("up", x, 10, { device: "touch", dt: 30 })]);
  assert.equal((tap(10, 20)[0] as { count: number }).count, 1);
  assert.equal((tap(25, 200)[0] as { count: number }).count, 2, "a finger is less exact: 28 px counts as the same place");
  const d = run(createRecognizer(), [ev("down", 0, 0, { device: "touch" }), ev("move", 5, 0, { device: "touch" }), ev("move", 40, 0, { device: "touch" }), ev("up", 40, 0, { device: "touch" })]);
  assert.deepEqual(types(d), ["orbit", "dragEnd"]);
  assert.equal((d[0] as { dx: number }).dx, 40 - 0, "the first move past the slop carries the whole distance so far");
  const lp = createRecognizer();
  const out: Intent[] = [];
  out.push(...lp.feed(ev("down", 50, 50, { device: "touch", dt: 0 })));
  out.push(...lp.feed({ kind: "tick", t: clock + 100 }));
  out.push(...lp.feed({ kind: "tick", t: clock + settings.input.longPressMs + 10 }));
  out.push(...lp.feed(ev("up", 50, 50, { device: "touch", dt: 1000 })));
  assert.deepEqual(out, [{ type: "menu", x: 50, y: 50 }]);
});

test("finger: two fingers pan together and pinch to zoom; lifting one does not start an orbit or a click", () => {
  const r = createRecognizer();
  run(r, [ev("down", 100, 100, { id: 1, device: "touch" }), ev("down", 200, 100, { id: 2, device: "touch" })]);
  const drag = run(r, [ev("move", 110, 120, { id: 1, device: "touch" }), ev("move", 210, 120, { id: 2, device: "touch" })]);
  assert.ok(drag.some((i) => i.type === "pan"));
  const pinch = run(r, [ev("move", 90, 120, { id: 1, device: "touch" })]);
  const z = pinch.find((i) => i.type === "zoom") as { factor: number } | undefined;
  assert.ok(z && z.factor < 1, "fingers moving apart zoom in");
  const rest = run(r, [ev("up", 90, 120, { id: 1, device: "touch" }), ev("move", 220, 140, { id: 2, device: "touch" }), ev("up", 220, 140, { id: 2, device: "touch" })]);
  assert.deepEqual(rest, []);
});

test("pen: behaves like the mouse (hover, barrel button = menu)", () => {
  const r = createRecognizer();
  assert.deepEqual(types(run(r, [ev("move", 1, 1, { device: "pen" })])), ["hover"]);
  assert.deepEqual(types(run(r, [ev("down", 5, 5, { device: "pen", button: 2 }), ev("up", 5, 5, { device: "pen", button: 2 })])), ["menu"]);
});

test("keys: the keymap turns presses into intents; Ctrl+Z undoes, Ctrl+Shift+Z redoes; a plain z does not undo", () => {
  const r = createRecognizer();
  const key = (k: string, mods: Mods = none): RawInput => ({ kind: "key", key: k, down: true, mods, t: 1 });
  assert.deepEqual(r.feed(key("z", m({ ctrl: true }))), [{ type: "undo" }]);
  assert.deepEqual(r.feed(key("Z", m({ ctrl: true, shift: true }))), [{ type: "redo" }]);
  assert.deepEqual(r.feed(key("z")), [], "letter keys are not assigned for now (in_131)");
  assert.deepEqual(r.feed(key("n")), []);
  assert.deepEqual(r.feed(key("Escape")), [{ type: "escape" }]);
  assert.deepEqual(r.feed(key("Delete")), [{ type: "delete" }]);
  assert.equal(keyAction("q", none, settings.input.keys), null);
});

test("while a drawing tool is armed a click may wander further before it counts as turning the view (the first point of a shape is not lost)", () => {
  const r = createRecognizer();
  const wander = () => run(r, [ev("down", 100, 100, { dt: 1000 }), ev("move", 108, 106), ev("up", 108, 106)]); // 10 px away
  assert.ok(types(wander()).includes("orbit"), "normally that is a turn of the view");
  r.setDrawing(true);
  assert.deepEqual(wander(), [{ type: "click", x: 108, y: 106, count: 1, shift: false }], "with a tool armed it is a click");
  assert.ok(types(run(r, [ev("down", 100, 100, { dt: 1000 }), ev("move", 140, 130), ev("up", 140, 130)])).includes("orbit"), "a real drag still turns the view");
  r.setDrawing(false);
  assert.ok(types(wander()).includes("orbit"));
});

test("finger while drawing: the cursor has a handle; dragging it moves the cursor like a hover; a tap on it sets the point; a tap elsewhere only moves the cursor; with no cursor a tap is a click", () => {
  const T = (kind: "down" | "move" | "up", x: number, y: number, id = 1) => ev(kind, x, y, { device: "touch", id });
  const r = createRecognizer();
  assert.deepEqual(types(run(r, [T("down", 300, 300), T("up", 300, 300)])), ["click"], "no cursor yet: the first tap is a click");
  r.setTouchCursor({ cursor: [200, 200], handle: [246, 246] });
  const drag = run(r, [T("down", 246, 246), T("move", 266, 256), T("move", 296, 276), T("up", 296, 276)]);
  assert.deepEqual(drag, [{ type: "hover", x: 220, y: 210 }, { type: "hover", x: 250, y: 230 }], "the cursor goes the way the finger goes");
  assert.deepEqual(run(r, [T("down", 248, 244), T("up", 248, 244)]), [{ type: "click", x: 200, y: 200, count: 1, shift: false }], "a tap on the handle sets the point where the cursor is");
  assert.deepEqual(run(r, [T("down", 400, 100), T("up", 400, 100)]), [{ type: "hover", x: 400, y: 100 }], "a tap elsewhere moves the cursor there");
  assert.deepEqual(types(run(r, [T("down", 400, 100), T("move", 440, 120), T("up", 440, 120)])), ["orbit", "dragEnd"], "a drag elsewhere still turns the view");
  r.setTouchCursor(null);
  assert.deepEqual(types(run(r, [T("down", 400, 100), T("up", 400, 100)])), ["click"]);
});
