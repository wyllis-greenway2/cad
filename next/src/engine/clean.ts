// "Clean" and "something happened" (E27, E29, E33): the checks after a step that the kernel's own validity does not make. A result can be a valid solid and still be a sliver of a few hundredths of a millimetre
// where a near-tangent hole meets a bore, or a valid solid that is the very body the step was given (the round that took nothing, the cut that missed). Both are said, in words, with the face or step named.
import * as K from "./kernel.ts";
import { type Body, type Note, type FaceRec } from "./lineage.ts";
import { show } from "./id.ts";

/** the smallest feature the model allows, in mm (`in_1488`: 0.01) */
export const MIN_FEATURE = 0.01;
export interface Sliver { face: FaceRec; /** the thickness of the face: twice its area over its perimeter */ width: number; area: number }
/** the faces thinner than `min` (or with an edge shorter than it), by their own numbers; no face is changed */
export function slivers(body: Body, min: number = MIN_FEATURE): Sliver[] {
  return K.scoped(() => {
    const out: Sliver[] = [];
    for (const f of body.faces) {
      const area = K.facts(f.h).area; if (!(area > 0)) continue;
      const edges = K.faceEdges(f.h), lens = edges.map(K.edgeLength), perimeter = lens.reduce((a, b) => a + b, 0), width = perimeter > 0 ? (2 * area) / perimeter : 0;
      if (width < min || area < min * min) out.push({ face: f, width, area });
    }
    return out;
  });
}
/** notes for the slivers of a result: one sentence each, with the face's name and its thickness */
export function sliverNotes(body: Body, min: number = MIN_FEATURE): Note[] {
  return slivers(body, min).map((s) => ({ kind: "sliver" as const, text: `${show(s.face.id)} is a sliver ${s.width.toFixed(4)} mm thick (smaller than the smallest feature, ${min} mm)` }));
}
/** the steps that must change the body they are given: when they come out the same, that is said (E27, spike 7) */
export const CHANGES = new Set(["round", "push", "moveFace", "offsetFace", "combine"]);
/** did the step make the body it was given again: the same volume and the same faces? */
export function changedNothing(input: Body, output: Body): boolean {
  if (input === output) return true;
  if (input.faces.length !== output.faces.length) return false;
  const a = K.scoped(() => K.volume(input.solid)), b = K.scoped(() => K.volume(output.solid));
  if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a))) return false;
  return input.fingerprint() === output.fingerprint();
}
