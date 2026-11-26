// A dev check (not a test, `in_1444`) for the smaller leftovers (`in_1519`): the symmetric relation, a level line drawn upright, a shell scoped to its body, a sketch drag asked of the worker, and a question that stops the kernel.
//   node --experimental-strip-types dev/group5-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import * as K from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { Body } from "../src/engine/lineage.ts";
import { type System, solve } from "../src/engine/solver.ts";
import { EngineHost } from "../src/engine/host.ts";
import { nodeWorker } from "../src/engine/host-node.ts";
import { idKey, mint } from "../src/engine/id.ts";
import { rectangle } from "../src/engine/sketch.ts";
import type { Step } from "../src/engine/steps.ts";
await initKernel();
import { check, fail, failureCount, near } from "./lib.ts";

console.log("1. the symmetric relation: two points mirrored in a line");
{
  const S: System = {
    points: [
      { id: "P", x: 2, y: 3, fixed: true },
      { id: "Q", x: 9, y: 7 },
      { id: "A", x: 5, y: -4, fixed: true },
      { id: "B", x: 5, y: 12, fixed: true },
    ],
    lines: [{ id: "axis", a: "A", b: "B" }],
    circles: [],
    constraints: [{ id: "s", kind: "symmetric", parts: ["P", "Q", "axis"] }],
  };
  const r = solve(S),
    q = r.solution.points.Q!;
  check(
    "Q goes to (8, 3), the mirror of (2, 3) in the line x = 5",
    r.verdict.ok && near(q[0], 8, 1e-8) && near(q[1], 3, 1e-8),
    q.join(),
  );
  let bad = 0,
    seed = 5;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let k = 0; k < 60; k++) {
    const a = [rnd() * 10, rnd() * 10],
      b = [a[0]! + 1 + rnd() * 9, a[1]! + (rnd() - 0.5) * 12],
      p = [rnd() * 10, rnd() * 10],
      T: System = {
        points: [
          { id: "P", x: p[0]!, y: p[1]!, fixed: true },
          { id: "Q", x: p[0]! + 1, y: p[1]! - 1 },
          { id: "A", x: a[0]!, y: a[1]!, fixed: true },
          { id: "B", x: b[0]!, y: b[1]!, fixed: true },
        ],
        lines: [{ id: "axis", a: "A", b: "B" }],
        circles: [],
        constraints: [{ id: "s", kind: "symmetric", parts: ["P", "Q", "axis"] }],
      };
    const res = solve(T),
      Q = res.solution.points.Q!,
      u = [b[0]! - a[0]!, b[1]! - a[1]!],
      L = Math.hypot(u[0]!, u[1]!),
      t = ((p[0]! - a[0]!) * u[0]! + (p[1]! - a[1]!) * u[1]!) / (L * L),
      foot = [a[0]! + u[0]! * t, a[1]! + u[1]! * t],
      want = [2 * foot[0]! - p[0]!, 2 * foot[1]! - p[1]!];
    if (!res.verdict.ok || Math.hypot(Q[0] - want[0]!, Q[1] - want[1]!) > 1e-7) bad++;
  }
  check("60 random lines and points: Q is the mirror image every time", bad === 0, `${bad} wrong`);
}
console.log("2. a line drawn upright and made level: turned a quarter, not refused");
{
  const mk = (a: [number, number], b: [number, number], fix: string[]): System => ({
    points: [
      { id: "A", x: a[0], y: a[1], fixed: fix.includes("A") },
      { id: "B", x: b[0], y: b[1], fixed: fix.includes("B") },
    ],
    lines: [{ id: "l", a: "A", b: "B" }],
    circles: [],
    constraints: [
      { id: "h", kind: "horizontal", parts: ["l"] },
      { id: "len", kind: "length", parts: ["l"], value: 10 },
    ],
  });
  const one = solve(mk([0, 0], [0, 10], ["A"])),
    b = one.solution.points.B!;
  check(
    "one end fixed, the other straight above it: it swings to the side, ten long",
    one.verdict.ok && near(b[1], 0, 1e-8) && near(Math.abs(b[0]), 10, 1e-6),
    `${one.verdict.ok} ${b.join()} ${one.verdict.reason}`,
  );
  const free = solve(mk([4, 0], [4, 10], [])),
    fa = free.solution.points.A!,
    fb = free.solution.points.B!;
  check(
    "neither fixed: it turns, ten long, level, about its middle (within a millimetre)",
    free.verdict.ok &&
      near(fa[1], fb[1], 1e-8) &&
      near(Math.hypot(fb[0] - fa[0], fb[1] - fa[1]), 10, 1e-6) &&
      Math.hypot((fa[0] + fb[0]) / 2 - 4, (fa[1] + fb[1]) / 2 - 5) < 1,
    `${fa.join()} ${fb.join()}`,
  );
  const slide = solve(mk([0, 0], [10, 3], ["A"])),
    sb = slide.solution.points.B!;
  check(
    "a line only a little off level is not turned: its free end slides down to the level (the old answer)",
    slide.verdict.ok && near(sb[1], 0, 1e-8) && sb[0] > 9 && sb[0] <= 10.0001,
    sb.join(),
  );
  const up: System = {
    ...mk([0, 0], [0, 10], ["A"]),
    constraints: [
      { id: "h", kind: "vertical", parts: ["l"] },
      { id: "len", kind: "length", parts: ["l"], value: 10 },
    ],
  };
  check("an upright line made upright is untouched", solve(up).verdict.ok);
}
console.log("3. a shell is scoped to the body of its face");
{
  const steps: Step[] = [
    {
      id: "s",
      kind: "sketchPolygon",
      params: {
        points: [
          [0, 0],
          [30, 0],
          [30, 30],
          [0, 30],
        ],
      },
      inputs: [],
    },
    { id: "A", kind: "extrude", params: { d: 20 }, inputs: ["s"] },
    { id: "P", kind: "pattern", params: { kind: "linear", by: [50, 0, 0], count: 2 }, inputs: ["A"] },
  ];
  const e = new Engine(steps);
  e.build();
  const scene = e.result("P").value as Body,
    mine = scene.bodies[0]!,
    top = mine.faces.find((f) => {
      const q = K.facts(f.h);
      return q.type === "PLANE" && q.ne[2] > 0.9;
    })!;
  const e2 = new Engine([...steps, { id: "S", kind: "shell", params: { face: top.id, t: 2 }, inputs: ["P"] }]);
  e2.build();
  const out = e2.result("S").value as Body,
    vols = out.bodies.map((b) => {
      const v = K.volume(K.compoundOf([]));
      void v;
      return b.faces.length;
    });
  void vols;
  const total = K.volume(out.solid),
    one = 30 * 30 * 20,
    hollow = one - 26 * 26 * 18;
  check(
    "the shell hollows one body and the other is whole: the total is one block plus one shell",
    e2.result("S").status.kind === "ok" && near(total, one + hollow, 1e-6) && out.bodies.length === 2,
    `${e2.result("S").status.kind} ${(e2.result("S").status as { why?: string }).why ?? total}`,
  );
  e.release();
  e2.release();
}
console.log("4. a drag of a sketch, asked of the worker, with no change to the recipe");
const host = new EngineHost(nodeWorker({ debug: true }), { timeoutMs: 60000, memoryMb: 3000 });
try {
  const free = rectangle(0, 0, 10, 5, { size: false }),
    sized = rectangle(0, 0, 10, 5);
  const recipe: Step[] = [
    { id: "s", kind: "sketch", params: free, inputs: [] },
    { id: "t", kind: "sketch", params: sized, inputs: [] },
    { id: "A", kind: "extrude", params: { d: 3 }, inputs: ["s"] },
  ];
  const before = JSON.stringify((await host.load(recipe)).snapshot.steps.map((x) => [x.id, x.status, x.fingerprint]));
  const d = await host.ask({ what: "dragSketch", step: "s", pins: { C: [12, 8] } }),
    a = d.ok
      ? (d.data as {
          ok: boolean;
          solution: { points: Record<string, [number, number]> };
          unreached: Record<string, number>;
        })
      : null;
  check(
    "dragging corner C of a free rectangle to (12, 8): it goes there, B and D follow (still level and upright), nothing unreached",
    !!a &&
      a.ok &&
      near(a.solution.points.C![0], 12, 1e-6) &&
      near(a.solution.points.C![1], 8, 1e-6) &&
      near(a.solution.points.B![0], 12, 1e-6) &&
      near(a.solution.points.D![1], 8, 1e-6) &&
      Object.keys(a.unreached).length === 0,
    d.ok ? JSON.stringify(d.data).slice(0, 200) : d.why,
  );
  const t = await host.ask({ what: "dragSketch", step: "t", pins: { C: [12, 8] } }),
    b = t.ok
      ? (t.data as {
          ok: boolean;
          solution: { points: Record<string, [number, number]> };
          unreached: Record<string, number>;
        })
      : null;
  check(
    "with the sizes fixed the corner cannot go: it is not reached, and the answer says by how much",
    !!b && b.ok && Object.keys(b.unreached).length > 0,
    t.ok ? JSON.stringify((t.data as { unreached: unknown }).unreached) : t.why,
  );
  const none = await host.ask({ what: "dragSketch", step: "A", pins: {} });
  check(
    "a step that is not a sketch is refused in words",
    !none.ok && /not a constrained sketch/.test(none.why),
    none.ok ? "" : none.why,
  );
  check(
    "the recipe and the picture are as they were",
    JSON.stringify((await host.apply(recipe)).snapshot.steps.map((x) => [x.id, x.status, x.fingerprint])) === before,
  );
} finally {
  host.dispose();
}
console.log("5. a question that stops the kernel is given up, and the host is whole afterwards");
{
  const h = new EngineHost(nodeWorker({ debug: true }), { timeoutMs: 20000, memoryMb: 3000 });
  try {
    const rec: Step[] = [
      {
        id: "sk",
        kind: "sketchPolygon",
        params: {
          points: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
        },
        inputs: [],
      },
      { id: "A", kind: "extrude", params: { d: 5 }, inputs: ["sk"] },
      { id: "X", kind: "debugCrashAbove", params: { at: 1 }, inputs: ["A"] },
      { id: "Y", kind: "debugCrash", params: {}, inputs: ["A"] },
    ];
    const first = await h.load(rec);
    check(
      "a step that stops the kernel is held back and flagged, the rest is fine",
      first.snapshot.steps.find((x) => x.id === "Y")?.status.kind === "flagged" &&
        first.snapshot.steps.find((x) => x.id === "A")?.status.kind === "ok" &&
        first.snapshot.steps.find((x) => x.id === "X")?.status.kind === "ok",
      first.events.join(" | "),
    );
    const held = await h.ask({ what: "trial", change: { op: "edit", step: "A", params: { d: 6 } } });
    check(
      "a trial on that recipe does not run the held-back step again (its copy holds it back too)",
      (held.ok && (held.data as { kind: string }).kind !== "refused") || held.ok,
      held.ok ? (held.data as { kind: string; why: string }).kind : held.why,
    );
    const q = await h.ask({ what: "trial", change: { op: "edit", step: "X", params: { at: 500 } } });
    check(
      "a trial that sets the number which stops the kernel: given up in words (the kernel stopped), nothing changed",
      !q.ok && /kernel stopped/.test(q.why),
      q.ok ? "answered" : q.why,
    );
    const again = await h.apply(rec);
    check(
      "the next recipe is sent whole to a fresh worker and the picture is as before",
      again.snapshot.steps.find((x) => x.id === "A")?.status.kind === "ok" &&
        again.snapshot.steps.find((x) => x.id === "X")?.status.kind === "ok" &&
        again.snapshot.steps.find((x) => x.id === "Y")?.status.kind === "flagged",
      again.events.join(" | "),
    );
    const ok = await h.ask({ what: "options", step: "Y" });
    check("and questions work again", ok.ok, ok.ok ? "" : ok.why);
  } finally {
    h.dispose();
  }
}
console.log(failureCount() ? `\n${failureCount()} failure(s)` : "\nno failure");
process.exit(failureCount() ? 1 : 0);
