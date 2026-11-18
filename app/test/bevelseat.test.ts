// A bevel partner that does not seat (`in_822`): the gear was made for a partner of 20 teeth (its mate teeth) and edited to 30 teeth; a partner of 30 teeth made with Mesh gear had a cone that fits a source with a
// mate of 30, and the source's was still the one for 20: the two cones did not add up to the shaft angle. The source's mate teeth follow the partner now, and the placement is worked out with them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, run, scene } from "../src/interaction/session.ts";
import { meshGearTool, finish } from "../src/interaction/tools.ts";
const gearsOf = (s: ReturnType<typeof scene>) => s.gears ?? [];
import { bevelOf } from "../src/operation/bevel.ts";
import type { GearSpec } from "../src/operation/gear.ts";

await kernel.init();

test("a partner of other teeth than the gear was made for: the gear's mate teeth follow and the two cones share the apex (the report's gear: 30 teeth made for 20, a partner of 30)", () => {
  const j = JSON.parse(readFileSync(new URL("./fixtures/bevel-seat-in_822.cad.json", import.meta.url), "utf8"));
  const r = openSession(kernel, JSON.stringify({ ...j, cursor: 4 })); // (the gear, before its partner)
  assert.ok(r.ok, r.ok ? "" : r.error);
  if (!r.ok) return;
  const sc = scene(r.value);
  const src = gearsOf(sc).find((g) => g.id === "g_001")!;
  assert.equal(src.spec.teeth, 30);
  assert.equal(src.spec.bevel!.mate, 20, "made for a partner of 20");
  const t = { ...meshGearTool(src, false), cursor: [20, 40, 0] as [number, number, number] };
  const typed = { ...t, gear: { ...t.gear!, typed: t.gear!.typed.map((v, i) => (i === 0 ? "30" : v)) } };
  const fin = finish(sc, typed);
  assert.ok(fin, "a partner is made");
  const done = run(r.value, fin!.command);
  assert.ok(!done.message, done.message ?? "");
  const [a, b] = [gearsOf(scene(done)).find((g) => g.id === "g_001")!, gearsOf(scene(done)).filter((g) => g.id !== "g_001")[0]!];
  assert.equal(a.spec.bevel!.mate, 30, "the gear's mate teeth follow the partner");
  assert.equal(b.spec.bevel!.mate, 30);
  const [g1, g2] = [bevelOf(a.spec as GearSpec), bevelOf(b.spec as GearSpec)];
  assert.ok(g1.ok && g2.ok);
  if (!g1.ok || !g2.ok) return;
  assert.ok(Math.abs(g1.value.delta + g2.value.delta - Math.PI / 2) < 1e-9, "the cone angles add up to the shaft angle");
  const [f0, f1] = b.spec.bevel!.frame!;
  const n2 = [f0[1] * f1[2] - f0[2] * f1[1], f0[2] * f1[0] - f0[0] * f1[2], f0[0] * f1[1] - f0[1] * f1[0]];
  const apex1 = [a.at[0], a.at[1], a.at[2] + g1.value.big];
  const apex2 = [0, 1, 2].map((k) => b.at[k]! + n2[k]! * g2.value.big);
  assert.ok(Math.hypot(apex1[0]! - apex2[0]!, apex1[1]! - apex2[1]!, apex1[2]! - apex2[2]!) < 1e-6, `apexes ${apex1} and ${apex2}`);
  // nothing typed: the partner has the teeth the gear was made for, and the gear is left as it is
  const plain = finish(sc, t);
  assert.ok(plain && plain.command.type === "gear", "one gear, not a change of the source too");
  assert.equal((plain!.command as { spec: GearSpec }).spec.teeth, 20, "the gear's mate teeth");
});
