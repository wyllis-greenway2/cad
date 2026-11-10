// The random user (`in_251`, `test/helpers/fuzz.ts`): a few runs on every check. To hunt for longer: FUZZ_SEEDS=200 FUZZ_STEPS=150 node --test test/fuzz.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { kernel } from "../src/compiler/kernel/index.ts";
import { fuzz } from "./helpers/fuzz.ts";

await kernel.init();
const seeds = Number(process.env.FUZZ_SEEDS ?? 6);
const steps = Number(process.env.FUZZ_STEPS ?? 40);
const first = Number(process.env.FUZZ_FIRST ?? 1);

test(`a random user, ${seeds} runs of ${steps} gestures, leaves the state sound after every intent`, () => {
  const failures = [];
  for (let seed = first; seed < first + seeds; seed++) {
    const f = fuzz(seed, steps);
    if (f) failures.push(f);
  }
  assert.equal(failures.length, 0, failures.map((f) => `seed ${f.seed}: ${f.what}\n  last intents:\n    ${f.log.join("\n    ")}`).join("\n\n"));
});

test(`the same, with the kernel answering later as it does in the page: ${seeds} runs of ${steps} gestures, answers coming whenever the kernel's thread finishes`, () => {
  const failures = [];
  for (let seed = first; seed < first + seeds; seed++) {
    const f = fuzz(seed, steps, undefined, { lagging: true });
    if (f) failures.push(f);
  }
  assert.equal(failures.length, 0, failures.map((f) => `seed ${f.seed}: ${f.what}\n  last intents:\n    ${f.log.join("\n    ")}`).join("\n\n"));
});
