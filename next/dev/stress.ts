// A dev stress run (not a test, `in_1444`, `in_1541`): random models built the way a person builds them (a profile, an extrude, then many operations on faces and edges picked from the part as it is),
// with the engine's promises checked after every step and after random edits:
//   1. nothing throws; every step is ok, flagged or orphaned, and a flagged or orphaned step says why
//   2. an ok body is a valid solid with a positive finite volume
//   3. a fresh build of the same recipe gives the same fingerprints as the live engine (edit equals fresh build)
//   4. a number edited and put back gives the first fingerprints again
//   5. no body the engine holds is changed in place by a later step (still valid, and its fingerprint read again is the one kept)
//   6. time per step, and how it grows with the length of the chain
// A model that fails is written to the output with its seed so it can be replayed.
//   node --experimental-strip-types dev/stress.ts [models] [seed] [steps] [from-to: only these model numbers, e.g. 7 or 20-39; the kernel leaks memory, so a long run is run in chunks of about 20]
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import type { Step } from "../src/engine/steps.ts";
import { driveModel, makeCtx, report } from "./stress-lib.ts";
await initKernel();
const MODELS = Number(process.argv[2] ?? 20),
  SEED = Number(process.argv[3] ?? 1),
  LEN = Number(process.argv[4] ?? 12);
const c = makeCtx(SEED),
  { pick, num } = c;

const profile = (): Step[] => {
  const kind = pick(["rect", "rect", "poly", "circle", "L"]);
  const w = num(20, 60),
    h = num(15, 45);
  const sk: Step =
    kind === "circle"
      ? { id: "s", kind: "sketchCircle", params: { r: num(8, 25), at: [0, 0] }, inputs: [] }
      : kind === "poly"
        ? {
            id: "s",
            kind: "sketchPolygon",
            params: {
              points: [
                [0, 0],
                [w, 0],
                [w * 0.8, h],
                [w * 0.1, h * 0.9],
              ],
            },
            inputs: [],
          }
        : kind === "L"
          ? {
              id: "s",
              kind: "sketchPolygon",
              params: {
                points: [
                  [0, 0],
                  [w, 0],
                  [w, h * 0.4],
                  [w * 0.4, h * 0.4],
                  [w * 0.4, h],
                  [0, h],
                ],
              },
              inputs: [],
            }
          : {
              id: "s",
              kind: "sketchPolygon",
              params: {
                points: [
                  [0, 0],
                  [w, 0],
                  [w, h],
                  [0, h],
                ],
              },
              inputs: [],
            };
  return [sk, { id: "A", kind: "extrude", params: { d: num(6, 30) }, inputs: ["s"] }];
};

const RANGE = (process.argv[5] ?? `0-${MODELS - 1}`).split("-").map(Number),
  LO = RANGE[0]!,
  HI = RANGE[1] ?? LO,
  t0 = Date.now();
for (let m = LO; m <= Math.min(HI, MODELS - 1); m++) {
  c.reseed(SEED * 7919 + m * 104729);
  c.models++;
  const e = new Engine(profile());
  e.build();
  driveModel(c, m, `${SEED}/${m}`, e, LEN);
}
process.exit(report(c, t0));
