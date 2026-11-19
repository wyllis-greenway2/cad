// Opening a project derives the scene now and then, not after every command (`in_994`): what comes out must be what the slow way gives, for every scene that can be gone back to.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, createSession, run, scene, saveText } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { replay, replayEachStep, sceneAt } from "../src/operation/history.ts";
import { fromText } from "../src/operation/file.ts";
import { drawRectangle } from "../src/operation/build.ts";
import { loopFaceRef } from "../src/operation/loops.ts";
import { startOp } from "../src/interaction/operations.ts";
import type { Op } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import { worldRef } from "../src/shared/ref.ts";
import type { Scene } from "../src/operation/scene.ts";

await kernel.init();
/** what a scene is, without the parts the kernel's answer made (which the two ways ask for at their own times) */
const key = (sc: Scene): string => JSON.stringify([Object.values(sc.parts).filter((p) => p.origin !== "body").map((p) => p.ref).sort(), sc.steps, sc.relations, sc.counter, sc.gears, sc.patterns, sc.groups]);

function agree(name: string, text: string, every: number): void {
  const opened = openSession(kernel, text);
  if (!opened.ok) return;
  const h = opened.value.history;
  const fast = replay(h.base, h.commands, h.commands.length, h.derive, every);
  const slow = replayEachStep(h.base, h.commands, h.commands.length, h.derive);
  assert.ok(fast.ok && slow.ok, name);
  if (!fast.ok || !slow.ok) return;
  assert.equal(key(fast.value.scene), key(slow.value.scene), `${name}: the final scene`);
  assert.equal(fast.value.snapshots.length, slow.value.snapshots.length, name);
  for (let i = 0; i <= h.commands.length; i += Math.max(1, Math.floor(h.commands.length / 7))) assert.equal(key(sceneAt(fast.value, i)), key(sceneAt(slow.value, i)), `${name}: the scene after ${i} commands`);
}

test("every fixture opens to the same scenes derived now and then (every 3 commands) as derived after every command", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".cad.json"))) { agree(f, readFileSync(new URL(f, dir), "utf8"), 3); n++; }
  assert.ok(n > 50, `${n} fixtures`);
});

test("a long history of separate parts opens to the same scene, and a command that needs a derived part takes the slow way and is not refused", () => {
  let s: Session = createSession(kernel);
  for (let i = 0; i < 40; i++) {
    const r = drawRectangle(scene(s), worldRef("XY"), [(i % 8) * 12, Math.floor(i / 8) * 12, 0], [(i % 8) * 12 + 8, Math.floor(i / 8) * 12 + 8, 0], [1, 0, 0], [0, 1, 0]);
    const s2 = run(s, r.command);
    s = runOp(s2, { ...(startOp(scene(s2), [loopFaceRef(r.lines) as never], "extrude") as { op: Op }).op, value: 4 + (i % 5) })!.session;
  }
  const text = saveText(s);
  agree("forty boxes", text, 7);
  agree("forty boxes, every 64", text, 64);
  const h = fromText(text, s.history.derive);
  assert.ok(h.ok && h.value.commands.length === s.history.commands.length);
});
