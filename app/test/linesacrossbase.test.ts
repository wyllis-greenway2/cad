// Lines drawn on the world plane a round body stands on cut the base into pieces up to the body's rim (`in_1343`): two upright lines and one across the middle of a cylinder's base are four closed regions, not one disk.
// The model is the user's (`lines-across-base.cad.json`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene } from "../src/interaction/session.ts";
import type { Session } from "../src/interaction/session.ts";
import type { Part } from "../src/operation/part.ts";

await kernel.init();
test("lines across the base of a cylinder make four regions with its rim", () => {
  const r = openSession(kernel, readFileSync(new URL("./fixtures/lines-across-base.cad.json", import.meta.url), "utf8"));
  assert.ok(r.ok);
  const s = (r as unknown as { value: Session }).value;
  const pieces = Object.values(scene(s).parts).filter((p): p is Extract<Part, { kind: "face" }> => p.kind === "face" && p.origin === "drawn" && !!p.pieces);
  assert.equal(pieces.length, 4);
});
