// A chamfer larger than the wall of a hollow body (`in_471`): the kernel's own round came out as a "valid" body whose cavity stuck out through the outer skin at the corner; it is refused now and the
// round is made as a region (`dec_edits_saturate`): the wall is cut through and the cavity is open there.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession } from "../src/interaction/session.ts";

await kernel.init();
const open = (text: string) => { const r = openSession(kernel as never, text); assert.ok(r.ok); return r.ok ? r.value : (null as never); };
const text = fs.readFileSync(new URL("./fixtures/invalid-chamfer-on-hollow-in_471.cad.json", import.meta.url), "utf8");
type K = { volume: number; faces: unknown[]; ops: { id: string; error: string | null; note?: string }[]; mesh: { vertices: Float32Array; triangles: Uint32Array } };

test("a chamfer wider than the wall of a hollow body takes the wall away and opens the cavity; the cavity does not stick out of the skin", () => {
  const k = open(text).outcome.kernel as unknown as K;
  const op = k.ops.find((o) => o.id === "x_s_017")!;
  assert.equal(op.error, null);
  assert.match(op.note ?? "", /region/, "it says it was made as a region");
  // the wedge is 1.7 x 1.7 / 2 x 12.1 = 17.48 mm3 of the block; 2.72 of it was cavity already: what the cut took is 14.76
  assert.ok(Math.abs(k.volume - (275.0999714600923 - 14.76)) < 0.05, `the volume is the block's less what the cut took: ${k.volume}`);
  // the mesh closes: every edge is shared by two triangles
  const { vertices: v, triangles: t } = k.mesh;
  const key = (i: number) => `${Math.round(v[i * 3]! * 1e4)},${Math.round(v[i * 3 + 1]! * 1e4)},${Math.round(v[i * 3 + 2]! * 1e4)}`;
  const count = new Map<string, number>();
  for (let i = 0; i < t.length; i += 3) for (let e = 0; e < 3; e++) { let a = key(t[i + e]!), b = key(t[i + (e + 1) % 3]!); if (a > b) [a, b] = [b, a]; count.set(`${a}|${b}`, (count.get(`${a}|${b}`) ?? 0) + 1); }
  assert.equal([...count.values()].filter((c) => c !== 2).length, 0);
});

test("the check lets a plain body and a closed hollow body pass (the case that fails is the fixture above: without the check its volume is 257.6)", async () => {
  const { makeBox } = await import("replicad");
  // @ts-expect-error (the kernel files are plain modules with no types)
  const { cavitiesInside } = await import("../src/compiler/kernel/occt/interpreter.mjs");
  const box = makeBox as never as (a: number[], b: number[]) => { cut: (o: unknown) => unknown; clone: () => unknown };
  const plain = box([0, 0, 0], [10, 10, 10]);
  assert.equal(cavitiesInside(plain as never), true, "one shell");
  const hollow = box([0, 0, 0], [10, 10, 10]).cut(box([2, 2, 2], [8, 8, 8]));
  assert.equal(cavitiesInside(hollow as never), true, "a cavity inside");
});
