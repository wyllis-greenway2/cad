// A spiral crown gear (`dec_spiral_crown`, `in_988`): a crown gear whose teeth are the bands between two cones about the cutter's axis (the generating crown of the spiral bevel gear), meshing with a spiral pinion; made by Mesh gear from either gear.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { meshWith } from "../src/operation/mesh.ts";
import { crownOf, crownShaft } from "../src/operation/crown.ts";
import { gearOutline } from "../src/operation/gear.ts";
import type { GearSpec } from "../src/operation/gear.ts";
import { worldRef } from "../src/shared/ref.ts";
import { createSession, run, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";

await kernel.init();
const bodies = (s: Session) => Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { ref: string; volume: number }[];
const crown = (over: Partial<GearSpec> = {}, bevel: Partial<NonNullable<GearSpec["bevel"]>> = {}): GearSpec => ({ teeth: 40, module: 2, bore: 5, ...over, bevel: { mate: 18, shaft: crownShaft(40, 18), spiral: 30, ...bevel } });

test("the spiral crown gear's numbers and limits say why", () => {
  const c = crownOf(crown());
  assert.ok(c.ok, c.ok ? "" : c.error);
  if (c.ok) { assert.ok(Math.abs(c.value.R - (2 * 40) / 2 / Math.cos((30 * Math.PI) / 180)) < 1e-9, "the pitch radius carries 1 / cos of the spiral angle"); assert.ok(c.value.spiral); }
  const err = (s: GearSpec) => { const r = gearOutline(s); return r.ok ? "" : r.error; };
  assert.equal(err(crown()), "");
  assert.match(err(crown({}, { mate: 12, shaft: crownShaft(40, 12) })), /16 or more teeth/);
  assert.match(err(crown({ teeth: 60 }, { mate: 18, shaft: crownShaft(60, 18) })), /at most 3 times/);
  assert.match(err(crown({}, { spiral: 5 })), /spiral angle must be/);
  assert.match(err(crown({ pressure: 25 })), /20 degrees only/);
  assert.match(err(crown({}, { offset: 5 })), /no hypoid offset/);
  assert.equal(err({ ...crown(), bevel: { mate: 18, shaft: crownShaft(40, 18) } }), "", "no spiral angle: the straight crown gear as before");
});
const fitOf = (src: GearSpec, partner: { teeth: number }, turn: number): { over: number; n: number; msg: string } => {
  const rec = { id: "g_001", plane: worldRef("XY"), at: [0, 0, 0] as [number, number, number], spec: src };
  const p = meshWith(rec, [1, 0, 0], [0, 1, 0], partner, 0.3);
  if (!p.ok) throw new Error(p.error);
  let s = run(createSession(kernel), { type: "gear", id: "g_001", plane: worldRef("XY"), at: rec.at, spec: src });
  s = run(s, { type: "gear", id: "g_002", plane: worldRef("XY"), at: p.value.at, turn: p.value.turn + turn, spec: p.value.spec });
  const b = bodies(s);
  if (s.message || b.length !== 2) return { over: -1, n: b.length, msg: s.message ?? "" };
  const done = run(s, { type: "addStep", step: { id: "s_900", type: "combine", parts: b.map((x) => x.ref), params: { mode: "intersect" } } } as never);
  return { over: /nothing in common/.test(done.message ?? "") ? 0 : bodies(done).map((x) => x.volume).sort((x, y) => y - x)[0] ?? 0, n: 2, msg: "" };
};
test("a spiral pinion made by Mesh gear on a spiral crown gear fits at its place and not turned off it", () => {
  const [fit, off] = [fitOf(crown(), { teeth: 18 }, 0), fitOf(crown(), { teeth: 18 }, 0.1745)];
  console.log("SPIRAL CROWN", fit.over, off.over);
  assert.equal(fit.n, 2, fit.msg);
  assert.ok(fit.over < 10, `at its place: ${fit.over}`);
  assert.ok(off.over > 20 * Math.max(fit.over, 1), `turned off it: ${off.over}`);
});
test("a spiral crown gear made by Mesh gear on a spiral pinion (the pinion first) fits too", () => {
  const pinion: GearSpec = { teeth: 18, module: 2, bore: 5, bevel: { mate: 40, shaft: crownShaft(40, 18), spiral: 30 } };
  const f = fitOf(pinion, { teeth: 40 }, 0);
  console.log("SPIRAL CROWN from the pinion", f.over);
  assert.equal(f.n, 2, f.msg);
  assert.ok(f.over < 10, `at its place: ${f.over}`);
});
