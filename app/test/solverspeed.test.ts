// Moving a corner of a sketch of a hundred constraints is solved in a fraction of a second, not seconds (`in_248`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";

await kernel.init();

test("dragging a corner of the sketch of 135 constraints: each move is solved in well under a second, and the sketch still holds", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/laggy.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session };
  const s = run(r.value, { type: "removeStep", id: "s_137" });
  const sc = scene(s);
  assert.equal(sc.relations.length, 135);
  const corners = Object.values(sc.parts).filter((q) => q.kind === "corner" && q.origin === "drawn" && !q.derived && q.movable) as unknown as { ref: string; at: [number, number, number] }[];
  const times: number[] = [];
  for (const k of [0, 7, 14, 21]) {
    const c = corners[k]!;
    const t = performance.now();
    const n = run(s, { type: "movePart", ref: c.ref as never, to: [c.at[0] + 1.5, c.at[1] + 1, c.at[2]] });
    times.push(performance.now() - t);
    assert.equal(n.message, null);
    assert.ok(n.outcome.solve.planes.every((p) => p.status === "ok"), "it still solves");
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  assert.ok(avg < 800, `${avg.toFixed(0)} ms a move (it was 1400 to 2800 ms)`);
});
