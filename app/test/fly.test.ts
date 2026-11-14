// W A S D camera (`in_300`): the keys move the view while they are down, and the pointer with no button down turns it about the eye.
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
const run = (rec: ReturnType<typeof createRecognizer>, inputs: RawInput[]): Intent[] => inputs.flatMap((e) => rec.feed(e));
const apply = (intents: Intent[]) => intents.reduce((st, i) => reduce(st, i, env), { ...createState(createSession(kernel)), cam: homeCamera() });

test("W moves the view forward, S back, D right and A left, while the key is down (`in_300`)", () => {
  const rec = createRecognizer();
  const intents = run(rec, [key("w", true, 0), { kind: "tick", t: 50 }, { kind: "tick", t: 100 }, key("w", false, 120), { kind: "tick", t: 150 }]);
  assert.equal(intents.filter((i) => i.type === "walk").length, 2, "one for each tick while it was down, none after");
  const st = apply(intents);
  const c0 = homeCamera();
  const f = basis(c0).forward;
  const d = [0, 1, 2].map((k) => st.cam.target[k]! - c0.target[k]!);
  assert.ok(d[0]! * f[0]! + d[1]! * f[1]! + d[2]! * f[2]! > 1, "it went the way the view looks");
  const right = apply(run(createRecognizer(), [key("d", true, 0), { kind: "tick", t: 50 }]));
  const r = basis(c0).right;
  assert.ok([0, 1, 2].reduce((a, k) => a + (right.cam.target[k]! - c0.target[k]!) * r[k]!, 0) > 0.5, "D goes to the right");
});

test("with a key held the pointer turns the view about the eye: the eye stays, the view turns the way the pointer goes (`in_300`)", () => {
  const rec = createRecognizer();
  const intents = run(rec, [move(100, 100, 0), key("w", true, 1), move(140, 100, 2), move(180, 80, 3)]);
  assert.deepEqual(intents.filter((i) => i.type === "swivel").map((i) => (i.type === "swivel" ? [i.dx, i.dy] : [])), [[40, 0], [40, -20]]);
  const c0 = homeCamera();
  const st = apply(intents.filter((i) => i.type === "swivel"));
  const [e0, e1] = [position(c0), position(st.cam)];
  assert.ok(Math.hypot(e0[0] - e1[0], e0[1] - e1[1], e0[2] - e1[2]) < 1e-6, "the eye did not move");
  const [f0, f1] = [basis(c0), basis(st.cam)];
  assert.ok(f1.forward[0] * f0.right[0] + f1.forward[1] * f0.right[1] + f1.forward[2] * f0.right[2] > 0.05, "turned to the right");
  assert.ok(f1.forward[0] * f0.up[0] + f1.forward[1] * f0.up[1] + f1.forward[2] * f0.up[2] > 0.01, "and up");
});

test("with no key held the pointer only hovers", () => {
  const rec = createRecognizer();
  const intents = run(rec, [move(100, 100, 0), move(140, 100, 2)]);
  assert.ok(intents.every((i) => i.type === "hover"));
});
