// The recipe of the first slice, as a person's actions would make it: a rectangle, extruded; one line drawn on the top, 12 from the right-hand side; the line imprinted so the top splits;
// the right-hand region pulled up; a width dimension; a fillet on the left edge. Ids are made by the same function the engine uses (src/engine/id.ts).
import { edgeRef, mint, piece } from "../src/engine/id.ts";
import type { Step } from "../src/engine/steps.ts";

export interface P {
  w: number;
  h: number;
  d: number;
  off: number;
  t: number;
  width: number;
  r: number;
}
export const P0: P = { w: 40, h: 30, d: 8, off: 12, t: 5, width: 50, r: 1.5 };

export function recipe(p: P): Step[] {
  const line = (i: number) => mint("sk0", "line", i),
    top = mint("A", "end"),
    side = (i: number) => mint("A", "side", line(i));
  return [
    {
      id: "sk0",
      kind: "sketchPolygon",
      params: {
        points: [
          [0, 0],
          [p.w, 0],
          [p.w, p.h],
          [0, p.h],
        ],
      },
      inputs: [],
    },
    { id: "A", kind: "extrude", params: { d: p.d }, inputs: ["sk0"] },
    {
      id: "sk1",
      kind: "sketchOnFace",
      params: { face: top, lines: [{ from: { edge: edgeRef(top, side(1)), dist: p.off } }] },
      inputs: ["A"],
    },
    { id: "B", kind: "imprint", params: {}, inputs: ["A", "sk1"] },
    { id: "C", kind: "push", params: { face: piece(top, 1), dist: p.t }, inputs: ["B"] },
    { id: "D", kind: "dimension", params: { a: side(3), b: side(1), value: p.width }, inputs: ["C"] },
    { id: "E", kind: "round", params: { edges: [edgeRef(piece(top, 0), side(3))], size: p.r }, inputs: ["D"] },
  ];
}
