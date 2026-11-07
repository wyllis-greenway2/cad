// The hollow body that was turned several times (`in_207`): its fillets can be pulled, and a side that cannot move is refused with the constraints shown, not filled in with a prism.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import { faceEdit } from "../src/interaction/faceedit.ts";
import { startOp, valueOf } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/hollow-rotated.cad.json", import.meta.url), "utf8")) as { ok: true; value: ReturnType<typeof openSession> extends { value: infer V } ? V : never }).value;

test("the fillets of a body that has been turned still find their step (the face is measured where the step made it)", () => {
  const s = open();
  const sc = scene(s);
  const fillets = (Object.values(sc.parts) as Part[]).filter((p) => p.kind === "plane" && p.origin === "body" && p.rounded === "TORUS");
  assert.ok(fillets.length >= 3);
  for (const f of fillets) assert.equal(faceEdit(sc, f.ref)?.kind, "edgeSize", f.ref);
});

test("a side whose neighbours are tangent circles cannot move: a push / pull is made instead, and the constraints holding the side are named (flashed)", () => {
  const s = open();
  const sc = scene(s);
  const outer = (Object.values(sc.parts) as Part[]).find((p) => p.kind === "plane" && p.origin === "body" && faceEdit(sc, p.ref)?.kind === "side" && (faceEdit(sc, p.ref) as { corners: string[] }).corners.some((c) => c.startsWith("d/e_013")))!;
  const st = startOp(sc, [outer.ref], "pushpull") as { ok: true; op: Parameters<typeof valueOf>[0] };
  const r = runOp(s, { ...st.op, value: 2 } as typeof st.op)!;
  assert.equal(scene(r.session).steps.at(-1)?.type, "pushPull");
  assert.ok(r.session.message?.includes("push / pull was added"), String(r.session.message));
  assert.ok((r.session.conflict?.culprits.length ?? 0) > 0, "the constraints are shown");
});
