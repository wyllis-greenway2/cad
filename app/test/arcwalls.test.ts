// Two arcs of one circle in an extruded outline (the tips of a gear's teeth) each have a push / pull arrow, and pushing one changes only that arc (`in_257`: the curved faces of a gear tooth had no arrow
// because the circle and its radius matched more than one arc, so the wall could not be told from the other).
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Command } from "../src/operation/commands.ts";
import type { Part } from "../src/operation/part.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";

await kernel.init();
const pt = (r: number, deg: number): [number, number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180), 0];

function twoTips(): Session {
  let s = createSession(kernel);
  const cmds: Command[] = [];
  const corner = (ref: string, at: [number, number, number]) => cmds.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref, kind: "corner", at } } as unknown as Command);
  const line = (ref: string, a: string, b: string, center?: string) => cmds.push({ type: "addPart", part: { origin: "drawn", plane: "w/XY", movable: true, ref, kind: "line", a, b, ...(center ? { center, ccw: true } : {}) } } as unknown as Command);
  corner("d/o", [0, 0, 0]);
  corner("d/a1", pt(20, 10)); corner("d/a2", pt(20, 40)); corner("d/b1", pt(20, 100)); corner("d/b2", pt(20, 130));
  line("d/arc1", "d/a1", "d/a2", "d/o"); line("d/l1", "d/a2", "d/b1"); line("d/arc2", "d/b1", "d/b2", "d/o"); line("d/l2", "d/b2", "d/o"); line("d/l3", "d/o", "d/a1");
  s = run(s, { type: "batch", commands: cmds });
  const face = Object.values(scene(s).parts).find((p) => p.kind === "face")!;
  const st = startOp(scene(s), [face.ref], "extrude");
  assert.ok(st.ok);
  if (!st.ok) throw new Error("no extrude");
  return run(s, opCommand(scene(s), { ...st.op, value: 6 })!);
}
const walls = (s: Session) => Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "plane" }> => p.kind === "plane" && p.origin === "body" && !!(p.curved || p.rounded));

test("each tip arc of a circle shared by two arcs has its arrow, and pushing one changes only its radius", () => {
  let s = twoTips();
  assert.equal(walls(s).length, 2);
  for (const w of walls(s)) assert.ok(startOp(scene(s), [w.ref], "pushpull").ok, `${w.ref}: no arrow`);
  const first = walls(s).find((w) => w.mesh!.some((v, i) => i % 3 === 1 && v > 0 && v < 13) )!;
  const st = startOp(scene(s), [first.ref], "pushpull");
  assert.ok(st.ok);
  if (!st.ok) return;
  s = run(s, opCommand(scene(s), { ...st.op, value: 2 })!);
  const radii = (["d/arc1", "d/arc2"] as const).map((r) => { const l = scene(s).parts[r]; if (l?.kind !== "line") return NaN; const a = scene(s).parts[l.a]; return a?.kind === "corner" ? Math.hypot(a.at[0], a.at[1]) : NaN; });
  assert.ok(Math.abs(radii[0]! - 22) < 1e-3 && Math.abs(radii[1]! - 20) < 1e-3, `radii ${radii}`);
});
