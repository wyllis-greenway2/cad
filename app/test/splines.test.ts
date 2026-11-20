// The straight-sided splines of ISO 14 (`dec_keyway_maker`, `in_1270`): the table as read from the standard, and the outline, whose area and whose solid are checked.
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../src/interaction/session.ts";
import { Builder, outline, disc } from "../src/operation/modelparts.ts";
import { asCommand } from "../src/operation/modelparts.ts";
import { ISO14, iso14, splineName, splineOutline, splineProblem } from "../src/operation/splines.ts";
import { flatten } from "../src/operation/arcs.ts";

await kernel.init();

test("the table is the standard's: 20 sizes, 35 rows, and the designations of its example and of the medium 56 (8 x 56 x 65)", () => {
  assert.equal(ISO14.length, 35);
  assert.equal(ISO14.filter((r) => r.series === "light").length, 15);
  assert.deepEqual(iso14("6 x 23 x 26"), { series: "light", n: 6, d: 23, D: 26, B: 6 }, "the standard's own example");
  assert.deepEqual(iso14("8x56x65"), { series: "medium", n: 8, d: 56, D: 65, B: 10 });
  assert.deepEqual(iso14("8 x 56 x 62"), { series: "light", n: 8, d: 56, D: 62, B: 10 });
  assert.equal(iso14("6 x 14 x 20"), null);
  assert.equal(splineName({ n: 10, d: 112, D: 125 }), "10 x 112 x 125");
  for (const r of ISO14) assert.equal(splineProblem(r), null, splineName(r));
  // the counts of the standard: 6 up to d 28, 8 up to 62, 10 above; the medium series is never narrower in D than the light
  for (const r of ISO14) assert.equal(r.n, r.d <= 28 ? 6 : r.d <= 62 ? 8 : 10, splineName(r));
  for (const m of ISO14.filter((r) => r.series === "medium")) { const l = iso14(`${m.n} x ${m.d} x ${ISO14.find((r) => r.series === "light" && r.d === m.d)?.D ?? 0}`); if (l) assert.ok(m.D > l.D); }
});

test("the outline is the minor circle with N parallel-flanked lugs to the outside circle: its area is what the table gives", () => {
  for (const name of ["6 x 23 x 26", "8 x 46 x 54", "10 x 112 x 125"]) {
    const r = iso14(name)!, o = splineOutline(r)!;
    assert.ok(o, name);
    const f = flatten(o.points, o.bulges, 64);
    const area = Math.abs(f.reduce((s, p, i) => s + p[0] * f[(i + 1) % f.length]![1] - f[(i + 1) % f.length]![0] * p[1], 0)) / 2;
    // the exact area: the minor circle, and a lug: the strip between the flanks from the minor circle to the outside circle, less nothing
    const [rd, rD, b] = [r.d / 2, r.D / 2, r.B / 2];
    const seg = (R: number) => R * R * Math.asin(b / R) + b * Math.sqrt(R * R - b * b); // (the area of the circle's cut by a strip of half-width b: the lens inside the strip, both sides)
    const lug = seg(rD) - seg(rd);
    const want = Math.PI * rd * rd + r.n * lug;
    assert.ok(Math.abs(area - want) < 0.002 * want, `${name}: ${area.toFixed(2)} against ${want.toFixed(2)}`);
    const radii = o.points.map((p) => Math.hypot(p[0], p[1]));
    assert.ok(Math.abs(Math.max(...radii) - rD) < 0.2 && Math.min(...radii) > rd - 1e-9, "its corners lie on the two circles");
  }
  assert.equal(splineOutline({ n: 6, d: 10, D: 12, B: 9 }), null, "lugs wider than the circle allows are refused");
  assert.match(splineProblem({ n: 2, d: 10, D: 12, B: 2 }) ?? "", /3 to 60/);
  assert.match(splineProblem({ n: 6, d: 10, D: 9, B: 2 }) ?? "", /outside diameter/);
});

test("a splined shaft and a splined hole are solids of the volume the profile says, and the shaft fits the hole (the volumes add up to the plain cylinder)", () => {
  const r = iso14("6 x 23 x 28")!, o = splineOutline(r)!, len = 20;
  const body = (shape: ReturnType<typeof outline>, mode?: "new" | "cut", base?: boolean) => {
    const b = new Builder();
    b.part("x");
    if (base) b.extrude(b.plane(0), disc(0, 0, 20), [], len);
    b.extrude(b.plane(-1), shape, [], len + 2, mode ? { mode } : {}); // (the shaft is made on its own, the hole is cut in the disc)
    return b.build();
  };
  const make = (steps: ReturnType<typeof body>) => { const c = asCommand(scene(createSession(kernel)), steps.steps); assert.ok(c.ok, c.ok ? "" : c.error); return run(createSession(kernel), c.value as never); };
  const volume = (s: ReturnType<typeof run>) => (Object.values(scene(s).parts).filter((p) => p.kind === "body") as unknown as { volume: number }[]).map((p) => p.volume);
  const shaft = volume(make(body(outline(o.points, o.bulges))));
  assert.equal(shaft.length, 1, "one body");
  const plan = (() => { const f = flatten(o.points, o.bulges, 64); return Math.abs(f.reduce((s, p, i) => s + p[0] * f[(i + 1) % f.length]![1] - f[(i + 1) % f.length]![0] * p[1], 0)) / 2; })();
  assert.ok(Math.abs(shaft[0]! - plan * (len + 2)) < 0.003 * plan * (len + 2), `${shaft[0]} against ${plan * (len + 2)}`);
  const hub = volume(make(body(outline(o.points, o.bulges), "cut", true)));
  assert.equal(hub.length, 1);
  assert.ok(Math.abs(hub[0]! - (Math.PI * 400 * len - plan * len)) < 0.004 * Math.PI * 400 * len, `${hub[0]} against ${Math.PI * 400 * len - plan * len}`);
});
