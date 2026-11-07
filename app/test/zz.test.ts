import test from "node:test";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
await kernel.init();
test("file", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/tangent-lines.cad.json", import.meta.url), "utf8")) as any;
  const sc = scene(r.value);
  console.log("faces", (Object.values(sc.parts) as any[]).filter((p) => p.kind === "face").map((f) => "loop" + f.loop.length + (f.disk ? " disk" : "") + (f.holes ? " holes" + f.holes.length : "")).join(" | "));
});
