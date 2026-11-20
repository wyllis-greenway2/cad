import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";
import { startOp } from "../src/interaction/operations.ts";
import { runOp } from "../src/interaction/runop.ts";
await kernel.init();
const o = openSession(kernel, readFileSync("/tmp/m5.json", "utf8"));
if (!o.ok) throw new Error(o.error);
let s = o.value;
const sc = scene(s);
const chosen: string[] = JSON.parse(readFileSync("/tmp/m5sel.json", "utf8"));
const st = startOp(sc, chosen as never, "extrude");
if (!st.ok) throw new Error("start");
const r = runOp(s, { ...st.op, value: -5 })!;
s = r.session;
const vol = (x: any) => Object.values(scene(x).parts).filter((p: any) => p.kind === "body").map((p: any) => Math.round(p.volume));
console.log("pulled; msg", s.message, "steps", scene(s).steps.map((x: any) => `${x.id}:${JSON.stringify(x.params)}`).join(" | "), "errors", JSON.stringify(s.outcome.errors), "vol", vol(s));
console.log("step parts", (scene(s).steps.at(-1) as any).parts.join(","));
const circle: any = Object.values(scene(s).parts).find((p: any) => p.kind === "circle" && p.origin === "drawn" && p.ref === "d/e_001.k");
for (const [tag, cmd] of [["same radius", { type: "setRadius", ref: circle.ref, radius: 12.5 }], ["radius 16.5", { type: "setRadius", ref: circle.ref, radius: 16.5 }], ["radius 9", { type: "setRadius", ref: circle.ref, radius: 9 }], ["depth 30", { type: "setStepParams", id: "s_002", params: { depth: 30 } }]] as any[]) {
  const t = run(s, cmd);
  console.log(tag, "msg:", t.message, "| errors", JSON.stringify(t.outcome.errors), "| vol", vol(t));
}
