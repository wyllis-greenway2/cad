// A dev check (not a test, `in_1444`) of a model's file, with the kernel: node --experimental-strip-types dev/files-check.ts
import { initKernel } from "../src/engine/kernel.ts";
import { Engine } from "../src/engine/engine.ts";
import { fromFile, toFile, DocError } from "../src/interaction/files.ts";
import { extrudeSteps } from "../src/interaction/extrude.ts";
import { addRect, emptySketch, keep, refOf } from "../src/interaction/drawing.ts";
import { worldFrame } from "../src/planes.ts";
import { canonical } from "../src/engine/params.ts";
import { check, failureCount } from "./lib.ts";
await initKernel();
const s0 = { points: {}, radii: {} };
let p = emptySketch();
const k = keep(addRect(p, s0, refOf(p, s0, [0, 0], 0.5), refOf(p, s0, [40, 25], 0.5))!);
if (!k.ok) throw new Error(k.why);
p = k.params;
const steps = extrudeSteps([], p, worldFrame(2), [20, 12], 10);
const model = {
  steps,
  drawings: { "world:2": p },
  faces: {
    "face:x": {
      frame: { origin: [1, 2, 3], normal: [0, 0, 1], u: [1, 0, 0] },
      source: { face: { step: "e1", role: "end", of: [], pieces: [] }, body: "e1" },
    },
  },
};
const text = toFile(model as any);
check(
  "a file is the document's text with the drawings and the planes on faces",
  text.startsWith('{"format":"cad-document"') &&
    text.includes('"drawings":') &&
    text.includes('"faces":') &&
    text.indexOf('"drawings"') < text.indexOf('"steps"'),
);
check("the same model is the same text", toFile(model as any) === text);
const back = fromFile(text);
check(
  "it reads back: the same steps, drawings and planes",
  canonical(back.model.steps) === canonical(steps) &&
    canonical(back.model.drawings) === canonical(model.drawings) &&
    canonical(back.model.faces) === canonical(model.faces),
);
const a = new Engine(steps as any),
  b = new Engine(back.model.steps as any);
a.build();
b.build();
check(
  "the recipe read back makes the same body (same fingerprint)",
  a.result("e1").fingerprint === b.result("e1").fingerprint && a.result("e1").status.kind === "ok",
);
const bad = (t: string) => {
  try {
    fromFile(t);
    return "";
  } catch (x) {
    return x instanceof DocError ? x.message : `OTHER ${(x as Error).message}`;
  }
};
check(
  "not a file: said in words",
  /not a document/.test(bad("hello")) && /not ours|not a document/.test(bad('{"a":1}')),
);
check("a newer file is refused, not misread", /newer/.test(bad(text.replace('"version":1', '"version":99'))));
check(
  "drawings that are not a list are said",
  /drawings/.test(bad(text.replace(/"drawings":\{.*?\},\n"faces"/s, '"drawings":5,\n"faces"'))),
);
const old = toFile({ steps, drawings: {}, faces: {} }).replace('"drawings":{},\n"faces":{},', "");
check(
  "a plain document (no drawings, no planes) opens too",
  fromFile(old).model.steps.length === steps.length && Object.keys(fromFile(old).model.drawings).length === 0,
);
process.exit(failureCount() ? 1 : 0);
