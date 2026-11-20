// A body with filleted pockets cut in it can be hollowed (`in_1339`): the kernel's offset with sharp corners comes back a sliver there, so the wall is made by another way of offsetting. The same file keeps its cuts of drawn pieces on the face when the face's edges cut the drawing (`in_1338`).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { kernel } from "../src/compiler/kernel/index.ts";
import { openSession, scene, run } from "../src/interaction/session.ts";

await kernel.init();
const open = () => (openSession(kernel, readFileSync(new URL("./fixtures/hollow-pockets.cad.json", import.meta.url), "utf8")) as unknown as { value: ReturnType<typeof run> }).value;
const vol = (s: ReturnType<typeof run>) => (Object.values(scene(s).parts).find((p) => p.kind === "body") as { volume?: number } | undefined)?.volume ?? 0;

test("the file loads with every step made, the pockets cut and the wall hollowed", () => {
  const s = open();
  assert.deepEqual(s.outcome.errors, {});
  assert.ok(vol(s) > 1000 && vol(s) < 4000, `volume ${vol(s)}`);
});

test("the wall can be made at other thicknesses too", () => {
  for (const th of [0.6, 1.5]) {
    const s = run(open(), { type: "setStepParams", id: "s_020", params: { thickness: th } } as never);
    assert.deepEqual(s.outcome.errors, {}, `${th}`);
    assert.ok(vol(s) > 500 && vol(s) < 7000, `${th}: ${vol(s)}`);
  }
});
