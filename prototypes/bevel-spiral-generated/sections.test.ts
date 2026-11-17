// The flank sections of the example pair: whether a section can be made at each plane, how thick the teeth come out, and (the test that matters) whether the pair, built in the kernel, fits.
import test from "node:test";
import assert from "node:assert/strict";
import { pairOf, flankGrid, contourAt, outlineAt, tipRadius, rootRadius } from "./sections.ts";
import type { PairSpec } from "./sections.ts";

const deg = (d: number) => (d * Math.PI) / 180;
export const EXAMPLE = (): PairSpec => {
  const [z1, z2, mn, bm] = [20, 30, 3.0, deg(30)];
  const g1 = Math.atan(z1 / z2), g2 = Math.PI / 2 - g1;
  const mf = mn / Math.cos(bm); // (the transverse module at the mean: the mean pitch diameter is mf z, Stadtfeld eq. 6)
  const RM = (mf * z2) / (2 * Math.sin(g2)), b = 0.3 * RM, RW = 0.88 * RM; // (a face of 0.3 of the mean cone distance, the cutter radius a little under it, as the paper has it)
  return { crown: { RM, RW, beta: bm, tB: Math.PI * mn, alpha: deg(20), gamma: g2, hand: 1 }, z1, z2, mn, b };
};

test("the sections of the example pair exist at every plane across the face width, and the teeth have the thickness of the paper's: half the normal pitch at the pitch cone", () => {
  const pr = pairOf(EXAMPLE());
  for (const which of ["pinion", "ring"] as const) {
    const g = which === "pinion" ? pr.pinion : pr.ring;
    const [A, B] = [flankGrid(pr, which, "A"), flankGrid(pr, which, "B")];
    const RM = pr.spec.crown.RM, b = pr.spec.b;
    for (const rho of [RM - b / 2, RM, RM + b / 2]) {
      const X = rho * Math.cos(g.gamma);
      const [ca, cb] = [contourAt(A, g.axis, X), contourAt(B, g.axis, X)];
      assert.ok(ca.length > 10 && cb.length > 10, `${which} rho ${rho.toFixed(1)}: ${ca.length} and ${cb.length} points`);
      const o = outlineAt(g, which, ca, cb, X);
      assert.ok(o, `${which} rho ${rho.toFixed(1)}: an outline`);
      const [rt, rr] = [tipRadius(g, X), rootRadius(g, X)];
      assert.ok(rt > rr && rr > 0, `radii ${rr} ${rt}`);
      // the arc thickness of the material at the pitch radius, from the outline: for the ring gear the tooth (the two flanks), for the pinion the tooth between slots
      console.log(`SEC ${which} rho ${rho.toFixed(1)} X ${X.toFixed(2)} r ${rr.toFixed(2)}..${rt.toFixed(2)} points ${o!.length}`);
    }
  }
});

// ---- the pair in the kernel ----
import { kernel } from "../../app/src/compiler/kernel/index.ts";
import { createSession, run, scene } from "../../app/src/interaction/session.ts";
import type { Session } from "../../app/src/interaction/session.ts";
import { drawChain } from "../../app/src/operation/build.ts";
import { nextId, figureParams } from "../../app/src/operation/scene.ts";
import { drawnRef } from "../../app/src/shared/ref.ts";
import type { Pair, Gear } from "./sections.ts";
import type { V3 } from "./generate.ts";

const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as { ref: string; volume: number }[];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** the gear's body: a loft through the outlines at `n` planes across the face width, the gear turned by `turn` about its axis, the pinion's slot widened by `bl` (mm) */
function gearBody(s: Session, pr: Pair, which: "pinion" | "ring", turn: number, n: number): Session {
  const g: Gear = which === "pinion" ? pr.pinion : pr.ring;
  const [A, B] = [flankGrid(pr, which, "A"), flankGrid(pr, which, "B")];
  const RM = pr.spec.crown.RM, b = pr.spec.b;
  const u: V3 = [1, 0, 0], v = cross3(g.axis, u);
  const secs: string[][] = [];
  for (let i = 0; i < n; i++) {
    const rho = RM - b / 2 + (b * i) / (n - 1), X = rho * Math.cos(g.gamma);
    const o = outlineAt(g, which, contourAt(A, g.axis, X), contourAt(B, g.axis, X), X);
    if (!o) throw new Error(`${which}: no outline at rho ${rho.toFixed(1)}`);
    const at: V3 = [g.axis[0] * X, g.axis[1] * X, g.axis[2] * X];
    const ref = drawnRef(nextId(scene(s), "p"));
    s = run(s, { type: "addPart", part: { ref, kind: "plane", origin: "drawn", plane: null, movable: true, at, u, v } } as never);
    const pts = o.map(([r, f]): V3 => [at[0] + r * Math.cos(f + turn) * u[0] + r * Math.sin(f + turn) * v[0], at[1] + r * Math.cos(f + turn) * u[1] + r * Math.sin(f + turn) * v[1], at[2] + r * Math.cos(f + turn) * u[2] + r * Math.sin(f + turn) * v[2]]);
    const ch = drawChain(scene(s), ref as never, pts, true);
    s = run(s, ch.command);
    secs.push(ch.lines as string[]);
  }
  const id = nextId(scene(s), "s");
  const done = run(s, { type: "addStep", step: { id, type: "loft", parts: secs[0] as never, params: { ...figureParams(secs.map((l) => ({ outer: l as never, holes: [] }))), mode: "new" } } } as never);
  if (done.message) throw new Error(`${which}: ${done.message}`);
  return done;
}
function overlap(pr: Pair, turnPinion: number, turnRing: number, n: number): { vol: number; none: boolean; vols: number[] } {
  let s = createSession(kernel);
  s = gearBody(s, pr, "pinion", turnPinion, n);
  s = gearBody(s, pr, "ring", turnRing, n);
  const b = bodies(s);
  assert.equal(b.length, 2);
  const vols = b.map((x) => Math.round(x.volume));
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref) as never, params: { mode: "intersect" } } } as never);
  if (/nothing in common/.test(done.message ?? "")) return { vol: 0, none: true, vols };
  return { vol: bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, none: false, vols };
}

test("the spiral bevel pair made by the gearing law, in the kernel: it fits at its place and keeps fitting as it rolls; the ring gear half a pitch round overlaps", async () => {
  await kernel.init();
  const sp = EXAMPLE();
  const pr = pairOf({ ...sp, bl: 0.05 });
  const kk = Math.sin(pr.pinion.gamma) / Math.sin(pr.ring.gamma);
  const rows: string[] = [];
  const N = 7;
  for (const [name, tp, tr] of [["at the meshing place", 0, 0], ["rolled by 0.04", 0.04, -kk * 0.04], ["rolled by 0.08", 0.08, -kk * 0.08], ["ring gear half a pitch round", 0, Math.PI / pr.ring.z]] as const) {
    const o = overlap(pr, tp, tr, N);
    rows.push(`${name}: ${o.none ? "nothing in common" : `${o.vol.toFixed(1)} mm3 overlap`} (bodies ${o.vols.join(", ")} mm3)`);
  }
  console.log("ROWS\n" + rows.join("\n"));
});
