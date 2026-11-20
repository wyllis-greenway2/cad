import { kernel } from "../../src/compiler/kernel/index.ts";
import { createSession, scene, run } from "../../src/interaction/session.ts";
import { createState, reduce } from "../../src/interaction/controller.ts";
import { homeCamera } from "../../src/interaction/camera.ts";
import { worldRef } from "../../src/shared/ref.ts";
import { drawCircle } from "../../src/operation/build.ts";
import { roundBodyOf } from "../../src/operation/roundbody.ts";
import { figureParams, nextId } from "../../src/operation/scene.ts";
await kernel.init();
const env = { w: 800, h: 600, now: 0 } as never;
let s = createSession(kernel);
const c = drawCircle(scene(s), worldRef("XY"), [0, 0, 0], 20); s = run(s, c.command);
s = run(s, { type: "addStep", step: { id: nextId(scene(s), "s"), type: "extrude", parts: [c.circle], params: { depth: 15, ...figureParams([{ outer: [c.circle], holes: [] }]) } } } as never);
const sc = scene(s);
const parts = Object.values(sc.parts) as any[];
console.log("kinds", [...new Set(parts.map((p) => p.kind + ":" + p.origin))].join(" "));
const body = parts.find((p) => p.kind === "body");
console.log("roundBody", JSON.stringify(roundBodyOf(sc, body.ref)));
const edges = parts.filter((p) => p.kind === "line" && p.origin === "body");
console.log("edges", edges.length, edges.slice(0, 4).map((e) => JSON.stringify({ a: e.a, b: e.b, circle: e.circle && e.circle.radius, twin: e.twin, of: e.of })).join(" "));
const faces = parts.filter((p) => p.kind === "plane" && p.origin === "body");
for (const f of faces) {
  let st: any = { ...createState(s), cam: homeCamera() };
  st = { ...st, session: { ...st.session, click: { ...st.session.click, selection: [f.ref] } } };
  st = reduce(st, { type: "runAction", id: "model:wheelcut" }, env);
  console.log("face", f.ref, "curved:", !!f.curved, "round:", !!f.round, "of:", f.of, "-> armed:", !!st.tool?.fill?.cut, st.session.message);
}
