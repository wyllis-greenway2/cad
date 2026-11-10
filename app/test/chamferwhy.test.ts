// A fillet or chamfer that cannot be made says why, how big it can be, and which edges are the problem (`in_266`).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, undoLast, run, scene } from "../src/interaction/session.ts";
import { startOp, opCommand } from "../src/interaction/operations.ts";

await kernel.init();
const FILE = "test/fixtures/gear-corner.cad.json";

test("a chamfer too big for a tooth's edge, next to the chamfer of the top, says the most that works and flashes the edge", { skip: !fs.existsSync(FILE) }, () => {
  const o = openSession(kernel, fs.readFileSync(FILE, "utf8"));
  assert.ok(o.ok);
  if (!o.ok) return;
  const base = o.value;
  const sc = scene(base);
  const edge = Object.values(sc.parts).find((p) => {
    if (p.kind !== "line" || p.origin !== "body" || p.mid) return false;
    const a = sc.parts[p.a], b = sc.parts[p.b];
    return a?.kind === "corner" && b?.kind === "corner" && Math.abs(a.at[0] - 20.04) < 1e-2 && Math.abs(a.at[1] - 37.55) < 1e-2 && Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) < 1e-3 && Math.abs(a.at[2] - b.at[2]) > 0.5;
  })!;
  const st = startOp(sc, [edge.ref], "edge");
  assert.ok(st.ok);
  if (!st.ok) return;
  const t = run(base, opCommand(sc, { ...st.op, value: -1.2 })!);
  assert.equal(scene(t).steps.length, scene(base).steps.length, "refused");
  assert.match(t.message ?? "", /a chamfer of 1\.2 mm cannot be made on this edge; the most that works here is about 0\.\d+ mm/);
  assert.deepEqual(t.conflict?.parts, [edge.ref], "the edge flashes");
  // a size that works is made
  assert.equal(scene(run(base, opCommand(sc, { ...st.op, value: -0.4 })!)).steps.length, scene(base).steps.length + 1);
});

test("the arrow of a chamfer on the edge between a flat face and a curved one points out of the corner, not at a made-up angle", { skip: !fs.existsSync(FILE) }, () => {
  const o = openSession(kernel, fs.readFileSync(FILE, "utf8"));
  if (!o.ok) return assert.fail("cannot open");
  const sc = scene(o.value);
  let checked = 0;
  for (const p of Object.values(sc.parts)) {
    if (p.kind !== "line" || p.origin !== "body" || p.mid) continue;
    const a = sc.parts[p.a], b = sc.parts[p.b];
    if (a?.kind !== "corner" || b?.kind !== "corner" || Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]) > 1e-3 || Math.abs(a.at[2] - b.at[2]) < 0.5) continue; // a vertical edge
    const st = startOp(sc, [p.ref], "edge");
    if (!st.ok) continue;
    const d = st.op.edges![0]!.dir;
    assert.ok(Math.abs(d[2]) < 1e-6, `${p.ref}: across the edge, not along it (${d})`);
    // out of the corner: along the sum of the two faces' normals, so the way across the tooth: it lies in the plane of the gear and is not the made-up "cross with up" for a skew edge
    assert.ok(Math.hypot(d[0], d[1]) > 0.99);
    checked++;
    // the edge at the foot of a tooth (20.04, 37.55): between the flat flank (normal +x) and the round wall (out from the gear's middle, +y there): the way out of the corner is between them. It used to be
    // along +x alone: the gear has a face in the same plane (x = 20.04) on its far side, and it was counted as one of the two faces of this edge
    if (Math.abs(a.at[0] - 20.04) < 1e-2 && Math.abs(a.at[1] - 37.55) < 1e-2) assert.ok((d[0] + d[1]) / Math.SQRT2 > 0.98, `the arrow ${d} is not the way out of the corner`);
  }
  assert.ok(checked >= 6);
});
