// A selected circle, arc or line offers "coincident with circle" / "on line" for the corners close to it (`in_244`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import { suggestionsFor, nearCommand } from "../src/interaction/suggest.ts";
import { createState, reduce } from "../src/interaction/controller.ts";
import type { Ref } from "../src/shared/ref.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession } from "../src/interaction/session.ts";
import { drawChain } from "../src/operation/build.ts";
import { pointOf } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/radial-circles.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session }).value;

test("the outer circle offers to take the corners of the radial lines that lie close to its edge, and one click puts them on it", () => {
  const s = open();
  const outer = "d/e_011.k" as Ref;
  const sg = suggestionsFor(scene(s), [outer]);
  const item = sg?.items.find((i) => i.id === "near:onCircle");
  assert.ok(item, `offered: ${sg?.items.map((i) => i.id).join()}`);
  assert.match(item!.label, /2 corners/);
  const st0 = createState(s);
  const st = reduce({ ...st0, session: { ...st0.session, click: { ...st0.session.click, selection: [outer] } } }, { type: "runAction", id: "near:onCircle" }, { w: 800, h: 600, now: 0 });
  const sc = scene(st.session);
  const added = sc.relations.filter((r) => r.kind === "onCircle" && r.parts[1] === outer);
  assert.equal(added.length, 2);
  const centre = pointOf((r) => sc.parts[r], "d/e_011.c" as Ref)!;
  for (const r of added) {
    const q = pointOf((x) => sc.parts[x], r.parts[0]!)!;
    assert.ok(Math.abs(Math.hypot(q[0] - centre[0], q[1] - centre[1]) - 13.8) < 1e-6, "on the circle");
  }
  assert.ok(!suggestionsFor(sc, [outer])?.items.some((i) => i.id === "near:onCircle"), "not offered again once they are on it");
  assert.equal(nearCommand(scene(s), [outer], "near:onLine"), null);
});

test("a line offers the corners that lie close to it along its length, and not those beyond its ends", () => {
  let s = createSession(kernel);
  const l = drawChain(scene(s), worldRef("XY"), [[0, 0, 0], [40, 0, 0]]); s = run(s, l.command);
  const c1 = drawChain(scene(s), worldRef("XY"), [[20, 1.2, 0], [20, 10, 0]]); s = run(s, c1.command); // its start is 1.2 above the middle
  const c2 = drawChain(scene(s), worldRef("XY"), [[45, 0.5, 0], [45, 10, 0]]); s = run(s, c2.command); // beside the end of it: not near along it
  const sg = suggestionsFor(scene(s), [l.lines[0]!]);
  const item = sg?.items.find((i) => i.id === "near:onLine");
  assert.ok(item, `offered: ${sg?.items.map((i) => i.id).join()}`);
  assert.match(item!.label, /the corner close/);
  const st0 = createState(s);
  const st = reduce({ ...st0, session: { ...st0.session, click: { ...st0.session.click, selection: [l.lines[0]!] } } }, { type: "runAction", id: "near:onLine" }, { w: 800, h: 600, now: 0 });
  const on = scene(st.session).relations.filter((r) => r.kind === "onLine");
  assert.equal(on.length, 1);
  assert.equal(on[0]!.parts[0], c1.corners[0]);
});
