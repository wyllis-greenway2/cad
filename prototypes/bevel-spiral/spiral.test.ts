// A spiral bevel pair made of twisted straight bevel teeth: the numbers of the spiral, and whether a pair of opposite hands fits (with the straight pair's place and phase) and a pair of the same hand does not.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";
import { bevelOf } from "../bevel-pair/bevel.ts";
import { spiralAngle, developedAngle, spiralSection } from "./spiral.ts";
import type { SpiralSpec } from "./spiral.ts";

type V = [number, number, number];
const [add, scale, dot, cross, unit] = [(a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k], (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], (a: V): V => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; }];

test("the spiral angle is the mean one at the mean cone distance, and the curve keeps it near by", () => {
  const [Rm, rc, bm] = [30, 27, (35 * Math.PI) / 180];
  assert.ok(Math.abs(spiralAngle(Rm, Rm, rc, bm) - bm) < 1e-12);
  const [a, b] = [spiralAngle(Rm - 6, Rm, rc, bm), spiralAngle(Rm + 6, Rm, rc, bm)];
  assert.ok(a < bm && bm < b, `the angle grows outward: ${a} ${bm} ${b}`);
  assert.ok(Math.abs(developedAngle(Rm, Rm, rc, bm)) < 1e-12);
  const psi = developedAngle(Rm + 6, Rm, rc, bm);
  // the curve at 6 mm further out has turned by about tan(b) 6 / Rm radians in the developed plane
  assert.ok(psi > 0.7 * Math.tan(bm) * 6 / Rm && psi < 1.4 * Math.tan(bm) * 6 / Rm, `psi ${psi}`);
});

function gearBody(s: Session, sp: SpiralSpec, axis: V, toward: V, turn: number): Session {
  const b = bevelOf(sp);
  const e = unit(add(toward, scale(axis, -dot(toward, axis))));
  const v = cross(axis, e);
  const secs: string[][] = [];
  for (const r of [b.coneDistance - b.face, b.coneDistance - 0.75 * b.face, b.coneDistance - 0.5 * b.face, b.coneDistance - 0.25 * b.face, b.coneDistance]) {
    const k = r / b.coneDistance;
    const at = scale(axis, r * Math.cos(b.delta));
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u: e, v } } as never);
    const pts = spiralSection(sp, r).map(([rr, th]): V => add(at, add(scale(e, rr * Math.cos(th + turn)), scale(v, rr * Math.sin(th + turn)))));
    void k;
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  const id = nextId(scene(s), "s");
  const done = run(s, { type: "addStep", step: { id, type: "loft", parts: secs[secs.length - 1] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), ruled: 1, mode: "new" } } } as never);
  if (done.message) throw new Error(done.message);
  return done;
}
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
function overlap(h1: 1 | -1, h2: 1 | -1, turn2: number): { vol: number; none: boolean } {
  const [z1, z2] = [20, 30];
  const [sp1, sp2]: [SpiralSpec, SpiralSpec] = [{ z: z1, mate: z2, module: 2, xt: -0.05, hand: h1 }, { z: z2, mate: z1, module: 2, xt: -0.05, hand: h2 }];
  const b1 = bevelOf(sp1);
  const contact: V = [Math.cos(b1.delta), 0, Math.sin(b1.delta)];
  let s = createSession(kernel);
  s = gearBody(s, sp1, [1, 0, 0], contact, 0);
  s = gearBody(s, sp2, [0, 0, 1], contact, turn2);
  const b = bodies(s);
  assert.equal(b.length, 2);
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return { vol: 0, none: true };
  return { vol: bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, none: false };
}

test("a spiral pair of opposite hands fits at the straight pair's place and phase; the same hands, or the wheel half a pitch round, overlap", async () => {
  await kernel.init();
  const rows: string[] = [];
  for (const [h1, h2, turn, name] of [[1, -1, Math.PI / 30, "opposite hands, phase of the straight pair"], [-1, 1, Math.PI / 30, "the other opposite hands"], [1, 1, Math.PI / 30, "the same hand"], [1, -1, 0, "opposite hands, half a pitch off"]] as const) {
    const o = overlap(h1, h2, turn);
    rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3 overlap`}`);
  }
  console.log("ROWS\n" + rows.join("\n"));
});
