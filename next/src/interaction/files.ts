// The file of a model (`in_1569`): the document (`engine/document.ts`: the recipe, canonical text, one step to a line, checked when opened) with what the screen holds besides the recipe: the drawings on the planes that are not steps yet,
// and the planes that lie on faces of the body. The extra keys sit between the names and the steps; the document's own reader ignores them, so a file is still a document. Pure: text in, text out; the platform's file service takes the text.
import { DocError, emptyDoc, open, save } from "../engine/document.ts";
import type { Id } from "../engine/id.ts";
import { canonical } from "../engine/params.ts";
import type { SketchParams } from "../engine/sketch.ts";
import type { Step } from "../engine/steps.ts";

export interface FacePlane {
  frame: { origin: readonly number[]; normal: readonly number[]; u: readonly number[] };
  source: { face: Id; body: string };
}
export interface Model {
  steps: readonly Step[];
  drawings: Record<string, SketchParams>;
  faces: Record<string, FacePlane>;
}

export function toFile(m: Model): string {
  const text = save({ ...emptyDoc(), steps: [...m.steps] }),
    at = text.indexOf('\n"steps":[');
  if (at < 0) throw new Error("the document's text has no steps list");
  return `${text.slice(0, at)}\n"drawings":${canonical(m.drawings)},\n"faces":${canonical(m.faces)},${text.slice(at)}`;
}
/** a model from a file's text; a file that is not one is refused in words that say where (`DocError`) */
export function fromFile(text: string): { model: Model; warnings: string[] } {
  const { doc, warnings } = open(text);
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* open() has said so */
  }
  const obj = (v: unknown, what: string): Record<string, never> => {
    if (v === undefined) return {};
    if (!v || typeof v !== "object" || Array.isArray(v))
      throw new DocError(`the ${what} of this file are not a list of names with values`);
    return v as Record<string, never>;
  };
  return {
    model: {
      steps: doc.steps,
      drawings: obj(raw.drawings, "drawings") as unknown as Record<string, SketchParams>,
      faces: obj(raw.faces, "planes on faces") as unknown as Record<string, FacePlane>,
    },
    warnings,
  };
}
export { DocError };
