// A dev check (not a test, `in_1444`): what the stress run found (`in_1541`, `in_1542`), kept as recipes in dev/stress-found/ and checked again.
//   node --experimental-strip-types dev/stress-found-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import type { Step } from "../src/engine/steps.ts";
import { readFileSync } from "node:fs";
await initKernel();
import { check, failureCount } from "./lib.ts";
const load = (n: string): Step[] => JSON.parse(readFileSync(new URL(`./stress-found/${n}.json`, import.meta.url), "utf8"));
const st = (e: Engine, id: string) => e.result(id).status as { kind: string; why?: string };

console.log("1. a shell the kernel calls valid but whose face is 1e101 mm squared is refused, not kept");
{ const e = new Engine(load("shell-absurd-volume")); e.build(); check("X9 is flagged, in words", st(e, "X9").kind === "flagged" && /cannot be right/.test(st(e, "X9").why ?? ""), st(e, "X9").kind + " " + (st(e, "X9").why ?? "")); e.release(); }
console.log("2. a round naming edges of two bodies says so (flagged), not that an edge is gone (orphaned)");
{ const e = new Engine(load("round-two-bodies")); e.build(); check("X6 flagged, says another body", st(e, "X6").kind === "flagged" && /another body/.test(st(e, "X6").why ?? ""), st(e, "X6").kind + " " + (st(e, "X6").why ?? "")); e.release(); }
console.log("3. an edit and back gives the same answers (the kernel's volume differs in the 11th digit with the way a shape was built)");
{
  const e = new Engine(load("edit-and-back-volume-noise")); e.build(); const ids = e.ids(), before = Object.fromEntries(ids.map((i) => [i, e.result(i).fingerprint])), p = e.step("X12").params as { dist: number };
  e.edit("X12", { ...p, dist: p.dist * 1.25 }); e.edit("X12", p);
  check("every step has its first fingerprint again", ids.every((i) => e.result(i).fingerprint === before[i]), ids.filter((i) => e.result(i).fingerprint !== before[i]).join(" ")); e.release();
}
process.exit(failureCount() ? 1 : 0);
