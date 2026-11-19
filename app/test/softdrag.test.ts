// A circle between two tangent lines with its size free (`in_1042`): its centre can only be on the line half way between them, so a pointer that is off that line cannot be matched exactly. The drag settles on the nearest
// place the constraints allow (a firm pin, `drag_soft`) instead of refusing, and the circle's size follows.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Command } from "../src/operation/commands.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/circle-tangent-drag.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
const pin = (rel: string, to: [number, number, number]): Command => ({ type: "batch", commands: [{ type: "addRelation", relation: { id: rel, kind: "fixed", parts: ["d/e_050.c" as Ref] } }, { type: "movePart", ref: "d/e_050.c" as Ref, to }] });
const at = (s: Session) => (scene(s).parts["d/e_050.c" as Ref] as unknown as { at: number[] }).at as [number, number, number];
const radius = (s: Session) => (scene(s).parts["d/e_050.k" as Ref] as unknown as { radius: number }).radius;

test("a hard pin off the line of centres is refused or undone, a firm pin slides the centre along it and the circle changes size", () => {
  const s = open();
  const [x, y, z] = at(s);
  const r0 = radius(s);
  const hard = run(s, pin("drag_pin_0", [x, y - 5, z]));
  assert.ok(hard.message || Math.hypot(at(hard)[0] - x, at(hard)[1] - (y - 5)) > 0.5, "the exact pin cannot be met");
  const soft = run(s, pin("drag_soft_0", [x, y - 5, z]));
  assert.equal(soft.message, null);
  const [nx, ny] = at(soft);
  assert.ok(y - ny > 3 && Math.hypot(nx - x, ny - (y - 5)) < 2, "the centre went most of the way down");
  assert.notEqual(Math.round(radius(soft) * 1000), Math.round(r0 * 1000), "the circle took the size the tangents ask for");
  // still tangent to both lines
  const sc = scene(soft);
  const P = (r: string) => (sc.parts[r as Ref] as unknown as { at: number[] }).at;
  for (const l of ["d/e_043.s0", "d/e_046.s0"]) {
    const ln = sc.parts[l as Ref] as unknown as { a: string; b: string };
    const [a, b] = [P(ln.a)!, P(ln.b)!];
    const d = Math.abs(((nx - a[0]!) * (b[1]! - a[1]!) - (ny - a[1]!) * (b[0]! - a[0]!)) / Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!));
    assert.ok(Math.abs(d - radius(soft)) < 1e-3, `tangent to ${l}`);
  }
});
