// Game mode (`in_300`, `in_302`): W A S D turn it on and it stays on until a mouse click; the keys move the view and the pointer, with no key held, turns it about the eye; both are smoothed over the ticks.
import test from "node:test";
import assert from "node:assert/strict";
import { createRecognizer } from "../src/interaction/recognizer.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import { createSession } from "../src/interaction/session.ts";
import { kernel } from "../src/compiler/kernel/index.ts";
import { basis, position, homeCamera } from "../src/interaction/camera.ts";
import type { RawInput, Intent } from "../src/shared/input.ts";

await kernel.init();
const env = { w: 800, h: 600, now: 0 };
const mods = { shift: false, ctrl: false, alt: false };
const key = (k: string, down: boolean, t: number): RawInput => ({ kind: "key", key: k, down, mods, t });
const move = (x: number, y: number, t: number): RawInput => ({ kind: "move", device: "mouse", id: 1, x, y, button: 0, mods, t } as unknown as RawInput);
const press = (kind: "down" | "up", t: number): RawInput => ({ kind, device: "mouse", id: 1, x: 100, y: 100, button: 0, mods, t } as unknown as RawInput);
const ticks = (from: number, n: number): RawInput[] => Array.from({ length: n }, (_, i) => ({ kind: "tick", t: from + (i + 1) * 16 }) as RawInput);
const run = (rec: ReturnType<typeof createRecognizer>, inputs: RawInput[]): Intent[] => inputs.flatMap((e) => rec.feed(e));
const apply = (intents: Intent[]) => intents.reduce((st, i) => reduce(st, i, env), { ...createState(createSession(kernel)), cam: homeCamera() });
const walks = (is: Intent[]) => is.filter((i): i is Extract<Intent, { type: "walk" }> => i.type === "walk");
const swivels = (is: Intent[]) => is.filter((i): i is Extract<Intent, { type: "swivel" }> => i.type === "swivel");

test("W moves the view forward and eases up to speed, then eases down after it is let go; D goes right (`in_300`, `in_302`)", () => {
  const rec = createRecognizer();
  const held = run(rec, [key("w", true, 0), ...ticks(0, 20)]);
  const f = walks(held).map((w) => w.forward);
  assert.ok(f.length > 10 && f[0]! < f[f.length - 1]! && f[0]! < 0.2, "it starts gently and gains speed");
  assert.ok(f[f.length - 1]! > 0.8, "and nearly reaches full speed in a third of a second");
  const after = run(rec, [key("w", false, 320), ...ticks(320, 30)]);
  const g = walks(after).map((w) => w.forward);
  assert.ok(g.length > 3 && g[0]! > g[g.length - 1]!, "it eases down rather than stopping dead");
  const st = apply(held);
  const c0 = homeCamera();
  const fw = basis(c0).forward;
  assert.ok([0, 1, 2].reduce((a, k) => a + (st.cam.target[k]! - c0.target[k]!) * fw[k]!, 0) > 1, "it went the way the view looks");
  const right = apply(run(createRecognizer(), [key("d", true, 0), ...ticks(0, 10)]));
  const r = basis(c0).right;
  assert.ok([0, 1, 2].reduce((a, k) => a + (right.cam.target[k]! - c0.target[k]!) * r[k]!, 0) > 0.3, "D goes to the right");
});

test("game mode stays on after the key is let go: the pointer goes on turning the view about the eye, smoothly, until a click (`in_302`)", () => {
  const rec = createRecognizer();
  run(rec, [move(100, 100, 0), key("w", true, 1), key("w", false, 2)]); // (a tap on W: game mode)
  const turned = run(rec, [move(180, 100, 3), ...ticks(3, 12)]);
  const sw = swivels(turned);
  assert.ok(sw.length > 4, "the movement is let out over several ticks, not at once");
  assert.ok(sw[0]!.dx > sw[sw.length - 1]!.dx, "most of it first, then less and less");
  assert.ok(Math.abs(sw.reduce((a, s) => a + s.dx, 0) - 80) < 5, "all of the pointer's movement comes out");
  const st = apply(sw);
  const c0 = homeCamera();
  const [e0, e1] = [position(c0), position(st.cam)];
  assert.ok(Math.hypot(e0[0] - e1[0], e0[1] - e1[1], e0[2] - e1[2]) < 1e-6, "the eye did not move");
  const [f0, f1] = [basis(c0), basis(st.cam)];
  assert.ok(f1.forward[0] * f0.right[0] + f1.forward[1] * f0.right[1] + f1.forward[2] * f0.right[2] > 0.05, "turned to the right");
  // a click ends it: the pointer only hovers again
  const out = run(rec, [press("down", 400), press("up", 410), move(200, 100, 420), move(260, 100, 430)]);
  assert.ok(out.some((i) => i.type === "hover"), "hover again");
  assert.equal(swivels(run(rec, [move(300, 100, 440), ...ticks(440, 5)])).length, 0, "no more turning");
});

test("with no key pressed the pointer only hovers", () => {
  const rec = createRecognizer();
  const intents = run(rec, [move(100, 100, 0), move(140, 100, 2), ...ticks(2, 5)]);
  assert.ok(intents.every((i) => i.type === "hover"));
});

test("Esc ends game mode", () => {
  const rec = createRecognizer();
  run(rec, [key("a", true, 0), key("a", false, 1), key("Escape", true, 2)]);
  assert.equal(swivels(run(rec, [move(100, 100, 3), move(160, 100, 4), ...ticks(4, 5)])).length, 0);
});
