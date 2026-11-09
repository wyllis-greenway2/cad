// The fill of a sketch with holes that touch each other has no gap in it (`in_245`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { surfaceTriangles, joinTouching } from "../src/interaction/surfaces.ts";
import { loopPoints } from "../src/operation/part.ts";
import type { Ref } from "../src/shared/ref.ts";

await kernel.init();
const shoelace = (p: number[][]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]!; return s + (a[0]! * b[1]! - b[0]! * a[1]!); }, 0)) / 2;
const trianglesArea = (t: number[]) => { let s = 0; for (let i = 0; i < t.length; i += 9) s += Math.abs((t[i + 3]! - t[i]!) * (t[i + 7]! - t[i + 1]!) - (t[i + 6]! - t[i]!) * (t[i + 4]! - t[i + 1]!)) / 2; return s; };

test("a circle with a circle inside it that lines cut in two: the fill is the ring between them, whole (no wedge missing)", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/radial-fill.cad.json", import.meta.url), "utf8")) as unknown as { value: import("../src/interaction/session.ts").Session };
  const sc = scene(r.value);
  const get = (x: string) => (sc.parts as Record<string, never>)[x] as never;
  const ring = Object.values(sc.parts).find((p) => p.kind === "face" && p.disk && (p.holes?.length ?? 0) === 2)!;
  assert.ok(ring, "the outer disk has the two pieces of the inner circle as holes");
  const outer = 0.5 * 64 * 14.5 * 14.5 * Math.sin((2 * Math.PI) / 64); // (the disk is drawn as 64 sides)
  const face = (h: string) => get(h) as unknown as { loop: Ref[]; corners: Ref[] };
  const holes = (ring as { holes: string[] }).holes.map((h) => shoelace(loopPoints(get, face(h).loop, face(h).corners) as unknown as number[][]));
  const want = outer - holes.reduce((a, b) => a + b, 0);
  const got = trianglesArea(surfaceTriangles(get, ring as never)!);
  assert.ok(Math.abs(got - want) < 0.01 * want, `${got.toFixed(3)} filled, ${want.toFixed(3)} is the ring`);
});

test("holes that share a side are joined into one hole; holes apart are left alone", () => {
  const left: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  const right: [number, number][] = [[2, 0], [4, 0], [4, 2], [2, 2]];
  const joined = joinTouching([left, right]);
  assert.equal(joined.length, 1);
  assert.equal(Math.round(shoelace(joined[0]!)), 8, "the union of the two");
  const far: [number, number][] = [[10, 0], [12, 0], [12, 2], [10, 2]];
  assert.equal(joinTouching([left, far]).length, 2);
});

test("the triangles of a concave polygon of a few hundred points cover exactly its area, and are made quickly (`in_248`)", async () => {
  const { triangulate } = await import("../src/interaction/surfaces.ts");
  // a star: the radius swings between 10 and 6 all round
  const n = 400;
  const star: [number, number][] = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; const r = 8 + 2 * Math.sin(a * 11); return [r * Math.cos(a), r * Math.sin(a)]; });
  const t0 = performance.now();
  const idx = triangulate(star);
  const ms = performance.now() - t0;
  let area = 0;
  for (let i = 0; i < idx.length; i += 3) { const [a, b, c] = [star[idx[i]!]!, star[idx[i + 1]!]!, star[idx[i + 2]!]!]; area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; }
  assert.equal(idx.length, (n - 2) * 3, "n - 2 triangles");
  assert.ok(Math.abs(area - shoelace(star)) < 1e-6 * shoelace(star), `${area} against ${shoelace(star)}`);
  assert.ok(ms < 100, `${ms.toFixed(1)} ms for ${n} points`);
  assert.equal(triangulate(star), idx, "the same polygon again is not worked out again");
});
