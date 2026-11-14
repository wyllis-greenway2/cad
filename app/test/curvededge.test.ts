// A curved edge of the body that is not a circle (here where a tilted round cut crosses the top and the wall of a cylinder) is lit and picked along the edge itself, not along a circle through its ends and middle
// (`in_341`): that circle ran far outside the body, so the blue line was nowhere near the drawn edge, and the edge could not be clicked where it is drawn.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import { outlineOf, hitPart, arcPoints } from "../src/operation/part.ts";
import { lookup } from "../src/operation/scene.ts";
import type { Part } from "../src/operation/part.ts";
import type { Vec3 } from "../src/math/vec.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/tilted-cut-edges-in_341.cad.json", import.meta.url), "utf8")) as unknown as { value: Session }).value;
type Line = Extract<Part, { kind: "line" }>;
const near = (p: Vec3, path: Vec3[]): number => Math.min(...path.slice(1).map((q, i) => { const a = path[i]!; const d = [q[0] - a[0], q[1] - a[1], q[2] - a[2]]; const w = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const t = Math.max(0, Math.min(1, (w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!) / (d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2 || 1))); return Math.hypot(p[0] - a[0] - d[0]! * t, p[1] - a[1] - d[1]! * t, p[2] - a[2] - d[2]! * t); }));

test("the file made when a move made a new plane still replays (`in_341`)", () => {
  const s = open();
  assert.deepEqual(s.outcome.errors, {});
});

test("a curved edge that is not a circle carries its own curve and is lit along it", () => {
  const sc = scene(open());
  const curved = (Object.values(sc.parts) as Part[]).filter((p): p is Line => p.kind === "line" && p.origin === "body" && !!p.path);
  assert.ok(curved.length >= 3, "the edges where the tilted cut crosses the body");
  const get = lookup(sc);
  let worst = 0;
  for (const l of curved) {
    const out = outlineOf(get, l);
    assert.equal(out.shape, "polyline");
    assert.deepEqual((out as { pts: Vec3[] }).pts, l.path, "the outline is the edge's curve");
    // the circle through the ends and the middle, which it used to be, is far from the edge
    const [a, b] = [sc.parts[l.a] as { at: Vec3 }, sc.parts[l.b] as { at: Vec3 }];
    for (const p of arcPoints(a.at, l.mid!, b.at)) worst = Math.max(worst, near(p, l.path!));
  }
  assert.ok(worst > 1, `the three-point circle strays ${worst.toFixed(1)} mm from the real edges`);
});

test("such an edge is picked where it is drawn, and not where the circle through its ends and middle runs", () => {
  const sc = scene(open());
  const get = lookup(sc);
  const l = (Object.values(sc.parts) as Part[]).find((p): p is Line => p.kind === "line" && p.origin === "body" && !!p.path && p.path.length > 6)!;
  // seen from straight above: a point of the scene is the pixel (x, y) times ten
  const project = (p: Vec3): [number, number] => [p[0] * 10, p[1] * 10];
  const at = (p: Vec3) => ({ x: p[0] * 10, y: p[1] * 10, project });
  const onCurve = l.path![Math.floor(l.path!.length / 3)]!;
  assert.ok((hitPart(get, l, at(onCurve)) ?? Infinity) < 1, "on the edge it is at the pointer");
  // a point of the old circle that is far from the real edge is no longer on it
  const [a, b] = [sc.parts[l.a] as { at: Vec3 }, sc.parts[l.b] as { at: Vec3 }];
  const far = arcPoints(a.at, l.mid!, b.at).map((p) => ({ p, d: near(p, l.path!) })).sort((x, y) => y.d - x.d)[0]!;
  if (far.d > 1) assert.ok((hitPart(get, l, at(far.p)) ?? 0) > 5, "off the edge it is not");
});
